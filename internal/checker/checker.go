package checker

import (
	"crypto/tls"
	"crypto/x509"
	"errors"
	"io"
	"net"
	"net/http"
	"strings"
	"syscall"
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

// new checker: max 10 redirects, timeout after `timeout`
func New(timeout time.Duration) *Checker {
	return &Checker{
		client: &http.Client{
			Timeout: timeout,
			// via is the list fo requests already made in the chain
			CheckRedirect: func(req *http.Request, via []*http.Request) error {
				if len(via) >= 10 {
					return http.ErrUseLastResponse
				}
				return nil
			},
		},
	}
}

func classifyNetworkError(err error) string {
	// DNS resolution failure
	var dnsErr *net.DNSError
	if errors.As(err, &dnsErr) {
		return ErrDNS
	}

	// timeout
	var netErr net.Error
	if errors.As(err, &netErr) && netErr.Timeout() {
		return ErrTimeout
	}

	// TLS / certificate issue
	var certErr x509.CertificateInvalidError
	var hostErr x509.HostnameError
	var recErr tls.RecordHeaderError

	if errors.As(err, &certErr) || errors.As(err, &hostErr) || errors.As(err, &recErr) {
		return ErrSSL
	}

	// syscall socket error
	if errors.Is(err, syscall.ECONNREFUSED) {
		return ErrConnRefused
	}

	if errors.Is(err, syscall.ECONNRESET) {
		return ErrConnReset
	}

	if strings.Contains(err.Error(), "redirect") {
		return ErrRedirectLoop
	}

	return ErrConnRefused
}

// status code = OK but page content is empty/error-like
func isSoft404(body []byte) bool {
	lower := strings.ToLower(string(body))
	// TODO: use smarter (ML-based?) approach
	phrases := []string{
		"page not found",
		"404 not found",
		"this page doesn't exist",
		"page has been removed",
		"error 404",
		"content not found",
		"page cannot be found",
	}

	for _, p := range phrases {
		if strings.Contains(lower, p) {
			return true
		}
	}
	return false
}

func (c *Checker) Check(rawURL string) CheckResult {
	start := time.Now()
	res := CheckResult{FinalURL: rawURL}

	req, err := http.NewRequest(http.MethodGet, rawURL, nil)

	if err != nil {
		// malformed URL (unreachable)
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
	// url after redirect
	res.FinalURL = resp.Request.URL.String()

	// read body up to 1 MB
	body, _ := io.ReadAll(io.LimitReader(resp.Body, 1<<20))

	switch {
	case resp.StatusCode >= 500:
		res.ErrorType = ErrServer5xx
	case resp.StatusCode >= 400:
		res.ErrorType = ErrHTTP4xx
	default:
		// 2xx/3xx
		isHTML := strings.Contains(res.ContentType, "text/html")
		if isHTML && isSoft404(body) {
			res.ErrorType = ErrSoft404
		} else {
			res.IsAlive = true
			if isHTML {
				// use content for SEO analysis
				res.Body = body
			}
		}
	}
	return res
}
