package config

import (
	"os"
	"strconv"
)

type Config struct {
	MySQLDSN       string
	RedisAddr      string
	RabbitURL      string
	HTTPAddr       string
	MaxPages       int
	RatePerMin     int
	WorkerCount    int
	FrontendOrigin string
}

func env(key, deflt string) string {
	if val := os.Getenv(key); val != "" {
		return val
	}
	return deflt
}

func envInt(key string, deflt int) int {
	if val := os.Getenv(key); val != "" {
		if i, err := strconv.Atoi(val); err == nil {
			return i
		}
	}
	return deflt
}

func Load() Config {
	return Config{
		MySQLDSN:       env("MYSQL_DSN", "linktrace:linktrace@tcp(localhost:3306)/linktrace?parseTime=true"),
		RedisAddr:      env("REDIS_ADDR", "localhost:6379"),
		RabbitURL:      env("RABBIT_URL", "amqp://guest:guest@localhost:5672/"),
		HTTPAddr:       env("HTTP_ADDR", ":8080"),
		MaxPages:       envInt("MAX_PAGES", 1000),
		RatePerMin:     envInt("RATE_PER_MIN", 50),
		WorkerCount:    envInt("WORKER_COUNT", 8),
		FrontendOrigin: env("FRONTEND_ORIGIN", "http://localhost:5173"),
	}
}
