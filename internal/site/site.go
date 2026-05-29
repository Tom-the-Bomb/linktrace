// Package site runs one-shot domain-level checks (robots.txt, sitemap, HTTPS/cert, www
// canonicalization) and computes sitemap-vs-crawl coverage gaps. Helpers live in utils.go.
package site

import (
	"log"
	"net/url"

	"github.com/Tom-the-Bomb/linktrace/internal/crawler"
)

// Audit holds every domain-level fact (mirrors the site_audits table).
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

const ua = "LinkTraceBot/1.0"
const maxSitemapURLs = 2000

// Run performs every domain-level check against the root URL.
func Run(rawRoot string) Audit {
	var a Audit
	root, err := url.Parse(rawRoot)
	if err != nil {
		log.Printf("[site] invalid root URL %q: %v", rawRoot, err)
		return a
	}
	log.Printf("[site] auditing %s", root.Host)

	// robots.txt: yields disallow + crawl-delay + sitemap hints
	log.Printf("[site] fetching robots.txt for %s", root.Host)
	found, disallow, delay, sitemaps := fetchRobots(root)
	a.RobotsFound, a.RobotsDisallowAll, a.CrawlDelay = found, disallow, delay
	if found {
		log.Printf("[site] robots.txt found, sitemaps=%d, disallow_all=%v, crawl_delay=%ds",
			len(sitemaps), disallow, delay)
	} else {
		log.Printf("[site] no robots.txt at %s", root.Host)
	}

	// sitemap.xml: prefer one named in robots, else the conventional location
	sitemapURL := root.Scheme + "://" + root.Host + "/sitemap.xml"
	if len(sitemaps) > 0 {
		sitemapURL = sitemaps[0]
		log.Printf("[site] using sitemap from robots.txt: %s", sitemapURL)
	} else {
		log.Printf("[site] no sitemap in robots.txt, trying %s", sitemapURL)
	}
	if ok, urls := fetchSitemap(sitemapURL, 0); ok {
		a.SitemapFound, a.SitemapURL, a.SitemapURLs = true, sitemapURL, urls
		a.SitemapURLCount = len(urls)
		log.Printf("[site] sitemap OK, %d URLs collected", len(urls))
	} else {
		log.Printf("[site] sitemap not found / unparseable at %s", sitemapURL)
	}

	// HTTPS / cert / www
	log.Printf("[site] checking HTTPS + cert for %s", root.Host)
	a.IsHTTPS, a.HTTPSRedirect, a.CertValid = checkHTTPS(root.Host)
	log.Printf("[site] https=%v, http→https=%v, cert=%v", a.IsHTTPS, a.HTTPSRedirect, a.CertValid)

	log.Printf("[site] checking www canonicalization for %s", root.Host)
	a.WWWCanonical = checkWWW(root.Host)
	log.Printf("[site] www_canonical=%s", a.WWWCanonical)
	return a
}

// CoverageGap is the set difference between the sitemap and the crawled pages.
type CoverageGap struct {
	Orphans     []string `json:"orphans"`      // crawled, not in sitemap
	NotCrawled  []string `json:"not_crawled"`  // in sitemap, never reached
	SitemapDead []string `json:"sitemap_dead"` // in sitemap and crawled, but rotten
}

// ComputeCoverageGap is pure set arithmetic. Both sides run through crawler.NormalizeURL (the
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
