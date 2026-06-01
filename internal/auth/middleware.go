// Package auth handles password hashing, session IDs/cookies, and middleware that resolves
// a request's authenticated user.
package auth

import (
	"context"
	"net/http"
)

type ctxKey string

const userIDKey ctxKey = "userID"

// sessionLooker is satisfied by *cache.Cache; defined here to avoid an import cycle.
type sessionLooker interface {
	LookupSession(sid string) (string, error)
}

// Optional attaches the user id to the context if a valid session is present, else anonymous.
func Optional(sessions sessionLooker) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if cookie, err := r.Cookie(CookieName); err == nil {
				if userID, _ := sessions.LookupSession(cookie.Value); userID != "" {
					r = r.WithContext(context.WithValue(r.Context(), userIDKey, userID))
				}
			}
			next.ServeHTTP(w, r)
		})
	}
}

// Require rejects the request with 401 unless a valid session is present.
func Require(sessions sessionLooker) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			cookie, err := r.Cookie(CookieName)
			if err != nil {
				http.Error(w, "unauthorized", http.StatusUnauthorized)
				return
			}
			userID, _ := sessions.LookupSession(cookie.Value)
			if userID == "" {
				http.Error(w, "unauthorized", http.StatusUnauthorized)
				return
			}
			r = r.WithContext(context.WithValue(r.Context(), userIDKey, userID))
			next.ServeHTTP(w, r)
		})
	}
}

// UserID pulls the authenticated user id out of the request context, or "" if anonymous.
func UserID(r *http.Request) string {
	if v, ok := r.Context().Value(userIDKey).(string); ok {
		return v
	}
	return ""
}
