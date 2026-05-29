// Package crawler extracts internal links from crawled HTML and canonicalizes URLs so the
// same page is never queued twice. Private helpers live in utils.go.
package crawler

import (
	"bytes"
	"net/url"

	"golang.org/x/net/html"
)

// NormalizeURL returns the canonical form of a raw URL, so the API's seed matches the form
// the crawler produces for discovered links. Returns the input unchanged if parsing fails.
func NormalizeURL(raw string) string {
	u, err := url.Parse(raw)
	if err != nil {
		return raw
	}
	return canonicalize(u, false)
}

// CanonicalKey returns a URL's dedup key: the canonical form with the query string dropped,
// so /endpoint, /endpoint?a=1, and /endpoint?a=1&b=2 collapse to one page. Dedup only; the
// crawler still fetches the first real URL it saw (query intact). Input unchanged if unparseable.
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
