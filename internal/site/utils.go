package site

import (
	"context"
	"encoding/xml"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/Tom-the-Bomb/linktrace/internal/httpx"
	"github.com/Tom-the-Bomb/linktrace/internal/robots"
)

const (
	// robots.txt and sitemap fetches share one deadline, so a huge sitemap index can't hold a
	// crawl's creation open
	fetchDeadline   = 20 * time.Second
	fetchTimeout    = 10 * time.Second // robots/sitemap GETs
	probeTimeout    = 8 * time.Second  // HTTPS/www redirect probes
	maxSitemapBytes = 5 << 20          // sitemaps can be big
)

// fetches /robots.txt and keeps what applies to LinkTrace; found is false when there's none.
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

// sitemap.xml comes in two shapes: a <urlset> of <url><loc>, or a <sitemapindex>
// pointing at more sitemaps. We recurse one level for an index.
type sitemapXML struct {
	URLs []struct {
		Loc string `xml:"loc"`
	} `xml:"url"`
	Sitemaps []struct {
		Loc string `xml:"loc"`
	} `xml:"sitemap"`
}

// downloads and parses a sitemap, recursing one level into a sitemap index,
// returning whether it was found and the (capped) list of page URLs.
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
	// sitemap INDEX: recurse one level
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

// verifies the site serves HTTPS with a valid cert and redirects HTTP to HTTPS.
func checkHTTPS(host string) (isHTTPS, httpsRedirect, certValid bool) {
	noFollow := httpx.NewClient(probeTimeout, false)

	// HTTP -> HTTPS redirect check
	if resp, err := noFollow.Get("http://" + host); err == nil {
		defer resp.Body.Close()
		if loc := resp.Header.Get("Location"); strings.HasPrefix(loc, "https://") {
			httpsRedirect = true
		}
	}

	// Go verifies the chain and hostname during the handshake, so reaching here means the cert
	// is valid. A bad cert and an unreachable host both leave these false.
	if resp, err := httpx.NewClient(probeTimeout, true).Get("https://" + host); err == nil {
		defer resp.Body.Close()
		isHTTPS = true
		certValid = true
	}
	return
}

// determines which form the site canonicalizes to.
// "www" / "apex" means proper canonicalization; "both" means duplicate-content risk.
func checkWWW(host string) string {
	apex := strings.TrimPrefix(host, "www.")
	wwwHost := "www." + apex

	noFollow := httpx.NewClient(probeTimeout, false)

	// land reports the host a form settles on, and whether it got there by redirecting. Both
	// facts are needed: a form that redirects elsewhere is not canonical, while one that serves
	// itself is — collapsing them to a bare host made every apex->www site look like "both".
	land := func(rawURL, self string) (dest string, redirected bool) {
		resp, err := noFollow.Get(rawURL)
		if err != nil {
			return "", false
		}
		defer resp.Body.Close()
		if resp.StatusCode >= 300 && resp.StatusCode < 400 {
			// only a cross-host redirect says where the canonical form lives; a relative or
			// same-host Location is internal routing, so this form still serves itself
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
	// both forms converge on one host: that host is the canonical form
	case wwwDest == apexDest:
		if wwwDest == wwwHost {
			return "www"
		}
		if wwwDest == apex {
			return "apex"
		}
		return "inconsistent" // converge somewhere off-domain
	// neither redirects, so each serves its own duplicate copy
	case !wwwRedirected && !apexRedirected:
		return "both"
	default:
		return "inconsistent"
	}
}

// fetchClient follows redirects through the guarded transport (the ctx below bounds each fetch)
var fetchClient = httpx.NewClient(0, true)

func isWebURL(s string) bool {
	return strings.HasPrefix(s, "https://") || strings.HasPrefix(s, "http://")
}

// fetches a URL (robots/sitemap) and returns its body and status, or ("", 0) on error.
func get(ctx context.Context, rawURL string) (string, int) {
	ctx, cancel := context.WithTimeout(ctx, fetchTimeout)
	defer cancel()
	body, status, err := httpx.Fetch(ctx, fetchClient, rawURL, maxSitemapBytes)
	if err != nil {
		return "", 0
	}
	return string(body), status
}
