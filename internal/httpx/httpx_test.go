package httpx

import (
	"net/netip"
	"testing"
)

func TestBlockedIP(t *testing.T) {
	blocked := []string{
		"127.0.0.1", "10.1.2.3", "172.16.0.9", "192.168.1.1",
		"169.254.169.254", // cloud metadata
		"100.64.0.1", "0.0.0.0", "198.18.0.1",
		"255.255.255.255", "224.0.0.1",
		"::1", "fe80::1", "fd00::1", "::",
		"::ffff:127.0.0.1", // IPv4-mapped loopback
		"64:ff9b::a00:1",   // NAT64 wrapping 10.0.0.1
	}
	for _, s := range blocked {
		if !isBlockedIP(netip.MustParseAddr(s)) {
			t.Errorf("%s should be blocked", s)
		}
	}
	for _, s := range []string{"8.8.8.8", "1.1.1.1", "93.184.216.34", "2606:4700:4700::1111"} {
		if isBlockedIP(netip.MustParseAddr(s)) {
			t.Errorf("%s should be allowed", s)
		}
	}
}
