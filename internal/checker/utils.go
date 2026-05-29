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
)

// classifyNetworkError maps a transport-level error to one of the rot ErrType constants.
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

	return ErrConnRefused
}

// soft404Phrases is the phrase list we match against visible body text.
// Kept narrow on purpose — broader phrases produce false positives on real pages
// (e.g. "page not found" copy inside a help center article).
var soft404Phrases = []string{
	"page not found",
	"404 not found",
	"this page doesn't exist",
	"page has been removed",
	"error 404",
	"content not found",
	"page cannot be found",
}

// isSoft404 reports whether a 2xx page is actually an error page (status OK, body says 404).
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

// visibleBodyText walks the parsed HTML and returns a lowercased concatenation of
// all text nodes inside <body>, skipping non-rendered elements (script, style,
// template, noscript). Returns ok=false if the document can't be parsed.
func visibleBodyText(body []byte) (string, bool) {
	doc, err := html.Parse(bytes.NewReader(body))
	if err != nil {
		return "", false
	}
	var buf strings.Builder
	var inBody bool
	var walk func(*html.Node)
	walk = func(n *html.Node) {
		if n.Type == html.ElementNode {
			switch n.Data {
			case "script", "style", "template", "noscript":
				return // entire subtree is non-visible
			case "body":
				inBody = true
				defer func() { inBody = false }()
			}
		}
		if inBody && n.Type == html.TextNode {
			buf.WriteString(strings.ToLower(n.Data))
			buf.WriteByte(' ')
		}
		for c := n.FirstChild; c != nil; c = c.NextSibling {
			walk(c)
		}
	}
	walk(doc)
	return buf.String(), true
}
