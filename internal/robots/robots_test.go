package robots

import "testing"

func TestAllowed(t *testing.T) {
	rules := []Rule{
		{Path: "/private"},
		{Path: "/private/press", Allow: true},
		{Path: "/*.pdf$"},
		{Path: "/search?"},
		{Path: "/tmp/*/cache"},
	}
	cases := map[string]bool{
		"/":                   true,
		"/about":              true,
		"/private":            false,
		"/private/notes":      false,
		"/private/press/2024": true,
		"/files/report.pdf":   false,
		"/files/report.pdf?x": true, // '$' pins the end, so a query string escapes it
		"/search?q=go":        false,
		"/searching":          true,
		"/tmp/a/b/cache/x":    false,
		"/tmp/cache":          true,
	}
	for path, want := range cases {
		if got := Allowed(rules, path); got != want {
			t.Errorf("Allowed(%q) = %v, want %v", path, got, want)
		}
	}
}

func TestTieGoesToAllow(t *testing.T) {
	rules := []Rule{{Path: "/page"}, {Path: "/page", Allow: true}}
	if !Allowed(rules, "/page") {
		t.Error("equal-length Allow should win over Disallow")
	}
}

func TestNoRulesAllowsEverything(t *testing.T) {
	if !Allowed(nil, "/anything") {
		t.Error("no rules should allow every path")
	}
}

func TestParseBOMAndCRLineEndings(t *testing.T) {
	f := Parse("\uFEFFUser-agent: *\rDisallow: /x\r", "linktrace")
	if len(f.Rules) != 1 || f.Rules[0].Path != "/x" {
		t.Errorf("BOM and CR-only lines should still parse, got %+v", f)
	}
}

func TestParseNamedGroupReplacesStar(t *testing.T) {
	body := `# comment
User-agent: *
Disallow: /
Crawl-delay: 10

User-agent: Googlebot
User-agent: LinkTraceBot
Disallow: /admin # trailing comment
Crawl-delay: 2

Sitemap: https://example.com/sitemap.xml
`
	f := Parse(body, "linktrace")
	if len(f.Rules) != 1 || f.Rules[0].Path != "/admin" || f.CrawlDelay != 2 {
		t.Errorf("named group should apply alone, got %+v", f)
	}
	if len(f.Sitemaps) != 1 {
		t.Errorf("sitemap lines apply to everyone, got %v", f.Sitemaps)
	}
	if star := Parse(body, "otherbot"); !(len(star.Rules) == 1 && star.Rules[0].Path == "/" && star.CrawlDelay == 10) {
		t.Errorf("unnamed crawler should fall back to *, got %+v", star)
	}
}

func TestParseFractionalCrawlDelay(t *testing.T) {
	if f := Parse("User-agent: *\nCrawl-delay: 1.5\n", "linktrace"); f.CrawlDelay != 2 {
		t.Errorf("fractional delay should round up, got %d", f.CrawlDelay)
	}
}
