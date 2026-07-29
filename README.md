<div align="center">
  <img src="web/public/icon-round.png" alt="LinkTrace" width="88" />

# LinkTrace

**Healthy links. Higher rankings.**

</div>

An open-source distributed site auditor. Give it a domain, the site will crawl outward from the homepage, audit the page content,
repeat for every internal link in the page. It finds:

- what links are broken, and the reason: DNS, timeout, SSL, soft 404, 4xx/5xx, redirect loop etc.
- report an SEO score and list of issues for every page that returns HTML
- all of these details can be accessed via an interactive table/graph

## How it works

- `cmd/api`: HTTP server that creates jobs and serves reports (orchestrator).
- `cmd/worker`: the actual crawler that fetches, classifies, extracts links, and audits the page. Each `cmd/worker` process manages a pool of goroutines, so we can easily horizontally scale!

- RabbitMQ manages delivering jobs out to the workers and getting results back.
- Redis stores the status of running jobs such as progress counters, a 'seen' set, self-imposed per-domain ratelimits, and sessions.
- MySQL stores jobs, pages, results, the site graph and users.
- Caddy serves `web/`, proxies `/api`, and does HTTPS.

Frontend: `/jobs/<id>` receives live updates (polling) until the crawl finishes.

## API

The base path is `/api` in production, everything is JSON

```
POST   /check                  start a crawl
GET    /check/{id}             status + live progress ({id} is a job UUID)
GET    /check/{id}/results     per-page rows
GET    /check/{id}/report      aggregated report
GET    /check/{id}/graph       nodes + edges
GET    /check/{id}/seo?url=    one page's SEO audit
POST   /check/{id}/cancel
DELETE /check/{id}             job + all its data

POST   /auth/register
POST   /auth/login
POST   /auth/logout
GET    /auth/me                null if anonymous
DELETE /auth/account           account + all jobs

GET    /history                past crawls (auth)
```

## Localhost

Docker, Go 1.26+, Node 20+ are needed as MySQL, Redis and RabbitMQ all run in containers.

```bash
cp .env.example .env        # fill in the empty passwords
docker compose up -d        # spin up docker

go run ./cmd/api            # :8080
go run ./cmd/worker         # separate terminal

cd web && npm install && npm run dev   # :5173
```

## Deploying

For Caddy to get a certificate, must point A record to server

```bash
ssh root@YOUR_SERVER_IP
git clone https://github.com/Tom-the-Bomb/linktrace.git && cd linktrace
cp .env.production.example .env.production   # DOMAIN, ACME_EMAIL, passwords
docker compose -f docker-compose.prod.yml --env-file .env.production up -d --build
```

Redeploy using the same command, you can append `api`, `worker` or `caddy` to rebuild just one.
There is a GH workflow (`.github/workflows/deploy.yml`, needs the `DROPLET_*` secrets) auto-deploy using SSH on push to `main`.

## Config

Worker limits: `WORKER_COUNT` (100), `MAX_PAGES` (10000), `MAX_DEPTH` (20), `MAX_PER_CATEGORY` (1000), `RATE_PER_MIN` (1000).

`SHARD_COUNT` (5) is the # of work-queue lanes so that each crawl (no matter how large) is limited to 1 lane so it doesn't block other crawls. (i.e. takes up 1/SHARD_COUNT fraction of the fetch goroutines) Set it to the same value on the api and the worker.

Connections: `MYSQL_DSN`, `REDIS_ADDR`, `RABBIT_URL`, `HTTP_ADDR`, `FRONTEND_ORIGIN` (comma-separated), `COOKIE_SECURE`.
Default values point at the dev containers. Production values should go in `.env.production`.
