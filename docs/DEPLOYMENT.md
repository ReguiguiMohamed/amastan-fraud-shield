# Deployment

The demo uses a Hugging Face Docker Space and Neon PostgreSQL.

## Space Secrets

Set these in the Space under Settings, then Variables and secrets:

```text
ADMIN_TOKEN=<random value>
ANALYST_TOKEN=<random value>
METRICS_TOKEN=<random value>
DATABASE_URL=postgresql://USER:PASSWORD@HOST/DBNAME?sslmode=require
```

`DATABASE_URL` takes the bare `postgresql://` form that Neon hands out. The
API maps it to psycopg2, the driver in the image.

`ADMIN_TOKEN` can ingest alerts and export cases. `ANALYST_TOKEN` can read the
queue and submit feedback.

## GitHub Secret

The deploy workflow needs `HF_TOKEN`, a Hugging Face token with write access to
the Space. Add it under Settings, Secrets and variables, Actions, New repository
secret. Without it the deploy is skipped.

## Deploy

A push to `main` that changes a file the Space uses starts the deploy. The
paths are listed in [`deploy.yml`](../.github/workflows/deploy.yml). A
Dependabot merge that changes `requirements.txt` or the `Dockerfile` starts it
too.

The workflow copies the runtime files to the Space and waits for the build. A
failed build fails the run. The Space builds [`Dockerfile`](../Dockerfile) and
serves the API on port `7860`.

## Check

```powershell
Invoke-RestMethod https://<space>.hf.space/health/
```

The Health check workflow calls this once a day. A free Space sleeps after 48
hours without traffic, and any request wakes it, so the check skips a sleeping
Space.

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

Useful checks:

```promql
amastan_api_info
amastan_db_metrics_scrape_success
sum(rate(amastan_api_requests_total{status_code=~"5.."}[5m]))
```

## Limits

The application creates its prototype tables with SQLAlchemy on startup. That
is enough for the demo. It is not a production migration strategy.

Before using another database:

- rehearse schema changes
- configure backups
- define retention
- review connection limits
- rotate all tokens
