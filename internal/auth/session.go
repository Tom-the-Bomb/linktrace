package auth

import (
	"crypto/rand"
	"encoding/hex"
	"net/http"
	"os"
)

const CookieName = "sid"

// secureCookie controls the cookie Secure attribute: off by default so local HTTP dev works,
// enabled by COOKIE_SECURE=true in HTTPS deployments.
var secureCookie = os.Getenv("COOKIE_SECURE") == "true"

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
		MaxAge:   7 * 24 * 60 * 60,
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
