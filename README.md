<div align="center">
  <img src="web/public/icon-round.png" alt="LinkTrace" width="88" />

# LinkTrace

**Healthy links. Higher rankings.**

</div>

Open-source distributed site auditor. Point it at a domain. It crawls outward from the homepage, following every internal link, and reports:

- what's broken, and why (DNS, timeout, SSL, soft 404, 4xx/5xx, redirect loop)
- an SEO score and issue list for every page that isn't
- the whole site as an interactive graph

## How it works

`cmd/api` is the HTTP server. It creates jobs and serves reports, and never crawls anything itself. `cmd/worker` is the crawler: fetch, classify, pull out links, audit, save. Each worker process runs a pool of goroutines, so to go faster you add replicas.

The rest is off the shelf. RabbitMQ carries work out to the workers and results back. Redis holds whatever changes constantly: progress counters, the seen-set, per-domain rate limits, sessions. MySQL holds jobs, pages, audits, the link graph and users. Caddy serves `web/`, proxies `/api`, and does HTTPS.

## The report

`/jobs/<id>` fills in live and freezes once the crawl finishes. Alongside progress and the graph, it has per-category rollups, a row per page with its SEO drilldown, site-level checks (robots, sitemap, HTTPS, cert), crawl stats, and any sitemap URLs the crawl never reached. Logged-in users keep their history.

## API

Base path `/api` in prod, JSON throughout, `{id}` is a job UUID.

```
POST   /check                  start a crawl
GET    /check/{id}             status + live progress
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

## Running it locally

Docker, Go 1.26+, Node 20+. Only MySQL, Redis and RabbitMQ run in containers.

```bash
cp .env.example .env        # fill in the empty passwords
docker compose up -d

go run ./cmd/api            # :8080
go run ./cmd/worker         # separate terminal

cd web && npm install && npm run dev   # :5173
```

## Deploying

One compose file, and only Caddy is exposed. Point your domain's A record at the server first, then:

```bash
ssh root@YOUR_SERVER_IP
git clone https://github.com/Tom-the-Bomb/linktrace.git && cd linktrace
cp .env.production.example .env.production   # DOMAIN, ACME_EMAIL, passwords
docker compose -f docker-compose.prod.yml --env-file .env.production up -d --build
```

The same command redeploys; append `api`, `worker` or `caddy` to rebuild just one. Pushes to `main` run it for you over SSH (`.github/workflows/deploy.yml`, needs the `DROPLET_*` secrets).

## Config

Worker limits: `WORKER_COUNT` (100), `MAX_PAGES` (10000), `MAX_DEPTH` (20), `MAX_PER_CATEGORY` (1000), `RATE_PER_MIN` (1000).

Connections: `MYSQL_DSN`, `REDIS_ADDR`, `RABBIT_URL`, `HTTP_ADDR`, `FRONTEND_ORIGIN`, `COOKIE_SECURE`. Defaults point at the dev containers; prod values go in `.env.production`.
