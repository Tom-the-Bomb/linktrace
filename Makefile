.PHONY: dev

dev:
	docker compose up -d --wait
	npx -y concurrently@10 -n api,worker,web -c blue,magenta,green \
		"go run ./cmd/api" "go run ./cmd/worker" "npm --prefix web run dev"
