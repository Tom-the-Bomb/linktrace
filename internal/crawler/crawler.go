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

// drops the query and trailing slash so /post?id=1, /post?id=2 and /post/ dedupe as one
// page; the original URL is still fetched.
func CanonicalKey(raw string) string {
	u, err := url.Parse(raw)
	if err != nil {
		return raw
	}
	u.Path = strings.TrimRight(u.Path, "/")
	return canonicalize(u, true)
}

func ExtractLinks(body []byte, page *url.URL) []string {
	doc, err := html.Parse(bytes.NewReader(body))
	if err != nil {
		return nil
	}

	var links []string
	base := page
	htmlx.Walk(doc, func(n *html.Node) bool {
		if n.Type != html.ElementNode {
			return true
		}
		href, ok := htmlx.Attr(n, "href")
		switch {
		case !ok:
		// relative links resolve against the first <base>, as in a browser
		case n.Data == "base" && base == page:
			if b, err := page.Parse(href); err == nil {
				base = b
			}
		case n.Data == "a":
			if abs := resolve(base, page.Host, href); abs != "" {
				links = append(links, abs)
			}
		}
		return true
	})
	return dedupe(links)
}
