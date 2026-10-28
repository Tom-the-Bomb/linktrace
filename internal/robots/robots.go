package robots

import (
	"math"
	"strconv"
	"strings"
)

// bound per-link matching cost; RFC 9309 asks crawlers to parse at least 500 KiB.
const (
	maxRules = 500
	maxBytes = 500 << 10
)

type Rule struct {
	Allow bool   `json:"a,omitempty"`
	Path  string `json:"p"`
}

type File struct {
	Rules      []Rule
	CrawlDelay int
	Sitemaps   []string
}

type group struct {
	rules []Rule
	delay int
}

// applies only the groups whose user-agent contains agent, else the '*' groups;
// Sitemap lines apply to everyone.
func Parse(body, agent string) File {
	if len(body) > maxBytes {
		body = body[:maxBytes]
	}
	body = strings.TrimPrefix(body, "\uFEFF")
	agent = strings.ToLower(agent)
	var f File
	var named, star group
	sawNamed := false
	// consecutive User-agent lines form one group
	var targets []*group
	inAgents := false
	for _, raw := range strings.FieldsFunc(body, func(r rune) bool { return r == '\n' || r == '\r' }) {
		line, _, _ := strings.Cut(raw, "#")
		key, val, ok := strings.Cut(line, ":")
		if !ok {
			continue
		}
		key, val = strings.ToLower(strings.TrimSpace(key)), strings.TrimSpace(val)
		if key == "sitemap" {
			f.Sitemaps = append(f.Sitemaps, val)
			continue
		}
		if key != "user-agent" {
			inAgents = false
		}
		switch key {
		case "user-agent":
			if !inAgents {
				targets, inAgents = nil, true
			}
			switch ua := strings.ToLower(val); {
			case ua == "*":
				targets = append(targets, &star)
			case strings.Contains(ua, agent):
				targets, sawNamed = append(targets, &named), true
			}
		case "allow", "disallow":
			// an empty value allows everything, so it adds no rule
			if val == "" {
				continue
			}
			for _, g := range targets {
				if len(g.rules) < maxRules {
					g.rules = append(g.rules, Rule{Allow: key == "allow", Path: val})
				}
			}
		case "crawl-delay":
			if n, err := strconv.ParseFloat(val, 64); err == nil {
				for _, g := range targets {
					g.delay = int(math.Ceil(n))
				}
			}
		}
	}
	g := star
	if sawNamed {
		g = named
	}
	f.Rules, f.CrawlDelay = g.rules, g.delay
	return f
}

// expects the path with its query string. Per RFC 9309 the longest match wins and
// Allow wins a tie.
func Allowed(rules []Rule, path string) bool {
	best, allowed := -1, true
	for _, r := range rules {
		if !matches(r.Path, path) {
			continue
		}
		if n := len(r.Path); n > best || (n == best && r.Allow) {
			best, allowed = n, r.Allow
		}
	}
	return allowed
}

// is anchored at the start of path; '*' matches any run and a trailing '$' pins the end.
func matches(pattern, path string) bool {
	anchored := strings.HasSuffix(pattern, "$")
	if anchored {
		pattern = pattern[:len(pattern)-1]
	}
	parts := strings.Split(pattern, "*")
	if !strings.HasPrefix(path, parts[0]) {
		return false
	}
	rest := path[len(parts[0]):]
	if len(parts) == 1 {
		return !anchored || rest == ""
	}
	for _, part := range parts[1 : len(parts)-1] {
		i := strings.Index(rest, part)
		if i < 0 {
			return false
		}
		rest = rest[i+len(part):]
	}
	last := parts[len(parts)-1]
	if anchored {
		return strings.HasSuffix(rest, last)
	}
	return strings.Contains(rest, last)
}
