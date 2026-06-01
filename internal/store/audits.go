package store

import (
	"database/sql"
	"encoding/json"
)

type SiteAudit struct {
	RobotsFound       bool     `json:"robots_found"`
	RobotsDisallowAll bool     `json:"robots_disallow_all"`
	CrawlDelay        int      `json:"crawl_delay"`
	SitemapFound      bool     `json:"sitemap_found"`
	SitemapURL        string   `json:"sitemap_url"`
	SitemapURLCount   int      `json:"sitemap_url_count"`
	SitemapURLs       []string `json:"-"`
	IsHTTPS           bool     `json:"is_https"`
	HTTPSRedirect     bool     `json:"https_redirect"`
	CertValid         bool     `json:"cert_valid"`
	WWWCanonical      string   `json:"www_canonical"`
}

// SaveSiteAudit persists the one-shot domain checks. Called once per crawl at job creation.
func (s *Store) SaveSiteAudit(jobID string, a SiteAudit) error {
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

// GetSiteAudit retrieves the one-shot domain checks. Returns (nil, nil) if absent.
func (s *Store) GetSiteAudit(jobID string) (*SiteAudit, error) {
	var a SiteAudit
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

// GetCrawlStats aggregates per-page rows into the telemetry numbers. Pure SQL: nothing new stored.
func (s *Store) GetCrawlStats(jobID string) (CrawlStats, error) {
	var cs CrawlStats
	var avg sql.NullFloat64
	var maxMs, retries, rotten, dur sql.NullInt64
	err := s.db.QueryRow(`
		SELECT COUNT(*),
		       COALESCE(SUM(retry_count), 0),
		       COALESCE(AVG(response_time), 0),
		       COALESCE(MAX(response_time), 0),
		       COALESCE(SUM(NOT is_alive), 0),
		       COALESCE(TIMESTAMPDIFF(SECOND, MIN(checked_at), MAX(checked_at)), 0)
		FROM pages WHERE job_id = UUID_TO_BIN(?)`, jobID).
		Scan(&cs.TotalPages, &retries, &avg, &maxMs, &rotten, &dur)
	if err != nil {
		return cs, err
	}
	cs.TotalRequests = cs.TotalPages + int(retries.Int64)
	cs.AvgResponseMs = int(avg.Float64)
	cs.MaxResponseMs = int(maxMs.Int64)
	cs.RottenCount = int(rotten.Int64)
	cs.DurationSeconds = int(dur.Int64)
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

// GetSiteSEO aggregates the per-page seo_audits rows into site-wide signals.
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
	if err != nil {
		return out, err
	}
	return out, nil
}
