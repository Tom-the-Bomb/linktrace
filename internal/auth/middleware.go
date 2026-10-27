package auth

import (
	"context"
	"net/http"
)

type ctxKey string

const userIDKey ctxKey = "userID"

// avoids an import cycle with cache.
type sessionLooker interface {
	LookupSession(sid string) (string, error)
}

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

// must be mounted below Optional, which resolves the user.
func Require(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if UserID(r) == "" {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func UserID(r *http.Request) string {
	if v, ok := r.Context().Value(userIDKey).(string); ok {
		return v
	}
	return ""
}
