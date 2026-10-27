package auth

import "golang.org/x/crypto/bcrypt"

func HashPassword(plain string) (string, error) {
	bytes, err := bcrypt.GenerateFromPassword([]byte(plain), bcrypt.DefaultCost)
	return string(bytes), err
}

// NoUserHash is checked for unknown usernames so timing doesn't reveal which ones exist.
var NoUserHash, _ = HashPassword("no such user")

func CheckPassword(hash, plain string) bool {
	return bcrypt.CompareHashAndPassword([]byte(hash), []byte(plain)) == nil
}
