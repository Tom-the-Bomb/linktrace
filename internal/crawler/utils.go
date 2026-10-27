package crawler

import (
	"net/url"
	"strings"
)

var skipPrefixes = []string{
	"/cdn-cgi/",
	"/.well-known/",
	"/wp-admin/",
	"/wp-includes/",
	"/wp-json/",
	"/_next/",
	"/__next/",
	"/_nuxt/",
	"/__nuxt/",
	"/_astro/",
	"/__svelte/",
	"/__sveltekit/",
	"/_app/",
	"/assets/",
	"/static/",
	"/_static/",
	"/_image",
	"/api/",
	"/feed",
	"/rss",
	"/sitemap",
	"/admin/",
}

var skipExtensions = []string{
	".css", ".js", ".mjs", ".map",
	".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".ico", ".bmp",
	".woff", ".woff2", ".ttf", ".otf", ".eot",
	".mp4", ".webm", ".mov", ".mp3", ".wav", ".ogg",
	".pdf", ".zip", ".tar", ".gz", ".rar",
	".xml", ".json", ".txt", ".csv",
}

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

func canonicalize(u *url.URL, dropQuery bool) string {
	u.Host = strings.ToLower(u.Host)
	u.Fragment = ""

	u.Path = strings.TrimRight(u.Path, "/")
	if u.Path == "" {
		u.Path = "/"
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
		// Encode() sorts keys, giving a stable canonical form
		u.RawQuery = q.Encode()
	}

	return u.String()
}

func resolve(base *url.URL, href string) string {
	u, err := base.Parse(href)
	if err != nil {
		return ""
	}
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
