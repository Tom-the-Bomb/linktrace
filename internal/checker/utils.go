package checker

import (
	"bytes"
	"crypto/tls"
	"crypto/x509"
	"errors"
	"net"
	"net/http"
	"strconv"
	"strings"
	"syscall"
	"time"

	"golang.org/x/net/html"

	"github.com/Tom-the-Bomb/linktrace/internal/htmlx"
)

// parseRetryAfter reads a Retry-After header (delta-seconds or HTTP-date) as a duration.
// Returns 0 when absent, malformed, or already in the past.
func parseRetryAfter(v string) time.Duration {
	v = strings.TrimSpace(v)
	if secs, err := strconv.Atoi(v); err == nil && secs > 0 {
		return time.Duration(secs) * time.Second
	}
	if t, err := http.ParseTime(v); err == nil {
		if d := time.Until(t); d > 0 {
			return d
		}
	}
	return 0
}

// maps a transport-level error to one of the rot ErrType constants.
func classifyNetworkError(err error) string {
	var dnsErr *net.DNSError
	if errors.As(err, &dnsErr) {
		return ErrDNS
	}

	var netErr net.Error
	if errors.As(err, &netErr) && netErr.Timeout() {
		return ErrTimeout
	}

	var certErr x509.CertificateInvalidError
	var hostErr x509.HostnameError
	var recErr tls.RecordHeaderError
	if errors.As(err, &certErr) || errors.As(err, &hostErr) || errors.As(err, &recErr) {
		return ErrSSL
	}

	if errors.Is(err, syscall.ECONNREFUSED) {
		return ErrConnRefused
	}
	if errors.Is(err, syscall.ECONNRESET) {
		return ErrConnReset
	}
	// redirect loops never reach here: Check's CheckRedirect returns ErrUseLastResponse (not an
	// error) and flags them from the surfaced response instead.
	return ErrUnknown
}

// blockScanLimit caps the body scan for block markers — challenge pages carry them near the
// top, so there's no need to lowercase a large body.
const blockScanLimit = 8 << 10

// blockMarkers are phrases anti-bot interstitials (Cloudflare, Akamai, captchas) put in the
// body of a challenge page served with a 403/503.
var blockMarkers = []string{
	"just a moment",
	"attention required",
	"enable javascript and cookies",
	"verify you are human",
	"verifying you are human",
	"are you a robot",
	"captcha",
	"access denied",
	"request blocked",
}

// reports whether a non-2xx response is an anti-bot block rather than ordinary rot: any 429,
// or a 403/503 carrying a Cloudflare fingerprint or a challenge-page marker in the body.
func looksBlocked(status int, header http.Header, body []byte) bool {
	if status == http.StatusTooManyRequests {
		return true
	}
	if status != http.StatusForbidden && status != http.StatusServiceUnavailable {
		return false
	}
	if header.Get("cf-ray") != "" ||
		strings.Contains(strings.ToLower(header.Get("Server")), "cloudflare") {
		return true
	}
	if len(body) > blockScanLimit {
		body = body[:blockScanLimit]
	}
	low := strings.ToLower(string(body))
	for _, m := range blockMarkers {
		if strings.Contains(low, m) {
			return true
		}
	}
	return false
}

// soft404Phrases match against visible body text. Kept narrow on purpose; broader phrases
// false-positive on real pages (e.g. "page not found" copy in a help-center article).
var soft404Phrases = []string{
	"page not found",
	"404 not found",
	"this page doesn't exist",
	"page has been removed",
	"error 404",
	"content not found",
	"page cannot be found",
}

// reports whether a 2xx page is actually an error page (status OK, body says 404).
// Only visible <body> text is scanned: SPA shells inline error copy like "page not found"
// inside <script> tags, so matching raw HTML would soft-404 the whole site.
func isSoft404(body []byte) bool {
	text, ok := visibleBodyText(body)
	if !ok {
		// parse failed: fall back to a raw-body scan rather than miss obvious 404s
		text = strings.ToLower(string(body))
	}
	for _, p := range soft404Phrases {
		if strings.Contains(text, p) {
			return true
		}
	}
	return false
}

// returns a lowercased concatenation of the text nodes inside <body>, skipping
// non-rendered subtrees (script/style/template/noscript). ok=false if the doc can't be parsed.
func visibleBodyText(body []byte) (string, bool) {
	doc, err := html.Parse(bytes.NewReader(body))
	if err != nil {
		return "", false
	}
	var buf strings.Builder
	var inBody bool
	htmlx.Walk(doc, func(n *html.Node) bool {
		if n.Type == html.ElementNode {
			if htmlx.IsNonRendered(n.Data) {
				return false // entire subtree is non-visible
			}
			if n.Data == "body" {
				inBody = true
			}
		}
		if inBody && n.Type == html.TextNode {
			buf.WriteString(strings.ToLower(n.Data))
			buf.WriteByte(' ')
		}
		return true
	})
	return buf.String(), true
}
