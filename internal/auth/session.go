package auth

import (
	"crypto/rand"
	"net/http"
	"time"
)

const CookieName = "sid"

const SessionTTL = 7 * 24 * time.Hour

var SecureCookie bool

func NewToken() string {
	return rand.Text()
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
		Secure:   SecureCookie,
		MaxAge:   maxAge,
	})
}
