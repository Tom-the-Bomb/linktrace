// Package htmlx holds the HTML node-walk and attribute helpers shared by the crawler, checker,
// and seo packages.
package htmlx

import "golang.org/x/net/html"

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
