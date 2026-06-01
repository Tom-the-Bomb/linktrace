package checker

import (
	"bytes"
	"crypto/tls"
	"crypto/x509"
	"errors"
	"net"
	"strings"
	"syscall"

	"golang.org/x/net/html"

	"github.com/Tom-the-Bomb/linktrace/internal/htmlx"
)

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
	if strings.Contains(err.Error(), "redirect") {
		return ErrRedirectLoop
	}
	return ErrUnknown
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
			switch n.Data {
			case "script", "style", "template", "noscript":
				return false // entire subtree is non-visible
			case "body":
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
