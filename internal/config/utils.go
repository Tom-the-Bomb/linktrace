package config

import (
	"os"
	"strconv"
)

// env returns the value of key, or deflt if unset/empty.
func env(key, deflt string) string {
	if val := os.Getenv(key); val != "" {
		return val
	}
	return deflt
}

// envInt returns key parsed as an int, or deflt if unset/empty/unparseable.
func envInt(key string, deflt int) int {
	if val := os.Getenv(key); val != "" {
		if i, err := strconv.Atoi(val); err == nil {
			return i
		}
	}
	return deflt
}
