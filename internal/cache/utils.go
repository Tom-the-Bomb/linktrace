package cache

import (
	"context"
	"strconv"
	"time"
)

func (c *Cache) ctx() (context.Context, context.CancelFunc) {
	return context.WithTimeout(context.Background(), 2*time.Second)
}

func (c *Cache) bump(jobID, field string) error {
	ctx, cancel := c.ctx()
	defer cancel()

	if err := c.rdb.HIncrBy(ctx, progressKey(jobID), field, 1).Err(); err != nil {
		return err
	}
	return c.rdb.Expire(ctx, progressKey(jobID), progressTTL).Err()
}

func progressKey(id string) string      { return "progress:" + id }
func seenKey(id string) string          { return "seen:" + id }
func checkedKey(id string) string       { return "checked:" + id }
func gapKey(domain string) string       { return "ratelimit:gap:" + domain }
func ratelimitKey(domain string) string { return "ratelimit:" + domain }
func apiRateKey(key string) string      { return "apirate:" + key }
func catCountKey(jobID string) string   { return "catcount:" + jobID }
func shardSetKey(i int) string          { return "shard:" + strconv.Itoa(i) + ":jobs" }
func cancelKey(jobID string) string     { return "cancel:" + jobID }
func completeKey(jobID string) string   { return "complete:" + jobID }
func sessionKey(sid string) string      { return "session:" + sid }
func jobHostKey(jobID string) string    { return "jobhost:" + jobID }
func robotsKey(jobID string) string     { return "robots:" + jobID }
func activeCrawlKey(host string) string { return "activecrawl:" + host }
