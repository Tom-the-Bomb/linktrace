package main

import (
	"net/url"
	"strings"

	"github.com/Tom-the-Bomb/linktrace/internal/checker"
	"golang.org/x/net/publicsuffix"
)

// returns the registrable domain so a site's subdomains share one request budget.
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

func hasHTML(res checker.CheckResult) bool {
	return res.IsAlive && len(res.Body) > 0
}

func isTransient(errType string) bool {
	return errType == checker.ErrTimeout || errType == checker.ErrConnReset
}

func categoryOf(rawURL string) string {
	u, err := url.Parse(rawURL)
	if err != nil {
		return "/"
	}
	seg, _, _ := strings.Cut(strings.TrimLeft(u.Path, "/"), "/")
	return "/" + seg
}

func classifyPattern(total, rotten int) string {
	switch {
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

func robotsPath(rawURL string) string {
	u, err := url.Parse(rawURL)
	if err != nil {
		return "/"
	}
	return u.RequestURI()
}
