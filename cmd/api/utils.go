package main

import (
	"encoding/json"
	"net/http"
	"sort"

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

// authorizeJobMutation gates cancel/delete. Reads stay open (the unguessable UUID is the
// share capability), but mutating an owned job requires being the owner. Anonymous jobs have
// no owner so they stay UUID-gated. Writes 403, returns false when not allowed.
func authorizeJobMutation(w http.ResponseWriter, r *http.Request, job *store.Job) bool {
	if job.UserID != "" && job.UserID != auth.UserID(r) {
		writeJSON(w, http.StatusForbidden, map[string]string{"error": "unable to perform action on a job you didn't create"})
		return false
	}
	return true
}

// jobExists guards the per-job sub-resource handlers (results/report/graph). Returns true if
// present, else writes the response (500 on lookup failure, 404 on unknown id) and returns
// false. Without it an unknown id falls through to the queries and reads as a 500.
func (s *Server) jobExists(w http.ResponseWriter, id string) bool {
	job, err := s.store.GetJob(id)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "lookup failed"})
		return false
	}
	if job == nil {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "job not found"})
		return false
	}
	return true
}

// toStoreSiteAudit converts site.Audit to store.SiteAudit. Same fields, different package,
// keeps store from importing site.
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
