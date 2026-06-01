package auth

import "golang.org/x/crypto/bcrypt"

// returns a bcrypt hash safe to persist. bcrypt salts internally.
func HashPassword(plain string) (string, error) {
	bytes, err := bcrypt.GenerateFromPassword([]byte(plain), bcrypt.DefaultCost)
	return string(bytes), err
}

// reports whether plain matches a stored bcrypt hash (constant-time).
func CheckPassword(hash, plain string) bool {
	return bcrypt.CompareHashAndPassword([]byte(hash), []byte(plain)) == nil
}
