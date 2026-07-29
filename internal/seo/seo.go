// Package seo parses crawled HTML into an on-page SEO audit: tags, headings, structured
// data, keyword placement, a list of issues, and a weighted score. Helpers live in utils.go.
package seo

import (
	"bytes"
	"net/url"
	"sort"
	"strings"

	"golang.org/x/net/html"

	"github.com/Tom-the-Bomb/linktrace/internal/htmlx"
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

	// image stats: a11y + Core Web Vitals signals. ImagesTotal is the denominator for all.
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

	// <html lang="...">, empty if missing. used by search engines and screen readers.
	HTMLLang string

	Issues []Issue
	Score  int
}

type KeywordCount struct {
	Term  string `json:"term"`
	Count int    `json:"count"`
}

// tokenizes page text, counts meaningful terms, and reports the top keywords
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

// parses page HTML and extracts the SEO-relevant signals, scored.
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
	var inBody bool

	htmlx.Walk(doc, func(n *html.Node) bool {
		if n.Type == html.TextNode {
			// body-only, matching the checker's soft-404 scan: <head> text (notably <title>)
			// isn't page content and would inflate the thin-content word count
			if inBody {
				textBuf.WriteString(" ")
				textBuf.WriteString(n.Data)
			}
			return true
		}
		if n.Type != html.ElementNode {
			return true
		}
		if n.Data == "script" {
			handleJSONLD(&a, n)
			return false // never descend into scripts
		}
		// style/template/noscript/svg carry no page text; inline svg <title> would also
		// clobber the document title
		if htmlx.IsNonRendered(n.Data) {
			return false
		}
		switch n.Data {
		case "body":
			inBody = true
		case "title":
			if a.Title == "" {
				a.Title = htmlx.TextContent(n)
				a.TitleLength = len(a.Title)
			}
		case "h1":
			a.H1Count++
			if firstH1 == "" {
				firstH1 = htmlx.TextContent(n)
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
			if strings.EqualFold(htmlx.GetAttr(n, "rel"), "canonical") {
				a.Canonical = htmlx.GetAttr(n, "href")
			}
		case "html":
			if a.HTMLLang == "" {
				a.HTMLLang = strings.TrimSpace(htmlx.GetAttr(n, "lang"))
			}
		case "img":
			handleImg(&a, n)
		case "a":
			handleAnchor(&a, pageHost, n)
		}
		return true
	})

	text := textBuf.String()
	a.TopKeywords, a.PrimaryKeyword, a.KeywordInTitle, a.KeywordInH1, a.KeywordInURL =
		AnalyzeKeywords(text, a.Title, firstH1, pageURL)

	a.Issues = findIssues(&a, countWords(text))
	a.Score = score(a.Issues)
	return a
}
