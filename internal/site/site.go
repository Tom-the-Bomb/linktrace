package site

import (
	"context"
	"log"
	"net/url"
	"sort"

	"github.com/Tom-the-Bomb/linktrace/internal/crawler"
	"github.com/Tom-the-Bomb/linktrace/internal/robots"
)

type Audit struct {
	RobotsFound       bool     `json:"robots_found"`
	RobotsDisallowAll bool     `json:"robots_disallow_all"`
	CrawlDelay        int      `json:"crawl_delay"`
	SitemapFound      bool     `json:"sitemap_found"`
	SitemapURL        string   `json:"sitemap_url"`
	SitemapURLCount   int      `json:"sitemap_url_count"`
	SitemapURLs       []string `json:"-"`
	IsHTTPS           bool     `json:"is_https"`
	HTTPSRedirect     bool     `json:"https_redirect"`
	CertValid         bool     `json:"cert_valid"`
	WWWCanonical      string   `json:"www_canonical"`

	RobotsRules []robots.Rule `json:"-"`
}

const maxSitemapURLs = 2000

func Run(rawRoot string) Audit {
	var a Audit
	root, err := url.Parse(rawRoot)
	if err != nil {
		log.Printf("[site] invalid root URL %q: %v", rawRoot, err)
		return a
	}

	// "disallow all" means the seed itself is blocked, so blocking just the homepage counts
	ctx, cancel := context.WithTimeout(context.Background(), fetchDeadline)
	defer cancel()
	robotsFile, found := fetchRobots(ctx, root)
	a.RobotsFound, a.CrawlDelay, a.RobotsRules = found, robotsFile.CrawlDelay, robotsFile.Rules
	a.RobotsDisallowAll = !robots.Allowed(robotsFile.Rules, root.RequestURI())

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

type CoverageGap struct {
	Orphans     []string `json:"orphans"` // crawled, not in sitemap
	NotCrawled  []string `json:"not_crawled"`
	SitemapDead []string `json:"sitemap_dead"`
}

// normalizes both sides so trailing-slash/host-case differences don't
// masquerade as gaps.
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
	// stable order, else the report's lists reshuffle on every poll
	sort.Strings(g.Orphans)
	sort.Strings(g.NotCrawled)
	sort.Strings(g.SitemapDead)
	return g
}
