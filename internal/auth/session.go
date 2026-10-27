package auth

import (
	"crypto/rand"
	"encoding/hex"
	"net/http"
	"time"
)

const CookieName = "sid"

// SessionTTL is the session lifetime: both the cookie's MaxAge and the Redis session's TTL.
const SessionTTL = 7 * 24 * time.Hour

// secureCookie is the Secure attribute on every cookie we set: off for local HTTP, on behind HTTPS.
var secureCookie bool

// SetCookieSecure sets whether cookies carry the Secure attribute. Call once at startup.
func SetCookieSecure(secure bool) { secureCookie = secure }

// NewToken returns 32 bytes from crypto/rand as hex, for session ids and owner tokens.
func NewToken() (string, error) {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return hex.EncodeToString(b), nil
}

// SetSessionCookie writes the session cookie.
func SetSessionCookie(w http.ResponseWriter, sid string) {
	setCookie(w, CookieName, sid, int(SessionTTL.Seconds()))
}

// ClearSessionCookie expires the session cookie (logout).
func ClearSessionCookie(w http.ResponseWriter) {
	setCookie(w, CookieName, "", -1)
}

// HttpOnly keeps the cookie from scripts (XSS); SameSite=Lax and Secure keep it first-party and
// HTTPS-only. maxAge -1 deletes it.
func setCookie(w http.ResponseWriter, name, value string, maxAge int) {
	http.SetCookie(w, &http.Cookie{
		Name:     name,
		Value:    value,
		Path:     "/",
		HttpOnly: true,
		SameSite: http.SameSiteLaxMode,
		Secure:   secureCookie,
		MaxAge:   maxAge,
	})
}
