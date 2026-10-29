import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import {
  analyze,
  normalizeRows,
  parseCSV,
  retune,
  cycleMembership,
  canonicalJSON,
  evidence,
  exportCSV,
  MAX_ROWS,
} from "../investigation.js";
import { scenario, SCENARIOS } from "../scenarios.js";

const require = createRequire(import.meta.url);
const papa = require("../vendor/papaparse.min.js");
const base = scenario("clean")[0];
const row = (id, extra = {}) => ({ ...base, transaction_id: id, ...extra });

test("all six synthetic stories are valid and the control is quiet", () => {
  for (const name of Object.keys(SCENARIOS))
    assert.ok(analyze(scenario(name)).rows.length > 0);
  assert.equal(Object.keys(SCENARIOS).length, 6);
  assert.equal(analyze(scenario("clean")).summary.review, 0);
  assert.equal(analyze(scenario("mixed")).summary.total, 32);
  assert.throws(() => scenario("__proto__"), /Unknown scenario/);
});

test("CSV preserves identifiers, quoted commas, semicolons and BOM headers", () => {
  const records = [row("000123", { user_id: "account, with comma" })];
  const text = "\uFEFF" + papa.unparse(records, { delimiter: ";" });
  const parsed = parseCSV(text, papa);
  assert.equal(parsed[0].transaction_id, "000123");
  assert.equal(parsed[0].user_id, "account, with comma");
  assert.equal(parsed[0].amount_tnd, base.amount_tnd);
});

test("malformed CSV and duplicate headers do not produce a partial batch", () => {
  assert.throws(
    () => parseCSV('transaction_id,user_id\n"unfinished', papa),
    /CSV:/,
  );
  assert.throws(
    () => parseCSV("transaction_id,user_id\n1,2", papa),
    /Missing columns/,
  );
  assert.throws(
    () => parseCSV("transaction_id,transaction_id\n1,2", papa),
    /duplicate column/,
  );
});

test("invalid amounts, dates, identifiers and duplicate transactions are rejected", () => {
  for (const amount_tnd of [
    0,
    -1,
    Infinity,
    "not money",
    1.2345,
    100_000_001,
    true,
    "0x10",
  ])
    assert.throws(
      () => normalizeRows([row("A", { amount_tnd })]),
      /amount_tnd/,
    );
  for (const timestamp of [
    "2026-02-30T09:00:00Z",
    "2026-10-29",
    "2026-10-29T09:00:00",
    "2026-10-29T25:00:00Z",
  ])
    assert.throws(() => normalizeRows([row("A", { timestamp })]), /timestamp/);
  assert.throws(() => normalizeRows([row("A"), row("A")]), /Duplicate/);
  assert.throws(() => normalizeRows([row("A\0")]), /printable/);
  assert.throws(
    () => normalizeRows([row("A", { governorate: "unknown" })]),
    /governorate/,
  );
  assert.throws(() => normalizeRows(Array(MAX_ROWS + 1).fill(base)), /Provide/);
  assert.throws(
    () => normalizeRows([row("A", { reported_scam: "yes" })]),
    /true or false/,
  );
});

test("rolling context excludes expired payments and never uses future payments", () => {
  const records = [
    row("LATE", { timestamp: "2026-10-29T09:31:00Z", governorate: "Sfax" }),
    row("EARLY", { timestamp: "2026-10-29T09:00:00Z" }),
  ];
  const result = analyze(records).rows;
  assert.equal(result[0].transaction_id, "EARLY");
  assert.equal(result[0].v_count, 1);
  assert.equal(result[1].v_count, 1);
  assert.equal(result[1].g_dist, 1);
  assert.equal(
    analyze([records[1], row("EDGE", { timestamp: "2026-10-29T09:30:00Z" })])
      .rows[1].v_count,
    2,
  );
});

test("a base score of exactly 0.50 does not cross the default threshold", () => {
  const result = analyze(
    Array.from({ length: 4 }, (_, i) =>
      row(`T${i}`, { amount_tnd: 2100, payment_method: "flouci" }),
    ),
  );
  assert.equal(result.rows[3].score, 0.5);
  assert.equal(result.rows[3].rule_alert, false);
  assert.equal(retune(result, 0.45).rows[3].rule_alert, true);
  assert.equal(result.rows[3].rule_alert, false);
});

test("fanin counts distinct senders and fanout counts distinct recipients", () => {
  const incoming = analyze([
    row("A", { user_id: "A" }),
    row("B", { user_id: "B" }),
    row("C", { user_id: "C" }),
  ]);
  assert.equal(incoming.rows[0].findings.includes("fan_in"), false);
  assert.equal(incoming.rows[2].findings.includes("fan_in"), true);
  const repeated = analyze([row("A"), row("B"), row("C")]);
  assert.equal(repeated.rows[2].findings.includes("fan_in"), false);
  assert.equal(repeated.rows[2].findings.includes("fan_out"), false);
  const outgoing = analyze([
    row("A", { recipient_id: "A" }),
    row("B", { recipient_id: "B" }),
    row("C", { recipient_id: "C" }),
  ]);
  assert.equal(outgoing.rows[2].findings.includes("fan_out"), true);
});

test("similar-amount bands and device reuse have explicit boundaries", () => {
  const structured = analyze([
    row("A", { amount_tnd: 1400 }),
    row("B", { amount_tnd: 1499.999 }),
    row("C", { amount_tnd: 1450 }),
    row("D", { amount_tnd: 1500 }),
  ]);
  assert.equal(structured.rows[2].findings.includes("structuring"), true);
  assert.equal(structured.rows[3].findings.includes("structuring"), false);
  const reused = analyze([
    row("A", { user_id: "A", device_id: "ONE" }),
    row("B", { user_id: "B", device_id: "ONE" }),
    row("C", { user_id: "C", device_id: "ONE" }),
  ]);
  assert.ok(reused.rows.every((r) => r.findings.includes("shared_device")));
  assert.equal(
    analyze([row("A"), row("B"), row("C")]).rows[2].findings.includes(
      "shared_device",
    ),
    false,
  );
});

test("cycles flag their component but not attached branches", () => {
  const records = [
    row("1", { user_id: "A", recipient_id: "B" }),
    row("2", { user_id: "B", recipient_id: "C" }),
    row("3", { user_id: "C", recipient_id: "A" }),
    row("4", { user_id: "D", recipient_id: "A" }),
  ];
  const result = analyze(records);
  assert.ok(result.rows.slice(0, 3).every((r) => r.findings.includes("cycle")));
  assert.equal(result.rows[3].findings.includes("cycle"), false);
  assert.equal(
    cycleMembership([row("self", { user_id: "A", recipient_id: "A" })]).size,
    0,
  );
});

test("network and customer-report reviews survive a threshold of 1", () => {
  const result = retune(analyze(scenario("scams")), 1);
  assert.equal(result.summary.ruleAlerts, 0);
  assert.ok(result.rows[2].review);
  assert.ok(result.rows[2].findings.includes("reported_scam"));
  assert.throws(() => retune(result, NaN), /Threshold/);
});

test("unlabeled imports do not claim precision or recall", () => {
  const result = analyze([row("A", { expected_fraud: null })]);
  assert.equal(result.summary.labeled, 0);
  assert.equal(result.summary.precision, null);
  assert.equal(result.summary.recall, null);
});

test("money totals use integer millimes", () => {
  assert.equal(
    analyze([row("A", { amount_tnd: 0.1 }), row("B", { amount_tnd: 0.2 })])
      .summary.amount,
    0.3,
  );
});

test("a 5000-payment chain and burst finish without recursive stack failures", () => {
  const chain = Array.from({ length: MAX_ROWS }, (_, i) =>
    row(`T${i}`, { user_id: `A${i}`, recipient_id: `A${i + 1}` }),
  );
  assert.equal(analyze(chain).summary.total, MAX_ROWS);
  assert.equal(
    analyze(chain.map((r) => ({ ...r, user_id: "SINGLE" }))).rows.at(-1)
      .v_count,
    MAX_ROWS,
  );
});

test("evidence digest is stable across key order and changes with content", async () => {
  const first = await evidence({ z: 1, a: { b: "text" } });
  const second = await evidence({ a: { b: "text" }, z: 1 });
  assert.equal(first.sha256, second.sha256);
  assert.equal(
    first.sha256,
    createHash("sha256").update(canonicalJSON(first.payload)).digest("hex"),
  );
  assert.notEqual(
    first.sha256,
    (await evidence({ ...first.payload, z: 2 })).sha256,
  );
});

test("CSV exports neutralize spreadsheet formulas and keep notes quoted", () => {
  const result = analyze([row("=DANGEROUS()", { user_id: "+FORMULA" })]);
  const reviews = new Map([
    [
      "=DANGEROUS()",
      { verdict: "needs_info", note: '@SUM(1,2)\nsecond line, "quoted"' },
    ],
  ]);
  const parsed = papa.parse(exportCSV(result.rows, reviews, papa), {
    header: true,
  }).data[0];
  assert.equal(parsed.transaction_id, "'=DANGEROUS()");
  assert.equal(parsed.user_id, "'+FORMULA");
  assert.equal(parsed.note, '\'@SUM(1,2)\nsecond line, "quoted"');
  assert.ok(exportCSV([], new Map(), papa).startsWith("transaction_id,"));
});

test("vendored open-source libraries match their checked-in hashes", () => {
  const manifest = JSON.parse(
    readFileSync(new URL("../vendor/manifest.json", import.meta.url)),
  );
  for (const dependency of manifest) {
    const bytes = readFileSync(
      new URL(`../vendor/${dependency.name}.min.js`, import.meta.url),
    );
    assert.equal(
      createHash("sha256").update(bytes).digest("hex"),
      dependency.sha256,
    );
    assert.match(
      readFileSync(
        new URL(`../vendor/${dependency.name}.LICENSE`, import.meta.url),
        "utf8",
      ),
      /MIT/,
    );
  }
});
