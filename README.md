---
title: Amastan Fraud Shield Guard
sdk: docker
app_port: 7860
---

# Amastan Fraud Shield Guard

A small fraud alert review API for Tunisian digital payments.

The hosted demo runs FastAPI on Hugging Face Spaces and stores data in Neon
PostgreSQL. The same code uses SQLite locally.

The project is finished and in maintenance mode.

[Release](https://github.com/ReguiguiMohamed/hybrid-real-time-fraud-detection-tunisia/releases/latest)
| [API reference](docs/API_REFERENCE.md)
| [Deployment](docs/DEPLOYMENT.md)
| [OpenAPI](docs/openapi.json)
| [Security](SECURITY.md)

## What It Does

- Stores fraud alerts.
- Gives analysts a review queue.
- Records analyst feedback.
- Exports reviewed cases.
- Tracks model metadata and training outcomes.
- Reports drift and review metrics.
- Exposes Prometheus metrics for Grafana Cloud.
- Keeps an audit trail for important changes.

Bearer tokens separate admin and analyst access.

## Proof

The first image shows the hosted API, an authenticated Swagger request, and the
same alert in Neon PostgreSQL.

![Hosted API and Neon PostgreSQL result](resultscreenshot.png)

The second image shows the Grafana Cloud dashboard and the metric query behind
it.

![Grafana Cloud result](docs/grafana.png)

The dashboard export is stored at
[`docs/grafana-dashboard.json`](docs/grafana-dashboard.json).

## Architecture

```mermaid
flowchart LR
    Client[API client] --> API[FastAPI]
    API --> Auth[Admin / analyst tokens]
    Auth --> DB[(SQLite or Neon PostgreSQL)]
    DB --> Review[Alerts, feedback, audit, model metadata]
    API --> Metrics[Prometheus metrics]
    Metrics --> Grafana[Grafana Cloud]
```

This repository contains that deployed slice only. Earlier Kafka, Spark,
Streamlit, Ollama, ChromaDB, Kubernetes, and local monitoring experiments were
removed during final cleanup.

## Main Endpoints

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/health/` | Health and version |
| `POST` | `/api/v1/alerts/add/` | Store an alert |
| `GET` | `/api/v1/alerts/review-queue/` | Read the review queue |
| `POST` | `/api/v1/feedback/` | Record analyst feedback |
| `GET` | `/api/v1/stats/` | Review statistics |
| `GET` | `/api/v1/compliance/kpis/` | Compliance indicators |
| `GET` | `/api/v1/model/training-summary` | Model training history |
| `GET` | `/metrics` | Prometheus metrics |

Swagger is available at `/docs`.

## Run Locally

Python 3.11 or 3.12 is required.

```powershell
python -m pip install -r requirements-dev.txt

$env:ADMIN_TOKEN = "local-admin"
$env:ANALYST_TOKEN = "local-analyst"
$env:DATABASE_URL = "sqlite:///./data/feedback.db"

python -m uvicorn dashboard.api:app --reload --port 8001
```

Open `http://localhost:8001/docs`.

## Test

```powershell
$env:PYTEST_DISABLE_PLUGIN_AUTOLOAD = "1"
python -m pytest tests -q
ruff format --check src dashboard scripts tests
ruff check src dashboard scripts tests
bandit -r src dashboard scripts -lll
```

## Automation

Dependabot patch and minor updates merge on their own once CI passes. Major
updates stay open with a `semver-major` label. A failed health check, deploy or
security scan on `main` opens one issue, and the next green run closes it.

| Workflow | Trigger | What it does |
|---|---|---|
| [CI](.github/workflows/ci.yml) | Push to `main`, pull request, manual | Ruff, zizmor, tests with 70% coverage, OpenAPI snapshot, backtest artifact, Schemathesis against Postgres, Bandit gate, Docker build |
| [Deploy](.github/workflows/deploy.yml) | Push to `main` that changes the image, manual | Pushes the API to the Space and waits for the build |
| [Dependabot](.github/workflows/dependabot.yml) | Dependabot pull request, CI run | Labels updates and merges patch and minor ones after CI passes |
| [Health check](.github/workflows/health-check.yml) | Daily at 07:17 UTC, manual | Calls `/health/` unless the Space sleeps |
| [Weekly Security Report](.github/workflows/security-scan.yml) | Mondays at 06:00 UTC, manual | pip-audit, plus Semgrep and Bandit results to code scanning |
| [Failure issues](.github/workflows/failure-issues.yml) | Health check, deploy or security scan run on `main` | Opens, comments on or closes one issue per workflow |
| [Release](.github/workflows/release.yml) | `v*` tag | Creates the GitHub release from [CHANGELOG.md](CHANGELOG.md) |

## Repository

```text
dashboard/        FastAPI app and analytics
src/compliance/   Filing deadlines and change audit
src/ml/           Model lifecycle persistence
src/shared/       Database, logging, risk config, version
scripts/          OpenAPI and backtest utilities
tests/            API and domain tests
docs/             API, deployment, OpenAPI, Grafana evidence
```

## Scope

Before public or production use:

- rotate every token
- rehearse schema changes against PostgreSQL
- define backups and retention
- replace static bearer tokens with managed identity
- validate legal and reporting rules with the responsible institution

## Credits

- [Ruff](https://github.com/astral-sh/ruff), MIT, by Astral Software.
- [Schemathesis](https://github.com/schemathesis/schemathesis), MIT, by Dmitry
  Dygalo.
- [zizmor](https://github.com/zizmorcore/zizmor), MIT, by William Woodruff.

## License

[MIT](LICENSE)
