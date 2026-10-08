"""The site demo must score and date alerts exactly like the Python code."""

import json
import shutil
import subprocess
from datetime import date, datetime, timedelta
from pathlib import Path

import pandas as pd
import pytest

from compliance.deadlines import ctaf_filing_deadline
from scripts.backtest import BacktestEngine
from shared.risk_config import ALERT_SCORE_THRESHOLD, RISK_WEIGHTS

RULES_JS = Path(__file__).resolve().parents[1] / "site" / "rules.js"
CASES = [
    {"amount": amount, "method": method, "v_count": v_count, "g_dist": g_dist}
    for amount in (10.0, 2000.0, 2150.0, 15000.0, 15000.5, 50000.0)
    for method in ("card", "flouci", "Flouci")
    for v_count in (1, 3, 4)
    for g_dist in (1, 2)
]
DAYS = [date(2026, 1, 1) + timedelta(days=offset) for offset in range(366)]


def _run_rules_js() -> dict:
    if shutil.which("node") is None:
        pytest.skip("node is not installed")
    script = f"""
import * as rules from {json.dumps(RULES_JS.as_uri())};
const cases = {json.dumps(CASES)};
const days = {json.dumps([day.isoformat() for day in DAYS])};
console.log(JSON.stringify({{
  weights: rules.WEIGHTS,
  scores: cases.map((c) => rules.score(c)),
  deadlines: days.map((d) => rules.deadline(new Date(d + "T00:00:00Z")).toISOString().slice(0, 10)),
}}));
"""
    result = subprocess.run(
        ["node", "--input-type=module", "-e", script], capture_output=True, text=True, check=True, timeout=60
    )
    return json.loads(result.stdout)


def test_site_rules_match_python(monkeypatch):
    monkeypatch.delenv("TUNISIA_ISLAMIC_HOLIDAYS", raising=False)
    js = _run_rules_js()

    frame = pd.DataFrame(CASES).rename(columns={"amount": "amount_tnd", "method": "payment_method"})
    python = BacktestEngine._apply_rules(
        frame, "site", RISK_WEIGHTS, BacktestEngine._default_thresholds(), ALERT_SCORE_THRESHOLD
    )

    assert js["weights"] == RISK_WEIGHTS
    assert [s["total"] for s in js["scores"]] == python["site_score"].tolist()
    assert [s["alert"] for s in js["scores"]] == python["site_alert"].tolist()
    midnights = [datetime(d.year, d.month, d.day) for d in DAYS]
    assert js["deadlines"] == [ctaf_filing_deadline(m).date().isoformat() for m in midnights]
