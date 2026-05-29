// Package checker fetches a URL and classifies the outcome as alive or a specific kind of
// rot (DNS, timeout, SSL, soft-404, 4xx/5xx, redirect loop). Helpers live in utils.go.
package checker

import (
	"io"
	"net/http"
	"strings"
	"time"
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

type Checker struct {
	client *http.Client
}

// New returns a Checker whose client times out after timeout and follows at most 10 redirects.
func New(timeout time.Duration) *Checker {
	return &Checker{
		client: &http.Client{
			Timeout: timeout,
			CheckRedirect: func(req *http.Request, via []*http.Request) error {
				if len(via) >= 10 {
					return http.ErrUseLastResponse
				}
				return nil
			},
		},
	}
}

// Check fetches rawURL and returns its liveness + classified error type. For healthy HTML it
// also returns the response body (capped at 1 MB) for downstream SEO analysis.
func (c *Checker) Check(rawURL string) CheckResult {
	start := time.Now()
	res := CheckResult{FinalURL: rawURL}

	req, err := http.NewRequest(http.MethodGet, rawURL, nil)
	if err != nil {
		res.ErrorType = ErrDNS
		return res
	}

	req.Header.Set("User-Agent", "Mozilla/5.0 (compatible; LinkTrace/1.0)")

	resp, err := c.client.Do(req)
	res.ResponseTime = int(time.Since(start).Milliseconds())

	if err != nil {
		res.ErrorType = classifyNetworkError(err)
		return res
	}
	defer resp.Body.Close()

	res.StatusCode = resp.StatusCode
	res.ContentType = resp.Header.Get("Content-Type")
	res.FinalURL = resp.Request.URL.String()

	// read body up to 1 MB
	body, _ := io.ReadAll(io.LimitReader(resp.Body, 1<<20))

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
