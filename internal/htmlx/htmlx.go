// Package htmlx holds the HTML node-walk and attribute helpers shared by the crawler, checker,
// and seo packages.
package htmlx

import (
	"strings"

	"golang.org/x/net/html"
)

// visits n and its descendants pre-order. When visit returns false for a node, its subtree
// is skipped (used to drop script/style/svg etc.).
func Walk(n *html.Node, visit func(*html.Node) bool) {
	if !visit(n) {
		return
	}
	for c := n.FirstChild; c != nil; c = c.NextSibling {
		Walk(c, visit)
	}
}

// nonRendered are elements whose subtrees never contribute visible page text. Shared so the
// SEO audit and the soft-404 scan agree on what "the text of a page" means.
var nonRendered = map[string]bool{
	"script": true, "style": true, "template": true, "noscript": true, "svg": true,
}

// IsNonRendered reports whether an element's subtree should be skipped when collecting text.
func IsNonRendered(tag string) bool { return nonRendered[tag] }

// TextContent returns n's descendant text, space-separated and trimmed. Unlike reading
// FirstChild.Data it survives nested markup, so <h1><span>Title</span></h1> yields "Title"
// rather than the tag name.
func TextContent(n *html.Node) string {
	var buf strings.Builder
	Walk(n, func(c *html.Node) bool {
		if c.Type == html.ElementNode && IsNonRendered(c.Data) {
			return false
		}
		if c.Type != html.TextNode {
			return true
		}
		if t := strings.TrimSpace(c.Data); t != "" {
			if buf.Len() > 0 {
				buf.WriteByte(' ')
			}
			buf.WriteString(t)
		}
		return true
	})
	return buf.String()
}

// returns the value of n's attribute key and whether it was present.
func Attr(n *html.Node, key string) (string, bool) {
	for _, a := range n.Attr {
		if a.Key == key {
			return a.Val, true
		}
	}
	return "", false
}

// returns n's attribute value, or "" if absent.
func GetAttr(n *html.Node, key string) string {
	v, _ := Attr(n, key)
	return v
}

// reports whether n has the attribute (presence-only; distinguishes alt="" from no alt).
func HasAttr(n *html.Node, key string) bool {
	_, ok := Attr(n, key)
	return ok
}
