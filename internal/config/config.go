// Package config loads runtime configuration from environment variables, with defaults.
package config

type Config struct {
	MySQLDSN       string
	RedisAddr      string
	RabbitURL      string
	HTTPAddr       string
	MaxPages       int // hard cap on total pages per crawl
	MaxDepth       int // hard cap on clicks from the seed (0 = unlimited)
	MaxPerCategory int // soft cap per URL category like /blog (0 = unlimited)
	RatePerMin     int
	WorkerCount    int
	FrontendOrigin string
}

// Load reads the configuration from the environment, falling back to dev-friendly defaults.
func Load() Config {
	return Config{
		MySQLDSN:       env("MYSQL_DSN", "linktrace:linktrace@tcp(localhost:3306)/linktrace?parseTime=true"),
		RedisAddr:      env("REDIS_ADDR", "localhost:6379"),
		RabbitURL:      env("RABBIT_URL", "amqp://guest:guest@localhost:5672/"),
		HTTPAddr:       env("HTTP_ADDR", ":8080"),
		MaxPages:       envInt("MAX_PAGES", 10000),
		MaxDepth:       envInt("MAX_DEPTH", 20),
		MaxPerCategory: envInt("MAX_PER_CATEGORY", 1000),
		RatePerMin:     envInt("RATE_PER_MIN", 1000),
		WorkerCount:    envInt("WORKER_COUNT", 100),
		FrontendOrigin: env("FRONTEND_ORIGIN", "http://localhost:5173"),
	}
}
