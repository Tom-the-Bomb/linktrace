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

Frontend: React 19 + Tailwind 4, with design tokens in `web/src/index.css`. `/jobs/<id>` receives live updates (polling) until the crawl finishes. Buttons, dialogs, menus, tabs and other primitives in `web/src/components/ui` come from [shadcn/ui](https://ui.shadcn.com) (add more with `npx shadcn add <name>`), restyled to the design tokens.

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

Worker limits: `WORKER_COUNT` (100), `MAX_PAGES` (10000), `MAX_DEPTH` (20), `MAX_PER_CATEGORY` (1000), `RATE_PER_MIN` (300, requests per minute per target site across every crawl). `ANON_MAX_PAGES` (500) is read by the API only, which puts that lower cap on crawls started without an account.

`SHARD_COUNT` (5) is the # of work-queue lanes so that each crawl (no matter how large) is limited to 1 lane so it doesn't block other crawls. (i.e. takes up 1/SHARD_COUNT fraction of the fetch goroutines) Set it to the same value on the api and the worker.

Connections: `MYSQL_DSN`, `REDIS_ADDR`, `RABBIT_URL`, `HTTP_ADDR`, `FRONTEND_ORIGIN` (comma-separated), `COOKIE_SECURE`.

`ALLOW_PRIVATE_TARGETS` (false) lets you crawl localhost and LAN sites in development. Leave it off in production: every outbound request refuses private, loopback, link-local (including cloud metadata) and other reserved addresses, and any port other than 80 and 443, which is what stops a crawl from reaching the API, Redis, RabbitMQ or the host itself.

Default values point at the dev containers. Production values should go in `.env.production`.

## Abuse limits

- Only one crawl of a site started without an account runs at a time. Starting another joins the one already running. (Account crawls are separate, but every crawl of a site shares the same per-site request rate.)
- Crawls started without an account are capped at `ANON_MAX_PAGES` pages. Their creator gets a random owner cookie (only its hash is stored), and only that browser can stop or delete them.
- The checker identifies itself as `LinkTraceBot` with a link back here, and respects robots.txt `Allow`/`Disallow` rules as well as `Crawl-delay` (a group naming LinkTrace replaces the `*` group, and a robots.txt that errors blocks the crawl, as RFC 9309 specifies).
- A crawl stays on the site it was started on: a page that redirects to another site is recorded but not expanded.
- Every request that isn't a GET must send `Content-Type: application/json`, which forces a CORS preflight, so other sites can't start, stop or delete crawls from their visitors' browsers.
- Logins are rate limited per IP and per account; report data endpoints have their own per-minute budget.
