package httpx

import (
	"context"
	"errors"
	"io"
	"net"
	"net/http"
	"net/netip"
	"slices"
	"syscall"
	"time"
)

// The checker's UA keeps the "Mozilla/5.0 (compatible; ...)" shape, which fewer hosts reject
// outright.
const (
	userAgent        = "LinkTraceBot/1.0 (+https://linktrace.tomthebomb.dev)"
	checkerUserAgent = "Mozilla/5.0 (compatible; LinkTraceBot/1.0; +https://linktrace.tomthebomb.dev)"
)

// leaves Accept-Encoding unset so Go still auto-decompresses.
func SetCheckerHeaders(req *http.Request) {
	req.Header.Set("User-Agent", checkerUserAgent)
	req.Header.Set("Accept", "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8")
	req.Header.Set("Accept-Language", "en-US,en;q=0.9")
}

var AllowPrivateTargets bool

var ErrBlockedTarget = errors.New("target is a private address or not a web port")

// covers ranges netip's helpers miss; NAT64 can embed a private IPv4.
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

// only gives a clear error up front; the dialer is what enforces the rule.
func CheckHost(ctx context.Context, host string) error {
	if AllowPrivateTargets {
		return nil
	}
	addrs, err := net.DefaultResolver.LookupNetIP(ctx, "ip", host)
	if err != nil {
		return err
	}
	if slices.ContainsFunc(addrs, isBlockedIP) {
		return ErrBlockedTarget
	}
	return nil
}

// checks the address actually dialled, after DNS, so redirects to internal hosts and
// DNS rebinding are caught too. Web ports only, so reports can't probe other services.
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

func NewClient(timeout time.Duration, followRedirects bool) *http.Client {
	c := &http.Client{Timeout: timeout, Transport: transport}
	if !followRedirects {
		c.CheckRedirect = func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }
	}
	return c
}

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
