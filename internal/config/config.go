package config

type Config struct {
	MySQLDSN            string
	RedisAddr           string
	RabbitURL           string
	HTTPAddr            string
	MaxPages            int
	AnonMaxPages        int
	MaxDepth            int // 0 = unlimited
	MaxPerCategory      int // 0 = unlimited
	RatePerMin          int // per target domain, shared by every crawl
	WorkerCount         int
	ShardCount          int
	FrontendOrigin      string
	CookieSecure        bool
	AllowPrivateTargets bool // disables the SSRF guard; keep false in prod
}

func Load() Config {
	loadDotEnv(".env")
	return Config{
		MySQLDSN:            env("MYSQL_DSN", "linktrace:linktrace@tcp(localhost:3306)/linktrace?parseTime=true"),
		RedisAddr:           env("REDIS_ADDR", "localhost:6379"),
		RabbitURL:           env("RABBIT_URL", "amqp://guest:guest@localhost:5672/"),
		HTTPAddr:            env("HTTP_ADDR", ":8080"),
		MaxPages:            envInt("MAX_PAGES", 10000),
		AnonMaxPages:        envInt("ANON_MAX_PAGES", 500),
		MaxDepth:            envInt("MAX_DEPTH", 20),
		MaxPerCategory:      envInt("MAX_PER_CATEGORY", 1000),
		RatePerMin:          envInt("RATE_PER_MIN", 300),
		WorkerCount:         envInt("WORKER_COUNT", 100),
		ShardCount:          max(1, envInt("SHARD_COUNT", 5)),
		FrontendOrigin:      env("FRONTEND_ORIGIN", "http://localhost:5173"),
		CookieSecure:        envBool("COOKIE_SECURE", false),
		AllowPrivateTargets: envBool("ALLOW_PRIVATE_TARGETS", false),
	}
}
