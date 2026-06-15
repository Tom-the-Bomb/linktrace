// Command worker runs the crawl pipeline: page-fetch goroutines plus the report, archive,
// and aggregate result consumers. Pure helpers live in utils.go.
package main

import (
	"encoding/json"
	"log"
	"net/http"
	"net/url"
	"os"
	"os/signal"
	"sync"
	"syscall"
	"time"

	amqp "github.com/rabbitmq/amqp091-go"

	"github.com/Tom-the-Bomb/linktrace/internal/archive"
	"github.com/Tom-the-Bomb/linktrace/internal/cache"
	"github.com/Tom-the-Bomb/linktrace/internal/checker"
	"github.com/Tom-the-Bomb/linktrace/internal/config"
	"github.com/Tom-the-Bomb/linktrace/internal/crawler"
	"github.com/Tom-the-Bomb/linktrace/internal/queue"
	"github.com/Tom-the-Bomb/linktrace/internal/seo"
	"github.com/Tom-the-Bomb/linktrace/internal/store"
)

const (
	maxRetries        = 3
	checkTimeout      = 10 * time.Second // per-page fetch timeout
	rateLimitBackoff  = time.Second      // pause before requeueing a rate-limited job
	maxRetryAfterWait = 15 * time.Second // honor a 429 Retry-After up to this; longer → record as blocked
)

// starts the page-fetch workers and the result consumers, then waits for shutdown.
func main() {
	cfg := config.Load()

	st, err := store.New(cfg.MySQLDSN)
	if err != nil {
		log.Fatalf("mysql: %v", err)
	}
	defer st.Close()

	ca, err := cache.New(cfg.RedisAddr, cfg.ShardCount)
	if err != nil {
		log.Fatalf("redis: %v", err)
	}
	defer ca.Close()

	q, err := queue.New(cfg.RabbitURL, cfg.ShardCount)
	if err != nil {
		log.Fatalf("rabbitmq: %v", err)
	}
	defer q.Close()

	w := &worker{cfg: cfg, cache: ca, queue: q, chk: checker.New(checkTimeout)}
	rb := &reportBuilder{store: st, cache: ca}
	ac := &archiveChecker{store: st, cache: ca}
	ag := newAggregator(st, ca)

	var wg sync.WaitGroup
	var channels []*amqp.Channel

	pageChs, err := startPageWorkers(w, &wg)
	if err != nil {
		log.Fatalf("page workers: %v", err)
	}
	channels = append(channels, pageChs...)

	consumers := []struct {
		name    string
		handler func(queue.PageChecked) error
	}{
		{queue.QReport, rb.handle},
		{queue.QArchive, ac.handle},
		{queue.QAggregate, ag.handle},
	}
	for _, c := range consumers {
		ch, err := runConsumer(q, c.name, &wg, c.handler)
		if err != nil {
			log.Fatalf("consumer %s: %v", c.name, err)
		}
		channels = append(channels, ch)
	}

	log.Printf("worker running: %d page goroutines across %d shards + %d result consumers",
		cfg.WorkerCount, cfg.ShardCount, len(consumers))

	// graceful shutdown: closing channels closes their delivery chans, ranging goroutines exit
	stop := make(chan os.Signal, 1)
	signal.Notify(stop, syscall.SIGINT, syscall.SIGTERM)
	<-stop
	log.Println("shutting down...")
	for _, ch := range channels {
		_ = ch.Close()
	}
	wg.Wait()
	log.Println("worker stopped")
}

// bundles per-goroutine dependencies for processing a page job.
type worker struct {
	cfg   config.Config
	cache *cache.Cache
	queue *queue.Queue
	chk   *checker.Checker
}

// launches WorkerCount/ShardCount goroutines per shard lane, each consuming only its own
// pages.<n> queue. A job is pinned to one lane, so a single crawl can occupy at most one lane's
// workers — bounding it to ~1/ShardCount of the pool. Prefetch = per-lane goroutines keeps each
// lane's broker-side backpressure matched to its workers.
func startPageWorkers(w *worker, wg *sync.WaitGroup) ([]*amqp.Channel, error) {
	perLane := w.cfg.WorkerCount / w.cfg.ShardCount
	if perLane < 1 {
		perLane = 1
	}
	var channels []*amqp.Channel
	for shard := 0; shard < w.cfg.ShardCount; shard++ {
		deliveries, ch, err := w.queue.Consume(queue.ShardQueue(shard), perLane)
		if err != nil {
			return channels, err
		}
		for i := 0; i < perLane; i++ {
			wg.Add(1)
			go func() {
				defer wg.Done()
				for d := range deliveries {
					w.processPage(d)
				}
			}()
		}
		channels = append(channels, ch)
	}
	return channels, nil
}

// is the per-message decision tree: rate-limit -> fetch -> retry/ack/dead-letter.
func (w *worker) processPage(d amqp.Delivery) {
	var job queue.PageJob
	if err := json.Unmarshal(d.Body, &job); err != nil {
		log.Printf("[worker] unparseable message, dead-lettering: %v", err)
		_ = d.Nack(false, false)
		return
	}

	// user hit Stop, silently drain remaining jobs without crawling or counting them
	if w.cache.IsCancelled(job.JobID) {
		log.Printf("[worker] skip %s (job cancelled)", job.URL)
		_ = d.Ack(false)
		return
	}

	log.Printf("[worker] crawling depth=%d %s", job.Depth, job.URL)

	allowed, err := w.cache.Allow(hostOf(job.URL), w.cfg.RatePerMin)
	if err != nil {
		log.Printf("[worker] ratelimit error: %v", err)
	}
	if !allowed {
		// over budget: brief sleep prevents hot-loop nacking
		log.Printf("[worker] rate-limited, requeueing %s", job.URL)
		time.Sleep(rateLimitBackoff)
		_ = d.Nack(false, true)
		return
	}

	res := w.chk.Check(job.URL)

	// 429: the origin asked us to slow down. If Retry-After is short enough to wait out, back off
	// and requeue; a missing/oversized Retry-After falls through and is recorded as blocked.
	if res.StatusCode == http.StatusTooManyRequests && job.RetryCount < maxRetries {
		wait := res.RetryAfter
		if wait <= 0 {
			wait = rateLimitBackoff
		}
		if wait <= maxRetryAfterWait {
			log.Printf("[worker] 429 on %s, backing off %s (retry %d/%d)",
				job.URL, wait, job.RetryCount+1, maxRetries)
			time.Sleep(wait)
			w.requeue(d, job)
			return
		}
	}

	// transient failure: republish with incremented retry count
	if isTransient(res.ErrorType) {
		if job.RetryCount < maxRetries {
			log.Printf("[worker] retry %d/%d (%s) %s", job.RetryCount+1, maxRetries, res.ErrorType, job.URL)
			w.requeue(d, job)
			return
		}
		// retries exhausted: record as rotten, then dead-letter for inspection
		log.Printf("[worker] retries exhausted, dead-lettering %s (%s)", job.URL, res.ErrorType)
		w.publishResult(job, res, nil)
		_ = d.Nack(false, false)
		return
	}

	// enqueue children (bumps `discovered`) before publishing the result (bumps `checked`)
	// so the completion rule checked >= discovered holds
	var links []string
	if hasHTML(res) {
		links = w.enqueueLinks(job, res)
	}
	w.publishResult(job, res, links)

	if res.IsAlive {
		log.Printf("[worker] alive  %d  %dms  %s  (+%d links)",
			res.StatusCode, res.ResponseTime, job.URL, len(links))
	} else {
		log.Printf("[worker] rotten %s  %dms  %s", res.ErrorType, res.ResponseTime, job.URL)
	}
	_ = d.Ack(false)
}

// requeue republishes job with one more retry and acks the current delivery; on publish
// failure it nacks for redelivery instead. Either way the delivery is settled.
func (w *worker) requeue(d amqp.Delivery, job queue.PageJob) {
	job.RetryCount++
	if err := w.queue.PublishPageJob(job); err != nil {
		log.Printf("[worker] requeue %s failed: %v", job.URL, err)
		_ = d.Nack(false, true)
		return
	}
	_ = d.Ack(false)
}

// builds the fanout message: rot record + (for healthy HTML) SEO audit + edges.
func (w *worker) publishResult(job queue.PageJob, res checker.CheckResult, links []string) {
	pr := store.PageResult{
		JobID:         job.JobID,
		URL:           job.URL,
		StatusCode:    res.StatusCode,
		ResponseTime:  res.ResponseTime,
		ErrorType:     res.ErrorType,
		IsAlive:       res.IsAlive,
		Depth:         job.Depth,
		RetryCount:    job.RetryCount,
		RedirectChain: res.RedirectChain,
	}
	resultJSON, _ := json.Marshal(pr) // marshaling a plain struct can't realistically fail

	msg := queue.PageChecked{
		JobID:   job.JobID,
		URL:     job.URL,
		Depth:   job.Depth,
		IsAlive: res.IsAlive,
		Result:  resultJSON,
	}

	if hasHTML(res) {
		audit := seo.AuditHTML(res.Body, job.URL)
		sa := mapAudit(job.JobID, job.URL, audit)
		msg.SEO, _ = json.Marshal(sa) // marshaling a plain struct can't realistically fail
	}
	msg.Links = links

	if err := w.queue.PublishResult(msg); err != nil {
		log.Printf("publish result failed: %v", err)
	}
}

// publishChild counts a freshly-discovered page and publishes it onto its job's shard lane.
func (w *worker) publishChild(child queue.PageJob) {
	_ = w.cache.IncDiscovered(child.JobID)
	if err := w.queue.PublishPageJob(child); err != nil {
		log.Printf("[worker] publish child %s: %v", child.URL, err)
	}
}

// expands the frontier and returns only the children this page first discovered,
// so recorded edges form a strict BFS tree (one parent per page) rather than the full link soup.
// Three caps bound a sprawling crawl: depth (MaxDepth), global (MaxPages), per-category (MaxPerCategory).
func (w *worker) enqueueLinks(job queue.PageJob, res checker.CheckResult) []string {
	base, err := url.Parse(res.FinalURL)
	if err != nil {
		return nil
	}
	childDepth := job.Depth + 1
	if w.cfg.MaxDepth > 0 && childDepth > w.cfg.MaxDepth {
		log.Printf("[worker] depth cap hit (%d), skipping children of %s", w.cfg.MaxDepth, job.URL)
		return nil
	}

	var discovered []string
	capLogged := false
	for _, link := range crawler.ExtractLinks(res.Body, base) {
		n, _ := w.cache.SeenCount(job.JobID)
		if n >= w.cfg.MaxPages {
			if !capLogged {
				log.Printf("[worker] page cap hit (%d), no more URLs accepted", w.cfg.MaxPages)
				capLogged = true
			}
			break
		}
		// dedupe on the value-agnostic key so /post?id=1 and /post?id=2 collapse to one page
		isNew, err := w.cache.MarkSeen(job.JobID, crawler.CanonicalKey(link))
		if err != nil || !isNew {
			continue
		}

		// per-category soft cap: increment first, then drop if it would overflow
		if w.cfg.MaxPerCategory > 0 {
			cat := categoryOf(link)
			count, err := w.cache.IncCategory(job.JobID, cat)
			if err == nil && count > w.cfg.MaxPerCategory {
				if count == w.cfg.MaxPerCategory+1 {
					log.Printf("[worker] category cap hit (%d) for %s, skipping further URLs in it", w.cfg.MaxPerCategory, cat)
				}
				continue
			}
		}

		w.publishChild(queue.PageJob{JobID: job.JobID, URL: link, Depth: childDepth, Shard: job.Shard})
		discovered = append(discovered, link)
	}
	return discovered
}

// drains queueName one at a time: nil acks; a handler error requeues once, then
// dead-letters on the retry (so a transient blip doesn't drop a result, nor loop forever).
func runConsumer(q *queue.Queue, queueName string, wg *sync.WaitGroup,
	handle func(queue.PageChecked) error) (*amqp.Channel, error) {

	deliveries, ch, err := q.Consume(queueName, 1)
	if err != nil {
		return nil, err
	}
	wg.Add(1)
	go func() {
		defer wg.Done()
		for d := range deliveries {
			var msg queue.PageChecked
			if err := json.Unmarshal(d.Body, &msg); err != nil {
				_ = d.Nack(false, false) // unparseable: requeue can't help
				continue
			}
			if err := handle(msg); err != nil {
				requeue := !d.Redelivered // retry once, then dead-letter
				log.Printf("[%s] handler error (requeue=%v): %v", queueName, requeue, err)
				_ = d.Nack(false, requeue)
				continue
			}
			_ = d.Ack(false)
		}
	}()
	return ch, nil
}

// unmarshals the optional SEO blob on a result message; ok=false when it's absent
// (e.g. a rotten page), "null", or unparseable.
func decodeSEO(raw json.RawMessage) (store.SEOAudit, bool) {
	if len(raw) == 0 || string(raw) == "null" {
		return store.SEOAudit{}, false
	}
	var audit store.SEOAudit
	if err := json.Unmarshal(raw, &audit); err != nil {
		return store.SEOAudit{}, false
	}
	return audit, true
}

// persists rot + SEO rows, bumps progress, and flips the job to complete.
type reportBuilder struct {
	store *store.Store
	cache *cache.Cache
}

// persists a checked page (rot row, SEO audit, links) and bumps progress.
func (rb *reportBuilder) handle(msg queue.PageChecked) error {
	// cancelled mid-flight: drop the message, preserving whatever was already saved
	if rb.cache.IsCancelled(msg.JobID) {
		return nil
	}
	var pr store.PageResult
	if err := json.Unmarshal(msg.Result, &pr); err != nil {
		return err
	}
	if err := rb.store.InsertPageResult(pr); err != nil {
		return err
	}

	audit, hasSEO := decodeSEO(msg.SEO)
	if hasSEO {
		audit.JobID = msg.JobID
		audit.URL = msg.URL
		if err := rb.store.InsertSEOAudit(audit); err != nil {
			return err
		}
	}

	// persist outbound edges for the graph view (INSERT IGNORE dedupes DB-side)
	for _, target := range msg.Links {
		if err := rb.store.InsertLink(msg.JobID, msg.URL, target); err != nil {
			log.Printf("[report] insert link failed: %v", err)
		}
	}

	log.Printf("[report] saved %s  seo=%v  links=%d", msg.URL, hasSEO, len(msg.Links))

	if err := rb.cache.IncChecked(msg.JobID, msg.IsAlive); err != nil {
		return err
	}
	return rb.maybeComplete(msg.JobID)
}

// marks the job done once `checked` catches up to `discovered`. The IsCancelled
// guard is belt-and-suspenders for a result that was in-flight at cancel time.
func (rb *reportBuilder) maybeComplete(jobID string) error {
	if rb.cache.IsCancelled(jobID) {
		return nil
	}
	prog, err := rb.cache.GetProgress(jobID)
	if err != nil {
		return err
	}
	if prog["discovered"] > 0 && prog["checked"] >= prog["discovered"] {
		if err := rb.store.SetTotalPages(jobID, prog["checked"]); err != nil {
			return err
		}
		log.Printf("[report] job %s COMPLETE: %d pages (%d healthy, %d rotten)",
			jobID[:8], prog["checked"], prog["healthy"], prog["rotten"])
		_ = rb.cache.ReleaseShard(jobID) // free the lane for new crawls
		return rb.store.UpdateJobStatus(jobID, "complete")
	}
	return nil
}

// hits Wayback for rotten pages only; isolated so its slowness can't stall reports.
type archiveChecker struct {
	store *store.Store
	cache *cache.Cache
}

// looks up a Wayback snapshot for rotten pages and stores it.
func (ac *archiveChecker) handle(msg queue.PageChecked) error {
	if msg.IsAlive {
		return nil
	}
	// Stop wasting Wayback calls (slow + rate-limited) once the user cancelled.
	if ac.cache.IsCancelled(msg.JobID) {
		return nil
	}
	log.Printf("[archive] looking up wayback for %s", msg.URL)
	snap, err := archive.Available(msg.URL)
	if err != nil {
		log.Printf("[archive] wayback error for %s: %v", msg.URL, err)
		return err
	}
	if snap == "" {
		log.Printf("[archive] no snapshot for %s", msg.URL)
		return nil
	}
	log.Printf("[archive] snapshot found: %s -> %s", msg.URL, snap)
	return ac.store.SetArchiveURL(msg.JobID, msg.URL, snap)
}

// buckets pages by URL category and rewrites the category_reports row each tick.
// In-memory tallies are fine given a single aggregator instance.
type aggregator struct {
	store *store.Store
	cache *cache.Cache
	mu    sync.Mutex
	stats map[string]map[string]*catTally
}

type catTally struct {
	total      int
	rotten     int
	scoreSum   int
	scoreCount int
}

// builds an aggregator with empty per-job category tallies.
func newAggregator(st *store.Store, ca *cache.Cache) *aggregator {
	return &aggregator{store: st, cache: ca, stats: map[string]map[string]*catTally{}}
}

// tallies a page into its URL category and rewrites that category's report row.
func (ag *aggregator) handle(msg queue.PageChecked) error {
	// cancelled: skip the write and free the per-job stats so it doesn't squat on memory
	if ag.cache.IsCancelled(msg.JobID) {
		ag.mu.Lock()
		delete(ag.stats, msg.JobID)
		ag.mu.Unlock()
		return nil
	}
	cat := categoryOf(msg.URL)

	var seoScore int
	a, hasSEO := decodeSEO(msg.SEO)
	if hasSEO {
		seoScore = a.Score
	}

	ag.mu.Lock()
	if ag.stats[msg.JobID] == nil {
		ag.stats[msg.JobID] = map[string]*catTally{}
	}
	t := ag.stats[msg.JobID][cat]
	if t == nil {
		t = &catTally{}
		ag.stats[msg.JobID][cat] = t
	}
	t.total++
	if !msg.IsAlive {
		t.rotten++
	}
	if hasSEO {
		t.scoreSum += seoScore
		t.scoreCount++
	}
	snapshot := *t
	ag.mu.Unlock()

	avg := 0
	if snapshot.scoreCount > 0 {
		avg = snapshot.scoreSum / snapshot.scoreCount
	}
	pattern := classifyPattern(snapshot.total, snapshot.rotten)
	log.Printf("[aggregator] %s: %d pages, %d rotten, avg_seo=%d, pattern=%s",
		cat, snapshot.total, snapshot.rotten, avg, pattern)
	return ag.store.ReplaceCategoryReport(msg.JobID, store.CategoryReport{
		Category:    cat,
		TotalPages:  snapshot.total,
		RottenPages: snapshot.rotten,
		AvgSEOScore: avg,
		Pattern:     pattern,
	})
}
