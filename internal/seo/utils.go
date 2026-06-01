package seo

import (
	"encoding/json"
	"net/url"
	"strings"
	"unicode"

	"golang.org/x/net/html"

	"github.com/Tom-the-Bomb/linktrace/internal/htmlx"
)

// SEO thresholds and score penalties.
const (
	titleMaxLen    = 60
	titleMinLen    = 10
	metaDescMaxLen = 160
	metaDescMinLen = 50
	minAltRatio    = 0.9 // share of images that must have alt text
	minDimRatio    = 0.8 // share of images that must set width+height

	penaltyError   = 20
	penaltyWarning = 10
	penaltyInfo    = 3
)

// nonNavPrefixes are href prefixes that aren't navigable links (skipped in the link rollup).
var nonNavPrefixes = []string{"#", "javascript:", "mailto:", "tel:"}

var stopwords = map[string]bool{
	"the": true, "a": true, "an": true, "and": true, "or": true, "but": true,
	"of": true, "to": true, "in": true, "on": true, "for": true, "with": true,
	"is": true, "are": true, "this": true, "that": true, "it": true, "as": true,
	"at": true, "by": true, "be": true, "from": true, "your": true, "you": true,
	"we": true, "our": true, "all": true, "can": true, "will": true, "has": true,
	"have": true, "was": true, "were": true, "not": true, "if": true, "so": true,
	"its": true, "their": true, "they": true, "them": true, "than": true,
	"then": true, "what": true, "when": true, "where": true, "which": true,
	"who": true, "how": true, "more": true, "most": true, "some": true,
	"any": true, "one": true, "two": true, "may": true, "also": true,
}

// records a <script type="application/ld+json"> block's @type.
func handleJSONLD(a *Audit, n *html.Node) {
	if htmlx.GetAttr(n, "type") != "application/ld+json" || n.FirstChild == nil {
		return
	}
	a.JSONLDCount++
	var jsonld map[string]any
	if err := json.Unmarshal([]byte(n.FirstChild.Data), &jsonld); err == nil {
		if t, ok := jsonld["@type"].(string); ok {
			a.JSONLDTypes = append(a.JSONLDTypes, t)
		}
	}
}

// tallies one <img>'s a11y/CWV signals (alt, dimensions, lazy, responsive).
func handleImg(a *Audit, n *html.Node) {
	a.ImagesTotal++
	if htmlx.HasAttr(n, "alt") { // empty alt="" is the valid decorative signal
		a.ImagesWithAlt++
	}
	if htmlx.GetAttr(n, "width") != "" && htmlx.GetAttr(n, "height") != "" {
		a.ImagesWithDims++
	}
	if strings.EqualFold(htmlx.GetAttr(n, "loading"), "lazy") {
		a.ImagesLazyLoaded++
	}
	if htmlx.GetAttr(n, "srcset") != "" {
		a.ImagesResponsive++
	}
}

// buckets one <a> as internal/external and counts nofollow, skipping non-nav hrefs.
func handleAnchor(a *Audit, pageHost string, n *html.Node) {
	href := strings.TrimSpace(htmlx.GetAttr(n, "href"))
	if href == "" {
		return
	}
	for _, p := range nonNavPrefixes {
		if strings.HasPrefix(href, p) {
			return
		}
	}
	if strings.Contains(strings.ToLower(htmlx.GetAttr(n, "rel")), "nofollow") {
		a.LinksNofollow++
	}
	if linkURL, err := url.Parse(href); err == nil {
		if linkURL.Host == "" || linkURL.Host == pageHost {
			a.LinksInternal++
		} else {
			a.LinksExternal++
		}
	}
}

// reads a <meta> element: description, viewport, robots noindex, OG / Twitter tags.
func handleMeta(a *Audit, n *html.Node) {
	name := htmlx.GetAttr(n, "name")
	property := htmlx.GetAttr(n, "property")
	content := htmlx.GetAttr(n, "content")

	switch {
	case name == "description":
		a.MetaDescription = content
		a.MetaDescLength = len(content)
	case name == "viewport":
		a.HasViewport = true
	case name == "robots":
		a.Noindex = strings.Contains(strings.ToLower(content), "noindex")
	case strings.HasPrefix(property, "og:"):
		a.OGTags[property] = content
	case strings.HasPrefix(name, "twitter:"):
		a.TwitterTags[name] = content
	}
}

// classifies findings by severity:
//
//	error   = breaks indexing (missing title, multiple H1, noindex)
//	warning = suboptimal (too-long title, missing meta desc, no canonical)
//	info    = nice-to-have (no OG, no JSON-LD, no viewport)
func findIssues(a *Audit) []Issue {
	var issues []Issue
	add := func(code, msg, sev string) {
		issues = append(issues, Issue{Code: code, Message: msg, Severity: sev})
	}

	if a.Title == "" {
		add("title_missing", "Missing <title> tag", SeverityError)
	} else if a.TitleLength > titleMaxLen {
		add("title_too_long", "Title is longer than 60 characters", SeverityWarning)
	} else if a.TitleLength < titleMinLen {
		add("title_too_short", "Title is shorter than 10 characters", SeverityWarning)
	}

	if a.MetaDescription == "" {
		add("meta_desc_missing", "Missing meta description", SeverityWarning)
	} else if a.MetaDescLength > metaDescMaxLen {
		add("meta_desc_too_long", "Meta description longer than 160 characters", SeverityInfo)
	} else if a.MetaDescLength < metaDescMinLen {
		add("meta_desc_too_short", "Meta description shorter than 50 characters", SeverityInfo)
	}

	// H1: exactly 1 per page is the established SEO baseline (Google/Moz/Ahrefs).
	if a.H1Count == 0 {
		add("h1_missing", "Missing H1 heading", SeverityError)
	} else if a.H1Count > 1 {
		add("h1_multiple", "Multiple H1 headings", SeverityError)
	}

	// H2: 1+ for scannable structure, 2+ is typical. no upper bound, long-form pages have many.
	switch {
	case a.H2Count == 0:
		add("h2_missing", "No H2 headings", SeverityWarning)
	case a.H2Count < 2:
		add("h2_too_few", "Fewer than 2 H2 headings", SeverityInfo)
	}

	// H3: optional but recommended for sub-sectioning under H2s. Info-level only.
	if a.H3Count == 0 {
		add("h3_missing", "No H3 headings", SeverityInfo)
	}

	if a.Canonical == "" {
		add("canonical_missing", "Missing canonical link", SeverityWarning)
	}

	if a.JSONLDCount == 0 {
		add("jsonld_missing", "No JSON-LD structured data", SeverityInfo)
	}

	if len(a.OGTags) == 0 {
		add("og_missing", "No Open Graph tags", SeverityInfo)
	}

	// Twitter cards fall back to Open Graph, so a missing one is only informational
	if len(a.TwitterTags) == 0 {
		add("twitter_missing", "No Twitter card tags", SeverityInfo)
	}

	if !a.HasViewport {
		add("viewport_missing", "Missing viewport meta tag", SeverityWarning)
	}

	if a.Noindex {
		add("noindex", "Page is marked noindex", SeverityError)
	}

	// <html lang="..."> is a small but real SEO + a11y signal; absent is info-only.
	if a.HTMLLang == "" {
		add("html_lang_missing", "Missing <html lang> attribute", SeverityInfo)
	}

	// image hygiene: only flag when there are images, else it fires on every text-only page
	if a.ImagesTotal > 0 {
		altRatio := float64(a.ImagesWithAlt) / float64(a.ImagesTotal)
		if altRatio < minAltRatio {
			add("img_missing_alt",
				"Images missing alt attribute (accessibility + SEO)", SeverityWarning)
		}
		dimRatio := float64(a.ImagesWithDims) / float64(a.ImagesTotal)
		if dimRatio < minDimRatio {
			add("img_missing_dims",
				"Images missing width/height (causes layout shift)", SeverityInfo)
		}
	}

	if a.PrimaryKeyword != "" {
		if !a.KeywordInTitle {
			add("keyword_not_in_title",
				"Primary keyword \""+a.PrimaryKeyword+"\" not in title", SeverityWarning)
		}
		if !a.KeywordInH1 {
			add("keyword_not_in_h1",
				"Primary keyword \""+a.PrimaryKeyword+"\" not in any H1", SeverityWarning)
		}
		if !a.KeywordInURL {
			add("keyword_not_in_url",
				"Primary keyword \""+a.PrimaryKeyword+"\" not in URL slug", SeverityInfo)
		}
	}

	return issues
}

// returns 100 minus weighted issue penalties, clamped to [0, 100].
func score(issues []Issue) int {
	s := 100
	for _, iss := range issues {
		switch iss.Severity {
		case SeverityError:
			s -= penaltyError
		case SeverityWarning:
			s -= penaltyWarning
		case SeverityInfo:
			s -= penaltyInfo
		}
	}
	return max(0, s)
}

// lowercases s and splits it into runs of letters.
func tokenize(s string) []string {
	return strings.FieldsFunc(strings.ToLower(s), func(r rune) bool {
		return !unicode.IsLetter(r)
	})
}

// turns a URL's path into space-separated words so keyword matching can scan it.
func slug(pageURL string) string {
	u, err := url.Parse(pageURL)
	if err != nil {
		return ""
	}
	return strings.NewReplacer("-", " ", "_", " ", "/", " ").Replace(u.Path)
}
