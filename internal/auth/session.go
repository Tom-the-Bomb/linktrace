package auth

import (
	"crypto/rand"
	"encoding/hex"
	"net/http"
	"time"
)

const CookieName = "sid"

const SessionTTL = 7 * 24 * time.Hour

var secureCookie bool

func SetCookieSecure(secure bool) { secureCookie = secure }

func NewToken() (string, error) {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return hex.EncodeToString(b), nil
}

func SetSessionCookie(w http.ResponseWriter, sid string) {
	setCookie(w, CookieName, sid, int(SessionTTL.Seconds()))
}

func ClearSessionCookie(w http.ResponseWriter) {
	setCookie(w, CookieName, "", -1)
}

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
