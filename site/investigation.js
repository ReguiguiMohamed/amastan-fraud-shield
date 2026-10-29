import { score, WEIGHTS, ALERT } from "./rules.js";

export const MAX_ROWS = 5000;
export const MAX_BYTES = 2_000_000;
export const WINDOW_MS = 30 * 60 * 1000;
export const REQUIRED = [
  "transaction_id",
  "user_id",
  "recipient_id",
  "amount_tnd",
  "timestamp",
  "governorate",
  "payment_method",
];
export const GOVERNORATES = [
  "Tunis",
  "Ariana",
  "Ben Arous",
  "Manouba",
  "Bizerte",
  "Nabeul",
  "Zaghouan",
  "Béja",
  "Jendouba",
  "Le Kef",
  "Siliana",
  "Sousse",
  "Monastir",
  "Mahdia",
  "Kairouan",
  "Kasserine",
  "Sidi Bouzid",
  "Sfax",
  "Gafsa",
  "Tozeur",
  "Kébili",
  "Gabès",
  "Médenine",
  "Tataouine",
];
export const RULE_NAMES = {
  velocity: "More than 3 payments in 30 minutes",
  travel: "Multiple governorates in 30 minutes",
  high_value: "Amount above 15,000 TND",
  d17_limit: "Flouci amount above 2,000 TND",
};
export const FINDINGS = {
  fan_in: {
    title: "Shared beneficiary",
    detail:
      "This recipient received payments from at least 3 distinct accounts in the preceding 30 minutes, including this payment.",
  },
  fan_out: {
    title: "Rapid dispersal",
    detail:
      "This sender paid at least 3 different recipients in the preceding 30 minutes, including this payment.",
  },
  structuring: {
    title: "Repeated similar amounts",
    detail:
      "At least 3 payments from this sender fall between 1,400 and 1,500 TND in 30 minutes. This is a demo pattern, not a statutory threshold.",
  },
  shared_device: {
    title: "Shared device",
    detail:
      "At least 3 sender accounts in this batch use this device. Shared access can also be legitimate.",
  },
  cycle: {
    title: "Circular transfers",
    detail:
      "These accounts form a directed cycle in the complete imported batch. This is a retrospective graph finding, not proof of laundering.",
  },
  reported_scam: {
    title: "Customer-reported scam",
    detail:
      "The input explicitly marks this payment as reported by a customer. The system did not infer manipulation from transaction amounts.",
  },
};

function identifier(value, name, optional = false) {
  if (value !== undefined && value !== null && typeof value !== "string")
    throw new Error(`${name} must be a string`);
  const text = String(value ?? "").trim();
  if (
    (!optional && !text) ||
    text.length > 80 ||
    /[\u0000-\u001f\u007f]/u.test(text)
  )
    throw new Error(`${name} must contain 1–80 printable characters`);
  return text;
}

function boolean(value, name, optional = false) {
  if (value === "" || value === undefined || value === null)
    return optional ? null : false;
  if (value === true || String(value).toLowerCase() === "true") return true;
  if (value === false || String(value).toLowerCase() === "false") return false;
  throw new Error(`${name} must be true or false`);
}

export function normalizeRows(records) {
  if (
    !Array.isArray(records) ||
    records.length < 1 ||
    records.length > MAX_ROWS
  )
    throw new Error(`Provide 1–${MAX_ROWS.toLocaleString()} transactions`);
  const ids = new Set();
  return records.map((raw, index) => {
    try {
      if (!raw || typeof raw !== "object")
        throw new Error("Expected a transaction object");
      const row = Object.fromEntries(
        ["transaction_id", "user_id", "recipient_id"].map((key) => [
          key,
          identifier(raw[key], key),
        ]),
      );
      if (ids.has(row.transaction_id))
        throw new Error(`Duplicate transaction_id: ${row.transaction_id}`);
      ids.add(row.transaction_id);
      const amount = Number(raw.amount_tnd);
      if (
        !["number", "string"].includes(typeof raw.amount_tnd) ||
        (typeof raw.amount_tnd === "string" &&
          !/^\d+(?:\.\d{1,3})?$/.test(raw.amount_tnd.trim())) ||
        !Number.isFinite(amount) ||
        amount <= 0 ||
        amount > 100_000_000 ||
        Math.abs(amount * 1000 - Math.round(amount * 1000)) > 0.0001
      )
        throw new Error(
          "amount_tnd must be positive, at most 100,000,000 and have at most 3 decimal places",
        );
      const timestamp = String(raw.timestamp ?? "");
      if (
        !/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(
          timestamp,
        ) ||
        !Number.isFinite(Date.parse(timestamp))
      )
        throw new Error(
          "timestamp must be ISO 8601 with seconds and a timezone",
        );
      const date = new Date(`${timestamp.slice(0, 10)}T00:00:00Z`);
      if (date.toISOString().slice(0, 10) !== timestamp.slice(0, 10))
        throw new Error("timestamp contains an invalid calendar date");
      const governorate = GOVERNORATES.find(
        (g) => g.toLowerCase() === String(raw.governorate).trim().toLowerCase(),
      );
      if (!governorate)
        throw new Error("governorate must be one of Tunisia's 24 governorates");
      const payment_method = String(raw.payment_method ?? "")
        .trim()
        .toLowerCase();
      if (
        ![
          "card",
          "flouci",
          "d17",
          "edinar",
          "konnect",
          "bank_transfer",
        ].includes(payment_method)
      )
        throw new Error("Unknown payment_method");
      return {
        ...row,
        amount_tnd: Math.round(amount * 1000) / 1000,
        timestamp: new Date(timestamp).toISOString(),
        governorate,
        payment_method,
        device_id: identifier(raw.device_id, "device_id", true),
        reported_scam: boolean(raw.reported_scam, "reported_scam"),
        expected_fraud: boolean(raw.expected_fraud, "expected_fraud", true),
      };
    } catch (error) {
      throw new Error(`Row ${index + 2}: ${error.message}`);
    }
  });
}

export function parseCSV(text, papa = globalThis.Papa) {
  if (new TextEncoder().encode(text).byteLength > MAX_BYTES)
    throw new Error("CSV is larger than 2 MB");
  const parsed = papa.parse(text, {
    header: true,
    skipEmptyLines: "greedy",
    transformHeader: (h) =>
      h
        .replace(/^\uFEFF/, "")
        .trim()
        .toLowerCase(),
    preview: MAX_ROWS + 1,
  });
  if (parsed.errors.length) throw new Error(`CSV: ${parsed.errors[0].message}`);
  if (Object.keys(parsed.meta.renamedHeaders ?? {}).length)
    throw new Error("CSV has duplicate column names");
  const missing = REQUIRED.filter((key) => !parsed.meta.fields?.includes(key));
  if (missing.length) throw new Error(`Missing columns: ${missing.join(", ")}`);
  return normalizeRows(parsed.data);
}

export function networkElements(rows) {
  const accounts = new Set(rows.flatMap((r) => [r.user_id, r.recipient_id]));
  return [
    ...Array.from(accounts, (id) => ({ data: { id: `a:${id}`, label: id } })),
    ...rows.map((r) => ({
      data: {
        id: `t:${r.transaction_id}`,
        source: `a:${r.user_id}`,
        target: `a:${r.recipient_id}`,
        transaction_id: r.transaction_id,
        amount: r.amount_tnd,
      },
    })),
  ];
}

export function cycleMembership(rows) {
  const forward = new Map(),
    reverse = new Map();
  for (const { user_id: a, recipient_id: b } of rows) {
    for (const map of [forward, reverse])
      for (const id of [a, b]) if (!map.has(id)) map.set(id, []);
    forward.get(a).push(b);
    reverse.get(b).push(a);
  }
  const visited = new Set(),
    finished = [];
  // Explicit stacks keep long payment chains within browser call-stack limits.
  for (const root of forward.keys()) {
    const stack = [[root, false]];
    while (stack.length) {
      const [id, expanded] = stack.pop();
      if (expanded) {
        finished.push(id);
        continue;
      }
      if (visited.has(id)) continue;
      visited.add(id);
      stack.push([id, true]);
      for (const next of forward.get(id))
        if (!visited.has(next)) stack.push([next, false]);
    }
  }
  visited.clear();
  const membership = new Map();
  for (const root of finished.reverse()) {
    if (visited.has(root)) continue;
    const group = new Set(),
      stack = [root];
    visited.add(root);
    while (stack.length) {
      const id = stack.pop();
      group.add(id);
      for (const next of reverse.get(id))
        if (!visited.has(next)) {
          visited.add(next);
          stack.push(next);
        }
    }
    if (group.size > 1) for (const id of group) membership.set(id, group);
  }
  return membership;
}

export function analyze(records, threshold = ALERT) {
  if (!Number.isFinite(threshold) || threshold < 0 || threshold > 1)
    throw new Error("Threshold must be between 0 and 1");
  const rows = normalizeRows(records).sort(
    (a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp),
  );
  const devices = new Map();
  for (const row of rows) {
    if (!row.device_id) continue;
    if (!devices.has(row.device_id)) devices.set(row.device_id, new Set());
    devices.get(row.device_id).add(row.user_id);
  }
  const cycleGroups = cycleMembership(rows);
  const times = new Map(
    rows.map((r) => [r.transaction_id, Date.parse(r.timestamp)]),
  );
  const senders = new Map(),
    recipients = new Map();
  const results = rows.map((row) => {
    const cutoff = times.get(row.transaction_id) - WINDOW_MS;
    const recent = (map, key) => {
      if (!map.has(key))
        map.set(key, {
          history: [],
          head: 0,
          band: 0,
          governorate: new Map(),
          recipient_id: new Map(),
          user_id: new Map(),
        });
      const state = map.get(key);
      const count = (item, delta) => {
        for (const field of ["governorate", "recipient_id", "user_id"]) {
          const n = (state[field].get(item[field]) ?? 0) + delta;
          if (n) state[field].set(item[field], n);
          else state[field].delete(item[field]);
        }
        if (item.amount_tnd >= 1400 && item.amount_tnd < 1500)
          state.band += delta;
      };
      while (
        state.head < state.history.length &&
        times.get(state.history[state.head].transaction_id) < cutoff
      )
        count(state.history[state.head++], -1);
      state.history.push(row);
      count(row, 1);
      return state;
    };
    const sent = recent(senders, row.user_id),
      received = recent(recipients, row.recipient_id);
    const v_count = sent.history.length - sent.head,
      g_dist = sent.governorate.size;
    const base = score({
      amount: row.amount_tnd,
      method: row.payment_method,
      v_count,
      g_dist,
    });
    const findings = [];
    if (received.user_id.size >= 3) findings.push("fan_in");
    if (sent.recipient_id.size >= 3) findings.push("fan_out");
    if (row.amount_tnd >= 1400 && row.amount_tnd < 1500 && sent.band >= 3)
      findings.push("structuring");
    if (row.device_id && devices.get(row.device_id).size >= 3)
      findings.push("shared_device");
    if (cycleGroups.get(row.user_id)?.has(row.recipient_id))
      findings.push("cycle");
    if (row.reported_scam) findings.push("reported_scam");
    const rules = Object.keys(base.hits).filter((key) => base.hits[key]);
    return {
      ...row,
      v_count,
      g_dist,
      score: base.total,
      rules,
      findings,
      rule_alert: base.total > threshold,
      review: base.total > threshold || findings.length > 0,
      priority: Math.min(
        100,
        Math.round(base.total * 100 + findings.length * 12),
      ),
    };
  });
  return summarize(results, threshold);
}

function summarize(results, threshold) {
  const expected = results.filter((r) => r.expected_fraud !== null);
  const tp = expected.filter((r) => r.review && r.expected_fraud).length;
  const fp = expected.filter((r) => r.review && !r.expected_fraud).length;
  const fn = expected.filter((r) => !r.review && r.expected_fraud).length;
  return {
    rows: results,
    threshold,
    summary: {
      total: results.length,
      review: results.filter((r) => r.review).length,
      ruleAlerts: results.filter((r) => r.rule_alert).length,
      networkFlags: results.filter((r) => r.findings.length).length,
      amount:
        results.reduce((sum, r) => sum + Math.round(r.amount_tnd * 1000), 0) /
        1000,
      accounts: new Set(results.flatMap((r) => [r.user_id, r.recipient_id]))
        .size,
      labeled: expected.length,
      tp,
      fp,
      fn,
      precision: tp + fp ? tp / (tp + fp) : null,
      recall: tp + fn ? tp / (tp + fn) : null,
    },
  };
}

export function retune(analysis, threshold) {
  if (!Number.isFinite(threshold) || threshold < 0 || threshold > 1)
    throw new Error("Threshold must be between 0 and 1");
  return summarize(
    analysis.rows.map((r) => ({
      ...r,
      rule_alert: r.score > threshold,
      review: r.score > threshold || r.findings.length > 0,
    })),
    threshold,
  );
}

export function canonicalJSON(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJSON).join(",")}]`;
  if (value && typeof value === "object")
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJSON(value[key])}`)
      .join(",")}}`;
  return JSON.stringify(value);
}

export async function evidence(payload) {
  const bytes = new TextEncoder().encode(canonicalJSON(payload));
  const hash = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return {
    algorithm: "SHA-256",
    canonicalization: "Amastan sorted JSON v1",
    sha256: Array.from(new Uint8Array(hash), (b) =>
      b.toString(16).padStart(2, "0"),
    ).join(""),
    payload,
  };
}

export function exportCSV(rows, reviews = new Map(), papa = globalThis.Papa) {
  const fields = [
    ...REQUIRED,
    "device_id",
    "reported_scam",
    "expected_fraud",
    "score",
    "review",
    "signals",
    "verdict",
    "note",
  ];
  const data = rows.map((r) => ({
    transaction_id: r.transaction_id,
    user_id: r.user_id,
    recipient_id: r.recipient_id,
    amount_tnd: r.amount_tnd.toFixed(3),
    timestamp: r.timestamp,
    governorate: r.governorate,
    payment_method: r.payment_method,
    device_id: r.device_id,
    reported_scam: r.reported_scam,
    expected_fraud: r.expected_fraud,
    score: r.score.toFixed(2),
    review: r.review,
    signals: [...r.rules, ...r.findings].join(" | "),
    verdict: reviews.get(r.transaction_id)?.verdict ?? "pending",
    note: reviews.get(r.transaction_id)?.note ?? "",
  }));
  // A prefix-only pattern also covers multiline notes beginning with a formula.
  return papa.unparse(
    { fields, data },
    { escapeFormulae: /^[\t\r\n=+\-@]|^\s+[=+\-@]/ },
  );
}

export const RULE_WEIGHTS = WEIGHTS;
