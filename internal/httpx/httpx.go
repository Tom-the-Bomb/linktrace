// Package httpx centralizes the HTTP client construction and the fetch-with-cap pattern shared
// by the site, archive, and checker packages.
package httpx

import (
	"context"
	"io"
	"net/http"
	"time"
)

// UserAgent identifies LinkTrace's site-level probes (robots/sitemap/cert/archive) as a bot.
// CheckerUserAgent impersonates a real browser on purpose: the per-page liveness check wants
// what a real visitor sees, since some hosts 403 a bare bot UA but 200 a browser.
const (
	UserAgent        = "LinkTraceBot/1.0"
	CheckerUserAgent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
)

// browserHeaders accompany CheckerUserAgent; many anti-bot filters key off a missing Accept /
// Sec-Fetch set as much as the UA. Accept-Encoding is left unset so Go still auto-decompresses.
var browserHeaders = map[string]string{
	"Accept":                    "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
	"Accept-Language":           "en-US,en;q=0.9",
	"Upgrade-Insecure-Requests": "1",
	"Sec-Fetch-Dest":            "document",
	"Sec-Fetch-Mode":            "navigate",
	"Sec-Fetch-Site":            "none",
	"Sec-Fetch-User":            "?1",
}

// SetBrowserHeaders applies a browser-like header set so header-sniffing blocks are less likely
// to reject a per-page liveness check. Use only for the checker; site-level probes stay honest.
func SetBrowserHeaders(req *http.Request) {
	req.Header.Set("User-Agent", CheckerUserAgent)
	for k, v := range browserHeaders {
		req.Header.Set(k, v)
	}
}

// returns a client with the given timeout. When followRedirects is false it surfaces
// the 3xx response (with its Location) instead of following it.
func NewClient(timeout time.Duration, followRedirects bool) *http.Client {
	c := &http.Client{Timeout: timeout}
	if !followRedirects {
		c.CheckRedirect = func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }
	}
	return c
}

// gETs rawURL with the bot UA and returns the body (capped at limit bytes) and status.
func Fetch(ctx context.Context, client *http.Client, rawURL string, limit int64) ([]byte, int, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, rawURL, nil)
	if err != nil {
		return nil, 0, err
	}
	req.Header.Set("User-Agent", UserAgent)
	resp, err := client.Do(req)
	if err != nil {
		return nil, 0, err
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(io.LimitReader(resp.Body, limit))
	return body, resp.StatusCode, nil
}
