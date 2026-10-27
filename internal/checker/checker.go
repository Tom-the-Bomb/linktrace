package checker

import (
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/Tom-the-Bomb/linktrace/internal/httpx"
)

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
	ErrBlocked      = "blocked"
	ErrUnknown      = "unknown"
)

const (
	maxRedirects = 10
	maxBodyBytes = 1 << 20
)

type CheckResult struct {
	StatusCode   int
	ResponseTime int
	IsAlive      bool
	ErrorType    string
	Body         []byte
	FinalURL     string
	RetryAfter   time.Duration
}

// builds a client per Check so the redirect hook's loop flag isn't shared.
type Checker struct {
	timeout time.Duration
}

func New(timeout time.Duration) *Checker {
	return &Checker{timeout: timeout}
}

func (c *Checker) Check(rawURL string) CheckResult {
	start := time.Now()
	res := CheckResult{FinalURL: rawURL}

	req, err := http.NewRequest(http.MethodGet, rawURL, nil)
	if err != nil {
		res.ErrorType = ErrUnknown
		return res
	}
	httpx.SetCheckerHeaders(req)

	// ErrUseLastResponse keeps the last response, where a real error would discard it.
	var looped bool
	client := httpx.NewClient(c.timeout, true)
	client.CheckRedirect = func(_ *http.Request, via []*http.Request) error {
		if len(via) >= maxRedirects {
			looped = true
			return http.ErrUseLastResponse
		}
		return nil
	}

	resp, err := client.Do(req)
	res.ResponseTime = int(time.Since(start).Milliseconds())
	if err != nil {
		res.ErrorType = classifyNetworkError(err)
		return res
	}
	defer resp.Body.Close()

	res.StatusCode = resp.StatusCode
	res.FinalURL = resp.Request.URL.String()

	body, _ := io.ReadAll(io.LimitReader(resp.Body, maxBodyBytes))

	switch {
	// first: the surfaced response is the chain's last 3xx, which would otherwise count as alive
	case looped:
		res.ErrorType = ErrRedirectLoop
	case looksBlocked(resp.StatusCode, resp.Header, body):
		res.ErrorType = ErrBlocked
		res.RetryAfter = parseRetryAfter(resp.Header.Get("Retry-After"))
	case resp.StatusCode >= 500:
		res.ErrorType = ErrServer5xx
	case resp.StatusCode >= 400:
		res.ErrorType = ErrHTTP4xx
	default:
		isHTML := strings.Contains(resp.Header.Get("Content-Type"), "text/html")
		if isHTML && isSoft404(body) {
			res.ErrorType = ErrSoft404
		} else {
			res.IsAlive = true
			if isHTML {
				res.Body = body
			}
		}
	}
	return res
}
