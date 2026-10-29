"""Exercise the CLI on synthetic batches. Run: python scripts/check_payment_contract.py."""

import copy
import json
import os
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CONTRACT = ROOT / "site/contracts/payments.odcs.yaml"
DATA = ROOT / "data/contract"


def check_batch(name, rows, expected_failure=None):
    fixture = DATA / "checks" / f"{name}.json"
    report = DATA / "reports" / f"{name}.json"
    report.unlink(missing_ok=True)
    fixture.parent.mkdir(parents=True, exist_ok=True)
    fixture.write_text(json.dumps(rows, ensure_ascii=False), encoding="utf-8")
    cli = shutil.which("datacontract", path=str(Path(sys.executable).parent))
    if cli is None:
        raise RuntimeError("Install requirements-contract.txt into this Python environment first")
    result = subprocess.run(
        [cli, "test", str(CONTRACT), "--output-format", "json", "--output", str(report)],
        cwd=ROOT,
        env={**os.environ, "PYTHONUTF8": "1", "PAYMENTS_FILE": str(fixture)},
        capture_output=True,
        text=True,
        encoding="utf-8",
        timeout=60,
        check=False,
    )
    if not report.exists():
        raise AssertionError(f"{name}: CLI produced no report\n{result.stdout[-3000:]}\n{result.stderr[-1000:]}")
    run = json.loads(report.read_text(encoding="utf-8"))
    checks = run["checks"]
    if not checks or run.get("dryRun"):
        raise AssertionError(f"{name}: no real checks executed")
    if expected_failure is None:
        if result.returncode != 0 or run["result"] != "passed" or any(check["result"] != "passed" for check in checks):
            raise AssertionError(f"{name}: valid data failed\n{result.stdout[-4000:]}")
        executed = {check.get("qualityId") for check in checks if check["result"] == "passed"}
        if not {"batch_row_count", "amount_millime_precision", "timestamp_calendar_valid"} <= executed:
            raise AssertionError(f"{name}: required quality checks did not execute")
    else:
        failed = [check for check in checks if check["result"] in {"failed", "error"}]
        relevant = [
            check
            for check in failed
            if check.get("field") == expected_failure
            or check.get("qualityId") == expected_failure
            or expected_failure in (check.get("reason") or "")
        ]
        if result.returncode == 0 or not relevant:
            raise AssertionError(f"{name}: the intended violation was not rejected\n{json.dumps(failed, indent=2)}")
    print(f"{name}: {'accepted' if expected_failure is None else 'rejected as expected'} ({len(checks)} CLI checks)")


def main():
    fixtures = sorted((DATA / "scenarios").glob("*.json"))
    if len(fixtures) != 6:
        raise RuntimeError("Run node scripts/generate_contract_fixtures.mjs first")
    for fixture in fixtures:
        check_batch(fixture.stem, json.loads(fixture.read_text(encoding="utf-8")))
    rows = json.loads((DATA / "payments.json").read_text(encoding="utf-8"))
    check_batch(
        "boundaries_and_unlabeled",
        [
            {**rows[0], "transaction_id": "000001", "amount_tnd": 0.001, "device_id": "", "expected_fraud": None},
            {**rows[0], "transaction_id": "000002", "amount_tnd": 100000000, "timestamp": "2024-02-29T00:00:00.000Z"},
        ],
    )
    check_batch("duplicate_id", [rows[0], rows[0]], "transaction_id")
    mutations = [
        ("missing_id", "transaction_id", None, "transaction_id"),
        ("control_character", "user_id", "account\u0000", "user_id"),
        ("long_identifier", "recipient_id", "x" * 81, "recipient_id"),
        ("negative_amount", "amount_tnd", -1, "amount_tnd"),
        ("sub_millime_amount", "amount_tnd", 0.00000001, "amount_tnd"),
        ("excess_amount", "amount_tnd", 100000001, "amount_tnd"),
        ("fractional_millime", "amount_tnd", 1.2345, "amount_millime_precision"),
        ("unknown_governorate", "governorate", "unknown", "governorate"),
        ("unknown_method", "payment_method", "cash", "payment_method"),
        ("invalid_date", "timestamp", "2026-02-30T09:00:00.000Z", "timestamp_calendar_valid"),
        ("non_utc_timestamp", "timestamp", "2026-10-29T10:00:00+01:00", "timestamp"),
        ("string_label", "expected_fraud", "false", "expected_fraud"),
    ]
    for name, field, value, expected in mutations:
        mutated = copy.deepcopy(rows)
        mutated[0][field] = value
        check_batch(name, mutated, expected)
    check_batch("empty_batch", [], "batch_row_count")
    oversized = [{**rows[0], "transaction_id": f"LIMIT-{index}"} for index in range(5001)]
    check_batch("oversized_batch", oversized, "batch_row_count")


if __name__ == "__main__":
    main()
