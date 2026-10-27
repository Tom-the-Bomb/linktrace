package main

import (
	"net/url"
	"strings"

	"github.com/Tom-the-Bomb/linktrace/internal/checker"
	"golang.org/x/net/publicsuffix"
)

// returns the registrable domain a URL belongs to (example.com for www.example.com or
// blog.example.com), so a site's subdomains share one request budget. IPs and hosts without a
// public suffix (localhost) fall back to the hostname.
func domainOf(raw string) string {
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
	return errType == checker.ErrTimeout || errType == checker.ErrConnReset
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

// the part of a URL robots.txt rules match against: escaped path plus query string.
func robotsPath(rawURL string) string {
	u, err := url.Parse(rawURL)
	if err != nil {
		return "/"
	}
	return u.RequestURI()
}
