// Command api serves the LinkTrace HTTP API: crawl creation/control, report/graph/SEO
// reads, and auth. Handler helpers live in utils.go.
package main

import (
	"context"
	"encoding/json"
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

// Server bundles shared dependencies so handlers can reach them without globals.
type Server struct {
	cfg   config.Config
	store *store.Store
	cache *cache.Cache
	queue *queue.Queue
}

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
	r.Get("/check/{id}", s.handleStatus)
	r.Get("/check/{id}/results", s.handleResults)
	r.Get("/check/{id}/report", s.handleReport)
	r.Get("/check/{id}/graph", s.handleGraph)
	r.Get("/check/{id}/seo", s.handleSEODetail)

	r.With(auth.Require(s.cache)).Get("/history", s.handleHistory)

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

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	_ = srv.Shutdown(ctx)
	log.Println("API stopped")
}

type createRequest struct {
	URL string `json:"url"`
}

// handleCreate (POST /check) validates the URL, creates the job row, seeds the crawl, returns 202.
func (s *Server) handleCreate(w http.ResponseWriter, r *http.Request) {
	var req createRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.URL == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "body must be {\"url\":\"...\"}"})
		return
	}
	u, err := url.Parse(req.URL)
	if err != nil || (u.Scheme != "http" && u.Scheme != "https") || u.Host == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "url must be an absolute http(s) URL"})
		return
	}
	// normalise through the same canonical form used on extracted links, else the homepage crawls twice
	seed := crawler.NormalizeURL(u.String())

	id := uuid.NewString()
	owner := auth.UserID(r)
	ownerLabel := "anonymous"
	if owner != "" {
		ownerLabel = "user " + owner[:8]
	}
	log.Printf("[api] new job %s for %s (%s)", id[:8], seed, ownerLabel)

	if err := s.store.CreateJob(id, seed, owner); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "could not create job"})
		return
	}

	// runs before the crawl so we can honour robots.txt (costs ~1-2s of HTTP up front)
	siteAudit := toStoreSiteAudit(site.Run(seed))
	if err := s.store.SaveSiteAudit(id, siteAudit); err != nil {
		log.Printf("[api] save site audit: %v", err)
	}
	if siteAudit.RobotsDisallowAll {
		log.Printf("[api] job %s BLOCKED by robots.txt", id[:8])
		_ = s.store.UpdateJobStatus(id, "failed")
		writeJSON(w, http.StatusOK, map[string]string{"job_id": id, "status": "blocked_by_robots"})
		return
	}

	_ = s.store.UpdateJobStatus(id, "crawling")
	log.Printf("[api] job %s seeding queue with %s", id[:8], seed)

	// mark+count before publishing so the seed is counted exactly once
	if _, err := s.cache.MarkSeen(id, crawler.CanonicalKey(seed)); err != nil {
		log.Printf("[api] MarkSeen seed: %v", err)
	}
	_ = s.cache.IncDiscovered(id)
	if err := s.queue.PublishPageJob(queue.PageJob{JobID: id, URL: seed, Depth: 0}); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "could not enqueue"})
		return
	}

	// sitemap URLs are deliberately not enqueued: the crawl stays a pure BFS from the
	// homepage, and unreached sitemap pages become the coverage_gap report's "missed" entries.
	writeJSON(w, http.StatusAccepted, map[string]string{"job_id": id, "status": "crawling"})
}

// handleCancel (POST /check/{id}/cancel) sets the Redis cancel flag and marks the job stopped;
// worker consumers check IsCancelled and silently ack the rest so the queue drains cheaply.
func (s *Server) handleCancel(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")

	job, err := s.store.GetJob(id)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "lookup failed"})
		return
	}
	if job == nil {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "job not found"})
		return
	}
	if err := s.cache.Cancel(id); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "cancel failed"})
		return
	}
	log.Printf("[api] job %s STOPPED by user", id[:8])
	// cancelled jobs never bump `checked`, so maybeComplete won't fire; set status here
	_ = s.store.UpdateJobStatus(id, "stopped")
	writeJSON(w, http.StatusOK, map[string]string{"job_id": id, "status": "stopped"})
}

// GET /check/{id}, job row (MySQL) + live progress (Redis).
func (s *Server) handleStatus(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")

	job, err := s.store.GetJob(id)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "lookup failed"})
		return
	}
	if job == nil {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "job not found"})
		return
	}

	prog, err := s.cache.GetProgress(id)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "progress lookup failed"})
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"job_id":     job.ID,
		"url":        job.URL,
		"status":     job.Status,
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

	pages, err := s.store.ListPageResults(id)
	if err != nil {
		log.Printf("handleResults: ListPageResults(%s): %v", id, err)
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "results lookup failed"})
		return
	}
	audits, err := s.store.ListSEOAudits(id)
	if err != nil {
		log.Printf("handleResults: ListSEOAudits(%s): %v", id, err)
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "audits lookup failed"})
		return
	}

	auditByURL := make(map[string]store.SEOAudit, len(audits))
	for _, a := range audits {
		auditByURL[a.URL] = a
	}

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
		if a, ok := auditByURL[p.URL]; ok {
			score := a.Score
			row.SEOScore = &score
		}
		out = append(out, row)
	}
	writeJSON(w, http.StatusOK, out)
}

// GET /check/{id}/report, overall totals + per-category breakdown.
func (s *Server) handleReport(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")

	pages, err := s.store.ListPageResults(id)
	if err != nil {
		log.Printf("handleReport: ListPageResults(%s): %v", id, err)
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "report lookup failed"})
		return
	}
	audits, err := s.store.ListSEOAudits(id)
	if err != nil {
		log.Printf("handleReport: ListSEOAudits(%s): %v", id, err)
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "audits lookup failed"})
		return
	}
	cats, err := s.store.ListCategoryReports(id)
	if err != nil {
		log.Printf("handleReport: ListCategoryReports(%s): %v", id, err)
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "category lookup failed"})
		return
	}

	overall := computeOverall(pages, audits)
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
		"overall":      overall,
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

	pages, err := s.store.ListPageResults(id)
	if err != nil {
		log.Printf("handleGraph: ListPageResults(%s): %v", id, err)
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "pages lookup failed"})
		return
	}
	audits, err := s.store.ListSEOAudits(id)
	if err != nil {
		log.Printf("handleGraph: ListSEOAudits(%s): %v", id, err)
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "audits lookup failed"})
		return
	}
	links, err := s.store.ListLinks(id)
	if err != nil {
		log.Printf("handleGraph: ListLinks(%s): %v", id, err)
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "links lookup failed"})
		return
	}

	scoreByURL := make(map[string]int, len(audits))
	for _, a := range audits {
		scoreByURL[a.URL] = a.Score
	}

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
		if s, ok := scoreByURL[p.URL]; ok {
			s := s
			n.SEOScore = &s
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
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "missing ?url"})
		return
	}
	audit, err := s.store.GetSEOAudit(id, pageURL)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "lookup failed"})
		return
	}
	if audit == nil {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "no audit for this URL"})
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
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "bad request"})
		return
	}
	username := strings.TrimSpace(req.Username)
	if len(username) < 2 || len(username) > 64 {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "username must be 2 to 64 characters"})
		return
	}
	if len(req.Password) < 8 {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "password must be at least 8 characters"})
		return
	}
	hash, err := auth.HashPassword(req.Password)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "could not hash"})
		return
	}
	user := store.User{ID: uuid.NewString(), Username: username, PasswordHash: hash}
	if err := s.store.CreateUser(user); err != nil {
		if store.IsDuplicateUsername(err) {
			writeJSON(w, http.StatusConflict, map[string]string{"error": "username already taken"})
			return
		}
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "could not create user"})
		return
	}
	if err := s.startSession(w, user.ID); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "session error"})
		return
	}
	writeJSON(w, http.StatusCreated, map[string]string{"username": user.Username})
}

// POST /auth/login
func (s *Server) handleLogin(w http.ResponseWriter, r *http.Request) {
	var req authRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "bad request"})
		return
	}
	user, err := s.store.GetUserByUsername(strings.TrimSpace(req.Username))
	// Identical error whether the username is unknown or the password is wrong, so an attacker
	// can't probe which usernames are registered.
	if err != nil || user == nil || !auth.CheckPassword(user.PasswordHash, req.Password) {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "invalid username or password"})
		return
	}
	if err := s.startSession(w, user.ID); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "session error"})
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
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "not logged in"})
		return
	}
	user, err := s.store.GetUserByID(userID)
	if err != nil || user == nil {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "not logged in"})
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"username": user.Username})
}

// GET /history (protected by Require middleware, so UserID is guaranteed non-empty).
func (s *Server) handleHistory(w http.ResponseWriter, r *http.Request) {
	entries, err := s.store.ListUserHistory(auth.UserID(r))
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "history lookup failed"})
		return
	}
	if entries == nil {
		entries = []store.HistoryEntry{}
	}
	writeJSON(w, http.StatusOK, entries)
}
