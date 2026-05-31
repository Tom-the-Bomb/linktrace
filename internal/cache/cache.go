// Package cache wraps Redis for the crawler's transient state: live progress counters, the
// per-job seen-set, per-domain rate limits, category caps, cancellation flags, and sessions.
// Key builders and small helpers live in utils.go.
package cache

import (
	"context"
	"strconv"
	"time"

	"github.com/redis/go-redis/v9"
)

type Cache struct {
	rdb *redis.Client
}

const progressTTL = 2 * time.Hour
const seenTTL = 1 * time.Hour
const sessionTTL = 7 * 24 * time.Hour

// New connects to Redis at addr and pings it to verify the connection.
func New(addr string) (*Cache, error) {
	rdb := redis.NewClient(&redis.Options{
		Addr: addr,
	})

	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()

	if err := rdb.Ping(ctx).Err(); err != nil {
		return nil, err
	}

	return &Cache{rdb: rdb}, nil
}

func (c *Cache) Close() error {
	return c.rdb.Close()
}

// CreateSession maps a session id to a user id, expiring after sessionTTL.
func (c *Cache) CreateSession(sid, userID string) error {
	ctx, cancel := c.ctx()
	defer cancel()
	return c.rdb.Set(ctx, sessionKey(sid), userID, sessionTTL).Err()
}

// LookupSession returns the user id for a session id, or "" if missing/expired.
// redis.Nil is treated as "no session", not an error (same pattern as sql.ErrNoRows).
func (c *Cache) LookupSession(sid string) (string, error) {
	ctx, cancel := c.ctx()
	defer cancel()
	userID, err := c.rdb.Get(ctx, sessionKey(sid)).Result()
	if err == redis.Nil {
		return "", nil
	}
	return userID, err
}

// DeleteSession invalidates a session immediately (logout).
func (c *Cache) DeleteSession(sid string) error {
	ctx, cancel := c.ctx()
	defer cancel()
	return c.rdb.Del(ctx, sessionKey(sid)).Err()
}

// IncDiscovered bumps the discovered counter; called each time a new page is queued.
func (c *Cache) IncDiscovered(jobID string) error {
	return c.bump(jobID, "discovered", 1)
}

// IncChecked bumps the checked counter plus healthy or rotten; called once per crawled page.
func (c *Cache) IncChecked(jobID string, isAlive bool) error {
	if err := c.bump(jobID, "checked", 1); err != nil {
		return err
	}
	field := "rotten"
	if isAlive {
		field = "healthy"
	}
	return c.bump(jobID, field, 1)
}

// GetProgress reads all four progress counters (discovered/checked/healthy/rotten) at once.
func (c *Cache) GetProgress(jobID string) (map[string]int, error) {
	ctx, cancel := c.ctx()
	defer cancel()

	vals, err := c.rdb.HGetAll(ctx, progressKey(jobID)).Result()
	if err != nil {
		return nil, err
	}

	out := map[string]int{
		"discovered": 0,
		"checked":    0,
		"healthy":    0,
		"rotten":     0,
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

// Allow reports whether workers may still hit domain this minute, incrementing its counter.
// Returns false once perMinute is exceeded within the rolling one-minute window.
func (c *Cache) Allow(domain string, perMinute int) (bool, error) {
	ctx, cancel := c.ctx()
	defer cancel()

	n, err := allowScript.Run(ctx, c.rdb, []string{ratelimitKey(domain)}, 60).Int64()
	if err != nil {
		return false, err
	}
	return n <= int64(perMinute), nil
}

// MarkSeen adds url to the job's seen-set, returning true if it wasn't already present.
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

// Cancel marks jobID as cancelled. Workers see this on the next processPage tick and bail.
func (c *Cache) Cancel(jobID string) error {
	ctx, cancel := c.ctx()
	defer cancel()
	return c.rdb.Set(ctx, cancelKey(jobID), "1", seenTTL).Err()
}

// PurgeJob clears a job's transient Redis state on deletion. First it (re)sets the cancel
// tombstone: the work queue is shared and can't be selectively purged, so in-flight messages
// for this job must be skipped by workers (via IsCancelled) instead of resurrecting rows
// we're about to delete. The tombstone is left to self-expire after seenTTL, by which point
// the queue has drained. The progress/seen/category keys carry no such risk, deleted outright.
func (c *Cache) PurgeJob(jobID string) error {
	ctx, cancel := c.ctx()
	defer cancel()
	if err := c.rdb.Set(ctx, cancelKey(jobID), "1", seenTTL).Err(); err != nil {
		return err
	}
	return c.rdb.Del(ctx, progressKey(jobID), seenKey(jobID), catCountKey(jobID)).Err()
}

// IsCancelled reports whether jobID's cancel flag is set.
func (c *Cache) IsCancelled(jobID string) bool {
	ctx, cancel := context.WithTimeout(context.Background(), 1*time.Second)
	defer cancel()
	n, err := c.rdb.Exists(ctx, cancelKey(jobID)).Result()
	return err == nil && n > 0
}

// IncCategory atomically bumps the per-category counter for jobID and returns the new count, so
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

// SeenCount returns how many distinct URLs have been seen for jobID.
func (c *Cache) SeenCount(jobID string) (int, error) {
	ctx, cancel := c.ctx()
	defer cancel()

	size, err := c.rdb.SCard(ctx, seenKey(jobID)).Result()
	if err != nil {
		return 0, err
	}
	return int(size), nil
}
