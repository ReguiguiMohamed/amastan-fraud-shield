# Browser demos

[Payment demo](https://reguiguimohamed.github.io/amastan-fraud-shield/) ·
[Investigation desk](https://reguiguimohamed.github.io/amastan-fraud-shield/workbench.html)

The original demo composes and scores individual payments. The investigation
desk analyzes local CSV batches, links accounts and records case decisions.
Neither sends transaction data to the hosted API.

Run from the repository root:

```text
python -m http.server 8765 --directory site
```

Open `http://localhost:8765/workbench.html`.

| File | Purpose |
| --- | --- |
| `index.html` | Original payment walkthrough and deployment status |
| `rules.js` | Base scoring and prototype filing calendar |
| `workbench.html`, `workbench.css`, `workbench.js` | Investigation interface |
| `investigation.js` | Import validation, temporal analysis, graph findings and evidence |
| `scenarios.js` | Six deterministic fictional cases |
| `contracts/` | ODCS payment contract, generated browser policy and native CLI exports |
| `tests/` | Node unit tests |
| `browser-tests/` | Playwright desktop, mobile and workspace checks |
| `vendor/` | Pinned MIT-licensed browser libraries |

The [payment contract guide](contracts/README.md) owns schema and CLI checks.
The [investigation guide](../docs/INVESTIGATION_DESK.md) owns import behavior,
signal definitions, storage behavior, limits, research and verification steps.
