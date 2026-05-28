package crawler

import (
	"bytes"
	"net/url"

	"golang.org/x/net/html"
)

func resolve(base *url.URL, href string) string {
	u, err := base.Parse(href)
	if err != nil {
		return ""
	}
	// skip mailto:, tel:, javascript:, etc.
	if u.Scheme != "http" && u.Scheme != "https" {
		return ""
	}
	// ensure same domain
	if u.Host != base.Host {
		return ""
	}
	// /a and /a#section are the same page
	u.Fragment = ""
	return u.String()
}

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

// removes duplicate URLs, preserve order
func dedupe(in []string) []string {
	seen := map[string]bool{}
	var out []string
	for _, s := range in {
		if !seen[s] {
			seen[s] = true
			out = append(out, s)
		}
	}
	return out
}
