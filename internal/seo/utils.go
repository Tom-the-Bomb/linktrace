package seo

import (
	"net/url"
	"strings"
	"unicode"

	"golang.org/x/net/html"
)

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

// getAttr returns the value of n's attribute key, or "" if absent.
func getAttr(n *html.Node, key string) string {
	for _, attr := range n.Attr {
		if attr.Key == key {
			return attr.Val
		}
	}
	return ""
}

// handleMeta reads a <meta> element into the audit: description, viewport, robots noindex,
// and Open Graph / Twitter card tags.
func handleMeta(a *Audit, n *html.Node) {
	var name, property, content string
	for _, attr := range n.Attr {
		switch attr.Key {
		case "name":
			name = attr.Val
		case "property":
			property = attr.Val
		case "content":
			content = attr.Val
		}
	}

	switch {
	case name == "description":
		a.MetaDescription = content
		a.MetaDescLength = len(content)
	case strings.HasPrefix(property, "og:"):
		a.OGTags[property] = content
	case strings.HasPrefix(name, "twitter:"):
		a.TwitterTags[name] = content
	}

	if name == "viewport" {
		a.HasViewport = true
	}
	if name == "robots" && strings.Contains(strings.ToLower(content), "noindex") {
		a.Noindex = true
	}
}

// findIssues classifies SEO findings by severity:
//
//	error   = breaks indexing / search visibility (missing title, multiple H1, noindex)
//	warning = suboptimal / against best practice (too-long title, missing meta desc, no canonical)
//	info    = nice-to-have / non-critical signals (no OG tags, no JSON-LD, no viewport)
func findIssues(a *Audit) []Issue {
	var issues []Issue
	add := func(code, msg, sev string) {
		issues = append(issues, Issue{Code: code, Message: msg, Severity: sev})
	}

	if a.Title == "" {
		add("title_missing", "Missing <title> tag", SeverityError)
	} else if a.TitleLength > 60 {
		add("title_too_long", "Title is longer than 60 characters", SeverityWarning)
	} else if a.TitleLength < 10 {
		add("title_too_short", "Title is shorter than 10 characters", SeverityWarning)
	}

	if a.MetaDescription == "" {
		add("meta_desc_missing", "Missing meta description", SeverityWarning)
	} else if a.MetaDescLength > 160 {
		add("meta_desc_too_long", "Meta description longer than 160 characters", SeverityInfo)
	} else if a.MetaDescLength < 50 {
		add("meta_desc_too_short", "Meta description shorter than 50 characters", SeverityInfo)
	}

	if a.H1Count == 0 {
		add("h1_missing", "Missing H1 heading", SeverityError)
	} else if a.H1Count > 1 {
		add("h1_multiple", "Multiple H1 headings", SeverityError)
	}

	switch {
	case a.H2Count == 0:
		add("h2_missing", "No H2 headings", SeverityWarning)
	case a.H2Count < 3:
		add("h2_too_few", "Fewer than 3 H2 headings", SeverityInfo)
	case a.H2Count > 5:
		add("h2_too_many", "More than 5 H2 headings", SeverityInfo)
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

// score returns 100 minus weighted issue penalties, clamped to [0, 100].
func score(issues []Issue) int {
	s := 100
	for _, iss := range issues {
		switch iss.Severity {
		case SeverityError:
			s -= 20
		case SeverityWarning:
			s -= 10
		case SeverityInfo:
			s -= 3
		}
	}
	if s < 0 {
		return 0
	}
	return s
}

// tokenize lowercases s and splits it into runs of letters.
func tokenize(s string) []string {
	return strings.FieldsFunc(strings.ToLower(s), func(r rune) bool {
		return !unicode.IsLetter(r)
	})
}

// slug turns a URL's path into space-separated words so keyword matching can scan it.
func slug(pageURL string) string {
	u, err := url.Parse(pageURL)
	if err != nil {
		return ""
	}
	return strings.NewReplacer("-", " ", "_", " ", "/", " ").Replace(u.Path)
}
