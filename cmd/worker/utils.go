package main

import (
	"net/url"
	"strings"

	"github.com/Tom-the-Bomb/linktrace/internal/checker"
	"github.com/Tom-the-Bomb/linktrace/internal/seo"
	"github.com/Tom-the-Bomb/linktrace/internal/store"
)

// hostOf returns the host of a raw URL, or the input unchanged if it won't parse.
func hostOf(raw string) string {
	u, err := url.Parse(raw)
	if err != nil {
		return raw
	}
	return u.Host
}

// isTransient flags failures worth retrying; permanent rot (dns/4xx/ssl/soft_404) is not.
func isTransient(errType string) bool {
	switch errType {
	case checker.ErrTimeout, checker.ErrConnReset:
		return true
	default:
		return false
	}
}

// categoryOf returns the first non-empty path segment (e.g. /blog/x -> /blog), or "/" for root.
func categoryOf(rawURL string) string {
	u, err := url.Parse(rawURL)
	if err != nil {
		return "/"
	}
	for _, seg := range strings.Split(u.Path, "/") {
		if seg != "" {
			return "/" + seg
		}
	}
	return "/"
}

// classifyPattern labels a category by its rotten-to-total ratio for the report UI.
func classifyPattern(total, rotten int) string {
	switch {
	case total == 0:
		return "empty"
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

// mapAudit copies seo.Audit -> store.SEOAudit (separate types to avoid an import cycle).
func mapAudit(jobID, url string, a seo.Audit) store.SEOAudit {
	issues := make([]store.Issue, len(a.Issues))
	for i, iss := range a.Issues {
		issues[i] = store.Issue{Code: iss.Code, Message: iss.Message, Severity: iss.Severity}
	}
	keywords := make([]store.KeywordCount, len(a.TopKeywords))
	for i, k := range a.TopKeywords {
		keywords[i] = store.KeywordCount{Term: k.Term, Count: k.Count}
	}
	return store.SEOAudit{
		JobID:                 jobID,
		URL:                   url,
		Title:                 a.Title,
		TitleLength:           a.TitleLength,
		MetaDescription:       a.MetaDescription,
		MetaDescriptionLength: a.MetaDescLength,
		H1Count:               a.H1Count,
		H2Count:               a.H2Count,
		H3Count:               a.H3Count,
		H4Count:               a.H4Count,
		H5Count:               a.H5Count,
		H6Count:               a.H6Count,
		ImagesTotal:           a.ImagesTotal,
		ImagesWithAlt:         a.ImagesWithAlt,
		ImagesWithDims:        a.ImagesWithDims,
		ImagesLazyLoaded:      a.ImagesLazyLoaded,
		ImagesResponsive:      a.ImagesResponsive,
		LinksInternal:         a.LinksInternal,
		LinksExternal:         a.LinksExternal,
		LinksNofollow:         a.LinksNofollow,
		HTMLLang:              a.HTMLLang,
		Canonical:             a.Canonical,
		OGTags:                a.OGTags,
		TwitterTags:           a.TwitterTags,
		JSONLDCount:           a.JSONLDCount,
		JSONLDTypes:           a.JSONLDTypes,
		HasViewport:           a.HasViewport,
		Noindex:               a.Noindex,
		TopKeywords:           keywords,
		PrimaryKeyword:        a.PrimaryKeyword,
		KeywordInTitle:        a.KeywordInTitle,
		KeywordInH1:           a.KeywordInH1,
		KeywordInURL:          a.KeywordInURL,
		Issues:                issues,
		Score:                 a.Score,
	}
}
