// Package checker fetches a URL and classifies the outcome as alive or a specific kind of
// rot (DNS, timeout, SSL, soft-404, 4xx/5xx, redirect loop). Helpers live in utils.go.
package checker

import (
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/Tom-the-Bomb/linktrace/internal/httpx"
)

// type of rot
const (
	ErrTimeout      = "timeout"
	ErrDNS          = "dns_failure"
	ErrConnRefused  = "connection_refused"
	ErrConnReset    = "connection_reset"
	ErrRedirectLoop = "redirect_loop"
	ErrSSL          = "ssl_error"
	ErrSoft404      = "soft_404"
	ErrHTTP4xx      = "http_4xx"
	ErrServer5xx    = "server_error"
	ErrUnknown      = "unknown"
)

const (
	maxRedirects = 10      // give up past this many hops (redirect loop)
	maxBodyBytes = 1 << 20 // 1 MB cap on the body kept for SEO analysis
)

type CheckResult struct {
	StatusCode    int
	ResponseTime  int
	IsAlive       bool
	ErrorType     string
	RedirectChain []string
	ContentType   string
	Body          []byte
	FinalURL      string
}

// Checker holds only the per-request timeout; each Check builds its own client so the
// CheckRedirect hook can record that request's redirect chain without shared state.
type Checker struct {
	timeout time.Duration
}

// New returns a Checker whose requests time out after the given duration.
func New(timeout time.Duration) *Checker {
	return &Checker{timeout: timeout}
}

// Check fetches rawURL and returns its liveness + classified error type. For healthy HTML it
// also returns the response body (capped at maxBodyBytes) for downstream SEO analysis.
func (c *Checker) Check(rawURL string) CheckResult {
	start := time.Now()
	res := CheckResult{FinalURL: rawURL}

	req, err := http.NewRequest(http.MethodGet, rawURL, nil)
	if err != nil {
		res.ErrorType = ErrUnknown // malformed URL / bad scheme, not a DNS failure
		return res
	}
	req.Header.Set("User-Agent", httpx.CheckerUserAgent)

	var chain []string
	client := &http.Client{
		Timeout: c.timeout,
		CheckRedirect: func(req *http.Request, via []*http.Request) error {
			chain = append(chain, req.URL.String())
			if len(via) >= maxRedirects {
				return http.ErrUseLastResponse
			}
			return nil
		},
	}

	resp, err := client.Do(req)
	res.ResponseTime = int(time.Since(start).Milliseconds())
	if err != nil {
		res.ErrorType = classifyNetworkError(err)
		return res
	}
	defer resp.Body.Close()

	res.StatusCode = resp.StatusCode
	res.ContentType = resp.Header.Get("Content-Type")
	res.FinalURL = resp.Request.URL.String()
	res.RedirectChain = chain

	body, _ := io.ReadAll(io.LimitReader(resp.Body, maxBodyBytes))

	switch {
	case resp.StatusCode >= 500:
		res.ErrorType = ErrServer5xx
	case resp.StatusCode >= 400:
		res.ErrorType = ErrHTTP4xx
	default: // 2xx/3xx
		isHTML := strings.Contains(res.ContentType, "text/html")
		if isHTML && isSoft404(body) {
			res.ErrorType = ErrSoft404
		} else {
			res.IsAlive = true
			if isHTML {
				res.Body = body // kept for downstream SEO analysis
			}
		}
	}
	return res
}
