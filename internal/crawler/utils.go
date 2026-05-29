package crawler

import (
	"net/url"
	"strings"
)

// path prefixes that are auto-generated infrastructure / framework internals, never user
// content. We don't even add them to the crawl frontier, saves the budget for real pages.
var skipPrefixes = []string{
	"/cdn-cgi/",     // cloudflare
	"/.well-known/", // ietf metadata
	"/wp-admin/",    // wordpress backend
	"/wp-includes/", // wordpress framework files
	"/wp-json/",     // wordpress REST
	"/_next/",       // next.js build assets
	"/__next/",      // next.js internals
	"/_nuxt/",       // nuxt build assets
	"/__nuxt/",      // nuxt internals
	"/_astro/",      // astro build assets
	"/__svelte/",    // svelte internals
	"/__sveltekit/", // sveltekit internals
	"/_app/",        // sveltekit app routes
	"/assets/",      // generic build output
	"/static/",      // generic static
	"/_static/",     // generic static
	"/_image",       // framework image proxies
	"/api/",         // REST/RPC endpoints, not user-facing pages
	"/feed",         // rss/atom feeds
	"/rss",          // rss feed root
	"/sitemap",      // sitemap.xml + variants
	"/admin/",       // generic admin
}

// file extensions that aren't HTML pages, we'd just fetch a 404 or a binary
var skipExtensions = []string{
	".css", ".js", ".mjs", ".map",
	".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".ico", ".bmp",
	".woff", ".woff2", ".ttf", ".otf", ".eot",
	".mp4", ".webm", ".mov", ".mp3", ".wav", ".ogg",
	".pdf", ".zip", ".tar", ".gz", ".rar",
	".xml", ".json", ".txt", ".csv",
}

// isUnwantedPath reports whether a path is a framework/asset route or a non-HTML file we
// should never enqueue.
func isUnwantedPath(path string) bool {
	lower := strings.ToLower(path)
	for _, p := range skipPrefixes {
		if strings.HasPrefix(lower, p) {
			return true
		}
	}
	for _, ext := range skipExtensions {
		if strings.HasSuffix(lower, ext) {
			return true
		}
	}
	return false
}

// query params that don't change the page content, tracking, sessions, click IDs.
// stripped during URL normalization so /post?utm_source=x and /post collapse to one entry.
var trackingParams = map[string]bool{
	"utm_source":   true,
	"utm_medium":   true,
	"utm_campaign": true,
	"utm_term":     true,
	"utm_content":  true,
	"utm_id":       true,
	"fbclid":       true,
	"gclid":        true,
	"msclkid":      true,
	"dclid":        true,
	"yclid":        true,
	"twclid":       true,
	"mc_eid":       true,
	"mc_cid":       true,
	"_ga":          true,
	"ref":          true,
	"ref_src":      true,
	"referrer":     true,
	"source":       true,
	"session":      true,
	"sessionid":    true,
}

// canonicalize collapses URL variants of the same page into one string: lowercase host,
// fragment dropped, trailing slash trimmed (except root), tracking params removed and the
// rest sorted. When dropQuery is true the query string is removed entirely (the dedup key).
func canonicalize(u *url.URL, dropQuery bool) string {
	u.Host = strings.ToLower(u.Host)
	u.Fragment = ""

	// canonical root path is "/", else "https://x.com" and "https://x.com/" never collide
	if u.Path == "" {
		u.Path = "/"
	}
	// trim trailing slash so /a and /a/ are the same, but keep "/" itself
	if len(u.Path) > 1 && strings.HasSuffix(u.Path, "/") {
		u.Path = strings.TrimRight(u.Path, "/")
	}

	if dropQuery {
		u.RawQuery = ""
	} else if u.RawQuery != "" {
		q := u.Query()
		for k := range q {
			if trackingParams[strings.ToLower(k)] {
				q.Del(k)
			}
		}
		// Encode() already sorts keys alphabetically, gives a stable canonical form
		u.RawQuery = q.Encode()
	}

	return u.String()
}

// resolve turns an href (relative or absolute) into a canonical same-host page URL, or ""
// if it's off-host, a non-http(s) scheme, or an asset/framework path.
func resolve(base *url.URL, href string) string {
	u, err := base.Parse(href)
	if err != nil {
		return ""
	}
	// skip mailto:, tel:, javascript:, etc.
	if u.Scheme != "http" && u.Scheme != "https" {
		return ""
	}
	if !strings.EqualFold(u.Host, base.Host) {
		return ""
	}
	if isUnwantedPath(u.Path) {
		return ""
	}
	return canonicalize(u, false)
}

// dedupe removes duplicate URLs while preserving first-seen order.
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
