package auth

import "golang.org/x/crypto/bcrypt"

// returns a bcrypt hash safe to persist. bcrypt salts internally.
func HashPassword(plain string) (string, error) {
	bytes, err := bcrypt.GenerateFromPassword([]byte(plain), bcrypt.DefaultCost)
	return string(bytes), err
}

// NoUserHash is checked when a login names an account that doesn't exist, so that attempt takes
// as long as a wrong password and the timing doesn't reveal which usernames are registered.
var NoUserHash, _ = HashPassword("no such user")

// reports whether plain matches a stored bcrypt hash (constant-time).
func CheckPassword(hash, plain string) bool {
	return bcrypt.CompareHashAndPassword([]byte(hash), []byte(plain)) == nil
}
