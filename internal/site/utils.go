package site

import (
	"context"
	"crypto/tls"
	"encoding/xml"
	"errors"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/Tom-the-Bomb/linktrace/internal/httpx"
	"github.com/Tom-the-Bomb/linktrace/internal/robots"
)

const (
	// shared by robots and sitemap fetches so a huge sitemap index can't stall crawl creation
	fetchDeadline   = 20 * time.Second
	fetchTimeout    = 10 * time.Second
	probeTimeout    = 8 * time.Second
	maxSitemapBytes = 5 << 20
)

func fetchRobots(ctx context.Context, root *url.URL) (f robots.File, found bool) {
	body, status := get(ctx, root.Scheme+"://"+root.Host+"/robots.txt")
	if status >= 500 {
		// RFC 9309: a robots.txt that errors means the whole site is off limits
		return robots.File{Rules: []robots.Rule{{Path: "/"}}}, false
	}
	if status != http.StatusOK || body == "" {
		return robots.File{}, false
	}
	return robots.Parse(body, "linktrace"), true
}

type sitemapXML struct {
	URLs []struct {
		Loc string `xml:"loc"`
	} `xml:"url"`
	Sitemaps []struct {
		Loc string `xml:"loc"`
	} `xml:"sitemap"`
}

func fetchSitemap(ctx context.Context, sitemapURL string, depth int) (bool, []string) {
	body, status := get(ctx, sitemapURL)
	if status != http.StatusOK || body == "" {
		return false, nil
	}
	var doc sitemapXML
	if err := xml.Unmarshal([]byte(body), &doc); err != nil {
		return false, nil
	}

	var urls []string
	for _, u := range doc.URLs {
		if loc := strings.TrimSpace(u.Loc); isWebURL(loc) {
			urls = append(urls, loc)
			if len(urls) >= maxSitemapURLs {
				return true, urls
			}
		}
	}
	if depth == 0 && len(doc.Sitemaps) > 0 {
		for _, child := range doc.Sitemaps {
			if ctx.Err() != nil {
				break
			}
			if loc := strings.TrimSpace(child.Loc); loc != "" {
				_, more := fetchSitemap(ctx, loc, depth+1)
				for _, u := range more {
					urls = append(urls, u)
					if len(urls) >= maxSitemapURLs {
						return true, urls
					}
				}
			}
		}
	}
	return true, urls
}

func checkHTTPS(host string) (isHTTPS, httpsRedirect, certValid bool) {
	noFollow := httpx.NewClient(probeTimeout, false)

	if resp, err := noFollow.Get("http://" + host); err == nil {
		defer resp.Body.Close()
		if loc := resp.Header.Get("Location"); strings.HasPrefix(loc, "https://") {
			httpsRedirect = true
		}
	}

	resp, err := httpx.NewClient(probeTimeout, true).Get("https://" + host)
	if err == nil {
		defer resp.Body.Close()
	}
	var verifyErr *tls.CertificateVerificationError
	certValid = err == nil
	isHTTPS = certValid || errors.As(err, &verifyErr)
	return
}

func checkWWW(host string) string {
	apex := strings.TrimPrefix(host, "www.")
	wwwHost := "www." + apex

	noFollow := httpx.NewClient(probeTimeout, false)

	land := func(rawURL, self string) (dest string, redirected bool) {
		resp, err := noFollow.Get(rawURL)
		if err != nil {
			return "", false
		}
		defer resp.Body.Close()
		if resp.StatusCode >= 300 && resp.StatusCode < 400 {
			// only a cross-host redirect names the canonical form; a relative or same-host Location
			// is internal routing
			if loc, lerr := url.Parse(resp.Header.Get("Location")); lerr == nil && loc.Host != "" {
				if h := strings.ToLower(loc.Host); h != self {
					return h, true
				}
			}
			return self, false
		}
		if resp.StatusCode >= 200 && resp.StatusCode < 300 {
			return self, false
		}
		return "", false
	}

	wwwDest, wwwRedirected := land("https://"+wwwHost, wwwHost)
	apexDest, apexRedirected := land("https://"+apex, apex)

	switch {
	case wwwDest == "" || apexDest == "":
		return "inconsistent"
	case wwwDest == apexDest:
		if wwwDest == wwwHost {
			return "www"
		}
		if wwwDest == apex {
			return "apex"
		}
		return "inconsistent"
	case !wwwRedirected && !apexRedirected:
		return "both"
	default:
		return "inconsistent"
	}
}

// has no timeout: the ctx in get bounds each fetch.
var fetchClient = httpx.NewClient(0, true)

func isWebURL(s string) bool {
	return strings.HasPrefix(s, "https://") || strings.HasPrefix(s, "http://")
}

func get(ctx context.Context, rawURL string) (string, int) {
	ctx, cancel := context.WithTimeout(ctx, fetchTimeout)
	defer cancel()
	body, status, err := httpx.Fetch(ctx, fetchClient, rawURL, maxSitemapBytes)
	if err != nil {
		return "", 0
	}
	return string(body), status
}
