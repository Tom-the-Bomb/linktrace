package crawler

import (
	"bytes"
	"net/url"
	"strings"

	"golang.org/x/net/html"

	"github.com/Tom-the-Bomb/linktrace/internal/htmlx"
)

func NormalizeURL(raw string) string {
	u, err := url.Parse(raw)
	if err != nil {
		return raw
	}
	return canonicalize(u, false)
}

func CategoryOf(rawURL string) string {
	u, err := url.Parse(rawURL)
	if err != nil {
		return "/"
	}
	seg, _, _ := strings.Cut(strings.TrimLeft(u.Path, "/"), "/")
	return "/" + seg
}

func SiteKey(host string) string {
	host = strings.TrimSuffix(strings.ToLower(host), ".")
	return strings.TrimPrefix(host, "www.")
}

// drops the query so /post?id=1 and /post?id=2 dedupe as one page; the original
// URL is still fetched.
func CanonicalKey(raw string) string {
	u, err := url.Parse(raw)
	if err != nil {
		return raw
	}
	return canonicalize(u, true)
}

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
