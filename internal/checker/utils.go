package checker

import (
	"bytes"
	"crypto/tls"
	"errors"
	"net"
	"net/http"
	"slices"
	"strconv"
	"strings"
	"syscall"
	"time"

	"golang.org/x/net/html"

	"github.com/Tom-the-Bomb/linktrace/internal/htmlx"
)

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

func classifyNetworkError(err error) string {
	var dnsErr *net.DNSError
	if errors.As(err, &dnsErr) {
		return ErrDNS
	}

	var netErr net.Error
	if errors.As(err, &netErr) && netErr.Timeout() {
		return ErrTimeout
	}

	var verifyErr *tls.CertificateVerificationError
	var recErr tls.RecordHeaderError
	if errors.As(err, &verifyErr) || errors.As(err, &recErr) {
		return ErrSSL
	}

	if errors.Is(err, syscall.ECONNREFUSED) {
		return ErrConnRefused
	}
	if errors.Is(err, syscall.ECONNRESET) {
		return ErrConnReset
	}
	return ErrUnknown
}

// suffices since challenge pages carry their markers near the top.
const blockScanLimit = 8 << 10

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

// is kept narrow: broader phrases false-positive on real pages.
var soft404Phrases = []string{
	"page not found",
	"404 not found",
	"this page doesn't exist",
	"page has been removed",
	"error 404",
	"content not found",
	"page cannot be found",
}

// scans only visible text: SPA shells inline "page not found" copy in <script>,
// which would soft-404 the whole site.
func isSoft404(body []byte) bool {
	doc, err := html.Parse(bytes.NewReader(body))
	if err != nil {
		return false
	}
	var text string
	htmlx.Walk(doc, func(n *html.Node) bool {
		if n.Type == html.ElementNode && n.Data == "body" {
			text = strings.ToLower(htmlx.TextContent(n))
			return false
		}
		return true
	})
	return slices.ContainsFunc(soft404Phrases, func(p string) bool { return strings.Contains(text, p) })
}
