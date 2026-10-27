// Package auth handles password hashing, session IDs/cookies, and middleware that resolves
// a request's authenticated user.
package auth

import (
	"context"
	"net/http"
)

type ctxKey string

const userIDKey ctxKey = "userID"

// is satisfied by *cache.Cache; defined here to avoid an import cycle.
type sessionLooker interface {
	LookupSession(sid string) (string, error)
}

// attaches the user id to the context if a valid session is present, else anonymous.
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

// rejects anonymous requests with 401. Mount below Optional, which resolves the user.
func Require(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if UserID(r) == "" {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}
		next.ServeHTTP(w, r)
	})
}

// pulls the authenticated user id out of the request context, or "" if anonymous.
func UserID(r *http.Request) string {
	if v, ok := r.Context().Value(userIDKey).(string); ok {
		return v
	}
	return ""
}
