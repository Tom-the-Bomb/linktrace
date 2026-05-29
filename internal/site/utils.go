package site

import (
	"context"
	"encoding/xml"
	"io"
	"log"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"
)

// newNoFollowClient returns a client that surfaces redirects (returns the 3xx response with
// its Location header) instead of following them, so we can inspect where a URL points.
func newNoFollowClient() *http.Client {
	return &http.Client{
		Timeout: 8 * time.Second,
		CheckRedirect: func(req *http.Request, via []*http.Request) error {
			return http.ErrUseLastResponse
		},
	}
}

// fetchRobots reads /robots.txt. We only honour groups that target * or our UA.
// Disallow:/ inside an applicable group means "stay out".
func fetchRobots(root *url.URL) (found, disallowAll bool, crawlDelay int, sitemaps []string) {
	body, status := get(root.Scheme + "://" + root.Host + "/robots.txt")
	if status != http.StatusOK || body == "" {
		return false, false, 0, nil
	}
	found = true
	applies := false
	for _, raw := range strings.Split(body, "\n") {
		line := strings.TrimSpace(raw)
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		key, val, ok := cut(line)
		if !ok {
			continue
		}
		switch key {
		case "user-agent":
			applies = val == "*" || strings.Contains(strings.ToLower(val), "linktrace")
		case "disallow":
			if applies && val == "/" {
				disallowAll = true
			}
		case "crawl-delay":
			if applies {
				if n, err := strconv.Atoi(val); err == nil {
					crawlDelay = n
				}
			}
		case "sitemap":
			// global directive, applies regardless of UA group
			sitemaps = append(sitemaps, val)
		}
	}
	return found, disallowAll, crawlDelay, sitemaps
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

// fetchSitemap downloads and parses a sitemap, recursing one level into a sitemap index,
// returning whether it was found and the (capped) list of page URLs.
func fetchSitemap(sitemapURL string, depth int) (bool, []string) {
	log.Printf("[site] analyzing sitemap (depth %d): %s", depth, sitemapURL)
	body, status := get(sitemapURL)
	if status != http.StatusOK || body == "" {
		log.Printf("[site] sitemap fetch failed (status %d): %s", status, sitemapURL)
		return false, nil
	}
	var doc sitemapXML
	if err := xml.Unmarshal([]byte(body), &doc); err != nil {
		log.Printf("[site] sitemap unparseable (%v): %s", err, sitemapURL)
		return false, nil
	}

	var urls []string
	for _, u := range doc.URLs {
		if loc := strings.TrimSpace(u.Loc); loc != "" {
			urls = append(urls, loc)
			if len(urls) >= maxSitemapURLs {
				log.Printf("[site] sitemap hit URL cap (%d) at %s", maxSitemapURLs, sitemapURL)
				return true, urls
			}
		}
	}
	// sitemap INDEX: recurse one level
	if depth == 0 && len(doc.Sitemaps) > 0 {
		log.Printf("[site] %s is an index with %d children, recursing", sitemapURL, len(doc.Sitemaps))
		for _, child := range doc.Sitemaps {
			if loc := strings.TrimSpace(child.Loc); loc != "" {
				_, more := fetchSitemap(loc, depth+1)
				for _, u := range more {
					urls = append(urls, u)
					if len(urls) >= maxSitemapURLs {
						return true, urls
					}
				}
			}
		}
	}
	if depth > 0 {
		log.Printf("[site] sitemap leaf returned %d URLs: %s", len(urls), sitemapURL)
	}
	return true, urls
}

// checkHTTPS verifies the site serves HTTPS with a valid cert and redirects HTTP to HTTPS.
func checkHTTPS(host string) (isHTTPS, httpsRedirect, certValid bool) {
	noFollow := newNoFollowClient()

	// HTTP -> HTTPS redirect check
	if resp, err := noFollow.Get("http://" + host); err == nil {
		defer resp.Body.Close()
		if loc := resp.Header.Get("Location"); strings.HasPrefix(loc, "https://") {
			httpsRedirect = true
		}
	}

	// HTTPS reachable + cert valid
	if resp, err := http.DefaultClient.Get("https://" + host); err == nil {
		defer resp.Body.Close()
		isHTTPS = true
		certValid = true
	}
	return
}

// checkWWW determines which form the site canonicalizes to.
// "www" / "apex" means proper canonicalization; "both" means duplicate-content risk.
func checkWWW(host string) string {
	apex := strings.TrimPrefix(host, "www.")
	wwwHost := "www." + apex

	noFollow := newNoFollowClient()

	land := func(rawURL string) string {
		resp, err := noFollow.Get(rawURL)
		if err != nil {
			return ""
		}
		defer resp.Body.Close()
		// a 3xx redirect tells us where the canonical form lives
		if loc := resp.Header.Get("Location"); loc != "" {
			if u, err := url.Parse(loc); err == nil && u.Host != "" {
				return strings.TrimPrefix(u.Host, "www.")
			}
		}
		// served directly (no redirect) -> this is itself a live canonical form
		if resp.StatusCode >= 200 && resp.StatusCode < 400 {
			return strings.TrimPrefix(rawURL, "https://")
		}
		return ""
	}

	wwwLands := land("https://" + wwwHost)
	apexLands := land("https://" + apex)

	switch {
	case wwwLands == "" || apexLands == "":
		return "inconsistent"
	case strings.HasPrefix(wwwLands, wwwHost) && strings.HasPrefix(apexLands, wwwHost):
		return "www"
	case wwwLands == apex && apexLands == apex:
		return "apex"
	case strings.HasPrefix(wwwLands, wwwHost) && apexLands == apex:
		return "both" // both serve themselves, no redirect either way
	default:
		return "inconsistent"
	}
}

// get fetches a URL with a 10s timeout and a 5 MiB cap (sitemaps can be big).
func get(rawURL string) (string, int) {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, rawURL, nil)
	if err != nil {
		return "", 0
	}
	req.Header.Set("User-Agent", ua)
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return "", 0
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(io.LimitReader(resp.Body, 5<<20))
	return string(body), resp.StatusCode
}

// cut splits "Key: value" on the first ':'. Lowercases the key, trims both sides.
func cut(line string) (key, val string, ok bool) {
	i := strings.Index(line, ":")
	if i < 0 {
		return "", "", false
	}
	return strings.ToLower(strings.TrimSpace(line[:i])), strings.TrimSpace(line[i+1:]), true
}
