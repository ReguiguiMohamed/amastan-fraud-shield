# Investigation desk

The [investigation desk](https://reguiguimohamed.github.io/amastan-fraud-shield/workbench.html)
turns a payment batch into an analyst queue, account graph and case file.
It runs in the browser and makes no transaction-data requests to the API.
The existing API continues to own hosted alert storage and analyst feedback.

## Investigation flow

1. Open one of six synthetic stories or import a CSV.
2. Search the review queue and select a payment.
3. Inspect its base-rule contributions, link signals and connected timeline.
4. Follow accounts and payment arrows in the graph.
5. Record a verdict and the context behind it.
6. Export a case brief or a workspace with an integrity digest.

The morning-shift scenario contains 32 fictional payments. The other stories
cover a mule collection network, rapid wallet payments, repeated similar
amounts, customer-reported scams and an ordinary-payment control group.
Every identifier, label and payment in these stories is synthetic.

## Data contract

CSV imports accept up to 5,000 rows and 2 MB. Papa Parse handles quoted
fields, BOM headers and comma, semicolon or tab delimiters. The desk rejects
malformed files, duplicate headers, duplicate transaction IDs and invalid
rows before replacing the current batch.

The [ODCS payment contract](../site/contracts/README.md) owns normalized field
constraints and accepted values. The browser imports its limits from generated
contract metadata. Data Contract CLI checks normalized synthetic batches in CI
with DuckDB, including deliberately invalid inputs.

Field notes links to the YAML, native CLI documentation and JSON Schema.
Export payment records for CLI downloads the normalized array for local checks.
The sample CSV is generated from the same synthetic data as the desk.

## Scoring and graph context

Base rules come from [`site/rules.js`](../site/rules.js), which is checked
against the Python backtest and shared risk configuration. The desk derives
velocity and governorate diversity from the preceding 30 minutes, including
the current payment. A base alert requires `score > threshold`.

Additional signals raise a review independently of the base threshold:

| Signal | Prototype condition |
| --- | --- |
| Shared beneficiary | At least 3 distinct senders pay one recipient within 30 minutes |
| Rapid dispersal | One sender pays at least 3 distinct recipients within 30 minutes |
| Repeated similar amounts | At least 3 payments by one sender fall in `[1400, 1500)` TND within 30 minutes |
| Shared device | At least 3 distinct sender accounts use one device in the complete batch |
| Circular transfers | Sender and recipient belong to the same directed strongly connected account group with at least 2 members |
| Customer-reported scam | Input explicitly supplies `reported_scam=true` |

The amount band is a demo heuristic. It is not a statutory reporting limit.
Shared devices and account cycles use the complete batch. Their findings
are retrospective and can include connections established later in the
batch. They must not be presented as prospective detection results.

Queue priority is `min(100, round(base_score * 100 + 12 * link_signal_count))`.
It orders review work. It is not a fraud probability. A person decides
whether a payment is confirmed fraud, cleared or needs more context.

Moving the threshold recalculates base alerts and workload without rebuilding
the graph. Precision and recall appear only when supplied labels exist.
Synthetic results describe those scenarios and do not establish production
accuracy. Analyst decisions do not change supplied evaluation labels.

## Case files and storage

Decisions and drafts start in memory. Choosing a decision records the current
note and timestamp. The workspace keeps the last 20 decisions for each
payment. Case files show related payments and that local decision history.
This is not a server-authenticated audit log.

Save on this device explicitly enables browser local storage. Remove saved
copy deletes that browser copy while leaving the current session open.
Storage limits and private-browsing policies can prevent saving. The desk
reports those failures and supports a workspace export instead.

A workspace JSON export contains the payment contract ID and version,
normalized source transactions, decisions,
threshold and source description. Import verifies its integrity digest and
validates its contents before restoring it. JSON workspace imports are
limited to 20 MB. A case export contains the contract ID and version,
the selected payment, signals,
analyst decision, connected payments and rule settings. Print case brief
uses the selected case and recorded note, excluding draft notes.

The SHA-256 digest covers UTF-8 JSON with object keys sorted lexically and
array order preserved. The export identifies this as `Amastan sorted JSON v1`.
It checks content integrity. Anyone can recompute a digest, so it does not
authenticate an analyst, establish data provenance or certify a filing.

CSV review exports contain the filtered queue, including rows beyond the
first 250 displayed in the table. Formula-like cells receive an apostrophe
prefix, including multiline analyst notes. Use JSON workspaces for lossless
restoration because spreadsheet-safe CSV prefixes change those string values.

The graph displays the selected account component, capped at 100 accounts
and 250 payments. The connected timeline shows its first 30 related
payments. These display limits do not truncate batch analysis or exports.
Queue buttons provide an accessible alternative to canvas interactions.

## Research and open source

The research cutoff for this release is October 29, 2026.

| Primary source | Design decision |
| --- | --- |
| [FCA, September 23, 2026](https://www.fca.org.uk/publications/multi-firm-reviews/money-mules-activity-cashing-out-findings) | Inspect connected accounts and repeat activity alongside individual amounts |
| [European Commission, October 20, 2026](https://digital-strategy.ec.europa.eu/en/library/digital-services-act-study-financial-scams-online-platforms-and-ways-counter-them) | Include scam scenarios and recorded investigation context |
| [EBA / ECB, December 15, 2025](https://www.eba.europa.eu/publications-and-media/press-releases/joint-eba-ecb-report-payment-fraud-strong-authentication-remains-effective-fraudsters-are-adapting) | Treat customer-reported manipulation as a separate signal from payment authentication |

These reports concern other jurisdictions. They do not validate Tunisian
legal thresholds or the detection rules used here.

[Cytoscape.js 3.34.4](https://js.cytoscape.org/) renders the interactive graph.
[Papa Parse 5.7.0](https://www.papaparse.com/docs) handles CSV parsing and
exports. Both are MIT-licensed. The pinned bundles, original licenses,
npm tarball integrity values and file hashes live in
[`site/vendor`](../site/vendor/).

[Data Contract CLI](https://github.com/datacontract/datacontract-cli) checks
normalized payment fixtures in CI and exports the contract's JSON Schema and
HTML documentation. Its license and local commands are linked in the
[payment contract guide](../site/contracts/README.md).

The graph library's recursive component analysis exceeded the JavaScript
call-stack limit on a 5,000-payment chain during verification. Batch analysis
therefore uses an iterative Kosaraju traversal. Cytoscape handles display.
The bounded batch does not need a separate analytical database or a paid API.

## Verification

```text
node --test site/tests/*.test.mjs
npm ci --prefix site --ignore-scripts
site/node_modules/.bin/playwright install chromium
site/node_modules/.bin/playwright test --config site/playwright.config.js
```

Unit tests cover temporal boundaries, scoring, account relationships,
5,000-payment chains and bursts, malformed imports, integer money totals,
digest reproducibility, library hashes and spreadsheet-safe exports.
Browser checks cover desktop and mobile layouts, graph rendering, case
decisions, browser storage, import/export restoration, tampered-file rejection
and safe rendering of imported text. CI retains screenshots and failure traces.
