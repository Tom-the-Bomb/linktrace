package auth

import (
	"crypto/sha256"
	"crypto/subtle"
	"encoding/hex"
	"net/http"
	"time"
)

// ownerCookieName holds a random per-browser token that proves who started an anonymous crawl.
// Only its sha256 is stored on the job, so a database leak can't be replayed as the cookie.
const ownerCookieName = "lt_owner"

const ownerTTL = 365 * 24 * time.Hour

// OwnerHash returns the hash a job stores for this browser's anonymous owner token, issuing a
// token first if the browser has none.
func OwnerHash(w http.ResponseWriter, r *http.Request) (string, error) {
	if c, err := r.Cookie(ownerCookieName); err == nil && c.Value != "" {
		return hashToken(c.Value), nil
	}
	token, err := NewToken()
	if err != nil {
		return "", err
	}
	setCookie(w, ownerCookieName, token, int(ownerTTL.Seconds()))
	return hashToken(token), nil
}

// OwnsAnonymous reports whether the request carries the owner cookie whose hash is wantHash.
func OwnsAnonymous(r *http.Request, wantHash string) bool {
	if wantHash == "" {
		return false
	}
	c, err := r.Cookie(ownerCookieName)
	if err != nil || c.Value == "" {
		return false
	}
	return subtle.ConstantTimeCompare([]byte(hashToken(c.Value)), []byte(wantHash)) == 1
}

func hashToken(token string) string {
	sum := sha256.Sum256([]byte(token))
	return hex.EncodeToString(sum[:])
}
