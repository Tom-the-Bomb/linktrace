// Package seo parses crawled HTML into an on-page SEO audit: tags, headings, structured
// data, keyword placement, a list of issues, and a weighted score. Helpers live in utils.go.
package seo

import (
	"bytes"
	"encoding/json"
	"net/url"
	"sort"
	"strings"

	"golang.org/x/net/html"
)

const (
	SeverityError   = "error"
	SeverityWarning = "warning"
	SeverityInfo    = "info"
)

type Issue struct {
	Code     string `json:"code"`
	Message  string `json:"message"`
	Severity string `json:"severity"`
}

type Audit struct {
	Title           string
	TitleLength     int
	MetaDescription string
	MetaDescLength  int
	H1Count         int
	H2Count         int
	H3Count         int
	// H4-H6 are tracked for completeness but have no scoring rules attached.
	H4Count        int
	H5Count        int
	H6Count        int
	Canonical      string
	OGTags         map[string]string
	TwitterTags    map[string]string
	JSONLDCount    int
	JSONLDTypes    []string
	HasViewport    bool
	Noindex        bool
	TopKeywords    []KeywordCount
	PrimaryKeyword string
	KeywordInTitle bool
	KeywordInH1    bool
	KeywordInURL   bool

	// Image stats — a11y + Core Web Vitals signals. ImagesTotal is the denominator for all.
	ImagesTotal      int
	ImagesWithAlt    int // <img alt="..."> present (empty alt counts; decorative is fine)
	ImagesWithDims   int // both width AND height set (prevents CLS)
	ImagesLazyLoaded int // loading="lazy"
	ImagesResponsive int // has srcset (responsive image source set)

	// Link stats: split by destination so the report can flag SEO-relevant patterns
	// (e.g. lots of external links without nofollow on a content site).
	LinksInternal int
	LinksExternal int
	LinksNofollow int

	// <html lang="..."> — empty if missing. Search engines + screen readers use it.
	HTMLLang string

	Issues []Issue
	Score  int
}

type KeywordCount struct {
	Term  string `json:"term"`
	Count int    `json:"count"`
}

// AnalyzeKeywords tokenizes page text, counts meaningful terms, and reports the top keywords
// plus where the most frequent ("primary") one appears (title / first H1 / URL slug).
func AnalyzeKeywords(text, title, firstH1, pageURL string) (top []KeywordCount,
	primary string, inTitle, inH1, inURL bool) {

	counts := map[string]int{}
	for _, tok := range tokenize(text) {
		if len(tok) < 3 || stopwords[tok] {
			continue
		}
		counts[tok]++
	}

	for term, count := range counts {
		top = append(top, KeywordCount{Term: term, Count: count})
	}
	sort.Slice(top, func(i, j int) bool {
		if top[i].Count != top[j].Count {
			return top[i].Count > top[j].Count
		}
		return top[i].Term < top[j].Term
	})
	if len(top) > 10 {
		top = top[:10]
	}

	if len(top) == 0 {
		return top, "", false, false, false
	}
	primary = top[0].Term
	inTitle = strings.Contains(strings.ToLower(title), primary)
	inH1 = strings.Contains(strings.ToLower(firstH1), primary)
	inURL = strings.Contains(strings.ToLower(slug(pageURL)), primary)
	return
}

// AuditHTML parses page HTML and extracts the SEO-relevant signals, scored.
func AuditHTML(body []byte, pageURL string) Audit {
	a := Audit{
		OGTags:      map[string]string{},
		TwitterTags: map[string]string{},
	}

	// page host used to bucket links as internal vs external; empty if unparseable
	var pageHost string
	if u, err := url.Parse(pageURL); err == nil {
		pageHost = u.Host
	}

	doc, err := html.Parse(bytes.NewReader(body))
	if err != nil {
		return a
	}

	var textBuf strings.Builder
	var firstH1 string

	var walk func(*html.Node)
	walk = func(n *html.Node) {
		// skip non-content subtrees entirely
		if n.Type == html.ElementNode && (n.Data == "script" || n.Data == "style") {
			if n.Data == "script" && getAttr(n, "type") == "application/ld+json" && n.FirstChild != nil {
				a.JSONLDCount++
				var jsonld map[string]any
				if err := json.Unmarshal([]byte(n.FirstChild.Data), &jsonld); err == nil {
					if t, ok := jsonld["@type"].(string); ok {
						a.JSONLDTypes = append(a.JSONLDTypes, t)
					}
				}
			}
			return
		}

		if n.Type == html.TextNode {
			textBuf.WriteString(" ")
			textBuf.WriteString(n.Data)
		}

		// Skip SVG subtrees entirely: inline icons commonly include <title>YouTube</title>
		// (or similar) as their a11y label, which would otherwise overwrite the real <head>
		// page title via last-write-wins.
		if n.Type == html.ElementNode && n.Data == "svg" {
			return
		}

		if n.Type == html.ElementNode {
			switch n.Data {
			case "title":
				// Only the first <title> wins — never let a later one overwrite (defense in
				// depth: SVG subtrees are already skipped above).
				if a.Title == "" && n.FirstChild != nil {
					a.Title = strings.TrimSpace(n.FirstChild.Data)
					a.TitleLength = len(a.Title)
				}
			case "h1":
				a.H1Count++
				if firstH1 == "" && n.FirstChild != nil {
					firstH1 = strings.TrimSpace(n.FirstChild.Data)
				}
			case "h2":
				a.H2Count++
			case "h3":
				a.H3Count++
			case "h4":
				a.H4Count++
			case "h5":
				a.H5Count++
			case "h6":
				a.H6Count++
			case "meta":
				handleMeta(&a, n)
			case "link":
				if getAttr(n, "rel") == "canonical" {
					a.Canonical = getAttr(n, "href")
				}
			case "html":
				// only the first <html lang> wins — there is only one in valid documents anyway
				if a.HTMLLang == "" {
					a.HTMLLang = strings.TrimSpace(getAttr(n, "lang"))
				}
			case "img":
				a.ImagesTotal++
				// alt attribute presence (even empty alt="" is the explicit "decorative" signal,
				// which is correct usage — so we count any alt attribute that exists)
				if hasAttr(n, "alt") {
					a.ImagesWithAlt++
				}
				if getAttr(n, "width") != "" && getAttr(n, "height") != "" {
					a.ImagesWithDims++
				}
				if strings.EqualFold(getAttr(n, "loading"), "lazy") {
					a.ImagesLazyLoaded++
				}
				if getAttr(n, "srcset") != "" {
					a.ImagesResponsive++
				}
			case "a":
				href := strings.TrimSpace(getAttr(n, "href"))
				if href == "" || strings.HasPrefix(href, "#") ||
					strings.HasPrefix(href, "javascript:") || strings.HasPrefix(href, "mailto:") ||
					strings.HasPrefix(href, "tel:") {
					break // not a navigable link, skip from the link rollup
				}
				rel := strings.ToLower(getAttr(n, "rel"))
				if strings.Contains(rel, "nofollow") {
					a.LinksNofollow++
				}
				if linkURL, err := url.Parse(href); err == nil {
					// relative URL or same host => internal; anything else => external
					if linkURL.Host == "" || linkURL.Host == pageHost {
						a.LinksInternal++
					} else {
						a.LinksExternal++
					}
				}
			}
		}

		for child := n.FirstChild; child != nil; child = child.NextSibling {
			walk(child)
		}
	}
	walk(doc)

	a.TopKeywords, a.PrimaryKeyword, a.KeywordInTitle, a.KeywordInH1, a.KeywordInURL =
		AnalyzeKeywords(textBuf.String(), a.Title, firstH1, pageURL)

	a.Issues = findIssues(&a)
	a.Score = score(a.Issues)
	return a
}
