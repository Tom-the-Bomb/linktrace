// Package store is the MySQL persistence layer: jobs, page results, SEO audits, links,
// category reports, users, site audits, and the derived crawl-stats/site-SEO aggregates.
// Row-scanning helpers and small utilities live in utils.go.
package store

import (
	"database/sql"
	"encoding/json"
	"sort"
	"strings"
	"time"

	_ "github.com/go-sql-driver/mysql"
)

type Job struct {
	ID         string
	URL        string
	Status     string
	TotalPages int
	CreatedAt  time.Time
	UpdatedAt  time.Time
}

type PageResult struct {
	ID            int64
	JobID         string
	URL           string
	StatusCode    int
	ResponseTime  int
	ErrorType     string
	IsAlive       bool
	Depth         int
	RetryCount    int
	RedirectChain []string
	ArchiveURL    string
}

type SEOAudit struct {
	JobID                 string            `json:"job_id"`
	URL                   string            `json:"url"`
	Title                 string            `json:"title"`
	TitleLength           int               `json:"title_length"`
	MetaDescription       string            `json:"meta_description"`
	MetaDescriptionLength int               `json:"meta_description_length"`
	H1Count               int               `json:"h1_count"`
	H2Count               int               `json:"h2_count"`
	H3Count               int               `json:"h3_count"`
	Canonical             string            `json:"canonical"`
	OGTags                map[string]string `json:"og_tags"`
	TwitterTags           map[string]string `json:"twitter_tags"`
	JSONLDCount           int               `json:"jsonld_count"`
	JSONLDTypes           []string          `json:"jsonld_types"`
	HasViewport           bool              `json:"has_viewport"`
	Noindex               bool              `json:"noindex"`
	TopKeywords           []KeywordCount    `json:"top_keywords"`
	PrimaryKeyword        string            `json:"primary_keyword"`
	KeywordInTitle        bool              `json:"keyword_in_title"`
	KeywordInH1           bool              `json:"keyword_in_h1"`
	KeywordInURL          bool              `json:"keyword_in_url"`
	Issues                []Issue           `json:"issues"`
	Score                 int               `json:"score"`
}

type KeywordCount struct {
	Term  string `json:"term"`
	Count int    `json:"count"`
}

type Issue struct {
	Code     string `json:"code"`
	Message  string `json:"message"`
	Severity string `json:"severity"` // "error" | "warning" | "info"
}

type CategoryReport struct {
	Category    string `json:"category"`
	TotalPages  int    `json:"total_pages"`
	RottenPages int    `json:"rotten_pages"`
	AvgSEOScore int    `json:"avg_seo_score"`
	Pattern     string `json:"pattern"`
}

type Store struct {
	db *sql.DB
}

// New opens the MySQL pool, verifies it with a ping, and applies connection limits.
func New(dsn string) (*Store, error) {
	db, err := sql.Open("mysql", dsn)
	if err != nil {
		return nil, err
	}

	if err := db.Ping(); err != nil {
		return nil, err
	}

	db.SetMaxIdleConns(20)
	db.SetMaxOpenConns(100)
	db.SetConnMaxLifetime(5 * time.Minute)
	return &Store{db: db}, nil
}

func (s *Store) Close() error {
	return s.db.Close()
}

// CreateJob inserts a job owned by userID, or anonymous (SQL NULL) when userID == "".
func (s *Store) CreateJob(id, url, userID string) error {
	var uid any
	if userID != "" {
		uid = userID
	}
	_, err := s.db.Exec(
		"INSERT INTO jobs (id, url, user_id, status) VALUES (UUID_TO_BIN(?), ?, UUID_TO_BIN(?), 'pending')",
		id, url, uid,
	)
	return err
}

// UpdateJobStatus sets a job's lifecycle status (pending/crawling/complete/failed/stopped).
func (s *Store) UpdateJobStatus(id, status string) error {
	_, err := s.db.Exec(
		"UPDATE jobs SET status = ? WHERE id = UUID_TO_BIN(?)", status, id,
	)
	return err
}

// SetTotalPages records the final crawled-page count on the job row.
func (s *Store) SetTotalPages(id string, n int) error {
	_, err := s.db.Exec(
		"UPDATE jobs SET total_pages = ? WHERE id = UUID_TO_BIN(?)", n, id,
	)
	return err
}

// GetJob returns the job by id, or (nil, nil) if it doesn't exist.
func (s *Store) GetJob(id string) (*Job, error) {
	var j Job
	err := s.db.QueryRow(
		"SELECT BIN_TO_UUID(id), url, status, total_pages, created_at, updated_at FROM jobs WHERE id = UUID_TO_BIN(?)",
		id,
	).Scan(&j.ID, &j.URL, &j.Status, &j.TotalPages, &j.CreatedAt, &j.UpdatedAt)

	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &j, nil
}

// InsertPageResult persists one crawled page's rot record (status, timing, redirect chain).
func (s *Store) InsertPageResult(result PageResult) error {
	chain, err := json.Marshal(result.RedirectChain)

	if err != nil {
		return err
	}

	_, err = s.db.Exec(
		`INSERT INTO pages (job_id, url, status_code,
		response_time, error_type, is_alive, depth,
		retry_count, redirect_chain)
		VALUES (UUID_TO_BIN(?), ?, ?, ?, ?, ?, ?, ?, ?)`,
		result.JobID, result.URL, result.StatusCode,
		result.ResponseTime, nullIfEmpty(result.ErrorType), result.IsAlive,
		result.Depth, result.RetryCount, chain,
	)
	return err
}

type Link struct {
	Source string
	Target string
}

// InsertLink records a discovered edge; INSERT IGNORE silently no-ops on duplicate (job, src, tgt).
func (s *Store) InsertLink(jobID, source, target string) error {
	_, err := s.db.Exec(
		"INSERT IGNORE INTO links (job_id, source_url, target_url) VALUES (UUID_TO_BIN(?), ?, ?)",
		jobID, source, target,
	)
	return err
}

// ListLinks returns every recorded edge for a job, for building the graph view.
func (s *Store) ListLinks(jobID string) ([]Link, error) {
	rows, err := s.db.Query(
		"SELECT source_url, target_url FROM links WHERE job_id = UUID_TO_BIN(?)",
		jobID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []Link
	for rows.Next() {
		var l Link
		if err := rows.Scan(&l.Source, &l.Target); err != nil {
			return nil, err
		}
		out = append(out, l)
	}
	return out, rows.Err()
}

// GetSEOAudit fetches one SEO audit row by (job, URL) for the per-page drilldown endpoint.
// Returns (nil, nil) if there's no audit for that URL.
func (s *Store) GetSEOAudit(jobID, pageURL string) (*SEOAudit, error) {
	row := s.db.QueryRow(
		`SELECT `+seoAuditColumns+`
		FROM seo_audits WHERE job_id = UUID_TO_BIN(?) AND url = ? LIMIT 1`,
		jobID, pageURL,
	)
	a, err := scanSEOAudit(row, jobID)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &a, nil
}

// SetArchiveURL records the Wayback snapshot URL for a (job, page).
func (s *Store) SetArchiveURL(jobID, url, archiveURL string) error {
	_, err := s.db.Exec(
		"UPDATE pages SET archive_url = ? where job_id = UUID_TO_BIN(?) AND url = ?",
		archiveURL, jobID, url,
	)
	return err
}

// ListPageResults returns every crawled page for a job, ordered by depth then URL.
func (s *Store) ListPageResults(jobID string) ([]PageResult, error) {
	rows, err := s.db.Query(
		`SELECT id, url, status_code, response_time, error_type,
		is_alive, depth, retry_count, redirect_chain, archive_url
		FROM pages WHERE job_id = UUID_TO_BIN(?)
		ORDER BY depth, url`,
		jobID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []PageResult
	for rows.Next() {
		var r PageResult
		var errType, archive sql.NullString
		var chain []byte

		if err := rows.Scan(&r.ID, &r.URL, &r.StatusCode, &r.ResponseTime, &errType, &r.IsAlive, &r.Depth, &r.RetryCount, &chain, &archive); err != nil {
			return nil, err
		}
		r.JobID = jobID
		r.ErrorType = errType.String
		r.ArchiveURL = archive.String
		_ = json.Unmarshal(chain, &r.RedirectChain)
		out = append(out, r)

	}
	return out, rows.Err()
}

// InsertSEOAudit persists one page's SEO audit, JSON-encoding the map/slice columns.
func (s *Store) InsertSEOAudit(audit SEOAudit) error {
	ogTags, err := json.Marshal(audit.OGTags)
	if err != nil {
		return err
	}
	jsonLDTypes, err := json.Marshal(audit.JSONLDTypes)
	if err != nil {
		return err
	}
	twitterTags, err := json.Marshal(audit.TwitterTags)
	if err != nil {
		return err
	}
	topKeywords, err := json.Marshal(audit.TopKeywords)
	if err != nil {
		return err
	}
	issues, err := json.Marshal(audit.Issues)
	if err != nil {
		return err
	}

	_, err = s.db.Exec(
		`INSERT INTO seo_audits (job_id, url, title, title_length,
		meta_description, meta_description_length, h1_count,
		h2_count, h3_count, canonical, og_tags, twitter_tags,
		jsonld_count, jsonld_types, has_viewport, noindex,
		top_keywords, primary_keyword, keyword_in_title,
		keyword_in_h1, keyword_in_url, issues, score)
		VALUES (UUID_TO_BIN(?), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		audit.JobID, audit.URL, audit.Title, audit.TitleLength,
		audit.MetaDescription, audit.MetaDescriptionLength,
		audit.H1Count, audit.H2Count, audit.H3Count,
		nullIfEmpty(audit.Canonical), ogTags, twitterTags,
		audit.JSONLDCount, jsonLDTypes, audit.HasViewport, audit.Noindex,
		topKeywords, nullIfEmpty(audit.PrimaryKeyword),
		audit.KeywordInTitle, audit.KeywordInH1, audit.KeywordInURL,
		issues, audit.Score,
	)
	return err
}

// ListSEOAudits returns every SEO audit row for a job (used by the report + graph endpoints).
func (s *Store) ListSEOAudits(jobID string) ([]SEOAudit, error) {
	rows, err := s.db.Query(
		`SELECT `+seoAuditColumns+` FROM seo_audits WHERE job_id = UUID_TO_BIN(?)`,
		jobID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []SEOAudit
	for rows.Next() {
		a, err := scanSEOAudit(rows, jobID)
		if err != nil {
			return nil, err
		}
		out = append(out, a)
	}
	return out, rows.Err()
}

// ReplaceCategoryReport upserts a category's rollup row (delete + insert in one tx), since
// the aggregator rewrites it on every tick as counts change.
func (s *Store) ReplaceCategoryReport(jobID string, report CategoryReport) error {
	tx, err := s.db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()

	if _, err = tx.Exec(
		"DELETE FROM category_reports WHERE job_id = UUID_TO_BIN(?) AND category = ?",
		jobID, report.Category,
	); err != nil {
		return err
	}

	_, err = tx.Exec(
		`INSERT INTO category_reports (job_id, category, total_pages,
		rotten_pages, avg_seo_score, pattern)
		VALUES (UUID_TO_BIN(?), ?, ?, ?, ?, ?)`,
		jobID, report.Category, report.TotalPages,
		report.RottenPages, report.AvgSEOScore, report.Pattern,
	)
	if err != nil {
		return err
	}

	return tx.Commit()
}

// ListCategoryReports returns the per-category rollups for a job.
func (s *Store) ListCategoryReports(jobID string) ([]CategoryReport, error) {
	rows, err := s.db.Query(
		`SELECT category, total_pages, rotten_pages,
		avg_seo_score, pattern FROM category_reports
		WHERE job_id = UUID_TO_BIN(?)`,
		jobID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []CategoryReport
	for rows.Next() {
		var r CategoryReport
		if err := rows.Scan(&r.Category, &r.TotalPages, &r.RottenPages, &r.AvgSEOScore, &r.Pattern); err != nil {
			return nil, err
		}
		out = append(out, r)
	}
	return out, rows.Err()
}

type User struct {
	ID           string `json:"id"`
	Username     string `json:"username"`
	PasswordHash string `json:"-"`
}

// CreateUser inserts a new account. UNIQUE(username) makes duplicate inserts fail at the DB.
func (s *Store) CreateUser(u User) error {
	_, err := s.db.Exec(
		"INSERT INTO users (id, username, password_hash) VALUES (UUID_TO_BIN(?), ?, ?)",
		u.ID, u.Username, u.PasswordHash,
	)
	return err
}

// IsDuplicateUsername reports whether err is a MySQL duplicate-username error.
// Lets the handler turn it into a 409 instead of a generic 500.
func IsDuplicateUsername(err error) bool {
	if err == nil {
		return false
	}
	return strings.Contains(err.Error(), "Duplicate entry") && strings.Contains(err.Error(), "username")
}

// GetUserByUsername returns the user with the given username, or (nil, nil) if not found.
func (s *Store) GetUserByUsername(username string) (*User, error) {
	var u User
	err := s.db.QueryRow(
		"SELECT BIN_TO_UUID(id), username, password_hash FROM users WHERE username = ?",
		username,
	).Scan(&u.ID, &u.Username, &u.PasswordHash)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &u, nil
}

// GetUserByID is the symmetric lookup used by /auth/me.
func (s *Store) GetUserByID(id string) (*User, error) {
	var u User
	err := s.db.QueryRow(
		"SELECT BIN_TO_UUID(id), username, password_hash FROM users WHERE id = UUID_TO_BIN(?)",
		id,
	).Scan(&u.ID, &u.Username, &u.PasswordHash)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &u, nil
}

type HistoryRun struct {
	JobID     string    `json:"job_id"`
	CreatedAt time.Time `json:"created_at"`
}

type HistoryEntry struct {
	URL         string       `json:"url"`
	CrawlCount  int          `json:"crawl_count"`
	LastJobID   string       `json:"last_job_id"`
	LastCrawled time.Time    `json:"last_crawled"`
	Runs        []HistoryRun `json:"runs"`
}

// ListUserHistory returns one row per site the user has crawled (most recent first), each
// with its individual runs, so the frontend can render an expandable list per domain.
// Rows are grouped in Go from a single (url, created_at DESC) query.
func (s *Store) ListUserHistory(userID string) ([]HistoryEntry, error) {
	rows, err := s.db.Query(`
		SELECT BIN_TO_UUID(id), url, created_at
		FROM jobs
		WHERE user_id = UUID_TO_BIN(?)
		ORDER BY url, created_at DESC`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	byURL := map[string]*HistoryEntry{}
	for rows.Next() {
		var jobID, url string
		var createdAt time.Time
		if err := rows.Scan(&jobID, &url, &createdAt); err != nil {
			return nil, err
		}
		e, ok := byURL[url]
		if !ok {
			// first row for this URL is the newest (rows are ordered DESC within each url)
			e = &HistoryEntry{URL: url, LastJobID: jobID, LastCrawled: createdAt}
			byURL[url] = e
		}
		e.CrawlCount++
		e.Runs = append(e.Runs, HistoryRun{JobID: jobID, CreatedAt: createdAt})
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}

	out := make([]HistoryEntry, 0, len(byURL))
	for _, e := range byURL {
		out = append(out, *e)
	}
	// final order: most recently active domain first
	sort.Slice(out, func(i, j int) bool { return out[i].LastCrawled.After(out[j].LastCrawled) })
	return out, nil
}

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
	urls, err := json.Marshal(a.SitemapURLs)
	if err != nil {
		return err
	}
	_, err = s.db.Exec(
		`INSERT INTO site_audits (job_id, robots_found, robots_disallow_all, crawl_delay,
		 sitemap_found, sitemap_url, sitemap_url_count, sitemap_urls,
		 is_https, https_redirect, cert_valid, www_canonical)
		 VALUES (UUID_TO_BIN(?), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		jobID, a.RobotsFound, a.RobotsDisallowAll, a.CrawlDelay,
		a.SitemapFound, nullIfEmpty(a.SitemapURL), a.SitemapURLCount, urls,
		a.IsHTTPS, a.HTTPSRedirect, a.CertValid, a.WWWCanonical,
	)
	return err
}

// GetSiteAudit retrieves the one-shot domain checks. Returns (nil, nil) if absent.
func (s *Store) GetSiteAudit(jobID string) (*SiteAudit, error) {
	var a SiteAudit
	var sitemapURL sql.NullString
	var urls []byte
	err := s.db.QueryRow(
		`SELECT robots_found, robots_disallow_all, crawl_delay,
		 sitemap_found, sitemap_url, sitemap_url_count, sitemap_urls,
		 is_https, https_redirect, cert_valid, www_canonical
		 FROM site_audits WHERE job_id = UUID_TO_BIN(?)`, jobID,
	).Scan(&a.RobotsFound, &a.RobotsDisallowAll, &a.CrawlDelay,
		&a.SitemapFound, &sitemapURL, &a.SitemapURLCount, &urls,
		&a.IsHTTPS, &a.HTTPSRedirect, &a.CertValid, &a.WWWCanonical)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	a.SitemapURL = sitemapURL.String
	_ = json.Unmarshal(urls, &a.SitemapURLs)
	return &a, nil
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
