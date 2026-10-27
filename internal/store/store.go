// Package store is the MySQL persistence layer: jobs, page results, SEO audits, links,
// category reports, users, site audits, and the derived crawl-stats/site-SEO aggregates.
// Job/page/link CRUD lives here; user and history methods are in users.go and the
// read-only aggregates in audits.go. Row-scanning helpers and small utilities live in utils.go.
package store

import (
	"database/sql"
	"strings"
	"time"

	_ "github.com/go-sql-driver/mysql"
	"github.com/google/uuid"

	"github.com/Tom-the-Bomb/linktrace/internal/seo"
)

type Job struct {
	ID        string
	UserID    string // owner; "" for anonymous jobs
	AnonOwner string // sha256 of the anonymous creator's owner token; "" for account jobs
	URL       string
	Status    string
	CreatedAt time.Time
}

type PageResult struct {
	JobID        string
	URL          string
	StatusCode   int
	ResponseTime int
	ErrorType    string
	IsAlive      bool
	Depth        int
	RetryCount   int
	ArchiveURL   string
}

type SEOAudit struct {
	JobID string `json:"job_id"`
	URL   string `json:"url"`
	seo.Audit
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

// opens the MySQL pool, verifies it with a ping, and applies connection limits.
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

// closes the database pool.
func (s *Store) Close() error {
	return s.db.Close()
}

// inserts a job owned by userID, or by the anonymous token hash anonOwner when userID == "".
func (s *Store) CreateJob(id, url, userID, anonOwner string) error {
	_, err := s.db.Exec(
		"INSERT INTO jobs (id, url, user_id, anon_owner, status) VALUES (UUID_TO_BIN(?), ?, UUID_TO_BIN(?), ?, 'pending')",
		id, url, nullIfEmpty(userID), nullIfEmpty(anonOwner),
	)
	return err
}

// Migrate adds columns introduced after a deployment's first boot, since schema.sql only runs on
// a fresh volume. Safe to call on every API start.
func (s *Store) Migrate() error {
	var n int
	if err := s.db.QueryRow(
		"SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'jobs' AND COLUMN_NAME = 'anon_owner'",
	).Scan(&n); err != nil {
		return err
	}
	if n > 0 {
		return nil
	}
	_, err := s.db.Exec("ALTER TABLE jobs ADD COLUMN anon_owner CHAR(64) NULL AFTER user_id")
	return err
}

// sets a job's lifecycle status (pending/crawling/complete/failed/stopped).
func (s *Store) UpdateJobStatus(id, status string) error {
	_, err := s.db.Exec(
		"UPDATE jobs SET status = ? WHERE id = UUID_TO_BIN(?)", status, id,
	)
	return err
}

// removes a job and every row that references it. The child tables have
// FK(job_id) -> jobs(id) with no ON DELETE CASCADE, so we delete children before the
// parent, all inside one transaction so a partial failure leaves nothing orphaned.
func (s *Store) DeleteJob(id string) error {
	// A malformed id matches nothing (and would error inside UUID_TO_BIN); treat as a no-op.
	if _, err := uuid.Parse(id); err != nil {
		return nil
	}
	return s.tx(func(t *sql.Tx) error {
		// children first, parent last
		stmts := []string{
			"DELETE FROM pages WHERE job_id = UUID_TO_BIN(?)",
			"DELETE FROM seo_audits WHERE job_id = UUID_TO_BIN(?)",
			"DELETE FROM links WHERE job_id = UUID_TO_BIN(?)",
			"DELETE FROM category_reports WHERE job_id = UUID_TO_BIN(?)",
			"DELETE FROM site_audits WHERE job_id = UUID_TO_BIN(?)",
			"DELETE FROM jobs WHERE id = UUID_TO_BIN(?)",
		}
		for _, q := range stmts {
			if _, err := t.Exec(q, id); err != nil {
				return err
			}
		}
		return nil
	})
}

// returns the job by id, or (nil, nil) if it doesn't exist.
func (s *Store) GetJob(id string) (*Job, error) {
	// A malformed id matches nothing (and would error inside UUID_TO_BIN); treat as not-found.
	if _, err := uuid.Parse(id); err != nil {
		return nil, nil
	}

	var j Job
	var userID, anonOwner sql.NullString // both nullable: one or neither is set
	out, err := getOne(&j, func() error {
		return s.db.QueryRow(
			"SELECT BIN_TO_UUID(id), BIN_TO_UUID(user_id), anon_owner, url, status, created_at FROM jobs WHERE id = UUID_TO_BIN(?)",
			id,
		).Scan(&j.ID, &userID, &anonOwner, &j.URL, &j.Status, &j.CreatedAt)
	})
	if out == nil || err != nil {
		return out, err
	}
	j.UserID, j.AnonOwner = userID.String, anonOwner.String
	return out, nil
}

// persists one crawled page's rot record (status, timing, retries).
func (s *Store) InsertPageResult(result PageResult) error {
	_, err := s.db.Exec(
		`INSERT INTO pages (job_id, url, status_code,
		response_time, error_type, is_alive, depth, retry_count)
		VALUES (UUID_TO_BIN(?), ?, ?, ?, ?, ?, ?, ?)`,
		result.JobID, result.URL, result.StatusCode,
		result.ResponseTime, nullIfEmpty(result.ErrorType), result.IsAlive,
		result.Depth, result.RetryCount,
	)
	return err
}

type Link struct {
	Source string
	Target string
}

// linkBatchSize bounds one multi-row INSERT so a link-heavy page stays well under
// max_allowed_packet and the 65535-placeholder limit.
const linkBatchSize = 200

// records a page's discovered edges; INSERT IGNORE silently no-ops on duplicate (job, src, tgt).
// Batched because a nav-heavy page carries hundreds of links and this runs on every result.
func (s *Store) InsertLinks(jobID, source string, targets []string) error {
	for start := 0; start < len(targets); start += linkBatchSize {
		batch := targets[start:min(start+linkBatchSize, len(targets))]

		args := make([]any, 0, len(batch)*3)
		for _, target := range batch {
			args = append(args, jobID, source, target)
		}
		values := strings.Repeat(",(UUID_TO_BIN(?), ?, ?)", len(batch))[1:]

		if _, err := s.db.Exec(
			"INSERT IGNORE INTO links (job_id, source_url, target_url) VALUES "+values, args...,
		); err != nil {
			return err
		}
	}
	return nil
}

// returns every recorded edge for a job, for building the graph view.
func (s *Store) ListLinks(jobID string) ([]Link, error) {
	return queryRows(s.db,
		"SELECT source_url, target_url FROM links WHERE job_id = UUID_TO_BIN(?)",
		func(rows *sql.Rows) (Link, error) {
			var l Link
			err := rows.Scan(&l.Source, &l.Target)
			return l, err
		}, jobID)
}

// fetches one SEO audit row by (job, URL) for the per-page drilldown endpoint.
// Returns (nil, nil) if there's no audit for that URL.
func (s *Store) GetSEOAudit(jobID, pageURL string) (*SEOAudit, error) {
	var a SEOAudit
	return getOne(&a, func() error {
		row := s.db.QueryRow(
			`SELECT `+seoAuditColumns+`
			FROM seo_audits WHERE job_id = UUID_TO_BIN(?) AND url = ? LIMIT 1`,
			jobID, pageURL,
		)
		var err error
		a, err = scanSEOAudit(row, jobID)
		return err
	})
}

// records the Wayback snapshot URL for a (job, page).
func (s *Store) SetArchiveURL(jobID, url, archiveURL string) error {
	_, err := s.db.Exec(
		"UPDATE pages SET archive_url = ? WHERE job_id = UUID_TO_BIN(?) AND url = ?",
		archiveURL, jobID, url,
	)
	return err
}

// returns every crawled page for a job, ordered by depth then URL.
func (s *Store) ListPageResults(jobID string) ([]PageResult, error) {
	return queryRows(s.db,
		`SELECT url, status_code, response_time, error_type, is_alive, depth, archive_url
		FROM pages WHERE job_id = UUID_TO_BIN(?)
		ORDER BY depth, url`,
		func(rows *sql.Rows) (PageResult, error) {
			var r PageResult
			var errType, archive sql.NullString
			if err := rows.Scan(&r.URL, &r.StatusCode, &r.ResponseTime, &errType, &r.IsAlive, &r.Depth, &archive); err != nil {
				return r, err
			}
			r.JobID = jobID
			r.ErrorType = errType.String
			r.ArchiveURL = archive.String
			return r, nil
		}, jobID)
}

// persists one page's SEO audit, JSON-encoding the map/slice columns and clipping text to the
// column widths, so an oversized field can't fail the insert and wedge the crawl.
func (s *Store) InsertSEOAudit(audit SEOAudit) error {
	_, err := s.db.Exec(
		`INSERT INTO seo_audits (job_id, url, title, title_length,
		meta_description, meta_description_length, h1_count,
		h2_count, h3_count, h4_count, h5_count, h6_count,
		images_total, images_with_alt, images_with_dims,
		images_lazy_loaded, images_responsive,
		links_internal, links_external, links_nofollow, html_lang,
		canonical, og_tags, twitter_tags,
		jsonld_count, jsonld_types, has_viewport, noindex,
		top_keywords, primary_keyword, keyword_in_title,
		keyword_in_h1, keyword_in_url, issues, score)
		VALUES (UUID_TO_BIN(?), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		audit.JobID, audit.URL, clip(audit.Title, 10000), audit.TitleLength,
		clip(audit.MetaDescription, 10000), audit.MetaDescLength,
		audit.H1Count, audit.H2Count, audit.H3Count,
		audit.H4Count, audit.H5Count, audit.H6Count,
		audit.ImagesTotal, audit.ImagesWithAlt, audit.ImagesWithDims,
		audit.ImagesLazyLoaded, audit.ImagesResponsive,
		audit.LinksInternal, audit.LinksExternal, audit.LinksNofollow,
		nullIfEmpty(clip(audit.HTMLLang, 20)),
		nullIfEmpty(clip(audit.Canonical, 10000)), mustJSON(audit.OGTags), mustJSON(audit.TwitterTags),
		audit.JSONLDCount, mustJSON(audit.JSONLDTypes), audit.HasViewport, audit.Noindex,
		mustJSON(audit.TopKeywords), nullIfEmpty(clip(audit.PrimaryKeyword, 100)),
		audit.KeywordInTitle, audit.KeywordInH1, audit.KeywordInURL,
		mustJSON(audit.Issues), audit.Score,
	)
	return err
}

// returns every SEO audit row for a job (used by the report + graph endpoints).
func (s *Store) ListSEOAudits(jobID string) ([]SEOAudit, error) {
	return queryRows(s.db,
		`SELECT `+seoAuditColumns+` FROM seo_audits WHERE job_id = UUID_TO_BIN(?)`,
		func(rows *sql.Rows) (SEOAudit, error) {
			return scanSEOAudit(rows, jobID)
		}, jobID)
}

// upserts a category's rollup row; the aggregator rewrites it on every tick as counts change.
// PRIMARY KEY (job_id, category) makes this a single statement, with no gap locks for concurrent
// tickers to deadlock on.
func (s *Store) ReplaceCategoryReport(jobID string, report CategoryReport) error {
	_, err := s.db.Exec(
		`INSERT INTO category_reports (job_id, category, total_pages,
		rotten_pages, avg_seo_score, pattern)
		VALUES (UUID_TO_BIN(?), ?, ?, ?, ?, ?) AS new
		ON DUPLICATE KEY UPDATE
			total_pages   = new.total_pages,
			rotten_pages  = new.rotten_pages,
			avg_seo_score = new.avg_seo_score,
			pattern       = new.pattern`,
		jobID, report.Category, report.TotalPages,
		report.RottenPages, report.AvgSEOScore, report.Pattern,
	)
	return err
}

// returns the per-category rollups for a job.
func (s *Store) ListCategoryReports(jobID string) ([]CategoryReport, error) {
	return queryRows(s.db,
		`SELECT category, total_pages, rotten_pages,
		avg_seo_score, pattern FROM category_reports
		WHERE job_id = UUID_TO_BIN(?)`,
		func(rows *sql.Rows) (CategoryReport, error) {
			var r CategoryReport
			err := rows.Scan(&r.Category, &r.TotalPages, &r.RottenPages, &r.AvgSEOScore, &r.Pattern)
			return r, err
		}, jobID)
}
