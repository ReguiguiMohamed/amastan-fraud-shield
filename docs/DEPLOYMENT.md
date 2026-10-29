# Deployment

The demo uses a Hugging Face Docker Space and Neon PostgreSQL.

## Space Secrets

Set these in the Space under Settings, then Variables and secrets:

```text
ADMIN_TOKEN=<random value>
ANALYST_TOKEN=<random value>
METRICS_TOKEN=<random value>
HEALTHCHECK_TOKEN=<random value>
DATABASE_URL=postgresql://USER:PASSWORD@HOST/DBNAME?sslmode=require
```

`DATABASE_URL` takes the bare `postgresql://` form that Neon hands out. The
API maps it to psycopg2, the driver in the image.

`ADMIN_TOKEN` can ingest alerts and export cases. `ANALYST_TOKEN` can read the
queue and submit feedback.

## GitHub Secrets

The deploy workflow needs `HF_TOKEN`, a Hugging Face token with write access to
the Space. Add it under Settings, Secrets and variables, Actions, New repository
secret. A missing token fails the deployment.

Set the same `HEALTHCHECK_TOKEN` in GitHub Actions secrets and the Space. It
can call `/ready/` and cannot read or write alerts. The admin and analyst
tokens can also call `/ready/`.

## Deploy

A push to `main` that changes a file the Space uses starts the deploy. The
paths are listed in [`deploy.yml`](../.github/workflows/deploy.yml). A
Dependabot merge that changes `requirements.txt` or the `Dockerfile` starts it
too.

The workflow copies the runtime files to the Space and waits until `/health/`
reports the deployed Git commit. A failed build fails the run. The Space
builds [`Dockerfile`](../Dockerfile) and serves the API on port `7860`.

## Check

```powershell
Invoke-RestMethod https://<space>.hf.space/health/
```

`/health/` checks the running process without opening a database connection.
Its `database_status` and `database_checked_at` fields describe the last
database check. A 200 from this route does not establish database readiness.

The Health check workflow checks the process and calls `/ready/` once a day
using `HEALTHCHECK_TOKEN`. `/ready/` opens a database connection and returns
200 only when the database is available. It returns 503 during an outage.
A free Space sleeps after 48 hours without traffic, so the workflow skips
sleeping and paused Spaces.

Then check:

- `/docs`
- an authenticated `POST /api/v1/alerts/add/`
- `GET /api/v1/alerts/review-queue/`
- the inserted row in Neon

## Grafana Cloud

Grafana Cloud scrapes:

```text
https://<space>.hf.space/metrics
```

Use bearer authentication with `METRICS_TOKEN`. Import
[`grafana-dashboard.json`](grafana-dashboard.json).

`/metrics` serves cached values and never connects to PostgreSQL. Database
gauges refresh during successful authenticated API traffic, at most once per
minute. `amastan_db_metrics_refreshed_timestamp_seconds` records the last
successful refresh and starts at zero. Idle values can be stale. Request
counters and latency histograms continue to update on each request.

Keep Grafana scraping `/metrics`. Do not point a frequent uptime monitor at
`/ready/` or an authenticated API route. Those routes wake the database.

Useful checks:

```promql
amastan_api_info
amastan_db_metrics_scrape_success
sum(rate(amastan_api_requests_total{status_code=~"5.."}[5m]))
```

## Neon free compute allowance

The October 2026 outage had two causes. Neon rejected connections after the
project exhausted its 100 CU-hour monthly allowance. The API created its
tables during startup and exited when that connection failed. The failed
[health check](https://github.com/ReguiguiMohamed/amastan-fraud-shield/actions/runs/40701884384)
reported `RUNTIME_ERROR`.

The old `/metrics` implementation also queried PostgreSQL on every scrape.
Queries less than five minutes apart prevent Neon's idle suspension. Even a
0.25 CU database running continuously uses 186 CU-hours in a 31-day month.
This exceeds the 100 CU-hour allowance before application traffic matters.
See [Neon's scale-to-zero documentation](https://neon.com/docs/introduction/scale-to-zero)
and [plan limits](https://neon.com/docs/introduction/plans).

The API starts during a database outage, serves docs and cached metrics, and
rejects database operations with 503 and `Retry-After: 60`. Failed connection
attempts have a one-minute cooldown. The next authenticated request or daily
readiness check retries the original database and creates the schema if
needed. No restart is required after database access returns.

An exhausted allowance cannot be restored by deploying code. Neon resumes
the existing database at the next monthly billing-period reset. The reset
date belongs to the Neon account and must be checked there. Existing rows
remain in Neon. The app does not silently switch to an empty database.

For a small demo, keep each active Neon compute at a fixed 0.25 CU, preserve
scale-to-zero, close unused SQL editor sessions and stop sustained load
generators. Other branches, database clients and real traffic also consume
the project's allowance. Removing scrape queries addresses idle monitoring
usage. Free compute and storage limits still apply.

## Free alternatives considered

| Option | Fit for this deployment |
| --- | --- |
| Existing Neon Free | Keeps the current PostgreSQL data and application contract. Allows idle suspension after the monitoring fix. Current exhausted quota must reset first. |
| [Supabase Free](https://supabase.com/pricing) | PostgreSQL-compatible. Lists a 500 MB database and pauses inactive projects after one week. Requires account setup and a verified data migration. |
| [Turso Free](https://turso.tech/pricing) | Uses row and storage allowances instead of CU-hours. Requires a new database driver, account setup and migration. |
| SQLite on the Space disk | No database bill, but the Space's default disk is ephemeral. Restarts can erase alerts. Unsuitable as a replacement for the current durable database. |
| Self-hosted PostgreSQL | Open-source software. Durable hosting, backups and availability become the operator's responsibility. |

The deployed choice keeps Neon and removes monitoring queries. No paid
hardware, storage tier or database plan is needed for these changes.
See [Space disk persistence](https://huggingface.co/docs/hub/spaces-storage)
before considering local database files.

## Limits

The application creates its prototype tables with SQLAlchemy when a database
check first succeeds. That is enough for the demo. It is not a production
migration strategy.

Before using another database:

- rehearse schema changes
- configure backups
- define retention
- review connection limits
- rotate all tokens
