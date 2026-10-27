package htmlx

import (
	"strings"

	"golang.org/x/net/html"
)

// visits pre-order and skips a node's subtree when visit returns false.
func Walk(n *html.Node, visit func(*html.Node) bool) {
	if !visit(n) {
		return
	}
	for c := n.FirstChild; c != nil; c = c.NextSibling {
		Walk(c, visit)
	}
}

var nonRendered = map[string]bool{
	"script": true, "style": true, "template": true, "noscript": true, "svg": true,
}

func IsNonRendered(tag string) bool { return nonRendered[tag] }

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

func Attr(n *html.Node, key string) (string, bool) {
	for _, a := range n.Attr {
		if a.Key == key {
			return a.Val, true
		}
	}
	return "", false
}

func GetAttr(n *html.Node, key string) string {
	v, _ := Attr(n, key)
	return v
}

func HasAttr(n *html.Node, key string) bool {
	_, ok := Attr(n, key)
	return ok
}
