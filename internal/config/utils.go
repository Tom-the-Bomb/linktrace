package config

import (
	"os"
	"strconv"
)

// returns the value of key, or deflt if unset/empty.
func env(key, deflt string) string {
	if val := os.Getenv(key); val != "" {
		return val
	}
	return deflt
}

// returns key parsed as an int, or deflt if unset/empty/unparseable.
func envInt(key string, deflt int) int {
	if val := os.Getenv(key); val != "" {
		if i, err := strconv.Atoi(val); err == nil {
			return i
		}
	}
	return deflt
}

// parses key as a bool, or returns deflt if unset/unparseable.
func envBool(key string, deflt bool) bool {
	if val := os.Getenv(key); val != "" {
		if b, err := strconv.ParseBool(val); err == nil {
			return b
		}
	}
	return deflt
}
