package store

import (
	"database/sql"
	"encoding/json"
)

// nullIfEmpty maps "" to a SQL NULL so empty optional columns store as NULL, not "".
func nullIfEmpty(s string) any {
	if s == "" {
		return nil
	}
	return s
}

// seoAuditColumns is the shared SELECT list for seo_audits, kept in sync with scanSEOAudit's
// Scan order so GetSEOAudit and ListSEOAudits can reuse one decode path.
const seoAuditColumns = `url, title, title_length, meta_description,
	meta_description_length, h1_count, h2_count, h3_count,
	canonical, og_tags, twitter_tags, jsonld_count,
	jsonld_types, has_viewport, noindex, top_keywords,
	primary_keyword, keyword_in_title, keyword_in_h1,
	keyword_in_url, issues, score`

// scanner is implemented by both *sql.Row and *sql.Rows.
type scanner interface {
	Scan(dest ...any) error
}

// scanSEOAudit decodes one seoAuditColumns row (from a Row or Rows) into a SEOAudit, handling
// the nullable string columns and JSON blobs.
func scanSEOAudit(s scanner, jobID string) (SEOAudit, error) {
	var a SEOAudit
	var canonical, primaryKeyword sql.NullString
	var ogTags, twitterTags, jsonLDTypes, topKeywords, issues []byte
	if err := s.Scan(&a.URL, &a.Title, &a.TitleLength,
		&a.MetaDescription, &a.MetaDescriptionLength, &a.H1Count, &a.H2Count, &a.H3Count,
		&canonical, &ogTags, &twitterTags, &a.JSONLDCount,
		&jsonLDTypes, &a.HasViewport, &a.Noindex, &topKeywords,
		&primaryKeyword, &a.KeywordInTitle, &a.KeywordInH1,
		&a.KeywordInURL, &issues, &a.Score); err != nil {
		return a, err
	}
	a.JobID = jobID
	a.Canonical = canonical.String
	a.PrimaryKeyword = primaryKeyword.String
	_ = json.Unmarshal(ogTags, &a.OGTags)
	_ = json.Unmarshal(twitterTags, &a.TwitterTags)
	_ = json.Unmarshal(jsonLDTypes, &a.JSONLDTypes)
	_ = json.Unmarshal(topKeywords, &a.TopKeywords)
	_ = json.Unmarshal(issues, &a.Issues)
	return a, nil
}
