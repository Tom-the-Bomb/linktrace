package store

import (
	"database/sql"
	"encoding/json"
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
	JobID                 string
	URL                   string
	Title                 string
	TitleLength           int
	MetaDescription       string
	MetaDescriptionLength int
	H1Count               int
	H2Count               int
	H3Count               int
	Canonical             string
	OGTags                map[string]string
	TwitterTags           map[string]string
	JSONLDCount           int
	JSONLDTypes           []string
	HasViewport           bool
	Noindex               bool
	TopKeywords           []KeywordCount
	PrimaryKeyword        string
	KeywordInTitle        bool
	KeywordInH1           bool
	KeywordInURL          bool
	Issues                []Issue
	Score                 int
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
	Category    string
	TotalPages  int
	RottenPages int
	AvgSEOScore int
	Pattern     string
}

type Store struct {
	db *sql.DB
}

func nullIfEmpty(s string) any {
	if s == "" {
		return nil
	}
	return s
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

func (s *Store) CreateJob(id, url string) error {
	_, err := s.db.Exec(
		"INSERT INTO jobs (id, url, status) VALUES (UUID_TO_BIN(?), ?, 'pending')", id, url,
	)
	return err
}

func (s *Store) UpdateJobStatus(id, status string) error {
	_, err := s.db.Exec(
		"UPDATE jobs SET status = ? WHERE id = UUID_TO_BIN(?)", status, id,
	)
	return err
}

func (s *Store) SetTotalPages(id string, n int) error {
	_, err := s.db.Exec(
		"UPDATE jobs SET total_pages = ? WHERE id = UUID_TO_BIN(?)", n, id,
	)
	return err
}

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

func (s *Store) SetArchiveURL(jobID, url, archiveURL string) error {
	_, err := s.db.Exec(
		"UPDATE pages SET archive_url = ? where job_id = UUID_TO_BIN(?) AND url = ?",
		archiveURL, jobID, url,
	)
	return err
}

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
		VALUES (UUID_TO_BIN(?), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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

func (s *Store) ListSEOAudits(jobID string) ([]SEOAudit, error) {
	rows, err := s.db.Query(
		`SELECT url, title, title_length, meta_description,
		meta_description_length, h1_count, h2_count, h3_count,
		canonical, og_tags, twitter_tags, jsonld_count,
		jsonld_types, has_viewport, noindex, top_keywords,
		primary_keyword, keyword_in_title, keyword_in_h1,
		keyword_in_url, issues, score
		FROM seo_audits WHERE job_id = UUID_TO_BIN(?)`,
		jobID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []SEOAudit
	for rows.Next() {
		var a SEOAudit
		var canonical sql.NullString
		var ogTags, twitterTags, jsonLDTypes, topKeywords, issues []byte

		if err := rows.Scan(&a.URL, &a.Title, &a.TitleLength,
			&a.MetaDescription, &a.MetaDescriptionLength, &a.H1Count, &a.H2Count, &a.H3Count,
			&canonical, &ogTags, &twitterTags, &a.JSONLDCount,
			&jsonLDTypes, &a.HasViewport, &a.Noindex, &topKeywords,
			&a.PrimaryKeyword, &a.KeywordInTitle, &a.KeywordInH1,
			&a.KeywordInURL, &issues, &a.Score); err != nil {
			return nil, err
		}
		a.JobID = jobID
		a.Canonical = canonical.String
		_ = json.Unmarshal(ogTags, &a.OGTags)
		_ = json.Unmarshal(twitterTags, &a.TwitterTags)
		_ = json.Unmarshal(jsonLDTypes, &a.JSONLDTypes)
		_ = json.Unmarshal(topKeywords, &a.TopKeywords)
		_ = json.Unmarshal(issues, &a.Issues)
		out = append(out, a)
	}
	return out, rows.Err()
}

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
