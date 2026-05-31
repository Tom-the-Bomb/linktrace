// Command worker runs the crawl pipeline: page-fetch goroutines plus the report, archive,
// and aggregate result consumers. Pure helpers live in utils.go.
package main

import (
	"encoding/json"
	"log"
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

const maxRetries = 3

// main starts the page-fetch workers and the result consumers, then waits for shutdown.
func main() {
	cfg := config.Load()

	st, err := store.New(cfg.MySQLDSN)
	if err != nil {
		log.Fatalf("mysql: %v", err)
	}
	defer st.Close()

	ca, err := cache.New(cfg.RedisAddr)
	if err != nil {
		log.Fatalf("redis: %v", err)
	}
	defer ca.Close()

	q, err := queue.New(cfg.RabbitURL)
	if err != nil {
		log.Fatalf("rabbitmq: %v", err)
	}
	defer q.Close()

	w := &worker{cfg: cfg, cache: ca, queue: q, chk: checker.New(10 * time.Second)}
	rb := &reportBuilder{store: st, cache: ca}
	ac := &archiveChecker{store: st, cache: ca}
	ag := newAggregator(st, ca)

	var wg sync.WaitGroup
	var channels []*amqp.Channel

	pageCh, err := startPageWorkers(w, &wg)
	if err != nil {
		log.Fatalf("page workers: %v", err)
	}
	channels = append(channels, pageCh)

	for _, c := range []struct {
		name    string
		handler func(queue.PageChecked) error
	}{
		{queue.QReport, rb.handle},
		{queue.QArchive, ac.handle},
		{queue.QAggregate, ag.handle},
	} {
		ch, err := runConsumer(q, c.name, &wg, c.handler)
		if err != nil {
			log.Fatalf("consumer %s: %v", c.name, err)
		}
		channels = append(channels, ch)
	}

	log.Printf("worker running: %d page goroutines + 3 result consumers", cfg.WorkerCount)

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

// worker bundles per-goroutine dependencies for processing a page job.
type worker struct {
	cfg   config.Config
	cache *cache.Cache
	queue *queue.Queue
	chk   *checker.Checker
}

// startPageWorkers launches cfg.WorkerCount goroutines, all consuming the same delivery channel.
// Prefetch = WorkerCount applies broker-side backpressure (fair dispatch + bounded in-flight).
func startPageWorkers(w *worker, wg *sync.WaitGroup) (*amqp.Channel, error) {
	deliveries, ch, err := w.queue.Consume(queue.WorkQueue, w.cfg.WorkerCount)
	if err != nil {
		return nil, err
	}
	for i := 0; i < w.cfg.WorkerCount; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for d := range deliveries {
				w.processPage(d)
			}
		}()
	}
	return ch, nil
}

// processPage is the per-message decision tree: rate-limit -> fetch -> retry/ack/dead-letter.
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
		time.Sleep(time.Second)
		_ = d.Nack(false, true)
		return
	}

	res := w.chk.Check(job.URL)

	// transient failure: republish with incremented retry count
	if isTransient(res.ErrorType) {
		if job.RetryCount < maxRetries {
			log.Printf("[worker] retry %d/%d (%s) %s", job.RetryCount+1, maxRetries, res.ErrorType, job.URL)
			retry := job
			retry.RetryCount++
			if err := w.queue.PublishPageJob(retry); err != nil {
				log.Printf("[worker] requeue failed: %v", err)
				_ = d.Nack(false, true)
				return
			}
			_ = d.Ack(false)
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
	if res.IsAlive && len(res.Body) > 0 {
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

// publishResult builds the fanout message: rot record + (for healthy HTML) SEO audit + edges.
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
	resultJSON, _ := json.Marshal(pr)

	msg := queue.PageChecked{
		JobID:   job.JobID,
		URL:     job.URL,
		Depth:   job.Depth,
		IsAlive: res.IsAlive,
		Result:  resultJSON,
	}

	if res.IsAlive && len(res.Body) > 0 {
		audit := seo.AuditHTML(res.Body, job.URL)
		sa := mapAudit(job.JobID, job.URL, audit)
		if seoJSON, err := json.Marshal(sa); err == nil {
			msg.SEO = seoJSON
		}
	}
	msg.Links = links

	if err := w.queue.PublishResult(msg); err != nil {
		log.Printf("publish result failed: %v", err)
	}
}

// enqueueLinks expands the frontier and returns only the children this page first discovered,
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

		_ = w.cache.IncDiscovered(job.JobID)
		_ = w.queue.PublishPageJob(queue.PageJob{
			JobID: job.JobID,
			URL:   link,
			Depth: childDepth,
		})
		discovered = append(discovered, link)
	}
	return discovered
}

// runConsumer drains queueName one at a time: handle returning nil acks, an error dead-letters.
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
				_ = d.Nack(false, false)
				continue
			}
			if err := handle(msg); err != nil {
				log.Printf("[%s] handler error: %v", queueName, err)
				_ = d.Nack(false, false)
				continue
			}
			_ = d.Ack(false)
		}
	}()
	return ch, nil
}

// reportBuilder persists rot + SEO rows, bumps progress, and flips the job to complete.
type reportBuilder struct {
	store *store.Store
	cache *cache.Cache
}

// handle persists a checked page (rot row, SEO audit, links) and bumps progress.
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

	hasSEO := len(msg.SEO) > 0 && string(msg.SEO) != "null"
	if hasSEO {
		var audit store.SEOAudit
		if err := json.Unmarshal(msg.SEO, &audit); err != nil {
			return err
		}
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

// maybeComplete marks the job done once `checked` catches up to `discovered`. The IsCancelled
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
		return rb.store.UpdateJobStatus(jobID, "complete")
	}
	return nil
}

// archiveChecker hits Wayback for rotten pages only; isolated so its slowness can't stall reports.
type archiveChecker struct {
	store *store.Store
	cache *cache.Cache
}

// handle looks up a Wayback snapshot for rotten pages and stores it.
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

// aggregator buckets pages by URL category and rewrites the category_reports row each tick.
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

// newAggregator builds an aggregator with empty per-job category tallies.
func newAggregator(st *store.Store, ca *cache.Cache) *aggregator {
	return &aggregator{store: st, cache: ca, stats: map[string]map[string]*catTally{}}
}

// handle tallies a page into its URL category and rewrites that category's report row.
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
	var hasSEO bool
	if len(msg.SEO) > 0 && string(msg.SEO) != "null" {
		var a store.SEOAudit
		if err := json.Unmarshal(msg.SEO, &a); err == nil {
			seoScore = a.Score
			hasSEO = true
		}
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
