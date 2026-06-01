// Package crawler extracts internal links from HTML and canonicalizes URLs so a page is never queued twice.
package crawler

import (
	"bytes"
	"net/url"

	"golang.org/x/net/html"

	"github.com/Tom-the-Bomb/linktrace/internal/htmlx"
)

// returns the canonical form of a raw URL, or the input unchanged if unparseable.
func NormalizeURL(raw string) string {
	u, err := url.Parse(raw)
	if err != nil {
		return raw
	}
	return canonicalize(u, false)
}

// returns a URL's dedup key: the canonical form with the query dropped, so
// /endpoint and /endpoint?a=1 collapse to one. Dedup only; the original URL is still fetched.
func CanonicalKey(raw string) string {
	u, err := url.Parse(raw)
	if err != nil {
		return raw
	}
	return canonicalize(u, true)
}

// returns the deduped, canonicalized, same-host links in <a href>.
func ExtractLinks(body []byte, base *url.URL) []string {
	doc, err := html.Parse(bytes.NewReader(body))
	if err != nil {
		return nil
	}

	var links []string
	htmlx.Walk(doc, func(n *html.Node) bool {
		if n.Type == html.ElementNode && n.Data == "a" {
			if href, ok := htmlx.Attr(n, "href"); ok {
				if abs := resolve(base, href); abs != "" {
					links = append(links, abs)
				}
			}
		}
		return true
	})
	return dedupe(links)
}
