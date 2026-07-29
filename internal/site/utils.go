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
	// applies tracks whether the current group targets us. Consecutive User-agent lines form one
	// group, so within a run we OR rather than overwrite; the first rule line ends the run.
	applies, inUARun := false, false
	for _, raw := range strings.Split(body, "\n") {
		line := strings.TrimSpace(raw)
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		key, val, ok := cut(line)
		if !ok {
			continue
		}
		if key != "user-agent" && key != "sitemap" {
			inUARun = false
		}
		switch key {
		case "user-agent":
			targetsUs := val == "*" || strings.Contains(strings.ToLower(val), "linktrace")
			if inUARun {
				applies = applies || targetsUs
			} else {
				applies, inUARun = targetsUs, true
			}
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
