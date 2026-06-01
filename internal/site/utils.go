package site

import (
	"context"
	"encoding/xml"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"

	"github.com/Tom-the-Bomb/linktrace/internal/httpx"
)

const (
	fetchTimeout    = 10 * time.Second // robots/sitemap GETs
	probeTimeout    = 8 * time.Second  // HTTPS/www redirect probes
	maxSitemapBytes = 5 << 20          // sitemaps can be big
)

// reads /robots.txt, honouring only groups that target * or our UA.
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
			sitemaps = append(sitemaps, val) // global directive, applies regardless of UA group
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

// downloads and parses a sitemap, recursing one level into a sitemap index,
// returning whether it was found and the (capped) list of page URLs.
func fetchSitemap(sitemapURL string, depth int) (bool, []string) {
	body, status := get(sitemapURL)
	if status != http.StatusOK || body == "" {
		return false, nil
	}
	var doc sitemapXML
	if err := xml.Unmarshal([]byte(body), &doc); err != nil {
		return false, nil
	}

	var urls []string
	for _, u := range doc.URLs {
		if loc := strings.TrimSpace(u.Loc); loc != "" {
			urls = append(urls, loc)
			if len(urls) >= maxSitemapURLs {
				return true, urls
			}
		}
	}
	// sitemap INDEX: recurse one level
	if depth == 0 && len(doc.Sitemaps) > 0 {
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

	// HTTPS reachable + cert valid (a bad cert errors out, leaving both false)
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

// fetches a URL (robots/sitemap) and returns its body and status, or ("", 0) on error.
func get(rawURL string) (string, int) {
	ctx, cancel := context.WithTimeout(context.Background(), fetchTimeout)
	defer cancel()
	body, status, err := httpx.Fetch(ctx, http.DefaultClient, rawURL, maxSitemapBytes)
	if err != nil {
		return "", 0
	}
	return string(body), status
}

// splits "Key: value" on the first ':'. Lowercases the key, trims both sides.
func cut(line string) (key, val string, ok bool) {
	i := strings.Index(line, ":")
	if i < 0 {
		return "", "", false
	}
	return strings.ToLower(strings.TrimSpace(line[:i])), strings.TrimSpace(line[i+1:]), true
}
