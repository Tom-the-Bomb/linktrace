package auth

import (
	"crypto/rand"
	"encoding/hex"
	"net/http"
	"time"
)

const CookieName = "sid"

// SessionTTL is the single source of truth for session lifetime; the cookie MaxAge and the
// Redis session TTL (cache.sessionTTL) both derive from it.
const SessionTTL = 7 * 24 * time.Hour

// secureCookie sets the cookie Secure attribute (off for local HTTP dev, on behind HTTPS).
// main wires it from config via SetCookieSecure before serving.
var secureCookie bool

// SetCookieSecure sets whether session cookies carry the Secure attribute. Call once at startup.
func SetCookieSecure(secure bool) { secureCookie = secure }

// returns 32 random bytes as hex: an opaque, unguessable token. Uses crypto/rand,
// since math/rand is predictable and unsafe for security tokens.
func NewSessionID() (string, error) {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return hex.EncodeToString(b), nil
}

// writes the session cookie. HttpOnly so JS can't read it (XSS defence);
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

// expires the cookie immediately (logout). Secure must match the
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
