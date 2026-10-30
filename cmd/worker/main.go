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
	"github.com/Tom-the-Bomb/linktrace/internal/httpx"
	"github.com/Tom-the-Bomb/linktrace/internal/queue"
	"github.com/Tom-the-Bomb/linktrace/internal/robots"
	"github.com/Tom-the-Bomb/linktrace/internal/seo"
	"github.com/Tom-the-Bomb/linktrace/internal/store"
)

const (
	maxRetries        = 3
	rateLimitBackoff  = time.Second
	maxRetryAfterWait = 15 * time.Second // longer is recorded as blocked
)

// result queues are shared by every job, so a backlog stalls everyone's progress; keep them
// near-empty
const (
	reportConsumers  = 16
	archiveConsumers = 8 // modest to avoid Wayback throttling
)

func main() {
	cfg := config.Load()
	httpx.AllowPrivateTargets = cfg.AllowPrivateTargets

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

	w := &worker{cfg: cfg, cache: ca, queue: q}
	rb := &reportBuilder{store: st, cache: ca}
	ac := &archiveChecker{rb}

	var wg sync.WaitGroup
	channels, err := startPageWorkers(w, &wg)
	if err != nil {
		log.Fatalf("page workers: %v", err)
	}
	reportCh, err := runConsumer(q, queue.QReport, reportConsumers, &wg, rb.handle)
	if err != nil {
		log.Fatalf("report consumer: %v", err)
	}
	archiveCh, err := runConsumer(q, queue.QArchive, archiveConsumers, &wg, ac.handle)
	if err != nil {
		log.Fatalf("archive consumer: %v", err)
	}
	channels = append(channels, reportCh, archiveCh)

	log.Printf("worker running: %d page goroutines across %d shards + %d result consumers",
		cfg.WorkerCount, cfg.ShardCount, reportConsumers+archiveConsumers)

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

type worker struct {
	cfg   config.Config
	cache *cache.Cache
	queue *queue.Queue
}

// splits workers across shard lanes; a job rides one lane, so one crawl
// can occupy at most ~1/ShardCount of them.
func startPageWorkers(w *worker, wg *sync.WaitGroup) ([]*amqp.Channel, error) {
	perLane := max(1, w.cfg.WorkerCount/w.cfg.ShardCount)
	var channels []*amqp.Channel
	for shard := range w.cfg.ShardCount {
		deliveries, ch, err := w.queue.Consume(queue.ShardQueue(shard), perLane)
		if err != nil {
			return channels, err
		}
		for range perLane {
			wg.Go(func() {
				for d := range deliveries {
					w.processPage(d)
				}
			})
		}
		channels = append(channels, ch)
	}
	return channels, nil
}

func (w *worker) processPage(d amqp.Delivery) {
	var job queue.PageJob
	if err := json.Unmarshal(d.Body, &job); err != nil {
		log.Printf("[worker] unparseable message, dead-lettering: %v", err)
		_ = d.Nack(false, false)
		return
	}

	if w.cache.IsCancelled(job.JobID) {
		log.Printf("[worker] skip %s (job cancelled)", job.URL)
		_ = d.Ack(false)
		return
	}

	log.Printf("[worker] crawling depth=%d %s", job.Depth, job.URL)

	domain := domainOf(job.URL)
	var allowed bool
	var err error
	if job.CrawlDelay > 0 {
		allowed, err = w.cache.AllowEvery(domain, time.Duration(job.CrawlDelay)*time.Second)
	} else {
		allowed, err = w.cache.Allow(domain, w.cfg.RatePerMin)
	}
	if err != nil {
		log.Printf("[worker] ratelimit error: %v", err)
	}
	if !allowed {
		// republish, not nack: a nack requeues at the front, so a slow site or long Crawl-delay
		// would hold up other crawls. The sleep stops a hot loop.
		log.Printf("[worker] rate-limited, requeueing %s", job.URL)
		time.Sleep(rateLimitBackoff)
		w.republish(d, job)
		return
	}

	res := checker.Check(job.URL)

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

	if isTransient(res.ErrorType) && job.RetryCount < maxRetries {
		log.Printf("[worker] retry %d/%d (%s) %s", job.RetryCount+1, maxRetries, res.ErrorType, job.URL)
		w.requeue(d, job)
		return
	}

	// children (discovered++) before the result (checked++), else checked >= discovered could
	// complete the job early
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

func (w *worker) requeue(d amqp.Delivery, job queue.PageJob) {
	job.RetryCount++
	w.republish(d, job)
}

func (w *worker) republish(d amqp.Delivery, job queue.PageJob) {
	if err := w.queue.PublishPageJob(job); err != nil {
		log.Printf("[worker] republish %s failed: %v", job.URL, err)
		_ = d.Nack(false, true)
		return
	}
	_ = d.Ack(false)
}

func (w *worker) publishResult(job queue.PageJob, res checker.CheckResult, links []string) {
	msg := queue.PageChecked{
		PageResult: store.PageResult{
			JobID:        job.JobID,
			URL:          job.URL,
			StatusCode:   res.StatusCode,
			ResponseTime: res.ResponseTime,
			ErrorType:    res.ErrorType,
			IsAlive:      res.IsAlive,
			Depth:        job.Depth,
			RetryCount:   job.RetryCount,
		},
		Links: links,
	}
	if hasHTML(res) {
		msg.SEO = &store.SEOAudit{JobID: job.JobID, URL: job.URL, Audit: seo.AuditHTML(res.Body, res.FinalURL)}
	}
	if err := w.queue.PublishResult(msg); err != nil {
		log.Printf("[worker] publish result failed: %v", err)
	}
}

func (w *worker) publishChild(child queue.PageJob) {
	_ = w.cache.IncProgress(child.JobID, "discovered")
	if err := w.queue.PublishPageJob(child); err != nil {
		log.Printf("[worker] publish child %s: %v", child.URL, err)
	}
}

// returns only links this page discovered first, so edges form a BFS tree.
func (w *worker) enqueueLinks(job queue.PageJob, res checker.CheckResult) []string {
	base, err := url.Parse(res.FinalURL)
	if err != nil || (job.Site != "" && crawler.SiteKey(base.Hostname()) != job.Site) {
		return nil
	}
	childDepth := job.Depth + 1
	if w.cfg.MaxDepth > 0 && childDepth > w.cfg.MaxDepth {
		log.Printf("[worker] depth cap hit (%d), skipping children of %s", w.cfg.MaxDepth, job.URL)
		return nil
	}
	links := crawler.ExtractLinks(res.Body, base)
	if len(links) == 0 {
		return nil
	}
	rules, err := w.cache.RobotsRules(job.JobID)
	if err != nil {
		log.Printf("[worker] robots rules for %s: %v", job.JobID, err)
		return nil // without the rules there's no telling what's disallowed
	}

	maxPages := w.cfg.MaxPages
	if job.MaxPages > 0 {
		maxPages = min(maxPages, job.MaxPages)
	}
	var discovered []string
	for _, link := range links {
		// before marking it seen, so a disallowed URL never counts toward the cap
		if len(rules) > 0 && !robots.Allowed(rules, robotsPath(link)) {
			continue
		}
		key := crawler.CanonicalKey(link)
		if seen, err := w.cache.IsSeen(job.JobID, key); err != nil || seen {
			continue
		}
		// before the page cap, so URLs a full category drops don't use up the crawl's pages
		if w.cfg.MaxPerCategory > 0 {
			cat := crawler.CategoryOf(link)
			count, err := w.cache.IncCategory(job.JobID, cat)
			if err == nil && count > w.cfg.MaxPerCategory {
				if count == w.cfg.MaxPerCategory+1 {
					log.Printf("[worker] category cap hit (%d) for %s, skipping further URLs in it", w.cfg.MaxPerCategory, cat)
				}
				continue
			}
		}
		isNew, full, err := w.cache.MarkSeenUnder(job.JobID, key, maxPages)
		if full {
			log.Printf("[worker] page cap hit (%d), no more URLs accepted", maxPages)
			break
		}
		if err != nil || !isNew {
			continue
		}

		w.publishChild(queue.PageJob{
			JobID: job.JobID, URL: link, Depth: childDepth, Shard: job.Shard,
			CrawlDelay: job.CrawlDelay, MaxPages: job.MaxPages, Site: job.Site,
		})
		discovered = append(discovered, link)
	}
	return discovered
}

func runConsumer(q *queue.Queue, queueName string, concurrency int, wg *sync.WaitGroup,
	handle func(msg queue.PageChecked, final bool) error) (*amqp.Channel, error) {

	deliveries, ch, err := q.Consume(queueName, concurrency)
	if err != nil {
		return nil, err
	}
	for range concurrency {
		wg.Go(func() {
			for d := range deliveries {
				var msg queue.PageChecked
				if err := json.Unmarshal(d.Body, &msg); err != nil {
					_ = d.Nack(false, false)
					continue
				}
				if err := handle(msg, d.Redelivered); err != nil {
					requeue := !d.Redelivered // retry once, then drop
					log.Printf("[%s] handler error (requeue=%v): %v", queueName, requeue, err)
					_ = d.Nack(false, requeue)
					continue
				}
				_ = d.Ack(false)
			}
		})
	}
	return ch, nil
}

type reportBuilder struct {
	store *store.Store
	cache *cache.Cache
}

// final is the last delivery: a page that still can't be saved is counted anyway, so the crawl
// can finish without it.
func (rb *reportBuilder) handle(msg queue.PageChecked, final bool) error {
	if rb.cache.IsCancelled(msg.JobID) {
		return nil
	}
	if done, err := rb.cache.IsChecked(msg.JobID, msg.URL); err == nil && done {
		return rb.maybeComplete(msg.JobID)
	}
	if err := rb.save(msg); err != nil {
		if !final {
			return err
		}
		log.Printf("[report] dropping %s: %v", msg.URL, err)
	}
	if err := rb.cache.MarkChecked(msg.JobID, msg.URL, msg.IsAlive); err != nil {
		return err
	}
	return rb.maybeComplete(msg.JobID)
}

func (rb *reportBuilder) save(msg queue.PageChecked) error {
	if err := rb.store.InsertPageResult(msg.PageResult); err != nil {
		return err
	}
	if msg.SEO != nil {
		if err := rb.store.InsertSEOAudit(*msg.SEO); err != nil {
			return err
		}
	}
	if err := rb.store.InsertLinks(msg.JobID, msg.URL, msg.Links); err != nil {
		log.Printf("[report] insert links failed: %v", err)
	}
	log.Printf("[report] saved %s  seo=%v  links=%d", msg.URL, msg.SEO != nil, len(msg.Links))
	return nil
}

// re-checks cancel in case it landed mid-handle.
func (rb *reportBuilder) maybeComplete(jobID string) error {
	if rb.cache.IsCancelled(jobID) {
		return nil
	}
	prog, err := rb.cache.GetProgress(jobID)
	if err != nil {
		return err
	}
	// broken pages also wait for their Wayback lookup, so the final report has every link
	if prog.Discovered > 0 && prog.Checked >= prog.Discovered && prog.Archived >= prog.Rotten {
		if err := rb.store.UpdateJobStatus(jobID, "complete"); err != nil {
			return err
		}
		// written before claiming: the write is idempotent, but a claim taken first would make a
		// failed write's redelivery lose the claim and wedge the job in `crawling`
		if won, err := rb.cache.ClaimComplete(jobID); err != nil || !won {
			return err
		}
		log.Printf("[report] job %s COMPLETE: %d pages (%d healthy, %d rotten)",
			jobID[:8], prog.Checked, prog.Healthy, prog.Rotten)
		_ = rb.cache.EndJob(jobID)
	}
	return nil
}

type archiveChecker struct {
	*reportBuilder
}

// final is the last delivery: a lookup that still fails is counted anyway, so the crawl can
// complete without it.
func (ac *archiveChecker) handle(msg queue.PageChecked, final bool) error {
	if msg.IsAlive || ac.cache.IsCancelled(msg.JobID) {
		return nil
	}
	if err := ac.lookup(msg); err != nil {
		if !final {
			return err
		}
		log.Printf("[archive] dropping %s: %v", msg.URL, err)
	}
	if err := ac.cache.IncProgress(msg.JobID, "archived"); err != nil {
		return err
	}
	return ac.maybeComplete(msg.JobID)
}

func (ac *archiveChecker) lookup(msg queue.PageChecked) error {
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
