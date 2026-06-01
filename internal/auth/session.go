package auth

import (
	"crypto/rand"
	"encoding/hex"
	"net/http"
	"time"

	"github.com/Tom-the-Bomb/linktrace/internal/config"
)

const CookieName = "sid"

// SessionTTL is the single source of truth for session lifetime; the cookie MaxAge and the
// Redis session TTL (cache.sessionTTL) both derive from it.
const SessionTTL = 7 * 24 * time.Hour

// secureCookie sets the cookie Secure attribute (off for local HTTP dev, on behind HTTPS).
var secureCookie = config.Load().CookieSecure

// NewSessionID returns 32 random bytes as hex: an opaque, unguessable token. Uses crypto/rand,
// since math/rand is predictable and unsafe for security tokens.
func NewSessionID() (string, error) {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return hex.EncodeToString(b), nil
}

// SetSessionCookie writes the session cookie. HttpOnly so JS can't read it (XSS defence);
// SameSite=Lax + Secure (in prod) keeps it first-party and HTTPS-only.
func SetSessionCookie(w http.ResponseWriter, sid string) {
	http.SetCookie(w, &http.Cookie{
		Name:     CookieName,
		Value:    sid,
		Path:     "/",
		HttpOnly: true,
		SameSite: http.SameSiteLaxMode,
		Secure:   secureCookie,
		MaxAge:   int(SessionTTL.Seconds()),
	})
}

// ClearSessionCookie expires the cookie immediately (logout). Secure must match the
// attribute used when setting, or the browser won't overwrite the existing cookie.
func ClearSessionCookie(w http.ResponseWriter) {
	http.SetCookie(w, &http.Cookie{
		Name:     CookieName,
		Value:    "",
		Path:     "/",
		HttpOnly: true,
		SameSite: http.SameSiteLaxMode,
		Secure:   secureCookie,
		MaxAge:   -1,
	})
}
