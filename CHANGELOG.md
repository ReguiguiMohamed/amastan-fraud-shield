# Changelog

## Unreleased

- Interactive demo site on GitHub Pages. It scores payments with the same
  rules as the API and shows live CI, deploy and Space status.
  `test_site_rules_match_python` keeps its rules equal to the Python ones.

## 0.1.1 - 2026-10-08

- Fixed the startup crash on SQLAlchemy 2.1 with a bare `postgresql://`
  URL. `test_bare_postgresql_url_uses_psycopg2` guards it.
- Fixed HTTP 500 on `/api/v1/metrics/feedback` and
  `/api/v1/metrics/system-overview` once an alert had feedback.
  `test_feedback_metrics_with_labelled_alert` guards it.
- Out-of-range `limit` and `days` values return 422 instead of 500.
  `test_out_of_range_query_returns_422` guards it.
- A blank feedback `transaction_id` returns 422 instead of being stored.
  `test_blank_feedback_transaction_id_returns_422` guards it.
- Declared the 401, 403 and 404 responses in OpenAPI.
- Replaced black, isort and flake8 with Ruff.
- Updated FastAPI, SQLAlchemy, pandas, pytest and the other pinned
  dependencies.
- CI fuzzes the API with Schemathesis against Postgres and audits the
  workflows with zizmor.
- Semgrep and Bandit results go to GitHub code scanning.
- Dependabot patch and minor updates merge after CI passes.
- A daily health check watches the live API. A failed health check,
  deploy or security scan on `main` opens one issue.
- A `v*` tag creates the GitHub release from this file.
- Removed the unused Kafka, Spark, Streamlit, RAG, Kubernetes, and local
  monitoring stacks.
- Removed duplicate Dockerfiles, Make automation, notebooks, migration
  scaffolding, and compatibility routes.
- Reduced runtime dependencies to the hosted API.
- Moved monitoring queries onto the shared SQLAlchemy connection.
- Shortened the README and deployment docs.
- Kept both deployment screenshots and the Grafana dashboard export.

## 0.1.0 - 2026-06-11

- Released the FastAPI and SQLAlchemy portfolio prototype.
- Added admin and analyst authentication.
- Added alert review, feedback, exports, compliance indicators, and metrics.
- Added SQLite and Neon PostgreSQL support.
- Added OpenAPI, tests, coverage, formatting, and security gates.
- Published the hosted API and Grafana evidence.
