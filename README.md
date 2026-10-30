<div align="center">
  <img src="web/public/icon-round.png" alt="LinkTrace" width="88" />

# LinkTrace

**Healthy links. Higher rankings.**

</div>

An open-source distributed site auditor. Give it a domain and it crawls outward from the homepage, following every internal
link and auditing each page. It reports:

- broken links and why they broke: DNS, timeout, SSL, soft 404, 4xx/5xx, redirect loop and so on
- an SEO score and list of issues for every HTML page
- all of it in an interactive table and graph

## How it works

- `cmd/api`: HTTP server that creates jobs and serves reports (orchestrator).
- `cmd/worker`: the crawler, which fetches, classifies and audits each page and extracts its links. Each process runs a pool of goroutines; scale out by running more processes.

- RabbitMQ delivers pages to the workers and carries results back.
- Redis holds live crawl state (progress counters, the seen set, per-domain rate limits) and sessions.
- MySQL stores jobs, pages, results, the site graph and users.
- Caddy serves `web/`, proxies `/api`, and does HTTPS.

Frontend: React 19 + Tailwind 4, with UI primitives from [shadcn/ui](https://ui.shadcn.com). `/jobs/<id>` polls for live updates until the crawl finishes.

## API

The site reaches these under `/api`. Everything is JSON.

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
GET    /auth/me                401 if anonymous
DELETE /auth/account           account + all jobs

GET    /history                past crawls (auth)
```

## Localhost

Needs Docker (MySQL, Redis and RabbitMQ run in containers), Go 1.26+ and Node 20+.

```bash
cp .env.example .env
npm --prefix web install

make dev           # containers, then API :8080, worker and web :5173 in one terminal
make dev LAN=1     # same, but the site is also reachable from your phone on the same network
```

## Deploying

Point the domain's A record at the server first, so Caddy can get a certificate.

```bash
ssh root@YOUR_SERVER_IP
git clone https://github.com/Tom-the-Bomb/linktrace.git && cd linktrace
cp .env.production.example .env.production   # DOMAIN, ACME_EMAIL, passwords
docker compose -f docker-compose.prod.yml --env-file .env.production up -d --build
```

Redeploy with the same command; append `api`, `worker` or `caddy` to rebuild just one.
`.github/workflows/deploy.yml` redeploys over SSH on every push to `main` (needs the `DROPLET_*` secrets).

## Config

Worker limits: `WORKER_COUNT` (100), `MAX_PAGES` (10000), `MAX_DEPTH` (20), `MAX_PER_CATEGORY` (1000), `RATE_PER_MIN` (300 per target site). `ANON_MAX_PAGES` (500) caps crawls started without an account (api only).

`SHARD_COUNT` (5) is the number of work-queue lanes. Each crawl, however large, uses one lane, so it takes at most 1/`SHARD_COUNT` of the fetch goroutines and can't block other crawls. Set the same value on the api and the worker.

Connections: `MYSQL_DSN`, `REDIS_ADDR`, `RABBIT_URL`, `HTTP_ADDR`, `COOKIE_SECURE`.

`ALLOW_PRIVATE_TARGETS` (false) lets you crawl localhost and LAN sites in dev. Keep it off in production, otherwise a crawl could reach the API, Redis or the host itself.

Defaults point at the dev containers; production values go in `.env.production`.

## Abuse limits

Crawls without an account are capped at `ANON_MAX_PAGES`, and only one can run per site at a time (starting another just joins it). The crawler identifies itself as `LinkTraceBot` and follows robots.txt, including `Crawl-delay`. Requests are rate limited per IP, and login attempts per account.
