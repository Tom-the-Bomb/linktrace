package store

import (
	"database/sql"
	"encoding/json"

	"github.com/Tom-the-Bomb/linktrace/internal/site"
)

// persists the one-shot domain checks. Called once per crawl at job creation.
func (s *Store) SaveSiteAudit(jobID string, a site.Audit) error {
	_, err := s.db.Exec(
		`INSERT INTO site_audits (job_id, robots_found, robots_disallow_all, crawl_delay,
		 sitemap_found, sitemap_url, sitemap_url_count, sitemap_urls,
		 is_https, https_redirect, cert_valid, www_canonical)
		 VALUES (UUID_TO_BIN(?), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		jobID, a.RobotsFound, a.RobotsDisallowAll, a.CrawlDelay,
		a.SitemapFound, nullIfEmpty(a.SitemapURL), a.SitemapURLCount, mustJSON(a.SitemapURLs),
		a.IsHTTPS, a.HTTPSRedirect, a.CertValid, a.WWWCanonical,
	)
	return err
}

// retrieves the one-shot domain checks. Returns (nil, nil) if absent.
func (s *Store) GetSiteAudit(jobID string) (*site.Audit, error) {
	var a site.Audit
	var sitemapURL sql.NullString
	var urls []byte
	out, err := getOne(&a, func() error {
		return s.db.QueryRow(
			`SELECT robots_found, robots_disallow_all, crawl_delay,
			 sitemap_found, sitemap_url, sitemap_url_count, sitemap_urls,
			 is_https, https_redirect, cert_valid, www_canonical
			 FROM site_audits WHERE job_id = UUID_TO_BIN(?)`, jobID,
		).Scan(&a.RobotsFound, &a.RobotsDisallowAll, &a.CrawlDelay,
			&a.SitemapFound, &sitemapURL, &a.SitemapURLCount, &urls,
			&a.IsHTTPS, &a.HTTPSRedirect, &a.CertValid, &a.WWWCanonical)
	})
	if out == nil || err != nil {
		return out, err
	}
	a.SitemapURL = sitemapURL.String
	_ = json.Unmarshal(urls, &a.SitemapURLs)
	return out, nil
}

type CrawlStats struct {
	TotalPages      int     `json:"total_pages"`
	TotalRequests   int     `json:"total_requests"`
	AvgResponseMs   int     `json:"avg_response_ms"`
	MaxResponseMs   int     `json:"max_response_ms"`
	RottenCount     int     `json:"rotten_count"`
	ErrorRate       float64 `json:"error_rate"`
	DurationSeconds int     `json:"duration_seconds"`
}

// aggregates per-page rows into the telemetry numbers. Pure SQL: nothing new stored.
func (s *Store) GetCrawlStats(jobID string) (CrawlStats, error) {
	var cs CrawlStats
	var retries int
	var avg float64 // AVG keeps decimals
	err := s.db.QueryRow(`
		SELECT COUNT(*),
		       COALESCE(SUM(retry_count), 0),
		       COALESCE(AVG(response_time), 0),
		       COALESCE(MAX(response_time), 0),
		       COALESCE(SUM(NOT is_alive), 0),
		       COALESCE(TIMESTAMPDIFF(SECOND, MIN(checked_at), MAX(checked_at)), 0)
		FROM pages WHERE job_id = UUID_TO_BIN(?)`, jobID).
		Scan(&cs.TotalPages, &retries, &avg, &cs.MaxResponseMs, &cs.RottenCount, &cs.DurationSeconds)
	if err != nil {
		return cs, err
	}
	cs.TotalRequests = cs.TotalPages + retries
	cs.AvgResponseMs = int(avg)
	if cs.TotalPages > 0 {
		cs.ErrorRate = float64(cs.RottenCount) / float64(cs.TotalPages)
	}
	return cs, nil
}

type SiteSEO struct {
	PagesAudited       int `json:"pages_audited"`
	DuplicateTitleSets int `json:"duplicate_title_sets"`
	MissingMetaDesc    int `json:"missing_meta_desc"`
	WithCanonical      int `json:"with_canonical"`
	NoindexPages       int `json:"noindex_pages"`
	WithJSONLD         int `json:"with_jsonld"`
	WithOpenGraph      int `json:"with_open_graph"`
	WithTwitterCards   int `json:"with_twitter_cards"`
	WithViewport       int `json:"with_viewport"`
	MultipleH1         int `json:"multiple_h1"`
	MissingH1          int `json:"missing_h1"`
}

// aggregates the per-page seo_audits rows into site-wide signals.
// Two queries: one row of counts, then a second for the duplicate-title set count.
func (s *Store) GetSiteSEO(jobID string) (SiteSEO, error) {
	var out SiteSEO
	err := s.db.QueryRow(`
		SELECT COUNT(*),
		       COALESCE(SUM(meta_description = '' OR meta_description IS NULL), 0),
		       COALESCE(SUM(canonical IS NOT NULL AND canonical <> ''), 0),
		       COALESCE(SUM(noindex), 0),
		       COALESCE(SUM(jsonld_count > 0), 0),
		       COALESCE(SUM(JSON_LENGTH(og_tags) > 0), 0),
		       COALESCE(SUM(JSON_LENGTH(twitter_tags) > 0), 0),
		       COALESCE(SUM(has_viewport), 0),
		       COALESCE(SUM(h1_count > 1), 0),
		       COALESCE(SUM(h1_count = 0), 0)
		FROM seo_audits WHERE job_id = UUID_TO_BIN(?)`, jobID).
		Scan(&out.PagesAudited, &out.MissingMetaDesc, &out.WithCanonical, &out.NoindexPages,
			&out.WithJSONLD, &out.WithOpenGraph, &out.WithTwitterCards, &out.WithViewport,
			&out.MultipleH1, &out.MissingH1)
	if err != nil {
		return out, err
	}
	// duplicate titles: titles that appear on more than one page
	err = s.db.QueryRow(`
		SELECT COUNT(*) FROM (
		    SELECT title FROM seo_audits
		    WHERE job_id = UUID_TO_BIN(?) AND title <> ''
		    GROUP BY title HAVING COUNT(*) > 1
		) t`, jobID).Scan(&out.DuplicateTitleSets)
	return out, err
}
