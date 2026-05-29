// Package crawler extracts internal links from crawled HTML and canonicalizes URLs so the
// same page is never queued twice. Private helpers live in utils.go.
package crawler

import (
	"bytes"
	"net/url"

	"golang.org/x/net/html"
)

// NormalizeURL parses a raw URL string and returns its canonical form. Exported so callers
// outside this package (the API seeding the frontier from a sitemap, the seed URL itself)
// can match the same canonical form the crawler uses when it discovers links in HTML.
// Returns the input unchanged if parsing fails.
func NormalizeURL(raw string) string {
	u, err := url.Parse(raw)
	if err != nil {
		return raw
	}
	return canonicalize(u, false)
}

// CanonicalKey returns the dedup key for a URL: its normal canonical form with the entire
// query string dropped. Every URL sharing a path collapses to one key regardless of its
// query params — /endpoint, /endpoint?a=1, and /endpoint?a=1&b=2 are all the same page.
// This governs deduplication ONLY; the crawler still fetches and records the first real URL
// it saw (query intact), so we never request a stripped URL that might 404. Returns input
// unchanged if parsing fails.
func CanonicalKey(raw string) string {
	u, err := url.Parse(raw)
	if err != nil {
		return raw
	}
	return canonicalize(u, true)
}

// ExtractLinks parses page HTML and returns the deduped, canonicalized, same-host links it
// discovers in <a href>. Off-host, non-http, and asset/framework paths are dropped.
func ExtractLinks(body []byte, base *url.URL) []string {
	doc, err := html.Parse(bytes.NewReader(body))
	if err != nil {
		return nil
	}

	var links []string
	var walk func(*html.Node)
	// recursively DFS the HTML tree to extract <a href="..."> -> absolute URL
	walk = func(n *html.Node) {
		if n.Type == html.ElementNode && n.Data == "a" {
			for _, attr := range n.Attr {
				if attr.Key == "href" {
					if abs := resolve(base, attr.Val); abs != "" {
						links = append(links, abs)
					}
				}
			}
		}
		for child := n.FirstChild; child != nil; child = child.NextSibling {
			walk(child)
		}
	}
	walk(doc)
	return dedupe(links)
}
