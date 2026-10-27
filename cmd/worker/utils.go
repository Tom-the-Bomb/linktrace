package main

import (
	"net/url"
	"strings"

	"github.com/Tom-the-Bomb/linktrace/internal/checker"
	"github.com/Tom-the-Bomb/linktrace/internal/seo"
	"github.com/Tom-the-Bomb/linktrace/internal/store"
	"golang.org/x/net/publicsuffix"
)

// returns the registrable domain a URL belongs to (example.com for www.example.com or
// blog.example.com), so a site's subdomains share one request budget. IPs and hosts without a
// public suffix (localhost) fall back to the hostname.
func siteOf(raw string) string {
	u, err := url.Parse(raw)
	if err != nil {
		return raw
	}
	if d, err := publicsuffix.EffectiveTLDPlusOne(u.Hostname()); err == nil {
		return d
	}
	return u.Hostname()
}

// converts a robots.txt Crawl-delay (seconds between requests) into a per-minute budget and
// takes the stricter of it and our own limit, so a site asking to be crawled slowly gets that.
func effectiveRate(configured, crawlDelay int) int {
	if crawlDelay <= 0 {
		return configured
	}
	return min(configured, max(1, 60/crawlDelay))
}

// reports whether a result is a live page with a body worth parsing (links + SEO).
func hasHTML(res checker.CheckResult) bool {
	return res.IsAlive && len(res.Body) > 0
}

// flags failures worth retrying; permanent rot (dns/4xx/ssl/soft_404) is not.
func isTransient(errType string) bool {
	switch errType {
	case checker.ErrTimeout, checker.ErrConnReset:
		return true
	default:
		return false
	}
}

// returns the first non-empty path segment (e.g. /blog/x -> /blog), or "/" for root.
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

// labels a category by its rotten-to-total ratio for the report UI.
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

// clip cuts s to n characters, so an oversized field can't fail the insert and wedge the crawl.
func clip(s string, n int) string {
	if r := []rune(s); len(r) > n {
		return string(r[:n])
	}
	return s
}

// copies seo.Audit -> store.SEOAudit (separate types to avoid an import cycle), clipped to the
// column widths in schema.sql.
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
		Title:                 clip(a.Title, 10000),
		TitleLength:           a.TitleLength,
		MetaDescription:       clip(a.MetaDescription, 10000),
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
		HTMLLang:              clip(a.HTMLLang, 20),
		Canonical:             clip(a.Canonical, 10000),
		OGTags:                a.OGTags,
		TwitterTags:           a.TwitterTags,
		JSONLDCount:           a.JSONLDCount,
		JSONLDTypes:           a.JSONLDTypes,
		HasViewport:           a.HasViewport,
		Noindex:               a.Noindex,
		TopKeywords:           keywords,
		PrimaryKeyword:        clip(a.PrimaryKeyword, 100),
		KeywordInTitle:        a.KeywordInTitle,
		KeywordInH1:           a.KeywordInH1,
		KeywordInURL:          a.KeywordInURL,
		Issues:                issues,
		Score:                 a.Score,
	}
}

// the part of a URL robots.txt rules match against: escaped path plus query string.
func robotsPath(rawURL string) string {
	u, err := url.Parse(rawURL)
	if err != nil {
		return "/"
	}
	return u.RequestURI()
}
