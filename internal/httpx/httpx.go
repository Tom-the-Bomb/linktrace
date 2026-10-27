// Package httpx centralizes the HTTP client construction and the fetch-with-cap pattern shared
// by the site, archive, and checker packages. Every outbound request goes through one guarded
// transport that refuses private and internal addresses.
package httpx

import (
	"context"
	"errors"
	"io"
	"net"
	"net/http"
	"net/netip"
	"syscall"
	"time"
)

// Both identify LinkTrace so site owners can see who's crawling and block it in robots.txt. The
// checker's keeps the "Mozilla/5.0 (compatible; ...)" shape, which fewer hosts reject outright.
const (
	userAgent        = "LinkTraceBot/1.0 (+https://linktrace.tomthebomb.dev)"
	checkerUserAgent = "Mozilla/5.0 (compatible; LinkTraceBot/1.0; +https://linktrace.tomthebomb.dev)"
)

// checkerHeaders accompany checkerUserAgent so content negotiation returns the HTML a visitor
// would get. Accept-Encoding is left unset so Go still auto-decompresses.
var checkerHeaders = map[string]string{
	"Accept":          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
	"Accept-Language": "en-US,en;q=0.9",
}

// SetCheckerHeaders applies the per-page liveness check's identity and Accept headers.
func SetCheckerHeaders(req *http.Request) {
	req.Header.Set("User-Agent", checkerUserAgent)
	for k, v := range checkerHeaders {
		req.Header.Set(k, v)
	}
}

// AllowPrivateTargets disables the guard below for local development; set once at startup.
var AllowPrivateTargets bool

// ErrBlockedTarget is returned when a connection would reach a private address or a non-web port.
var ErrBlockedTarget = errors.New("target is a private address or not a web port")

// ranges netip's helpers don't cover: "this network", CGNAT, IETF protocol assignments,
// benchmarking, reserved/broadcast, IPv4-compatible IPv6, and NAT64 (which can embed a private IPv4)
var extraBlocked = []netip.Prefix{
	netip.MustParsePrefix("0.0.0.0/8"),
	netip.MustParsePrefix("100.64.0.0/10"),
	netip.MustParsePrefix("192.0.0.0/24"),
	netip.MustParsePrefix("198.18.0.0/15"),
	netip.MustParsePrefix("240.0.0.0/4"),
	netip.MustParsePrefix("::/96"),
	netip.MustParsePrefix("64:ff9b::/96"),
	netip.MustParsePrefix("64:ff9b:1::/48"),
}

func isBlockedIP(ip netip.Addr) bool {
	ip = ip.Unmap()
	if ip.IsLoopback() || ip.IsPrivate() || ip.IsLinkLocalUnicast() || ip.IsMulticast() || ip.IsUnspecified() {
		return true
	}
	for _, p := range extraBlocked {
		if p.Contains(ip) {
			return true
		}
	}
	return false
}

// CheckHost resolves host and fails if any address it resolves to is blocked. Used to reject a
// crawl up front with a clear error; the dialer below is what actually enforces the rule.
func CheckHost(ctx context.Context, host string) error {
	if AllowPrivateTargets {
		return nil
	}
	addrs, err := net.DefaultResolver.LookupNetIP(ctx, "ip", host)
	if err != nil {
		return err
	}
	for _, a := range addrs {
		if isBlockedIP(a) {
			return ErrBlockedTarget
		}
	}
	return nil
}

// the check runs on the address actually being dialled, after DNS, so redirects to internal
// hosts and DNS rebinding are caught too. Only web ports are allowed, so reports can't be used
// to probe other services on a public host.
var dialer = &net.Dialer{
	Timeout:   10 * time.Second,
	KeepAlive: 30 * time.Second,
	Control: func(_, address string, _ syscall.RawConn) error {
		if AllowPrivateTargets {
			return nil
		}
		host, port, err := net.SplitHostPort(address)
		if err != nil {
			return err
		}
		if port != "80" && port != "443" {
			return ErrBlockedTarget
		}
		ip, err := netip.ParseAddr(host)
		if err != nil {
			return err
		}
		if isBlockedIP(ip) {
			return ErrBlockedTarget
		}
		return nil
	},
}

// transport is shared by every client: the default transport's settings with the guarded dialer.
// Proxy is nil on purpose: an environment proxy would make the dialer see the proxy's address
// instead of the target's.
var transport = func() *http.Transport {
	t := http.DefaultTransport.(*http.Transport).Clone()
	t.Proxy = nil
	t.DialContext = dialer.DialContext
	t.MaxIdleConns = 200
	t.MaxIdleConnsPerHost = 10
	return t
}()

// returns a client with the given timeout. When followRedirects is false it surfaces
// the 3xx response (with its Location) instead of following it.
func NewClient(timeout time.Duration, followRedirects bool) *http.Client {
	c := &http.Client{Timeout: timeout, Transport: transport}
	if !followRedirects {
		c.CheckRedirect = func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }
	}
	return c
}

// GETs rawURL with the bot UA and returns the body (capped at limit bytes) and status.
func Fetch(ctx context.Context, client *http.Client, rawURL string, limit int64) ([]byte, int, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, rawURL, nil)
	if err != nil {
		return nil, 0, err
	}
	req.Header.Set("User-Agent", userAgent)
	resp, err := client.Do(req)
	if err != nil {
		return nil, 0, err
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(io.LimitReader(resp.Body, limit))
	return body, resp.StatusCode, nil
}
