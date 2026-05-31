package cache

import (
	"context"
	"time"
)

// ctx returns the standard 2s request context used by most cache operations.
func (c *Cache) ctx() (context.Context, context.CancelFunc) {
	return context.WithTimeout(context.Background(), 2*time.Second)
}

// bump adds delta to field of the progress hash for jobID and refreshes its TTL.
func (c *Cache) bump(jobID, field string, delta int64) error {
	ctx, cancel := c.ctx()
	defer cancel()

	if err := c.rdb.HIncrBy(ctx, progressKey(jobID), field, delta).Err(); err != nil {
		return err
	}
	return c.rdb.Expire(ctx, progressKey(jobID), progressTTL).Err()
}

// redis key builders, namespaced by job / domain / session id.
func progressKey(id string) string      { return "progress:" + id }
func seenKey(id string) string          { return "seen:" + id }
func ratelimitKey(domain string) string { return "ratelimit:" + domain }
func catCountKey(jobID string) string   { return "catcount:" + jobID }
func cancelKey(jobID string) string     { return "cancel:" + jobID }
func sessionKey(sid string) string      { return "session:" + sid }
