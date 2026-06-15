// Command api serves the LinkTrace HTTP API: crawl creation/control, report/graph/SEO
// reads, and auth. Handler helpers live in utils.go.
package main

import (
	"context"
	"log"
	"net/http"
	"net/url"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/google/uuid"

	"github.com/Tom-the-Bomb/linktrace/internal/auth"
	"github.com/Tom-the-Bomb/linktrace/internal/cache"
	"github.com/Tom-the-Bomb/linktrace/internal/config"
	"github.com/Tom-the-Bomb/linktrace/internal/crawler"
	"github.com/Tom-the-Bomb/linktrace/internal/queue"
	"github.com/Tom-the-Bomb/linktrace/internal/site"
	"github.com/Tom-the-Bomb/linktrace/internal/store"
)

const shutdownTimeout = 5 * time.Second

// bundles shared dependencies so handlers can reach them without globals.
type Server struct {
	cfg   config.Config
	store *store.Store
	cache *cache.Cache
	queue *queue.Queue
}

// wires up the store/cache/queue, mounts the routes, and serves until shutdown.
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

	s := &Server{cfg: cfg, store: st, cache: ca, queue: q}

	r := chi.NewRouter()
	r.Use(middleware.Logger)
	r.Use(middleware.Recoverer)
	r.Use(corsMiddleware(cfg.FrontendOrigin))
	r.Use(auth.Optional(s.cache)) // tags the request with a user id if logged in; never blocks

	r.Post("/auth/register", s.handleRegister)
	r.Post("/auth/login", s.handleLogin)
	r.Post("/auth/logout", s.handleLogout)
	r.Get("/auth/me", s.handleMe)

	// crawl endpoints are anonymous-friendly; Optional tags ownership when a cookie is present
	r.Post("/check", s.handleCreate)
	r.Post("/check/{id}/cancel", s.handleCancel)
	r.Delete("/check/{id}", s.handleDelete)
	r.Get("/check/{id}", s.handleStatus)
	r.Get("/check/{id}/results", s.handleResults)
	r.Get("/check/{id}/report", s.handleReport)
	r.Get("/check/{id}/graph", s.handleGraph)
	r.Get("/check/{id}/seo", s.handleSEODetail)

	r.With(auth.Require(s.cache)).Get("/history", s.handleHistory)
	r.With(auth.Require(s.cache)).Delete("/auth/account", s.handleDeleteAccount)

	srv := &http.Server{Addr: cfg.HTTPAddr, Handler: r}

	go func() {
		log.Printf("API listening on %s", cfg.HTTPAddr)
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatal(err)
		}
	}()

	stop := make(chan os.Signal, 1)
	signal.Notify(stop, syscall.SIGINT, syscall.SIGTERM)
	<-stop

	ctx, cancel := context.WithTimeout(context.Background(), shutdownTimeout)
	defer cancel()
	_ = srv.Shutdown(ctx)
	log.Println("API stopped")
}

type createRequest struct {
	URL string `json:"url"`
}

// (POST /check) validates the URL, creates the job row, seeds the crawl, returns 202.
func (s *Server) handleCreate(w http.ResponseWriter, r *http.Request) {
	var req createRequest
	if !decodeJSON(w, r, &req) {
		return
	}
	if req.URL == "" {
		httpError(w, http.StatusBadRequest, `body must be {"url":"..."}`)
		return
	}
	u, err := url.Parse(req.URL)
	if err != nil || (u.Scheme != "http" && u.Scheme != "https") || u.Host == "" {
		httpError(w, http.StatusBadRequest, "url must be an absolute http(s) URL")
		return
	}
	// normalise through the same canonical form used on extracted links, else the homepage crawls twice
	seed := crawler.NormalizeURL(u.String())

	id := uuid.NewString()
	owner := auth.UserID(r)
	ownerLabel := "anonymous"
	if owner != "" {
		ownerLabel = "user " + short(owner)
	}
	log.Printf("[api] new job %s for %s (%s)", short(id), seed, ownerLabel)

	if err := s.store.CreateJob(id, seed, owner); err != nil {
		httpError(w, http.StatusInternalServerError, "could not create job")
		return
	}

	// runs before the crawl so we can honour robots.txt (costs ~1-2s of HTTP up front)
	siteAudit := toStoreSiteAudit(site.Run(seed))
	if err := s.store.SaveSiteAudit(id, siteAudit); err != nil {
		log.Printf("[api] save site audit: %v", err)
	}
	if siteAudit.RobotsDisallowAll {
		log.Printf("[api] job %s BLOCKED by robots.txt", short(id))
		_ = s.store.UpdateJobStatus(id, "failed")
		writeJSON(w, http.StatusOK, map[string]string{"job_id": id, "status": "blocked_by_robots"})
		return
	}

	_ = s.store.UpdateJobStatus(id, "crawling")

	// pin the crawl to the least-occupied shard lane; every page of this job rides that lane
	shard, err := s.cache.PlaceJob(id)
	if err != nil {
		log.Printf("[api] place job %s: %v", short(id), err) // shard defaults to 0 on error
	}
	log.Printf("[api] job %s seeding shard %d with %s", short(id), shard, seed)

	// mark+count before publishing so the seed is counted exactly once
	if _, err := s.cache.MarkSeen(id, crawler.CanonicalKey(seed)); err != nil {
		log.Printf("[api] MarkSeen seed: %v", err)
	}
	_ = s.cache.IncDiscovered(id)
	if err := s.queue.PublishPageJob(queue.PageJob{JobID: id, URL: seed, Depth: 0, Shard: shard}); err != nil {
		httpError(w, http.StatusInternalServerError, "could not enqueue")
		return
	}

	// sitemap URLs are deliberately not enqueued: the crawl stays a pure BFS from the
	// homepage, and unreached sitemap pages become the coverage_gap report's "missed" entries.
	writeJSON(w, http.StatusAccepted, map[string]string{"job_id": id, "status": "crawling"})
}

// (POST /check/{id}/cancel) sets the Redis cancel flag and marks the job stopped;
// workers check IsCancelled and silently ack the rest so the queue drains cheaply.
func (s *Server) handleCancel(w http.ResponseWriter, r *http.Request) {
	job := s.requireOwnedJob(w, r)
	if job == nil {
		return
	}
	if err := s.cache.Cancel(job.ID); err != nil {
		httpError(w, http.StatusInternalServerError, "cancel failed")
		return
	}
	log.Printf("[api] job %s STOPPED by user", short(job.ID))
	// cancelled jobs never complete, so free their lane here (maybeComplete won't)
	_ = s.cache.ReleaseShard(job.ID)
	// cancelled jobs never bump `checked`, so maybeComplete won't fire; set status here
	_ = s.store.UpdateJobStatus(job.ID, "stopped")
	writeJSON(w, http.StatusOK, map[string]string{"job_id": job.ID, "status": "stopped"})
}

// (DELETE /check/{id}) tears down a job. PurgeJob (tombstone + Redis keys) runs
// before DeleteJob so no in-flight worker re-creates rows mid-delete.
func (s *Server) handleDelete(w http.ResponseWriter, r *http.Request) {
	job := s.requireOwnedJob(w, r)
	if job == nil {
		return
	}
	if err := s.cache.PurgeJob(job.ID); err != nil {
		// Non-fatal: the tombstone/keys self-expire. Log and still remove the DB rows so the
		// user-visible delete succeeds rather than failing on a transient Redis hiccup.
		log.Printf("[api] job %s purge cache: %v", short(job.ID), err)
	}
	if err := s.store.DeleteJob(job.ID); err != nil {
		httpError(w, http.StatusInternalServerError, "delete failed")
		return
	}
	log.Printf("[api] job %s DELETED by user", short(job.ID))
	writeJSON(w, http.StatusOK, map[string]string{"job_id": job.ID, "status": "deleted"})
}

// GET /check/{id}, job row (MySQL) + live progress (Redis).
func (s *Server) handleStatus(w http.ResponseWriter, r *http.Request) {
	job := s.requireJob(w, chi.URLParam(r, "id"))
	if job == nil {
		return
	}

	prog, err := s.cache.GetProgress(job.ID)
	if err != nil {
		httpError(w, http.StatusInternalServerError, "progress lookup failed")
		return
	}

	// Redis progress counters expire after progressTTL, so a finished job reopened from
	// history later returns 0/0. Rebuild the counts from the persisted page rows instead.
	if prog["checked"] == 0 {
		if cs, serr := s.store.GetCrawlStats(job.ID); serr == nil && cs.TotalPages > 0 {
			prog["checked"] = cs.TotalPages
			prog["discovered"] = cs.TotalPages
			prog["rotten"] = cs.RottenCount
			prog["healthy"] = cs.TotalPages - cs.RottenCount
		}
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"job_id":     job.ID,
		"url":        job.URL,
		"status":     job.Status,
		"created_at": job.CreatedAt,
		"discovered": prog["discovered"],
		"checked":    prog["checked"],
		"healthy":    prog["healthy"],
		"rotten":     prog["rotten"],
	})
}

type pageRow struct {
	URL          string `json:"url"`
	IsAlive      bool   `json:"is_alive"`
	StatusCode   int    `json:"status_code"`
	ErrorType    string `json:"error_type"`
	Depth        int    `json:"depth"`
	ArchiveURL   string `json:"archive_url"`
	ResponseTime int    `json:"response_time"`
	SEOScore     *int   `json:"seo_score"`
}

// GET /check/{id}/results, per-page rot + SEO score, joined by URL.
func (s *Server) handleResults(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	if s.requireJob(w, id) == nil {
		return
	}
	pages, audits, ok := s.loadPagesAndAudits(w, id)
	if !ok {
		return
	}

	scores := scoreByURL(audits)
	out := make([]pageRow, 0, len(pages))
	for _, p := range pages {
		row := pageRow{
			URL:          p.URL,
			IsAlive:      p.IsAlive,
			StatusCode:   p.StatusCode,
			ErrorType:    p.ErrorType,
			Depth:        p.Depth,
			ArchiveURL:   p.ArchiveURL,
			ResponseTime: p.ResponseTime,
		}
		if score, ok := scores[p.URL]; ok {
			row.SEOScore = &score
		}
		out = append(out, row)
	}
	writeJSON(w, http.StatusOK, out)
}

// GET /check/{id}/report, overall totals + per-category breakdown.
func (s *Server) handleReport(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	if s.requireJob(w, id) == nil {
		return
	}
	pages, audits, ok := s.loadPagesAndAudits(w, id)
	if !ok {
		return
	}
	cats, err := s.store.ListCategoryReports(id)
	if err != nil {
		log.Printf("handleReport: ListCategoryReports(%s): %v", id, err)
		httpError(w, http.StatusInternalServerError, "category lookup failed")
		return
	}
	if cats == nil {
		cats = []store.CategoryReport{} // [] not null so the frontend can .length safely
	}

	// site-level sections are best-effort: log and continue so one missing row doesn't kill the report
	siteAudit, err := s.store.GetSiteAudit(id)
	if err != nil {
		log.Printf("site audit lookup: %v", err)
	}
	// pointer so a failed lookup serializes as null (panel hidden) instead of all-zeros
	var crawlStats *store.CrawlStats
	if cs, err := s.store.GetCrawlStats(id); err != nil {
		log.Printf("crawl stats lookup: %v", err)
	} else {
		crawlStats = &cs
	}
	var siteSEO *store.SiteSEO
	if ss, err := s.store.GetSiteSEO(id); err != nil {
		log.Printf("site seo lookup: %v", err)
	} else {
		siteSEO = &ss
	}
	// coverage gap: sitemap URLs vs crawled URLs
	var gap *site.CoverageGap
	if siteAudit != nil {
		crawledURLs := make([]string, 0, len(pages))
		rottenURLs := []string{}
		for _, p := range pages {
			crawledURLs = append(crawledURLs, p.URL)
			if !p.IsAlive {
				rottenURLs = append(rottenURLs, p.URL)
			}
		}
		g := site.ComputeCoverageGap(siteAudit.SitemapURLs, crawledURLs, rottenURLs)
		gap = &g
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"overall":      computeOverall(pages, audits),
		"categories":   cats,
		"site_audit":   siteAudit,
		"crawl_stats":  crawlStats,
		"site_seo":     siteSEO,
		"coverage_gap": gap,
	})
}

type graphNode struct {
	ID         string `json:"id"`
	URL        string `json:"url"`
	IsAlive    bool   `json:"is_alive"`
	StatusCode int    `json:"status_code"`
	ErrorType  string `json:"error_type"`
	Depth      int    `json:"depth"`
	SEOScore   *int   `json:"seo_score"`
}

type graphEdge struct {
	Source string `json:"source"`
	Target string `json:"target"`
}

// GET /check/{id}/graph, nodes (one per checked page) + edges (recorded by the worker).
// Edges referencing pages we never crawled (off-host, cap reached, etc.) are filtered out.
func (s *Server) handleGraph(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	if s.requireJob(w, id) == nil {
		return
	}
	pages, audits, ok := s.loadPagesAndAudits(w, id)
	if !ok {
		return
	}
	links, err := s.store.ListLinks(id)
	if err != nil {
		log.Printf("handleGraph: ListLinks(%s): %v", id, err)
		httpError(w, http.StatusInternalServerError, "links lookup failed")
		return
	}

	scores := scoreByURL(audits)
	nodes := make([]graphNode, 0, len(pages))
	urlSet := make(map[string]struct{}, len(pages))
	for _, p := range pages {
		n := graphNode{
			ID:         p.URL,
			URL:        p.URL,
			IsAlive:    p.IsAlive,
			StatusCode: p.StatusCode,
			ErrorType:  p.ErrorType,
			Depth:      p.Depth,
		}
		if score, ok := scores[p.URL]; ok {
			n.SEOScore = &score
		}
		nodes = append(nodes, n)
		urlSet[p.URL] = struct{}{}
	}

	edges := make([]graphEdge, 0, len(links))
	for _, l := range links {
		// drop edges to URLs we never reached; they'd render as orphan dots
		if _, ok := urlSet[l.Target]; !ok {
			continue
		}
		if _, ok := urlSet[l.Source]; !ok {
			continue
		}
		edges = append(edges, graphEdge{Source: l.Source, Target: l.Target})
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"nodes": nodes,
		"edges": edges,
	})
}

// GET /check/{id}/seo?url=..., full SEO audit row for one page (drilldown panel).
func (s *Server) handleSEODetail(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	pageURL := r.URL.Query().Get("url")
	if pageURL == "" {
		httpError(w, http.StatusBadRequest, "missing ?url")
		return
	}
	audit, err := s.store.GetSEOAudit(id, pageURL)
	if err != nil {
		httpError(w, http.StatusInternalServerError, "lookup failed")
		return
	}
	if audit == nil {
		httpError(w, http.StatusNotFound, "no audit for this URL")
		return
	}
	writeJSON(w, http.StatusOK, audit)
}

type authRequest struct {
	Username string `json:"username"`
	Password string `json:"password"`
}

// POST /auth/register
func (s *Server) handleRegister(w http.ResponseWriter, r *http.Request) {
	var req authRequest
	if !decodeJSON(w, r, &req) {
		return
	}
	username := strings.TrimSpace(req.Username)
	if len(username) < 2 || len(username) > 64 {
		httpError(w, http.StatusBadRequest, "username must be 2 to 64 characters")
		return
	}
	if len(req.Password) < 8 {
		httpError(w, http.StatusBadRequest, "password must be at least 8 characters")
		return
	}
	hash, err := auth.HashPassword(req.Password)
	if err != nil {
		httpError(w, http.StatusInternalServerError, "could not hash")
		return
	}
	user := store.User{ID: uuid.NewString(), Username: username, PasswordHash: hash}
	if err := s.store.CreateUser(user); err != nil {
		if store.IsDuplicateUsername(err) {
			httpError(w, http.StatusConflict, "username already taken")
			return
		}
		httpError(w, http.StatusInternalServerError, "could not create user")
		return
	}
	if err := s.startSession(w, user.ID); err != nil {
		httpError(w, http.StatusInternalServerError, "session error")
		return
	}
	writeJSON(w, http.StatusCreated, map[string]string{"username": user.Username})
}

// POST /auth/login
func (s *Server) handleLogin(w http.ResponseWriter, r *http.Request) {
	var req authRequest
	if !decodeJSON(w, r, &req) {
		return
	}
	user, err := s.store.GetUserByUsername(strings.TrimSpace(req.Username))
	// Identical error whether the username is unknown or the password is wrong, so an attacker
	// can't probe which usernames are registered.
	if err != nil || user == nil || !auth.CheckPassword(user.PasswordHash, req.Password) {
		httpError(w, http.StatusUnauthorized, "invalid username or password")
		return
	}
	if err := s.startSession(w, user.ID); err != nil {
		httpError(w, http.StatusInternalServerError, "session error")
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"username": user.Username})
}

// POST /auth/logout
func (s *Server) handleLogout(w http.ResponseWriter, r *http.Request) {
	if cookie, err := r.Cookie(auth.CookieName); err == nil {
		_ = s.cache.DeleteSession(cookie.Value)
	}
	auth.ClearSessionCookie(w)
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

// GET /auth/me, returns the current user's username or 401 if anonymous.
func (s *Server) handleMe(w http.ResponseWriter, r *http.Request) {
	userID := auth.UserID(r)
	if userID == "" {
		httpError(w, http.StatusUnauthorized, "not logged in")
		return
	}
	user, err := s.store.GetUserByID(userID)
	if err != nil || user == nil {
		httpError(w, http.StatusUnauthorized, "not logged in")
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"username": user.Username})
}

// (DELETE /auth/account) tears down each owned job, then the user row and
// session. Jobs go first because jobs.user_id FKs users(id).
func (s *Server) handleDeleteAccount(w http.ResponseWriter, r *http.Request) {
	userID := auth.UserID(r)

	jobIDs, err := s.store.ListUserJobIDs(userID)
	if err != nil {
		httpError(w, http.StatusInternalServerError, "lookup failed")
		return
	}
	for _, id := range jobIDs {
		if err := s.cache.PurgeJob(id); err != nil {
			log.Printf("[api] account delete: purge job %s: %v", short(id), err)
		}
		if err := s.store.DeleteJob(id); err != nil {
			httpError(w, http.StatusInternalServerError, "delete failed")
			return
		}
	}
	if err := s.store.DeleteUser(userID); err != nil {
		httpError(w, http.StatusInternalServerError, "delete failed")
		return
	}

	// invalidate the session, same as logout
	if cookie, cerr := r.Cookie(auth.CookieName); cerr == nil {
		_ = s.cache.DeleteSession(cookie.Value)
	}
	auth.ClearSessionCookie(w)
	log.Printf("[api] account %s DELETED (%d jobs)", short(userID), len(jobIDs))
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

// GET /history (protected by Require middleware, so UserID is guaranteed non-empty).
func (s *Server) handleHistory(w http.ResponseWriter, r *http.Request) {
	entries, err := s.store.ListUserHistory(auth.UserID(r))
	if err != nil {
		httpError(w, http.StatusInternalServerError, "history lookup failed")
		return
	}
	if entries == nil {
		entries = []store.HistoryEntry{}
	}
	writeJSON(w, http.StatusOK, entries)
}
