package store

import (
	"database/sql"
	"encoding/json"
	"strings"
	"time"

	_ "github.com/go-sql-driver/mysql"
	"github.com/google/uuid"

	"github.com/Tom-the-Bomb/linktrace/internal/seo"
)

type Job struct {
	ID        string
	UserID    string
	AnonOwner string
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

type Store struct {
	db *sql.DB
}

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

func (s *Store) CreateJob(id, url, userID, anonOwner string) error {
	_, err := s.db.Exec(
		"INSERT INTO jobs (id, url, user_id, anon_owner, status) VALUES (UUID_TO_BIN(?), ?, UUID_TO_BIN(?), ?, 'pending')",
		id, url, nullIfEmpty(userID), nullIfEmpty(anonOwner),
	)
	return err
}

// adds columns newer than a deployment's first boot, since schema.sql only runs on a
// fresh volume.
func (s *Store) Migrate() error {
	// sections are now computed per request
	if _, err := s.db.Exec("DROP TABLE IF EXISTS category_reports"); err != nil {
		return err
	}
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

func (s *Store) UpdateJobStatus(id, status string) error {
	_, err := s.db.Exec(
		"UPDATE jobs SET status = ? WHERE id = UUID_TO_BIN(?) AND status IN ('pending', 'crawling')", status, id,
	)
	return err
}

// deletes children before the parent since the FKs don't cascade.
func (s *Store) DeleteJob(id string) error {
	t, err := s.db.Begin()
	if err != nil {
		return err
	}
	defer t.Rollback() //nolint:errcheck // no-op after a successful Commit
	for _, q := range []string{
		"DELETE FROM pages WHERE job_id = UUID_TO_BIN(?)",
		"DELETE FROM seo_audits WHERE job_id = UUID_TO_BIN(?)",
		"DELETE FROM links WHERE job_id = UUID_TO_BIN(?)",
		"DELETE FROM site_audits WHERE job_id = UUID_TO_BIN(?)",
		"DELETE FROM jobs WHERE id = UUID_TO_BIN(?)",
	} {
		if _, err := t.Exec(q, id); err != nil {
			return err
		}
	}
	return t.Commit()
}

// returns (nil, nil) if the job doesn't exist.
func (s *Store) GetJob(id string) (*Job, error) {
	// a malformed id would error inside UUID_TO_BIN
	if _, err := uuid.Parse(id); err != nil {
		return nil, nil
	}

	var j Job
	var userID, anonOwner sql.NullString
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
	Source string `json:"source"`
	Target string `json:"target"`
}

// keeps one INSERT well under max_allowed_packet and the 65535-placeholder limit.
const linkBatchSize = 200

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

func (s *Store) ListLinks(jobID string) ([]Link, error) {
	return queryRows(s.db,
		"SELECT source_url, target_url FROM links WHERE job_id = UUID_TO_BIN(?)",
		func(rows *sql.Rows) (Link, error) {
			var l Link
			err := rows.Scan(&l.Source, &l.Target)
			return l, err
		}, jobID)
}

// returns (nil, nil) if there's no audit for that URL.
func (s *Store) GetSEOAudit(jobID, pageURL string) (*SEOAudit, error) {
	var a SEOAudit
	var canonical, primaryKeyword, htmlLang sql.NullString
	var ogTags, twitterTags, jsonLDTypes, topKeywords, issues []byte
	out, err := getOne(&a, func() error {
		return s.db.QueryRow(
			`SELECT url, title, title_length, meta_description,
			meta_description_length, h1_count, h2_count, h3_count,
			h4_count, h5_count, h6_count,
			images_total, images_with_alt, images_with_dims,
			images_lazy_loaded, images_responsive,
			links_internal, links_external, links_nofollow, html_lang,
			canonical, og_tags, twitter_tags, jsonld_count,
			jsonld_types, has_viewport, noindex, top_keywords,
			primary_keyword, keyword_in_title, keyword_in_h1,
			keyword_in_url, issues, score
			FROM seo_audits WHERE job_id = UUID_TO_BIN(?) AND url = ? COLLATE utf8mb4_bin LIMIT 1`,
			jobID, pageURL,
		).Scan(&a.URL, &a.Title, &a.TitleLength,
			&a.MetaDescription, &a.MetaDescLength, &a.H1Count, &a.H2Count, &a.H3Count,
			&a.H4Count, &a.H5Count, &a.H6Count,
			&a.ImagesTotal, &a.ImagesWithAlt, &a.ImagesWithDims,
			&a.ImagesLazyLoaded, &a.ImagesResponsive,
			&a.LinksInternal, &a.LinksExternal, &a.LinksNofollow, &htmlLang,
			&canonical, &ogTags, &twitterTags, &a.JSONLDCount,
			&jsonLDTypes, &a.HasViewport, &a.Noindex, &topKeywords,
			&primaryKeyword, &a.KeywordInTitle, &a.KeywordInH1,
			&a.KeywordInURL, &issues, &a.Score)
	})
	if out == nil || err != nil {
		return out, err
	}
	a.JobID = jobID
	a.Canonical = canonical.String
	a.PrimaryKeyword = primaryKeyword.String
	a.HTMLLang = htmlLang.String
	_ = json.Unmarshal(ogTags, &a.OGTags)
	_ = json.Unmarshal(twitterTags, &a.TwitterTags)
	_ = json.Unmarshal(jsonLDTypes, &a.JSONLDTypes)
	_ = json.Unmarshal(topKeywords, &a.TopKeywords)
	_ = json.Unmarshal(issues, &a.Issues)
	return out, nil
}

func (s *Store) SetArchiveURL(jobID, url, archiveURL string) error {
	_, err := s.db.Exec(
		"UPDATE pages SET archive_url = ? WHERE job_id = UUID_TO_BIN(?) AND url = ? COLLATE utf8mb4_bin",
		archiveURL, jobID, url,
	)
	return err
}

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
			r.ErrorType = errType.String
			r.ArchiveURL = archive.String
			return r, nil
		}, jobID)
}

// clips text to the column widths so an oversized field can't fail the insert.
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

// loads only what the report endpoints read; GetSEOAudit loads the full audit.
func (s *Store) ListSEOAudits(jobID string) ([]SEOAudit, error) {
	return queryRows(s.db,
		"SELECT url, score, issues FROM seo_audits WHERE job_id = UUID_TO_BIN(?)",
		func(rows *sql.Rows) (SEOAudit, error) {
			var a SEOAudit
			var issues []byte
			err := rows.Scan(&a.URL, &a.Score, &issues)
			_ = json.Unmarshal(issues, &a.Issues)
			return a, err
		}, jobID)
}
