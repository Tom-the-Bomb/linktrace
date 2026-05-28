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

func progressKey(id string) string {
	return "progress:" + id
}

func seenKey(id string) string {
	return "seen:" + id
}

func ratelimitKey(domain string) string {
	return "ratelimit:" + domain
}

// adds `delta` to `field` of the progress hash for `jobID` and resets the TTL
func (c *Cache) bump(jobId, field string, delta int64) error {
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()

	if err := c.rdb.HIncrBy(ctx, progressKey(jobId), field, delta).Err(); err != nil {
		return err
	}
	return c.rdb.Expire(ctx, progressKey(jobId), progressTTL).Err()
}

// called each time a NEW page is added to the queue
func (c *Cache) IncDiscovered(jJobID string) error {
	return c.bump(jJobID, "discovered", 1)
}

// reads all 4 counters at once and returns them in a map obj
func (c *Cache) GetProgress(jobID string) (map[string]int, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()

	vals, err := c.rdb.HGetAll(ctx, progressKey(jobID)).Result()

	if err != nil {
		return nil, err
	}

	out := map[string]int{
		"discovered": 0,
		"queued":     0,
		"crawled":    0,
		"errored":    0,
	}

	for k, v := range vals {
		if i, err := strconv.Atoi(v); err == nil {
			out[k] = i
		}
	}
	return out, nil
}

// redis ratelimit system
// checks whether or not our workers are still permitted to make requests to `domain`
// increments per-domain counter and returns false once the limit is exceeded (per minute)
func (c *Cache) Allow(domain string, perMinute int) (bool, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()

	n, err := c.rdb.Incr(ctx, ratelimitKey(domain)).Result()
	if err != nil {
		return false, err
	}

	if n == 1 {
		// first request, set the 1 min clock for TTL before deleting redis key
		if err := c.rdb.Expire(
			ctx,
			ratelimitKey(domain),
			time.Minute,
		).Err(); err != nil {
			return false, err
		}
	}
	return n <= int64(perMinute), nil
}

// avoids re-crawling already seen URLs by adding them to a set
// if not seen, add to queue
func (c *Cache) MarkSeen(jobID, url string) (bool, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()

	// added = 0 if seen else 1
	added, err := c.rdb.SAdd(ctx, seenKey(jobID), url).Result()

	if err != nil {
		return false, err
	}

	_ = c.rdb.Expire(ctx, seenKey(jobID), seenTTL).Err()

	return added == 1, nil
}

// # of URLS that have been seen / job
func (c *Cache) SeenCount(jobID string) (int, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()

	size, err := c.rdb.SCard(ctx, seenKey(jobID)).Result()
	if err != nil {
		return 0, err
	}
	return int(size), nil
}
