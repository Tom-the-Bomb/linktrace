package main

import (
	"encoding/json"
	"log"
	"mime"
	"net"
	"net/http"
	"net/netip"
	"sort"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"

	"github.com/Tom-the-Bomb/linktrace/internal/auth"
	"github.com/Tom-the-Bomb/linktrace/internal/site"
	"github.com/Tom-the-Bomb/linktrace/internal/store"
)

// writes v as a JSON response with the given status code.
func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

// writes a JSON {"error": msg} body with the given status.
func httpError(w http.ResponseWriter, status int, msg string) {
	writeJSON(w, status, map[string]string{"error": msg})
}

// truncates an id to its first 8 chars for logging, guarding ids shorter than that.
func short(id string) string {
	if len(id) > 8 {
		return id[:8]
	}
	return id
}

// maxBodyBytes caps request bodies. Every payload here is a small JSON object, so anything
// larger is a mistake or an attempt to make the server buffer an unbounded read.
const maxBodyBytes = 64 << 10

// decodes the request body into v; on failure it writes a 400 and returns false.
func decodeJSON(w http.ResponseWriter, r *http.Request, v any) bool {
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, maxBodyBytes)).Decode(v); err != nil {
		httpError(w, http.StatusBadRequest, "bad request")
		return false
	}
	return true
}

// returns the client IP for rate limiting. Behind Caddy the socket address is always the proxy,
// so the LAST X-Forwarded-For hop is used. Caddy appends the real peer, so a caller who sends
// their own header gets it overwritten in that position. Taking the first would be spoofable.
//
// This assumes exactly one trusted proxy and that nothing reaches the API directly (in prod only
// Caddy publishes ports). Publishing 8080, or adding a CDN in front, invalidates that: with a
// CDN the real client moves one position further left.
//
// An IPv6 address is cut to its /64, since one subscriber usually holds the whole block.
func clientIP(r *http.Request) string {
	ip := r.RemoteAddr
	if fwd := r.Header.Get("X-Forwarded-For"); fwd != "" {
		hops := strings.Split(fwd, ",")
		ip = strings.TrimSpace(hops[len(hops)-1])
	} else if host, _, err := net.SplitHostPort(r.RemoteAddr); err == nil {
		ip = host
	}
	if a, err := netip.ParseAddr(ip); err == nil && a.Is6() && !a.Is4In6() {
		return netip.PrefixFrom(a, 64).Masked().String()
	}
	return ip
}

// sets CORS headers for the configured frontend origin(s). origins is a comma-separated
// allowlist (e.g. "http://localhost:5173,http://10.0.0.168:5173" for LAN mobile testing); the
// request's Origin is echoed back only when it's on the list. Cookies require an EXACT origin
// (never "*") plus Allow-Credentials, and OPTIONS preflights short-circuit with 204.
func corsMiddleware(origins string) func(http.Handler) http.Handler {
	allowed := map[string]bool{}
	for _, o := range strings.Split(origins, ",") {
		if o = strings.TrimSpace(o); o != "" {
			allowed[o] = true
		}
	}
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			// all three headers are meaningless without Allow-Origin, so they travel together
			if origin := r.Header.Get("Origin"); allowed[origin] {
				w.Header().Set("Access-Control-Allow-Origin", origin)
				w.Header().Add("Vary", "Origin")
				w.Header().Set("Access-Control-Allow-Credentials", "true")
				w.Header().Set("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS")
				w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
			}
			if r.Method == http.MethodOptions {
				w.WriteHeader(http.StatusNoContent)
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}

// rejects state-changing requests not sent as JSON. A browser can't send that content type
// cross-origin without a CORS preflight, which only our own frontend passes, so other sites
// can't make their visitors' browsers start, stop or delete crawls.
func jsonOnly(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet && r.Method != http.MethodHead {
			if mt, _, _ := mime.ParseMediaType(r.Header.Get("Content-Type")); mt != "application/json" {
				httpError(w, http.StatusUnsupportedMediaType, "content type must be application/json")
				return
			}
		}
		next.ServeHTTP(w, r)
	})
}

// limitPerMin caps requests for the routes it wraps. Every caller is counted per client IP at
// perIP, and logged-in callers per account at perUser too, so signing up for more accounts
// doesn't add budget. bucket namespaces the counters so route groups don't share them. Must be
// mounted below auth.Optional, which resolves the identity.
func (s *Server) limitPerMin(bucket string, perIP, perUser int) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			ok := s.allow(bucket+":ip:"+clientIP(r), perIP)
			if userID := auth.UserID(r); ok && userID != "" {
				ok = s.allow(bucket+":u:"+userID, perUser)
			}
			if !ok {
				httpError(w, http.StatusTooManyRequests, "Too many requests. Try again in a minute.")
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}

// counts a request against key and reports whether it's within limit. Fails open, since a Redis
// blip shouldn't read as rate limiting (login keeps its own counters, which fail closed).
func (s *Server) allow(key string, limit int) bool {
	allowed, err := s.cache.AllowRequest(key, limit)
	if err != nil {
		log.Printf("[api] ratelimit %s: %v", key, err)
		return true
	}
	return allowed
}

// returns the job by id, or writes 500/404 and returns nil.
func (s *Server) requireJob(w http.ResponseWriter, id string) *store.Job {
	job, err := s.store.GetJob(id)
	if err != nil {
		httpError(w, http.StatusInternalServerError, "Couldn't load this crawl. Try again in a moment.")
		return nil
	}
	if job == nil {
		httpError(w, http.StatusNotFound, "job not found")
		return nil
	}
	return job
}

// is requireJob plus an owner check for mutations (see canManage). Writes 404/403 and returns
// nil if disallowed.
func (s *Server) requireOwnedJob(w http.ResponseWriter, r *http.Request) *store.Job {
	job := s.requireJob(w, chi.URLParam(r, "id"))
	if job == nil {
		return nil
	}
	if !canManage(job, r) {
		httpError(w, http.StatusForbidden, "Only the person who started this crawl can stop or delete it.")
		return nil
	}
	return job
}

// reports whether the caller may stop or delete job: its account owner, or the browser holding
// the owner cookie it was started with.
func canManage(job *store.Job, r *http.Request) bool {
	if job.UserID != "" {
		return job.UserID == auth.UserID(r)
	}
	return auth.OwnsAnonymous(r, job.AnonOwner)
}

// claims site for jobID. When another crawl of the site is still live it returns that crawl's
// id and false; a stale claim is cleared and retried once. Anything uncertain fails open, since
// it shouldn't stop anyone crawling.
func (s *Server) claimHost(site, jobID string) (string, bool) {
	for range 2 {
		holder, claimed, err := s.cache.ClaimHost(site, jobID)
		if err != nil {
			log.Printf("[api] claim host %s: %v", site, err)
			return "", true
		}
		if claimed {
			return "", true
		}
		job, err := s.store.GetJob(holder)
		if err != nil || job == nil {
			return "", true
		}
		if isLive(job) {
			return holder, false
		}
		_ = s.cache.ReleaseHost(holder)
	}
	return "", true
}

// pendingGrace outlasts site.Run, which a new crawl runs before it starts. A job still pending
// after this died before starting, so its claim is stale.
const pendingGrace = 2 * time.Minute

// reports whether job is a crawl that is running or about to start.
func isLive(job *store.Job) bool {
	return job.Status == "crawling" || (job.Status == "pending" && time.Since(job.CreatedAt) < pendingGrace)
}

// fetches a job's page rows + SEO audits, writing 500 and ok=false on failure.
func (s *Server) loadPagesAndAudits(w http.ResponseWriter, id string) (pages []store.PageResult, audits []store.SEOAudit, ok bool) {
	pages, err := s.store.ListPageResults(id)
	if err != nil {
		log.Printf("loadPagesAndAudits: ListPageResults(%s): %v", id, err)
		httpError(w, http.StatusInternalServerError, "results lookup failed")
		return nil, nil, false
	}
	audits, err = s.store.ListSEOAudits(id)
	if err != nil {
		log.Printf("loadPagesAndAudits: ListSEOAudits(%s): %v", id, err)
		httpError(w, http.StatusInternalServerError, "audits lookup failed")
		return nil, nil, false
	}
	return pages, audits, true
}

// indexes SEO audit scores by page URL for joining onto page rows.
func scoreByURL(audits []store.SEOAudit) map[string]int {
	m := make(map[string]int, len(audits))
	for _, a := range audits {
		m[a.URL] = a.Score
	}
	return m
}

// converts site.Audit to store.SiteAudit (keeps store from importing site).
func toStoreSiteAudit(a site.Audit) store.SiteAudit {
	return store.SiteAudit{
		RobotsFound:       a.RobotsFound,
		RobotsDisallowAll: a.RobotsDisallowAll,
		CrawlDelay:        a.CrawlDelay,
		SitemapFound:      a.SitemapFound,
		SitemapURL:        a.SitemapURL,
		SitemapURLCount:   a.SitemapURLCount,
		SitemapURLs:       a.SitemapURLs,
		IsHTTPS:           a.IsHTTPS,
		HTTPSRedirect:     a.HTTPSRedirect,
		CertValid:         a.CertValid,
		WWWCanonical:      a.WWWCanonical,
	}
}

// builds the report header: totals + average SEO score + top recurring issue codes.
func computeOverall(pages []store.PageResult, audits []store.SEOAudit) map[string]any {
	var rotten, healthy, scoreSum int
	for _, p := range pages {
		if p.IsAlive {
			healthy++
		} else {
			rotten++
		}
	}

	issueCounts := map[string]int{}
	for _, a := range audits {
		scoreSum += a.Score
		for _, iss := range a.Issues {
			issueCounts[iss.Message]++
		}
	}
	avg := 0
	if len(audits) > 0 {
		avg = scoreSum / len(audits)
	}

	// top 5 issues by frequency
	type kv struct {
		k string
		v int
	}
	ranked := make([]kv, 0, len(issueCounts))
	for k, v := range issueCounts {
		ranked = append(ranked, kv{k, v})
	}
	sort.Slice(ranked, func(i, j int) bool {
		if ranked[i].v != ranked[j].v {
			return ranked[i].v > ranked[j].v
		}
		return ranked[i].k < ranked[j].k
	})
	top := []string{}
	for i, r := range ranked {
		if i >= 5 {
			break
		}
		top = append(top, r.k)
	}

	return map[string]any{
		"total_pages":   len(pages),
		"rotten":        rotten,
		"healthy":       healthy,
		"avg_seo_score": avg,
		"top_issues":    top,
	}
}

// mints a session id, stores it in Redis, and sets the HttpOnly cookie.
func (s *Server) startSession(w http.ResponseWriter, userID string) error {
	sid, err := auth.NewToken()
	if err != nil {
		return err
	}
	if err := s.cache.CreateSession(sid, userID); err != nil {
		return err
	}
	auth.SetSessionCookie(w, sid)
	return nil
}
