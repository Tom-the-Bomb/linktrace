// Package cache wraps Redis for the crawler's transient state: live progress counters, the
// per-job seen-set, per-domain rate limits, category caps, shard placement, cancellation
// flags, and sessions.
// Key builders and small helpers live in utils.go.
package cache

import (
	"context"
	"strconv"
	"time"

	"github.com/redis/go-redis/v9"

	"github.com/Tom-the-Bomb/linktrace/internal/auth"
)

type Cache struct {
	rdb    *redis.Client
	shards int // number of work-queue lanes, for shard placement
}

const (
	progressTTL = 2 * time.Hour
	seenTTL     = 1 * time.Hour
	// shardJobTTL outlives a crawl; expires leaked lane entries so a dead job can't wedge a lane.
	shardJobTTL = 3 * time.Hour
	// sessionTTL mirrors the cookie lifetime; auth.SessionTTL is the single source of truth.
	sessionTTL = auth.SessionTTL
)

// progress hash field names, used by IncDiscovered/IncChecked/GetProgress.
const (
	fieldDiscovered = "discovered"
	fieldChecked    = "checked"
	fieldHealthy    = "healthy"
	fieldRotten     = "rotten"
)

var progressFields = []string{fieldDiscovered, fieldChecked, fieldHealthy, fieldRotten}

const (
	rateLimitWindow = 60 // seconds; rolling window for Allow's per-domain count
	// cancelCheckTimeout is tight: IsCancelled runs on every page, so a slow lookup stalls the crawl.
	cancelCheckTimeout = 1 * time.Second
)

// connects to Redis at addr and pings it to verify the connection. shards is the number of
// work-queue lanes used for shard placement.
func New(addr string, shards int) (*Cache, error) {
	if shards < 1 {
		shards = 1
	}
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

// closes the Redis client.
func (c *Cache) Close() error {
	return c.rdb.Close()
}

// maps a session id to a user id, expiring after sessionTTL.
func (c *Cache) CreateSession(sid, userID string) error {
	ctx, cancel := c.ctx()
	defer cancel()
	return c.rdb.Set(ctx, sessionKey(sid), userID, sessionTTL).Err()
}

// returns the user id for a session id, or "" if missing/expired.
// redis.Nil is treated as "no session", not an error (same pattern as sql.ErrNoRows).
// GETEX slides the expiry on every hit, so the TTL measures inactivity rather than account age —
// an active user isn't logged out mid-session. Atomic, so it costs no extra round-trip.
func (c *Cache) LookupSession(sid string) (string, error) {
	ctx, cancel := c.ctx()
	defer cancel()
	userID, err := c.rdb.GetEx(ctx, sessionKey(sid), sessionTTL).Result()
	if err == redis.Nil {
		return "", nil
	}
	return userID, err
}

// invalidates a session immediately (logout).
func (c *Cache) DeleteSession(sid string) error {
	ctx, cancel := c.ctx()
	defer cancel()
	return c.rdb.Del(ctx, sessionKey(sid)).Err()
}

// bumps the discovered counter; called each time a new page is queued.
func (c *Cache) IncDiscovered(jobID string) error {
	return c.bump(jobID, fieldDiscovered, 1)
}

// bumps the checked counter plus healthy or rotten; called once per crawled page.
func (c *Cache) IncChecked(jobID string, isAlive bool) error {
	if err := c.bump(jobID, fieldChecked, 1); err != nil {
		return err
	}
	field := fieldRotten
	if isAlive {
		field = fieldHealthy
	}
	return c.bump(jobID, field, 1)
}

// reads all four progress counters (discovered/checked/healthy/rotten) at once.
func (c *Cache) GetProgress(jobID string) (map[string]int, error) {
	ctx, cancel := c.ctx()
	defer cancel()

	vals, err := c.rdb.HGetAll(ctx, progressKey(jobID)).Result()
	if err != nil {
		return nil, err
	}

	out := make(map[string]int, len(progressFields))
	for _, f := range progressFields {
		out[f] = 0
	}
	for k, v := range vals {
		if i, err := strconv.Atoi(v); err == nil {
			out[k] = i
		}
	}
	return out, nil
}

// allowScript atomically increments the per-domain counter and, on the first hit, sets the
// one-minute window. Doing INCR+EXPIRE in one Lua eval avoids the race where a crash between
// the two commands leaves a counter that never expires (throttling that domain forever).
var allowScript = redis.NewScript(`
local n = redis.call('INCR', KEYS[1])
if n == 1 then
  redis.call('EXPIRE', KEYS[1], ARGV[1])
end
return n
`)

// reports whether workers may still hit domain this minute, incrementing its counter.
// Returns false once perMinute is exceeded within the current window.
func (c *Cache) Allow(domain string, perMinute int) (bool, error) {
	return c.allow(ratelimitKey(domain), perMinute)
}

// AllowRequest reports whether an API caller may make another request this minute. key is the
// route group plus the caller's identity, so groups don't share a budget.
func (c *Cache) AllowRequest(key string, perMinute int) (bool, error) {
	return c.allow(apiRateKey(key), perMinute)
}

// increments key's counter and reports whether it's still within budget. Fixed window, not
// sliding: the TTL starts on the first hit and the count resets wholesale when it expires, so a
// caller can spend two budgets back-to-back across a boundary. Fine for abuse control.
func (c *Cache) allow(key string, perMinute int) (bool, error) {
	ctx, cancel := c.ctx()
	defer cancel()

	n, err := allowScript.Run(ctx, c.rdb, []string{key}, rateLimitWindow).Int64()
	if err != nil {
		return false, err
	}
	return n <= int64(perMinute), nil
}

// adds url to the job's seen-set, returning true if it wasn't already present.
func (c *Cache) MarkSeen(jobID, url string) (bool, error) {
	ctx, cancel := c.ctx()
	defer cancel()

	added, err := c.rdb.SAdd(ctx, seenKey(jobID), url).Result()
	if err != nil {
		return false, err
	}
	_ = c.rdb.Expire(ctx, seenKey(jobID), seenTTL).Err()
	return added == 1, nil
}

// marks jobID as cancelled. Workers see this on the next processPage tick and bail.
func (c *Cache) Cancel(jobID string) error {
	ctx, cancel := c.ctx()
	defer cancel()
	return c.rdb.Set(ctx, cancelKey(jobID), "1", seenTTL).Err()
}

// clears a job's transient Redis state. The cancel tombstone is (re)set first so in-flight
// workers skip the job instead of re-creating rows mid-delete; it self-expires after seenTTL.
func (c *Cache) PurgeJob(jobID string) error {
	ctx, cancel := c.ctx()
	defer cancel()
	if err := c.rdb.Set(ctx, cancelKey(jobID), "1", seenTTL).Err(); err != nil {
		return err
	}
	if err := c.rdb.Del(ctx, progressKey(jobID), seenKey(jobID), catCountKey(jobID), completeKey(jobID)).Err(); err != nil {
		return err
	}
	return c.ReleaseShard(jobID) // freeing the lane is part of tearing the job down
}

// ClaimComplete returns true only for the first caller, so the job is finalised exactly once.
// Several report consumers run concurrently and can all observe checked >= discovered on the
// last page; without this they'd each rewrite the job row and log a duplicate completion.
func (c *Cache) ClaimComplete(jobID string) (bool, error) {
	ctx, cancel := c.ctx()
	defer cancel()
	return c.rdb.SetNX(ctx, completeKey(jobID), "1", progressTTL).Result()
}

// reports whether jobID's cancel flag is set.
func (c *Cache) IsCancelled(jobID string) bool {
	ctx, cancel := context.WithTimeout(context.Background(), cancelCheckTimeout)
	defer cancel()
	n, err := c.rdb.Exists(ctx, cancelKey(jobID)).Result()
	return err == nil && n > 0
}

// atomically bumps the per-category counter for jobID and returns the new count, so
// the worker can enforce a soft cap (return value > MaxPerCategory means this enqueue overflowed).
func (c *Cache) IncCategory(jobID, category string) (int, error) {
	ctx, cancel := c.ctx()
	defer cancel()
	n, err := c.rdb.HIncrBy(ctx, catCountKey(jobID), category, 1).Result()
	if err != nil {
		return 0, err
	}
	_ = c.rdb.Expire(ctx, catCountKey(jobID), seenTTL).Err()
	return int(n), nil
}

// returns how many distinct URLs have been seen for jobID.
func (c *Cache) SeenCount(jobID string) (int, error) {
	ctx, cancel := c.ctx()
	defer cancel()

	size, err := c.rdb.SCard(ctx, seenKey(jobID)).Result()
	if err != nil {
		return 0, err
	}
	return int(size), nil
}

// placeScript assigns a new job to the least-occupied shard lane and returns its index.
// Each lane is a sorted set of in-progress job ids scored by expiry; the script first evicts
// expired entries (self-healing if a job dies without releasing), then picks the lane with the
// fewest live jobs and adds this one. Done in one eval so concurrent placements can't both
// claim the same empty lane. KEYS=[shard:0:jobs, ...]; ARGV=[now, expiry, jobID].
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

// PlaceJob pins jobID to the least-occupied shard lane and returns its index. The lane membership
// expires after shardJobTTL so a crash that skips ReleaseShard can't wedge a lane forever.
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

// ReleaseShard frees jobID's lane slot once the crawl ends. It removes from every lane (the id
// lives in only one) so the caller needn't know which shard the job landed on.
func (c *Cache) ReleaseShard(jobID string) error {
	ctx, cancel := c.ctx()
	defer cancel()
	pipe := c.rdb.Pipeline()
	for i := 0; i < c.shards; i++ {
		pipe.ZRem(ctx, shardSetKey(i), jobID)
	}
	_, err := pipe.Exec(ctx)
	return err
}
