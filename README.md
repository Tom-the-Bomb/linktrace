# LinkTrace

**Healthy links. Higher rankings.**

Enter a domain. LinkTrace finds broken links, scores your on-page SEO, and lets you explore your whole site as an interactive graph.

It is an open-source distributed site auditor. It crawls a site from the homepage out, flags broken links with a reason, runs an SEO audit on the healthy pages, and shows it all as a graph with per-category rollups, site checks, and crawl stats.

## How it fits together

- **api** (`cmd/api`): the HTTP server. Takes a URL, creates the job, serves reports. Does no crawling itself.
- **worker** (`cmd/worker`): the crawl engine. Fetches pages, finds links, checks them, runs the SEO audit, saves results.
- **RabbitMQ**: the queue between them. The API drops the seed page in, workers pull from it and push newly found links back, which is what drives the crawl.
- **Redis**: live state. Progress counters, the seen-set for dedupe, rate limits, and sessions.
- **MySQL**: durable storage. Jobs, pages, SEO audits, the link graph, and users.
- **Caddy**: serves the React frontend (`web/`) and proxies `/api` to the API. Handles HTTPS.

The API and worker are split so the API stays fast and workers can scale on their own. The queue absorbs bursts and keeps jobs alive across restarts.

## What the report shows

Open `/jobs/<id>`. It streams in live and freezes when the crawl finishes.

- Live progress (checked vs discovered, healthy vs rotten)
- Per-category rollups (pages, rot percentage, average SEO score)
- Interactive graph and a table of every page
- Site audit: robots, sitemap, HTTPS, cert
- Crawl stats: response times, error rate, duration
- Coverage gap: sitemap URLs the crawl never reached
- Per-page SEO drilldown with a score and issues list
- History of your past crawls when logged in

## Run it locally

Needs Docker, plus Go 1.26+ and Node 20+ for the dev loop. In dev, only MySQL, Redis, and RabbitMQ run in Docker.

```bash
cp .env.example .env        # fill in the empty passwords
docker compose up -d        # mysql, redis, rabbitmq

go run ./cmd/api            # API on :8080
go run ./cmd/worker         # workers (separate terminal)

cd web && npm install && npm run dev   # frontend on :5173
```

Open http://localhost:5173 and crawl a domain. The defaults already point at the dev containers, so no extra config is needed.

## Deploy

Any Linux host with Docker. The whole stack is one compose file, and only Caddy is exposed.

```bash
ssh root@YOUR_SERVER_IP
git clone https://github.com/Tom-the-Bomb/linktrace.git && cd linktrace
cp .env.production.example .env.production   # set DOMAIN, ACME_EMAIL, passwords
docker compose -f docker-compose.prod.yml --env-file .env.production up -d --build
```

Point your domain's A record at the server and set `DOMAIN` and `ACME_EMAIL` so Caddy can issue HTTPS.

**Redeploy after changes.** The api, worker, and caddy images build from source, so restart alone will not update them. Rebuild:

```bash
git pull
docker compose -f docker-compose.prod.yml --env-file .env.production up -d --build
```

Add `api`, `worker`, or `caddy` to the end to rebuild just one. A handy alias for `~/.bashrc`:

```bash
ltup() { ( cd ~/linktrace && docker compose -f docker-compose.prod.yml --env-file .env.production up -d --build "$@" ); }
```

## Config

Worker knobs: `WORKER_COUNT` (100), `MAX_PAGES` (10000), `MAX_DEPTH` (20), `MAX_PER_CATEGORY` (1000), `RATE_PER_MIN` (1000).

Connections: `MYSQL_DSN`, `REDIS_ADDR`, `RABBIT_URL`, `HTTP_ADDR`, `FRONTEND_ORIGIN`, and `COOKIE_SECURE` (set `true` over HTTPS). Defaults match the dev containers. Prod values live in `.env.production`.

## License

See [LICENSE](LICENSE).
