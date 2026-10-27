package cache

import (
	"context"
	"encoding/json"
	"errors"
	"time"

	"github.com/redis/go-redis/v9"

	"github.com/Tom-the-Bomb/linktrace/internal/auth"
	"github.com/Tom-the-Bomb/linktrace/internal/robots"
)

type Cache struct {
	rdb    *redis.Client
	shards int
}

const (
	progressTTL = 2 * time.Hour
	jobTTL      = 1 * time.Hour
	// outlives any crawl, so a dead job's leaked lane entry can't wedge the lane.
	shardJobTTL = 3 * time.Hour
)

type Progress struct {
	Discovered int `redis:"discovered"`
	Checked    int `redis:"checked"`
	Healthy    int `redis:"healthy"`
	Rotten     int `redis:"rotten"`
}

const (
	rateLimitWindow = 60 // seconds
	// tight: IsCancelled runs on every page
	cancelCheckTimeout = 1 * time.Second
)

func New(addr string, shards int) (*Cache, error) {
	rdb := redis.NewClient(&redis.Options{
		Addr: addr,
	})

	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()

	if err := rdb.Ping(ctx).Err(); err != nil {
		return nil, err
	}

	return &Cache{rdb: rdb, shards: shards}, nil
}

func (c *Cache) Close() error {
	return c.rdb.Close()
}

func (c *Cache) CreateSession(sid, userID string) error {
	ctx, cancel := c.ctx()
	defer cancel()
	return c.rdb.Set(ctx, sessionKey(sid), userID, auth.SessionTTL).Err()
}

// returns "" if missing. GETEX slides the expiry, so the TTL measures inactivity.
func (c *Cache) LookupSession(sid string) (string, error) {
	ctx, cancel := c.ctx()
	defer cancel()
	userID, err := c.rdb.GetEx(ctx, sessionKey(sid), auth.SessionTTL).Result()
	if errors.Is(err, redis.Nil) {
		return "", nil
	}
	return userID, err
}

func (c *Cache) DeleteSession(sid string) error {
	ctx, cancel := c.ctx()
	defer cancel()
	return c.rdb.Del(ctx, sessionKey(sid)).Err()
}

func (c *Cache) IncDiscovered(jobID string) error {
	ctx, cancel := c.ctx()
	defer cancel()

	if err := c.rdb.HIncrBy(ctx, progressKey(jobID), "discovered", 1).Err(); err != nil {
		return err
	}
	return c.rdb.Expire(ctx, progressKey(jobID), progressTTL).Err()
}

// counts each page once, so a redelivered result can't push checked past discovered
var markCheckedScript = redis.NewScript(`
if redis.call('SADD', KEYS[2], ARGV[1]) == 0 then
  return 0
end
redis.call('HINCRBY', KEYS[1], 'checked', 1)
redis.call('HINCRBY', KEYS[1], ARGV[2], 1)
redis.call('EXPIRE', KEYS[1], ARGV[3])
redis.call('EXPIRE', KEYS[2], ARGV[3])
return 1
`)

func (c *Cache) MarkChecked(jobID, url string, isAlive bool) error {
	ctx, cancel := c.ctx()
	defer cancel()
	field := "rotten"
	if isAlive {
		field = "healthy"
	}
	keys := []string{progressKey(jobID), checkedKey(jobID)}
	return markCheckedScript.Run(ctx, c.rdb, keys, url, field, int(progressTTL.Seconds())).Err()
}

func (c *Cache) IsChecked(jobID, url string) (bool, error) {
	ctx, cancel := c.ctx()
	defer cancel()
	return c.rdb.SIsMember(ctx, checkedKey(jobID), url).Result()
}

func (c *Cache) GetProgress(jobID string) (Progress, error) {
	ctx, cancel := c.ctx()
	defer cancel()
	var p Progress
	err := c.rdb.HGetAll(ctx, progressKey(jobID)).Scan(&p)
	return p, err
}

// does INCR+EXPIRE in one eval: a crash between them would leave a counter
// that never expires.
var allowScript = redis.NewScript(`
local n = redis.call('INCR', KEYS[1])
if n == 1 then
  redis.call('EXPIRE', KEYS[1], ARGV[1])
end
return n
`)

func (c *Cache) Allow(domain string, perMinute int) (bool, error) {
	return c.allow(ratelimitKey(domain), perMinute)
}

func (c *Cache) AllowRequest(key string, perMinute int) (bool, error) {
	return c.allow(apiRateKey(key), perMinute)
}

// spaces requests at least gap apart, for sites that ask for a Crawl-delay
func (c *Cache) AllowEvery(domain string, gap time.Duration) (bool, error) {
	ctx, cancel := c.ctx()
	defer cancel()
	return c.rdb.SetNX(ctx, gapKey(domain), 1, gap).Result()
}

// uses a fixed window, so a caller can spend two budgets back-to-back across a
// boundary. Fine for abuse control.
func (c *Cache) allow(key string, perMinute int) (bool, error) {
	ctx, cancel := c.ctx()
	defer cancel()

	n, err := allowScript.Run(ctx, c.rdb, []string{key}, rateLimitWindow).Int64()
	if err != nil {
		return false, err
	}
	return n <= int64(perMinute), nil
}

func (c *Cache) MarkSeen(jobID, url string) error {
	ctx, cancel := c.ctx()
	defer cancel()

	if err := c.rdb.SAdd(ctx, seenKey(jobID), url).Err(); err != nil {
		return err
	}
	return c.rdb.Expire(ctx, seenKey(jobID), jobTTL).Err()
}

func (c *Cache) Cancel(jobID string) error {
	ctx, cancel := c.ctx()
	defer cancel()
	return c.rdb.Set(ctx, cancelKey(jobID), "1", jobTTL).Err()
}

// sets the cancel tombstone first so in-flight workers skip the job instead of
// re-creating rows mid-delete.
func (c *Cache) PurgeJob(jobID string) error {
	if err := c.Cancel(jobID); err != nil {
		return err
	}
	ctx, cancel := c.ctx()
	defer cancel()
	if err := c.rdb.Del(ctx, progressKey(jobID), seenKey(jobID), checkedKey(jobID), catCountKey(jobID), completeKey(jobID)).Err(); err != nil {
		return err
	}
	return c.EndJob(jobID)
}

// frees a crawl's lane, host claim and robots rules; every way a crawl ends must call it.
func (c *Cache) EndJob(jobID string) error {
	if err := c.ReleaseHost(jobID); err != nil {
		return err
	}
	ctx, cancel := c.ctx()
	defer cancel()
	pipe := c.rdb.Pipeline()
	pipe.Del(ctx, robotsKey(jobID))
	for i := range c.shards {
		pipe.ZRem(ctx, shardSetKey(i), jobID)
	}
	_, err := pipe.Exec(ctx)
	return err
}

// is true only for the first caller: concurrent report consumers can all see
// checked >= discovered on the last page.
func (c *Cache) ClaimComplete(jobID string) (bool, error) {
	ctx, cancel := c.ctx()
	defer cancel()
	return c.rdb.SetNX(ctx, completeKey(jobID), "1", progressTTL).Result()
}

func (c *Cache) IsCancelled(jobID string) bool {
	ctx, cancel := context.WithTimeout(context.Background(), cancelCheckTimeout)
	defer cancel()
	n, err := c.rdb.Exists(ctx, cancelKey(jobID)).Result()
	return err == nil && n > 0
}

func (c *Cache) IncCategory(jobID, category string) (int, error) {
	ctx, cancel := c.ctx()
	defer cancel()
	n, err := c.rdb.HIncrBy(ctx, catCountKey(jobID), category, 1).Result()
	if err != nil {
		return 0, err
	}
	_ = c.rdb.Expire(ctx, catCountKey(jobID), jobTTL).Err()
	return int(n), nil
}

// checks the cap and adds in one eval so concurrent fetchers can't each
// admit the remaining budget. Returns 1 added, 0 already seen, -1 cap reached.
var markSeenUnderScript = redis.NewScript(`
local added = -1
if redis.call('SCARD', KEYS[1]) < tonumber(ARGV[2]) then
  added = redis.call('SADD', KEYS[1], ARGV[1])
end
redis.call('EXPIRE', KEYS[1], ARGV[3])
return added
`)

func (c *Cache) IsSeen(jobID, url string) (bool, error) {
	ctx, cancel := c.ctx()
	defer cancel()
	return c.rdb.SIsMember(ctx, seenKey(jobID), url).Result()
}

func (c *Cache) MarkSeenUnder(jobID, url string, maxPages int) (isNew, full bool, err error) {
	ctx, cancel := c.ctx()
	defer cancel()
	n, err := markSeenUnderScript.Run(ctx, c.rdb, []string{seenKey(jobID)}, url, maxPages,
		int(jobTTL.Seconds())).Int()
	return n == 1, n < 0, err
}

// evicts expired entries (self-healing a job that died without releasing), then
// adds the job to the lane with the fewest live jobs, in one eval so concurrent placements
// can't both claim the same empty lane. KEYS=[shard:0:jobs, ...]; ARGV=[now, expiry, jobID].
var placeScript = redis.NewScript(`
local best, bestCount = 1, -1
for i = 1, #KEYS do
  redis.call('ZREMRANGEBYSCORE', KEYS[i], '-inf', ARGV[1])
  local c = redis.call('ZCARD', KEYS[i])
  if bestCount < 0 or c < bestCount then
    best, bestCount = i, c
  end
end
redis.call('ZADD', KEYS[best], ARGV[2], ARGV[3])
return best - 1
`)

func (c *Cache) PlaceJob(jobID string) (int, error) {
	ctx, cancel := c.ctx()
	defer cancel()
	keys := make([]string, c.shards)
	for i := range keys {
		keys[i] = shardSetKey(i)
	}
	now := time.Now().Unix()
	expiry := now + int64(shardJobTTL.Seconds())
	return placeScript.Run(ctx, c.rdb, keys, now, expiry, jobID).Int()
}

// frees the host claim only if jobID still holds it, so a finishing job can't
// clear a newer crawl's claim on the same host. KEYS=[jobhost:<id>], which holds the claim's key.
var releaseHostScript = redis.NewScript(`
local claim = redis.call('GET', KEYS[1])
if claim then
  if redis.call('GET', claim) == ARGV[1] then
    redis.call('DEL', claim)
  end
  redis.call('DEL', KEYS[1])
end
return 0
`)

// takes the claim and records it under jobhost:<id> in one step, so a claim never
// exists without the pointer releaseHostScript needs. KEYS=[claim, jobhost:<id>].
var claimHostScript = redis.NewScript(`
local holder = redis.call('SET', KEYS[1], ARGV[1], 'NX', 'GET', 'EX', ARGV[2])
if holder then
  return holder
end
redis.call('SET', KEYS[2], KEYS[1], 'EX', ARGV[2])
return false
`)

func (c *Cache) ClaimHost(host, jobID string) (holder string, claimed bool, err error) {
	ctx, cancel := c.ctx()
	defer cancel()
	keys := []string{activeCrawlKey(host), jobHostKey(jobID)}
	holder, err = claimHostScript.Run(ctx, c.rdb, keys, jobID, int(shardJobTTL.Seconds())).Text()
	if errors.Is(err, redis.Nil) {
		return "", true, nil
	}
	return holder, false, err
}

func (c *Cache) ReleaseHost(jobID string) error {
	ctx, cancel := c.ctx()
	defer cancel()
	return releaseHostScript.Run(ctx, c.rdb, []string{jobHostKey(jobID)}, jobID).Err()
}

func (c *Cache) SetRobotsRules(jobID string, rules []robots.Rule) error {
	if len(rules) == 0 {
		return nil
	}
	b, err := json.Marshal(rules)
	if err != nil {
		return err
	}
	ctx, cancel := c.ctx()
	defer cancel()
	return c.rdb.Set(ctx, robotsKey(jobID), b, shardJobTTL).Err()
}

// returns (nil, nil) when the site has none. Each read slides the expiry, so a
// crawl outliving shardJobTTL keeps honouring them.
func (c *Cache) RobotsRules(jobID string) ([]robots.Rule, error) {
	ctx, cancel := c.ctx()
	defer cancel()
	b, err := c.rdb.GetEx(ctx, robotsKey(jobID), shardJobTTL).Bytes()
	if errors.Is(err, redis.Nil) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	var rules []robots.Rule
	return rules, json.Unmarshal(b, &rules)
}
