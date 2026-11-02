<div align="center">
  <img src="web/public/icon-round.png" alt="LinkTrace" width="88" />
  <h1>Linktrace</h1>
  <p>A distributed site auditor</p>
</div>

Give it a domain and it crawls every page reachable from the homepage, then reports:

- broken links and why they broke (DNS, timeout, SSL, soft 404, 4xx/5xx, redirect loop, etc.)
- an SEO score and a list of issues for every HTML page
- all of it in an interactive table and graph

## How it works

- `cmd/api`: the HTTP server that starts crawls and serves reports.
- `cmd/worker`: the crawler that fetches each page, audits it and queues its links (Run more workers to scale)

- RabbitMQ delivers pages to the workers and carries results back.
- Redis holds live crawl state (progress counters, the seen set, per-domain rate limits) and sessions.
- MySQL stores jobs, pages, results, the site graph and users.
- Caddy serves `web/`, proxies `/api`, and does HTTPS.

Frontend: React 19 + Tailwind 4, with UI primitives from [shadcn/ui](https://ui.shadcn.com).

## API

All under `/api`, all JSON.

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
make dev LAN=1     # expose port
```

## Deploying

Point the domain's A record at the server first, so Caddy can get a certificate.

```bash
ssh root@YOUR_SERVER_IP
git clone https://github.com/Tom-the-Bomb/linktrace.git && cd linktrace
cp .env.production.example .env.production   # DOMAIN, ACME_EMAIL, passwords
docker compose -f docker-compose.prod.yml --env-file .env.production up -d --build
```

Rerun the same command to redeploy (append `api`, `worker` or `caddy` to rebuild only that service). Every push to
`main` also redeploys over SSH through [deploy.yml](.github/workflows/deploy.yml), which requires the `DROPLET_*` secrets.

## Config

| Variable                | Default | What it does                                                                                                  |
| ----------------------- | ------- | ------------------------------------------------------------------------------------------------------------- |
| `WORKER_COUNT`          | 100     | fetch goroutines per worker                                                                                   |
| `MAX_PAGES`             | 10000   | pages per crawl                                                                                               |
| `ANON_MAX_PAGES`        | 500     | pages per crawl without an account                                                                            |
| `MAX_DEPTH`             | 20      | clicks away from the homepage                                                                                 |
| `MAX_PER_CATEGORY`      | 1000    | pages per first path segment (e.g. `/blog`)                                                                   |
| `RATE_PER_MIN`          | 300     | requests per minute to one site, across all crawls                                                            |
| `SHARD_COUNT`           | 5       | queue lanes (each crawl uses one, so a large crawl cannot block the others). Must match on the api and worker |
| `ALLOW_PRIVATE_TARGETS` | false   | allows crawling localhost and LAN sites. Dev only, otherwise crawls can reach the server's own Redis and API  |

Connection settings: `MYSQL_DSN`, `REDIS_ADDR`, `RABBIT_URL`, `HTTP_ADDR`, `COOKIE_SECURE`. Defaults point at the dev containers.

## Abuse limits

- Crawls without an account stop at `ANON_MAX_PAGES` pages. A second crawl of the same site joins the first.
- The crawler's user agent is `LinkTraceBot`, and it follows robots.txt (including `Crawl-delay`).
- API requests are rate limited per IP, and logins per account.
