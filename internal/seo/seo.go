// Package seo parses crawled HTML into an on-page SEO audit: tags, headings, structured
// data, keyword placement, a list of issues, and a weighted score. Helpers live in utils.go.
package seo

import (
	"bytes"
	"cmp"
	"net/url"
	"slices"
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
	Title           string `json:"title"`
	TitleLength     int    `json:"title_length"`
	MetaDescription string `json:"meta_description"`
	MetaDescLength  int    `json:"meta_description_length"`
	H1Count         int    `json:"h1_count"`
	H2Count         int    `json:"h2_count"`
	H3Count         int    `json:"h3_count"`
	// H4-H6 are tracked for completeness but have no scoring rules attached.
	H4Count        int               `json:"h4_count"`
	H5Count        int               `json:"h5_count"`
	H6Count        int               `json:"h6_count"`
	Canonical      string            `json:"canonical"`
	OGTags         map[string]string `json:"og_tags"`
	TwitterTags    map[string]string `json:"twitter_tags"`
	JSONLDCount    int               `json:"jsonld_count"`
	JSONLDTypes    []string          `json:"jsonld_types"`
	HasViewport    bool              `json:"has_viewport"`
	Noindex        bool              `json:"noindex"`
	TopKeywords    []KeywordCount    `json:"top_keywords"`
	PrimaryKeyword string            `json:"primary_keyword"`
	KeywordInTitle bool              `json:"keyword_in_title"`
	KeywordInH1    bool              `json:"keyword_in_h1"`
	KeywordInURL   bool              `json:"keyword_in_url"`

	// image stats: a11y + Core Web Vitals signals. ImagesTotal is the denominator for all.
	ImagesTotal      int `json:"images_total"`
	ImagesWithAlt    int `json:"images_with_alt"`    // <img alt="..."> present (empty alt counts; decorative is fine)
	ImagesWithDims   int `json:"images_with_dims"`   // both width AND height set (prevents CLS)
	ImagesLazyLoaded int `json:"images_lazy_loaded"` // loading="lazy"
	ImagesResponsive int `json:"images_responsive"`  // has srcset (responsive image source set)

	// Link stats: split by destination so the report can flag SEO-relevant patterns
	// (e.g. lots of external links without nofollow on a content site).
	LinksInternal int `json:"links_internal"`
	LinksExternal int `json:"links_external"`
	LinksNofollow int `json:"links_nofollow"`

	// <html lang="...">, empty if missing. used by search engines and screen readers.
	HTMLLang string `json:"html_lang"`

	Issues []Issue `json:"issues"`
	Score  int     `json:"score"`
}

type KeywordCount struct {
	Term  string `json:"term"`
	Count int    `json:"count"`
}

// counts meaningful terms in the page text, keeps the top ten, and records where the most
// frequent ("primary") one appears: title, first H1 or URL slug.
func analyzeKeywords(a *Audit, text, firstH1, pageURL string) {
	counts := map[string]int{}
	for _, tok := range tokenize(text) {
		if len(tok) >= 3 && !stopwords[tok] {
			counts[tok]++
		}
	}
	top := make([]KeywordCount, 0, len(counts))
	for term, count := range counts {
		top = append(top, KeywordCount{Term: term, Count: count})
	}
	slices.SortFunc(top, func(x, y KeywordCount) int {
		return cmp.Or(y.Count-x.Count, strings.Compare(x.Term, y.Term))
	})
	a.TopKeywords = top[:min(10, len(top))]
	if len(top) == 0 {
		return
	}
	a.PrimaryKeyword = top[0].Term
	a.KeywordInTitle = strings.Contains(strings.ToLower(a.Title), a.PrimaryKeyword)
	a.KeywordInH1 = strings.Contains(strings.ToLower(firstH1), a.PrimaryKeyword)
	a.KeywordInURL = strings.Contains(strings.ToLower(slug(pageURL)), a.PrimaryKeyword)
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
	analyzeKeywords(&a, text, firstH1, pageURL)
	a.Issues = findIssues(&a, len(strings.Fields(text)))
	a.Score = score(a.Issues)
	return a
}
