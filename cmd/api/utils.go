package main

import (
	"encoding/json"
	"log"
	"net/http"
	"sort"

	"github.com/go-chi/chi/v5"

	"github.com/Tom-the-Bomb/linktrace/internal/auth"
	"github.com/Tom-the-Bomb/linktrace/internal/site"
	"github.com/Tom-the-Bomb/linktrace/internal/store"
)

// writeJSON writes v as a JSON response with the given status code.
func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

// httpError writes a JSON {"error": msg} body with the given status.
func httpError(w http.ResponseWriter, status int, msg string) {
	writeJSON(w, status, map[string]string{"error": msg})
}

// short truncates an id to its first 8 chars for logging, guarding ids shorter than that.
func short(id string) string {
	if len(id) > 8 {
		return id[:8]
	}
	return id
}

// decodeJSON decodes the request body into v; on failure it writes a 400 and returns false.
func decodeJSON(w http.ResponseWriter, r *http.Request, v any) bool {
	if err := json.NewDecoder(r.Body).Decode(v); err != nil {
		httpError(w, http.StatusBadRequest, "bad request")
		return false
	}
	return true
}

// corsMiddleware sets CORS headers for the Vite dev server. Cookies require an EXACT origin
// (never "*") plus Allow-Credentials, and OPTIONS preflights short-circuit with 204.
func corsMiddleware(origin string) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			w.Header().Set("Access-Control-Allow-Origin", origin)
			w.Header().Set("Access-Control-Allow-Credentials", "true")
			w.Header().Set("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS")
			w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
			if r.Method == http.MethodOptions {
				w.WriteHeader(http.StatusNoContent)
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}

// requireJob returns the job by id, or writes 500/404 and returns nil.
func (s *Server) requireJob(w http.ResponseWriter, id string) *store.Job {
	job, err := s.store.GetJob(id)
	if err != nil {
		httpError(w, http.StatusInternalServerError, "lookup failed")
		return nil
	}
	if job == nil {
		httpError(w, http.StatusNotFound, "job not found")
		return nil
	}
	return job
}

// requireOwnedJob is requireJob plus an owner check for mutations. Anonymous jobs stay
// UUID-gated; owned jobs require the owner. Writes 404/403 and returns nil if disallowed.
func (s *Server) requireOwnedJob(w http.ResponseWriter, r *http.Request) *store.Job {
	job := s.requireJob(w, chi.URLParam(r, "id"))
	if job == nil {
		return nil
	}
	if job.UserID != "" && job.UserID != auth.UserID(r) {
		httpError(w, http.StatusForbidden, "unable to perform action on a job you didn't create")
		return nil
	}
	return job
}

// loadPagesAndAudits fetches a job's page rows + SEO audits, writing 500 and ok=false on failure.
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

// scoreByURL indexes SEO audit scores by page URL for joining onto page rows.
func scoreByURL(audits []store.SEOAudit) map[string]int {
	m := make(map[string]int, len(audits))
	for _, a := range audits {
		m[a.URL] = a.Score
	}
	return m
}

// toStoreSiteAudit converts site.Audit to store.SiteAudit (keeps store from importing site).
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

// computeOverall builds the report header: totals + average SEO score + top recurring issue codes.
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

// startSession mints a session id, stores it in Redis, and sets the HttpOnly cookie.
func (s *Server) startSession(w http.ResponseWriter, userID string) error {
	sid, err := auth.NewSessionID()
	if err != nil {
		return err
	}
	if err := s.cache.CreateSession(sid, userID); err != nil {
		return err
	}
	auth.SetSessionCookie(w, sid)
	return nil
}
