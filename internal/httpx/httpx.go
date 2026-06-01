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
// CheckerUserAgent is browser-like on purpose: the per-page liveness check wants what a real
// visitor sees, since some hosts 403 a bare bot UA but 200 a browser.
const (
	UserAgent        = "LinkTraceBot/1.0"
	CheckerUserAgent = "Mozilla/5.0 (compatible; LinkTrace/1.0)"
)

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
