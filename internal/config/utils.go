package config

import (
	"bufio"
	"os"
	"strconv"
	"strings"
)

// loadDotEnv best-effort loads KEY=VALUE lines from a .env file in the working directory into
// the process environment, skipping any key already set (so explicit env and docker-compose
// still win). No-op when the file is absent — prod passes env directly; dev keeps it in .env.
func loadDotEnv(path string) {
	f, err := os.Open(path)
	if err != nil {
		return
	}
	defer f.Close()

	sc := bufio.NewScanner(f)
	for sc.Scan() {
		line := strings.TrimSpace(sc.Text())
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		key, val, ok := strings.Cut(line, "=")
		if !ok {
			continue
		}
		key, val = strings.TrimSpace(key), strings.TrimSpace(val)
		// strip matching surrounding quotes, if any
		if len(val) >= 2 && (val[0] == '"' || val[0] == '\'') && val[len(val)-1] == val[0] {
			val = val[1 : len(val)-1]
		}
		if _, set := os.LookupEnv(key); !set {
			_ = os.Setenv(key, val)
		}
	}
}

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
