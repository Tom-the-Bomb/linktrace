package store

import (
	"database/sql"
	"encoding/json"
	"strings"
)

func queryRows[T any](db *sql.DB, q string, scan func(*sql.Rows) (T, error), args ...any) ([]T, error) {
	rows, err := db.Query(q, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []T
	for rows.Next() {
		v, err := scan(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, v)
	}
	return out, rows.Err()
}

// maps sql.ErrNoRows to (nil, nil).
func getOne[T any](dest *T, scan func() error) (*T, error) {
	switch err := scan(); err {
	case nil:
		return dest, nil
	case sql.ErrNoRows:
		return nil, nil
	default:
		return nil, err
	}
}

func (s *Store) tx(fn func(*sql.Tx) error) error {
	t, err := s.db.Begin()
	if err != nil {
		return err
	}
	defer t.Rollback() //nolint:errcheck // no-op after a successful Commit
	if err := fn(t); err != nil {
		return err
	}
	return t.Commit()
}

func mustJSON(v any) []byte {
	b, _ := json.Marshal(v)
	return b
}

func clip(s string, n int) string {
	// MySQL rejects invalid UTF-8, and pages in legacy charsets carry it
	s = strings.ToValidUTF8(s, "\uFFFD")
	if r := []rune(s); len(r) > n {
		return string(r[:n])
	}
	return s
}

func nullIfEmpty(s string) any {
	if s == "" {
		return nil
	}
	return s
}

// seoAuditColumns' order must match scanSEOAudit's Scan order.
const seoAuditColumns = `url, title, title_length, meta_description,
	meta_description_length, h1_count, h2_count, h3_count,
	h4_count, h5_count, h6_count,
	images_total, images_with_alt, images_with_dims,
	images_lazy_loaded, images_responsive,
	links_internal, links_external, links_nofollow, html_lang,
	canonical, og_tags, twitter_tags, jsonld_count,
	jsonld_types, has_viewport, noindex, top_keywords,
	primary_keyword, keyword_in_title, keyword_in_h1,
	keyword_in_url, issues, score`

type scanner interface {
	Scan(dest ...any) error
}

func scanSEOAudit(s scanner, jobID string) (SEOAudit, error) {
	var a SEOAudit
	var canonical, primaryKeyword, htmlLang sql.NullString
	var ogTags, twitterTags, jsonLDTypes, topKeywords, issues []byte
	if err := s.Scan(&a.URL, &a.Title, &a.TitleLength,
		&a.MetaDescription, &a.MetaDescLength, &a.H1Count, &a.H2Count, &a.H3Count,
		&a.H4Count, &a.H5Count, &a.H6Count,
		&a.ImagesTotal, &a.ImagesWithAlt, &a.ImagesWithDims,
		&a.ImagesLazyLoaded, &a.ImagesResponsive,
		&a.LinksInternal, &a.LinksExternal, &a.LinksNofollow, &htmlLang,
		&canonical, &ogTags, &twitterTags, &a.JSONLDCount,
		&jsonLDTypes, &a.HasViewport, &a.Noindex, &topKeywords,
		&primaryKeyword, &a.KeywordInTitle, &a.KeywordInH1,
		&a.KeywordInURL, &issues, &a.Score); err != nil {
		return a, err
	}
	a.JobID = jobID
	a.Canonical = canonical.String
	a.PrimaryKeyword = primaryKeyword.String
	a.HTMLLang = htmlLang.String
	// corrupt blobs are ignored: one bad row shouldn't 500 a whole report
	_ = json.Unmarshal(ogTags, &a.OGTags)
	_ = json.Unmarshal(twitterTags, &a.TwitterTags)
	_ = json.Unmarshal(jsonLDTypes, &a.JSONLDTypes)
	_ = json.Unmarshal(topKeywords, &a.TopKeywords)
	_ = json.Unmarshal(issues, &a.Issues)
	return a, nil
}
