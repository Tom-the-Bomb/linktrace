package main

import (
	"cmp"
	"encoding/json"
	"log"
	"maps"
	"mime"
	"net"
	"net/http"
	"net/netip"
	"slices"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"

	"github.com/Tom-the-Bomb/linktrace/internal/auth"
	"github.com/Tom-the-Bomb/linktrace/internal/crawler"
	"github.com/Tom-the-Bomb/linktrace/internal/store"
)

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

func httpError(w http.ResponseWriter, status int, msg string) {
	writeJSON(w, status, map[string]string{"error": msg})
}

func serverError(w http.ResponseWriter, action string, err error) {
	log.Printf("[api] %s: %v", action, err)
	httpError(w, http.StatusInternalServerError, "Couldn't "+action+". Try again in a moment.")
}

func short(id string) string {
	return id[:min(8, len(id))]
}

const maxBodyBytes = 64 << 10

func decodeJSON(w http.ResponseWriter, r *http.Request, v any) bool {
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, maxBodyBytes)).Decode(v); err != nil {
		httpError(w, http.StatusBadRequest, "bad request")
		return false
	}
	return true
}

// trusts the last X-Forwarded-For hop, which Caddy sets, so
// only Caddy may reach the API. IPv6 is cut to its /64, since one subscriber usually holds it.
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

// blocks CSRF: browsers can't send JSON cross-origin without a CORS preflight,
// which this API never approves.
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

// fails open: a Redis blip shouldn't read as rate limiting.
func (s *Server) limitPerMin(bucket string, perMin int) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			key := bucket + ":ip:" + clientIP(r)
			if allowed, err := s.cache.AllowRequest(key, perMin); err != nil {
				log.Printf("[api] ratelimit %s: %v", key, err)
			} else if !allowed {
				httpError(w, http.StatusTooManyRequests, "Too many requests. Try again in a minute.")
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}

// mount below auth.Optional, which resolves the user.
func requireUser(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if auth.UserID(r) == "" {
			httpError(w, http.StatusUnauthorized, "Log in to continue.")
			return
		}
		next.ServeHTTP(w, r)
	})
}

func (s *Server) requireJob(w http.ResponseWriter, id string) *store.Job {
	job, err := s.store.GetJob(id)
	if err != nil {
		serverError(w, "load this crawl", err)
		return nil
	}
	if job == nil {
		httpError(w, http.StatusNotFound, "job not found")
		return nil
	}
	return job
}

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

func canManage(job *store.Job, r *http.Request) bool {
	if job.UserID != "" {
		return job.UserID == auth.UserID(r)
	}
	return auth.OwnsAnonymous(r, job.AnonOwner)
}

// returns the live holder's id and false if site is taken. A stale claim is
// released and retried once; errors fail open.
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

// outlasts site.Run; a job still pending after it died before starting.
const pendingGrace = 2 * time.Minute

func isLive(job *store.Job) bool {
	return job.Status == "crawling" || (job.Status == "pending" && time.Since(job.CreatedAt) < pendingGrace)
}

func (s *Server) loadPagesAndAudits(w http.ResponseWriter, id string) (pages []store.PageResult, audits []store.SEOAudit, ok bool) {
	pages, err := s.store.ListPageResults(id)
	if err != nil {
		serverError(w, "load this report", err)
		return nil, nil, false
	}
	audits, err = s.store.ListSEOAudits(id)
	if err != nil {
		serverError(w, "load this report", err)
		return nil, nil, false
	}
	return pages, audits, true
}

func scoreByURL(audits []store.SEOAudit) map[string]int {
	m := make(map[string]int, len(audits))
	for _, a := range audits {
		m[a.URL] = a.Score
	}
	return m
}

type categoryReport struct {
	Category    string `json:"category"`
	TotalPages  int    `json:"total_pages"`
	RottenPages int    `json:"rotten_pages"`
	AvgSEOScore *int   `json:"avg_seo_score"` // nil when no page in the section was audited
	Pattern     string `json:"pattern"`
}

func computeCategories(pages []store.PageResult, audits []store.SEOAudit) []categoryReport {
	scores := scoreByURL(audits)
	type tally struct{ total, rotten, scoreSum, scored int }
	byCat := map[string]*tally{}
	for _, p := range pages {
		cat := crawler.CategoryOf(p.URL)
		t := byCat[cat]
		if t == nil {
			t = &tally{}
			byCat[cat] = t
		}
		t.total++
		if !p.IsAlive {
			t.rotten++
		}
		if score, ok := scores[p.URL]; ok {
			t.scoreSum += score
			t.scored++
		}
	}

	out := make([]categoryReport, 0, len(byCat))
	for cat, t := range byCat {
		var avg *int
		if t.scored > 0 {
			v := t.scoreSum / t.scored
			avg = &v
		}
		out = append(out, categoryReport{
			Category:    cat,
			TotalPages:  t.total,
			RottenPages: t.rotten,
			AvgSEOScore: avg,
			Pattern:     classifyPattern(t.total, t.rotten),
		})
	}
	// the UI breaks size ties by this order, which keeps section colours stable between polls
	slices.SortFunc(out, func(a, b categoryReport) int { return strings.Compare(a.Category, b.Category) })
	return out
}

func classifyPattern(total, rotten int) string {
	switch {
	case rotten == total:
		return "all_rotten"
	case rotten == 0:
		return "healthy"
	case rotten*2 >= total:
		return "mostly_rotten"
	default:
		return "mixed"
	}
}

func computeOverall(pages []store.PageResult, audits []store.SEOAudit) map[string]any {
	var rotten, scoreSum int
	for _, p := range pages {
		if !p.IsAlive {
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

	ranked := slices.SortedFunc(maps.Keys(issueCounts), func(a, b string) int {
		return cmp.Or(issueCounts[b]-issueCounts[a], strings.Compare(a, b))
	})
	// [] not null: the UI reads .length
	top := append([]string{}, ranked[:min(5, len(ranked))]...)

	return map[string]any{
		"total_pages":   len(pages),
		"rotten":        rotten,
		"avg_seo_score": avg,
		"top_issues":    top,
	}
}

func (s *Server) startSession(w http.ResponseWriter, userID string) error {
	sid := auth.NewToken()
	if err := s.cache.CreateSession(sid, userID); err != nil {
		return err
	}
	auth.SetSessionCookie(w, sid)
	return nil
}

func (s *Server) endSession(w http.ResponseWriter, r *http.Request) {
	if cookie, err := r.Cookie(auth.CookieName); err == nil {
		_ = s.cache.DeleteSession(cookie.Value)
	}
	auth.ClearSessionCookie(w)
}
