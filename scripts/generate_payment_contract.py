"""Export payment contract assets. Run: python scripts/generate_payment_contract.py."""

import argparse
import json
import re
from pathlib import Path

import yaml
from datacontract.data_contract import DataContract

ROOT = Path(__file__).resolve().parents[1]
CONTRACT = ROOT / "site/contracts/payments.odcs.yaml"


def browser_contract(contract):
    model = next(model for model in contract["schema"] if model["name"] == "payments")
    fields = {field["name"]: field for field in model["properties"]}
    options = {item["property"]: item["value"] for item in contract["customProperties"]}
    bounds = next(rule["mustBeBetween"] for rule in model["quality"] if rule["id"] == "batch_row_count")
    money = fields["amount_tnd"]
    decimals = next(item["value"] for item in money["customProperties"] if item["property"] == "decimalPlaces")
    identifiers = [fields[name]["logicalTypeOptions"] for name in ("transaction_id", "user_id", "recipient_id")]
    if not all(item == identifiers[0] for item in identifiers):
        raise ValueError("The shared identifier validator requires identical account and transaction constraints")
    device = fields["device_id"]["logicalTypeOptions"]
    if device != {**identifiers[0], "minLength": 0}:
        raise ValueError("The optional device validator requires the shared identifier constraints")
    return {
        "id": contract["id"],
        "version": contract["version"],
        "standard": contract["apiVersion"],
        "minRows": bounds[0],
        "maxRows": bounds[1],
        "maxCsvBytes": options["maxCsvBytes"],
        "requiredColumns": [
            name
            for name, field in fields.items()
            if any(item["property"] == "csvRequired" and item["value"] for item in field.get("customProperties", []))
        ],
        "governorates": [item["value"] for item in fields["governorate"]["enum"]],
        "paymentMethods": [item["value"] for item in fields["payment_method"]["enum"]],
        "identifier": identifiers[0],
        "amount": {**money["logicalTypeOptions"], "decimalPlaces": decimals},
        "timestampInputPattern": options["timestampInputPattern"],
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="Fail if generated contract assets have drifted")
    args = parser.parse_args()
    contract = yaml.safe_load(CONTRACT.read_text(encoding="utf-8"))
    exporter = DataContract(data_contract_file=str(CONTRACT))
    exports = {
        "payment-contract.js": "export const PAYMENT_CONTRACT = "
        + json.dumps(browser_contract(contract), ensure_ascii=False, indent=2)
        + ";\n",
        "payments.schema.json": exporter.export("jsonschema", schema_name="payments"),
        "payments.html": exporter.export("html"),
    }
    for name, content in exports.items():
        output = CONTRACT.parent / name
        if args.check:
            existing = output.read_text(encoding="utf-8") if output.exists() else ""
            if name.endswith(".html"):
                # Native HTML exports include the current time in their footer.
                stamp = r'Created at [^\n<]+ with <a href="https://cli.datacontract.com"'
                existing = re.sub(stamp, 'Created at EXPORT_TIME with <a href="https://cli.datacontract.com"', existing)
                content = re.sub(stamp, 'Created at EXPORT_TIME with <a href="https://cli.datacontract.com"', content)
            if existing != content:
                raise SystemExit(f"{name} is stale. Run python scripts/generate_payment_contract.py")
        else:
            output.write_text(content, encoding="utf-8")


if __name__ == "__main__":
    main()
