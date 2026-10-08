import os
import subprocess
import sys


# The Space crashed on start with ModuleNotFoundError: psycopg after SQLAlchemy 2.1 changed the default driver.
def test_bare_postgresql_url_uses_psycopg2():
    env = {**os.environ, "DATABASE_URL": "postgresql://user:pass@localhost:5432/db"}
    code = "import shared.database as d; print(d.engine.dialect.driver)"
    result = subprocess.run([sys.executable, "-c", code], env=env, capture_output=True, text=True, check=True)
    assert result.stdout.strip() == "psycopg2"
