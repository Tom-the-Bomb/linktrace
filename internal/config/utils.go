package config

import (
	"bufio"
	"cmp"
	"log"
	"os"
	"strconv"
	"strings"
)

// skips keys already set, so real env and docker-compose win over .env.
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
		if len(val) >= 2 && (val[0] == '"' || val[0] == '\'') && val[len(val)-1] == val[0] {
			val = val[1 : len(val)-1]
		}
		if _, set := os.LookupEnv(key); !set {
			_ = os.Setenv(key, val)
		}
	}

	if err := sc.Err(); err != nil {
		log.Printf("[config] %s: %v", path, err)
	}
}

func env(key, deflt string) string {
	return cmp.Or(os.Getenv(key), deflt)
}

func envInt(key string, deflt int) int {
	if val := os.Getenv(key); val != "" {
		if i, err := strconv.Atoi(val); err == nil {
			return i
		}
	}
	return deflt
}

func envBool(key string, deflt bool) bool {
	if val := os.Getenv(key); val != "" {
		if b, err := strconv.ParseBool(val); err == nil {
			return b
		}
	}
	return deflt
}
