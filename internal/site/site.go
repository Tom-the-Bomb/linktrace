// Package site runs one-shot domain-level checks (robots.txt, sitemap, HTTPS/cert, www
// canonicalization) and computes sitemap-vs-crawl coverage gaps. Helpers live in utils.go.
package site

import (
	"log"
	"net/url"

	"github.com/Tom-the-Bomb/linktrace/internal/crawler"
)

// holds every domain-level fact (mirrors the site_audits table).
type Audit struct {
	RobotsFound       bool     `json:"robots_found"`
	RobotsDisallowAll bool     `json:"robots_disallow_all"`
	CrawlDelay        int      `json:"crawl_delay"`
	SitemapFound      bool     `json:"sitemap_found"`
	SitemapURL        string   `json:"sitemap_url"`
	SitemapURLCount   int      `json:"sitemap_url_count"`
	SitemapURLs       []string `json:"-"` // not serialised in the report, used for coverage gap
	IsHTTPS           bool     `json:"is_https"`
	HTTPSRedirect     bool     `json:"https_redirect"`
	CertValid         bool     `json:"cert_valid"`
	WWWCanonical      string   `json:"www_canonical"`
}

const maxSitemapURLs = 2000

// performs every domain-level check against the root URL.
func Run(rawRoot string) Audit {
	var a Audit
	root, err := url.Parse(rawRoot)
	if err != nil {
		log.Printf("[site] invalid root URL %q: %v", rawRoot, err)
		return a
	}

	// robots.txt: yields disallow + crawl-delay + sitemap hints
	found, disallow, delay, sitemaps := fetchRobots(root)
	a.RobotsFound, a.RobotsDisallowAll, a.CrawlDelay = found, disallow, delay

	// sitemap.xml: prefer one named in robots, else the conventional location
	sitemapURL := root.Scheme + "://" + root.Host + "/sitemap.xml"
	if len(sitemaps) > 0 {
		sitemapURL = sitemaps[0]
	}
	if ok, urls := fetchSitemap(sitemapURL, 0); ok {
		a.SitemapFound, a.SitemapURL, a.SitemapURLs = true, sitemapURL, urls
		a.SitemapURLCount = len(urls)
	}

	a.IsHTTPS, a.HTTPSRedirect, a.CertValid = checkHTTPS(root.Host)
	a.WWWCanonical = checkWWW(root.Host)
	log.Printf("[site] audited %s: robots=%v sitemap=%d https=%v www=%s",
		root.Host, a.RobotsFound, a.SitemapURLCount, a.IsHTTPS, a.WWWCanonical)
	return a
}

// is the set difference between the sitemap and the crawled pages.
type CoverageGap struct {
	Orphans     []string `json:"orphans"`      // crawled, not in sitemap
	NotCrawled  []string `json:"not_crawled"`  // in sitemap, never reached
	SitemapDead []string `json:"sitemap_dead"` // in sitemap and crawled, but rotten
}

// is pure set arithmetic. Both sides run through crawler.NormalizeURL (the
// same canonical form crawled URLs were stored under) so trailing-slash/host-case differences
// don't masquerade as orphans or missed pages.
func ComputeCoverageGap(sitemapURLs, crawledURLs, rottenURLs []string) CoverageGap {
	inSitemap := make(map[string]bool, len(sitemapURLs))
	for _, u := range sitemapURLs {
		inSitemap[crawler.NormalizeURL(u)] = true
	}
	crawled := make(map[string]bool, len(crawledURLs))
	for _, u := range crawledURLs {
		crawled[crawler.NormalizeURL(u)] = true
	}
	rotten := make(map[string]bool, len(rottenURLs))
	for _, u := range rottenURLs {
		rotten[crawler.NormalizeURL(u)] = true
	}

	g := CoverageGap{Orphans: []string{}, NotCrawled: []string{}, SitemapDead: []string{}}
	for u := range crawled {
		if !inSitemap[u] {
			g.Orphans = append(g.Orphans, u)
		}
	}
	for u := range inSitemap {
		if !crawled[u] {
			g.NotCrawled = append(g.NotCrawled, u)
		} else if rotten[u] {
			g.SitemapDead = append(g.SitemapDead, u)
		}
	}
	return g
}
