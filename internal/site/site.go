// Package site runs one-shot domain-level checks (robots.txt, sitemap, HTTPS/cert, www
// canonicalization) and computes sitemap-vs-crawl coverage gaps. Helpers live in utils.go.
package site

import (
	"context"
	"log"
	"net/url"
	"sort"

	"github.com/Tom-the-Bomb/linktrace/internal/crawler"
	"github.com/Tom-the-Bomb/linktrace/internal/robots"
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

	RobotsRules []robots.Rule `json:"-"` // handed to the crawl, not stored
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

	// robots.txt: path rules + crawl-delay + sitemap hints. "Disallow all" means the rules block
	// the URL the crawl starts from, so a site that only blocks its homepage still counts.
	ctx, cancel := context.WithTimeout(context.Background(), fetchDeadline)
	defer cancel()
	robotsFile, found := fetchRobots(ctx, root)
	a.RobotsFound, a.CrawlDelay, a.RobotsRules = found, robotsFile.CrawlDelay, robotsFile.Rules
	a.RobotsDisallowAll = !robots.Allowed(robotsFile.Rules, root.RequestURI())

	// sitemap.xml: prefer one named in robots, else the conventional location
	sitemapURL := root.Scheme + "://" + root.Host + "/sitemap.xml"
	if len(robotsFile.Sitemaps) > 0 {
		sitemapURL = robotsFile.Sitemaps[0]
	}
	if ok, urls := fetchSitemap(ctx, sitemapURL, 0); ok {
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
	toSet := func(urls []string) map[string]bool {
		set := make(map[string]bool, len(urls))
		for _, u := range urls {
			set[crawler.NormalizeURL(u)] = true
		}
		return set
	}
	inSitemap, crawled, rotten := toSet(sitemapURLs), toSet(crawledURLs), toSet(rottenURLs)

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
	// map iteration is randomised, and the report page re-fetches this every poll: without a
	// stable order the panel's lists visibly reshuffle while a crawl runs
	sort.Strings(g.Orphans)
	sort.Strings(g.NotCrawled)
	sort.Strings(g.SitemapDead)
	return g
}
