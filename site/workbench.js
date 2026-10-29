import {
  analyze,
  retune,
  parseCSV,
  normalizeRows,
  networkElements,
  evidence,
  exportCSV,
  MAX_BYTES,
  REQUIRED,
  RULE_NAMES,
  RULE_WEIGHTS,
  FINDINGS,
} from "./investigation.js";
import { scenario, SCENARIOS } from "./scenarios.js";

const $ = (id) => document.getElementById(id);
const escape = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const amount = (n) =>
  new Intl.NumberFormat("en-TN", {
    minimumFractionDigits: 3,
    maximumFractionDigits: 3,
  }).format(n);
const clock = (stamp) =>
  new Date(stamp).toLocaleString("en-GB", {
    timeZone: "Africa/Tunis",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
const percent = (value) =>
  value === null ? "—" : `${Math.round(value * 100)}%`;
const VERDICTS = {
  pending: "Pending",
  confirmed: "Fraud",
  cleared: "Cleared",
  needs_info: "Context",
};
const STORAGE_KEY = "amastan.investigation.v1";
let analysis,
  data,
  selected,
  activeScenario = "mixed",
  sourceName = "Synthetic scenario",
  descending = true,
  graph,
  graphSignature = "",
  persist = false;
let reviews = new Map(),
  drafts = new Map();

function notice(message, error = false) {
  $("notice").textContent = message;
  $("notice").classList.toggle("error", error);
  $("notice").hidden = !message;
}

function download(content, name, type = "application/json") {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function payload() {
  return {
    format: "amastan-workspace",
    version: 1,
    source: sourceName,
    scenario: activeScenario,
    threshold: data.threshold,
    transactions: analysis.rows.map(
      ({
        transaction_id,
        user_id,
        recipient_id,
        amount_tnd,
        timestamp,
        governorate,
        payment_method,
        device_id,
        reported_scam,
        expected_fraud,
      }) => ({
        transaction_id,
        user_id,
        recipient_id,
        amount_tnd,
        timestamp,
        governorate,
        payment_method,
        device_id,
        reported_scam,
        expected_fraud,
      }),
    ),
    reviews: Array.from(reviews),
    exported_at: new Date().toISOString(),
  };
}

function saveDevice() {
  if (!persist) return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload()));
    $("saved-state").textContent = "Saved locally";
    $("forget-device").hidden = false;
  } catch {
    $("saved-state").textContent = "Not saved";
    notice(
      "Browser storage is unavailable or full. Export a workspace to keep your decisions.",
      true,
    );
  }
}

function validateWorkspace(value) {
  if (value?.format !== "amastan-workspace" || value.version !== 1)
    throw new Error("Unsupported workspace format");
  const rows = normalizeRows(value.transactions);
  const ids = new Set(rows.map((r) => r.transaction_id));
  if (!Array.isArray(value.reviews) || value.reviews.length > rows.length)
    throw new Error("Invalid workspace decisions");
  const restored = new Map();
  for (const pair of value.reviews) {
    if (!Array.isArray(pair) || pair.length !== 2)
      throw new Error("Invalid review entry");
    const [id, review] = pair;
    if (
      !ids.has(id) ||
      restored.has(id) ||
      !review ||
      !["confirmed", "cleared", "needs_info"].includes(review.verdict) ||
      typeof review.note !== "string" ||
      review.note.length > 2000 ||
      !Number.isFinite(Date.parse(review.updated_at))
    )
      throw new Error("Invalid review entry");
    if (!Array.isArray(review.history) || review.history.length > 20)
      throw new Error("Invalid review history");
    const history = review.history.map((entry) => {
      if (
        !["confirmed", "cleared", "needs_info"].includes(entry.verdict) ||
        typeof entry.note !== "string" ||
        entry.note.length > 2000 ||
        !Number.isFinite(Date.parse(entry.at))
      )
        throw new Error("Invalid review history entry");
      return {
        verdict: entry.verdict,
        note: entry.note,
        at: new Date(entry.at).toISOString(),
      };
    });
    restored.set(id, {
      verdict: review.verdict,
      note: review.note,
      updated_at: new Date(review.updated_at).toISOString(),
      history,
    });
  }
  const threshold = Number(value.threshold);
  if (!Number.isFinite(threshold) || threshold < 0 || threshold > 1)
    throw new Error("Invalid workspace threshold");
  return {
    rows,
    reviews: restored,
    threshold,
    source: String(value.source ?? "Restored workspace").slice(0, 160),
    scenario: Object.hasOwn(SCENARIOS, value.scenario) ? value.scenario : null,
  };
}

function loadRows(rows, options = {}) {
  const next = analyze(rows, options.threshold ?? 0.5);
  analysis = next;
  data = next;
  reviews = options.reviews ?? new Map();
  drafts = new Map();
  activeScenario = options.scenario ?? null;
  sourceName = options.source ?? "CSV import";
  $("search").value = "";
  $("filter").value = "review";
  $("threshold").value = Math.round(data.threshold * 100);
  selected = [...data.rows].sort((a, b) => b.priority - a.priority)[0]
    ?.transaction_id;
  graphSignature = "";
  render();
  saveDevice();
}

function loadScenario(name) {
  loadRows(scenario(name), {
    scenario: name,
    source: `Synthetic scenario: ${SCENARIOS[name].title}`,
  });
  notice("");
}

function viewRows() {
  const search = $("search").value.trim().toLowerCase(),
    filter = $("filter").value;
  return data.rows
    .filter((row) => {
      const review = reviews.get(row.transaction_id)?.verdict ?? "pending";
      const match = [
        row.transaction_id,
        row.user_id,
        row.recipient_id,
        row.governorate,
        row.device_id,
      ].some((s) => s.toLowerCase().includes(search));
      return (
        match &&
        (filter === "all" ||
          (filter === "review" && row.review) ||
          (filter === "pending" && row.review && review === "pending") ||
          filter === review)
      );
    })
    .sort((a, b) =>
      descending ? b.priority - a.priority : a.priority - b.priority,
    );
}

function renderQueue() {
  const rows = viewRows();
  $("payments").innerHTML = rows
    .slice(0, 250)
    .map((row) => {
      const verdict = reviews.get(row.transaction_id)?.verdict ?? "pending";
      return `<tr class="${row.transaction_id === selected ? "selected" : ""}"><td><button class="payment-link" data-case="${escape(row.transaction_id)}" aria-label="Inspect ${escape(row.transaction_id)}">${escape(row.transaction_id)}</button><span class="sub">${escape(row.user_id)} → ${escape(row.recipient_id)}</span></td><td>${amount(row.amount_tnd)}</td><td><span class="priority ${row.review ? "high" : ""}">${row.priority}</span></td><td><span class="verdict ${verdict}">${VERDICTS[verdict]}</span></td></tr>`;
    })
    .join("");
  $("empty").hidden = rows.length !== 0;
  $("queue-count").textContent = String(rows.length);
  $("queue-position").textContent =
    rows.length > 250
      ? `First 250 of ${rows.length.toLocaleString()}`
      : `${rows.length} payments`;
  $("sort-priority").textContent = `Priority ${descending ? "↓" : "↑"}`;
}

function renderStats() {
  const s = data.summary,
    reviewed = data.rows.filter((r) => reviews.has(r.transaction_id)).length;
  $("stats").innerHTML = [
    ["PAYMENTS ANALYSED", s.total, ""],
    ["NEED REVIEW", s.review, "red"],
    ["LINK / REPORT SIGNALS", s.networkFlags, ""],
    ["ANALYST DECISIONS", reviewed, ""],
    ["BATCH VALUE", amount(s.amount), "", "TND"],
  ]
    .map(
      ([label, value, kind, unit]) =>
        `<div class="stat"><span class="stat-label">${label}</span><span class="stat-value ${kind}">${value}</span>${unit ? `<small>${unit}</small>` : ""}</div>`,
    )
    .join("");
}

function relatedRows(row) {
  return data.rows.filter(
    (r) =>
      r.user_id === row.user_id ||
      r.recipient_id === row.user_id ||
      r.user_id === row.recipient_id ||
      r.recipient_id === row.recipient_id ||
      (row.device_id && r.device_id === row.device_id),
  );
}

function renderDetail() {
  const row = data.rows.find((r) => r.transaction_id === selected);
  if (!row) {
    $("case-detail").textContent = "Choose a payment to investigate.";
    return;
  }
  const review = reviews.get(selected),
    verdict = review?.verdict ?? "pending",
    note = drafts.get(selected) ?? review?.note ?? "";
  const timeline = relatedRows(row).slice(0, 30);
  const signals = [
    ...row.rules.map(
      (key) =>
        `<div class="signal"><strong>${RULE_NAMES[key]}</strong><p>${key === "velocity" ? `${row.v_count} payments by this sender in the 30-minute window.` : key === "travel" ? `${row.g_dist} distinct governorates in the 30-minute window.` : "Prototype review threshold crossed."} <span class="weight">+${RULE_WEIGHTS[key].toFixed(2)}</span></p></div>`,
    ),
    ...row.findings.map(
      (key) =>
        `<div class="signal network"><strong>${FINDINGS[key].title}</strong><p>${FINDINGS[key].detail}</p></div>`,
    ),
  ].join("");
  const history = (review?.history ?? []).slice().reverse();
  $("case-detail").innerHTML =
    `<div class="case-top"><p class="eyebrow">03 / CASE FILE <span>${VERDICTS[verdict].toUpperCase()}</span></p><h2>${escape(row.transaction_id)}</h2><p>${escape(row.user_id)} → ${escape(row.recipient_id)}</p></div><div class="case-body"><div class="case-amount">${amount(row.amount_tnd)} <small>TND</small></div><dl class="case-meta"><div><dt>Recorded payment</dt><dd>${clock(row.timestamp)} · Tunis</dd></div><div><dt>Governorate / method</dt><dd>${escape(row.governorate)} / ${escape(row.payment_method)}</dd></div><div><dt>Base rule score</dt><dd>${row.score.toFixed(2)} / 1.00</dd></div><div><dt>Device</dt><dd>${escape(row.device_id || "Not supplied")}</dd></div></dl><div><h3>${row.rules.length + row.findings.length} explainable signals</h3>${signals || '<p class="small">No prototype signal was triggered. That does not establish that this payment is legitimate.</p>'}</div><div><h3>Record your decision</h3><label class="note-label" for="case-note">Analyst note</label><textarea id="case-note" maxlength="2000" placeholder="What did you check? What context is missing?"></textarea><div class="saved-note" hidden><strong>Recorded analyst note</strong><p>${escape(review?.note || "No note recorded.")}</p></div><div class="decision-actions"><button data-verdict="confirmed">Confirm fraud</button><button data-verdict="cleared">Clear payment</button><button data-verdict="needs_info">Need context</button></div><p class="case-save-state">${review ? `Decision recorded ${clock(review.updated_at)}. ${persist ? "Saved on this device." : "In this browser session."}` : "Draft notes are recorded when you choose a decision. Session only until saved or exported."}</p><div class="case-tools"><button id="export-case" class="text-button">Evidence JSON ↓</button><button id="print-case" class="text-button">Print case brief</button></div>${history.length ? `<h3>Decision history</h3><ol class="timeline">${history.map((entry) => `<li><time>${clock(entry.at)} · Tunis</time>${VERDICTS[entry.verdict]}${entry.note ? ` · ${escape(entry.note)}` : ""}</li>`).join("")}</ol>` : ""}</div><div><h3>Connected payment timeline</h3><ol class="timeline">${timeline.map((r) => `<li><time>${clock(r.timestamp)} · Tunis</time><a href="#queue" data-case="${escape(r.transaction_id)}">${escape(r.user_id)} → ${escape(r.recipient_id)}</a><br>${amount(r.amount_tnd)} TND${r.transaction_id === selected ? " · selected" : ""}</li>`).join("")}</ol>${relatedRows(row).length > 30 ? '<p class="small">First 30 related payments shown. Search the queue for more.</p>' : ""}</div></div>`;
  $("case-note").value = note;
  $("case-note").addEventListener("input", (event) =>
    drafts.set(selected, event.target.value),
  );
  $("export-case").addEventListener("click", () =>
    exportCase().catch((error) =>
      notice(`Export failed: ${error.message}`, true),
    ),
  );
  $("print-case").addEventListener("click", () => window.print());
}

function renderGraph() {
  const row = data.rows.find((r) => r.transaction_id === selected);
  if (!row) return;
  const signature = `${selected}:${analysis.rows.length}:${sourceName}`;
  if (signature === graphSignature) return;
  graphSignature = signature;
  const accounts = new Set([row.user_id, row.recipient_id]);
  let changed = true;
  while (changed && accounts.size < 100) {
    changed = false;
    for (const r of data.rows) {
      if (accounts.has(r.user_id) || accounts.has(r.recipient_id)) {
        for (const id of [r.user_id, r.recipient_id])
          if (!accounts.has(id) && accounts.size < 100) {
            accounts.add(id);
            changed = true;
          }
      }
    }
  }
  const connected = data.rows.filter(
    (r) => accounts.has(r.user_id) && accounts.has(r.recipient_id),
  );
  const shown = [
    row,
    ...connected.filter((r) => r.transaction_id !== selected),
  ].slice(0, 250);
  graph?.destroy();
  graph = globalThis.cytoscape({
    container: $("network"),
    elements: networkElements(shown),
    minZoom: 0.2,
    maxZoom: 3,
    wheelSensitivity: 0.2,
    layout: {
      name: "breadthfirst",
      directed: false,
      roots: [`a:${row.user_id}`],
      padding: 35,
      spacingFactor: 1.1,
      animate: false,
    },
    style: [
      {
        selector: "node",
        style: {
          "background-color": "#a3b8ac",
          label: "data(label)",
          "font-size": 8,
          "font-family": "JetBrains Mono, monospace",
          color: "#31453a",
          "text-valign": "bottom",
          "text-margin-y": 7,
          "text-wrap": "ellipsis",
          "text-max-width": 85,
          width: 17,
          height: 17,
          "border-width": 3,
          "border-color": "#f5f8f3",
        },
      },
      {
        selector: "edge",
        style: {
          width: 1.5,
          "line-color": "#c4cfc4",
          "target-arrow-color": "#9eb19f",
          "target-arrow-shape": "triangle",
          "curve-style": "bezier",
          "arrow-scale": 0.7,
        },
      },
      {
        selector: ".sender",
        style: {
          "background-color": "#b83d38",
          color: "#8d302b",
          width: 25,
          height: 25,
          "font-weight": "bold",
        },
      },
      {
        selector: ".recipient",
        style: {
          "background-color": "#315e9d",
          color: "#315e9d",
          width: 23,
          height: 23,
        },
      },
      {
        selector: ".selected-payment",
        style: {
          "line-color": "#b83d38",
          "target-arrow-color": "#b83d38",
          width: 2.7,
        },
      },
    ],
  });
  graph.getElementById(`a:${row.user_id}`).addClass("sender");
  graph.getElementById(`a:${row.recipient_id}`).addClass("recipient");
  graph.getElementById(`t:${row.transaction_id}`).addClass("selected-payment");
  graph.on("tap", "node", (event) => {
    $("search").value = event.target.data("label");
    $("filter").value = "all";
    renderQueue();
  });
  graph.on("tap", "edge", (event) =>
    selectCase(event.target.data("transaction_id")),
  );
  $("graph-caption").textContent =
    `${graph.nodes().length} accounts · ${shown.length} payments${accounts.size >= 100 || connected.length > 250 ? " · display limited" : ""}`;
}

function renderLab() {
  const s = data.summary,
    baseline = retune(analysis, 0.5).summary;
  $("threshold-value").textContent = data.threshold.toFixed(2);
  $("lab-metrics").innerHTML =
    `<div><strong>${s.ruleAlerts}</strong><span class="small">base-rule alerts</span></div><div><strong>${s.review}</strong><span class="small">total to review</span></div><div><strong>${s.review - baseline.review >= 0 ? "+" : ""}${s.review - baseline.review}</strong><span class="small">vs. default</span></div>`;
  const bins = Array(11).fill(0);
  for (const row of data.rows) bins[Math.round(row.score * 10)]++;
  const max = Math.max(...bins, 1);
  $("histogram").innerHTML = bins
    .map(
      (count, index) =>
        `<div class="bar ${index / 10 > data.threshold ? "cross" : ""}" style="height:${Math.max(1, (count / max) * 90)}%" title="Score ${(index / 10).toFixed(1)}: ${count} payments"><span>${count || ""}</span></div>`,
    )
    .join("");
  $("benchmark").innerHTML = s.labeled
    ? `<h3>Against ${s.labeled} supplied labels</h3><div class="metric-row"><div><strong>${percent(s.precision)}</strong><span>Precision</span></div><div><strong>${percent(s.recall)}</strong><span>Recall</span></div><div><strong>${s.fp}</strong><span>False positives</span></div><div><strong>${s.fn}</strong><span>Missed labels</span></div></div><p class="small">${activeScenario ? "Synthetic scenario labels only." : "Uses the expected_fraud column supplied in this import."} These figures are not production model accuracy. Analyst verdicts do not rewrite the supplied labels.</p>`
    : "<h3>No ground-truth labels supplied</h3><p>Review volume is measurable. Precision and recall require known outcomes, so they are not estimated for this import.</p>";
}

function render() {
  $("scenario-list").innerHTML = Object.entries(SCENARIOS)
    .map(
      ([key, value], i) =>
        `<button class="scenario" data-scenario="${key}" aria-pressed="${key === activeScenario}"><span>0${i + 1} / ${key === "clean" ? "CONTROL" : "CASE STUDY"}</span><strong>${value.title}</strong></button>`,
    )
    .join("");
  $("scenario-story").textContent = activeScenario
    ? SCENARIOS[activeScenario].story
    : `Imported workspace · ${sourceName}. Prototype signals require human review.`;
  $("data-origin").textContent = sourceName;
  renderStats();
  renderQueue();
  renderDetail();
  renderGraph();
  renderLab();
}

function selectCase(id) {
  if (!data.rows.some((r) => r.transaction_id === id)) return;
  selected = id;
  renderQueue();
  renderDetail();
  renderGraph();
}

async function exportCase() {
  const row = data.rows.find((r) => r.transaction_id === selected);
  const bundle = await evidence({
    format: "amastan-case",
    version: 1,
    source: sourceName,
    threshold: data.threshold,
    transaction: row,
    analyst_review: reviews.get(selected) ?? null,
    connected_payments: relatedRows(row),
    rule_weights: RULE_WEIGHTS,
    analysis_window_minutes: 30,
    graph_scope: "complete batch",
    exported_at: new Date().toISOString(),
    interpretation:
      "Prototype signals for human investigation. Hash verifies exported content integrity, not provenance or compliance.",
  });
  download(JSON.stringify(bundle, null, 2), "amastan-case.json");
  notice(`Case evidence exported. SHA-256 ${bundle.sha256.slice(0, 16)}…`);
}

async function importFile(file) {
  const json = file.name.toLowerCase().endsWith(".json");
  if (file.size > (json ? 20_000_000 : MAX_BYTES))
    throw new Error(json ? "Workspace exceeds 20 MB" : "CSV exceeds 2 MB");
  const text = await file.text();
  if (!json) {
    const rows = parseCSV(text);
    loadRows(rows, { source: file.name });
    notice(
      `Analysed ${rows.length.toLocaleString()} payments locally. Nothing was uploaded.`,
    );
    return;
  }
  const envelope = JSON.parse(text);
  if (
    !envelope ||
    typeof envelope.sha256 !== "string" ||
    !envelope.payload ||
    envelope.algorithm !== "SHA-256" ||
    envelope.canonicalization !== "Amastan sorted JSON v1"
  )
    throw new Error(
      "Expected an integrity-checked workspace or case export from this desk",
    );
  const checked = await evidence(envelope.payload);
  if (checked.sha256 !== envelope.sha256)
    throw new Error(
      "Integrity check failed. This file changed after export; current workspace was kept.",
    );
  if (envelope.payload.format === "amastan-case") {
    notice(
      "Case file integrity verified. Import a full workspace export to restore payments and decisions.",
    );
    return;
  }
  const restored = validateWorkspace(envelope.payload);
  loadRows(restored.rows, restored);
  notice(
    `Workspace restored: ${restored.rows.length} payments and ${restored.reviews.size} decisions. Integrity verified.`,
  );
}

function wire() {
  $("scenario-list").addEventListener("click", (event) => {
    const button = event.target.closest("[data-scenario]");
    if (button) loadScenario(button.dataset.scenario);
  });
  document.addEventListener("click", (event) => {
    const choice = event.target.closest("[data-case]");
    if (choice) {
      event.preventDefault();
      selectCase(choice.dataset.case);
    }
    const decision = event.target.closest("[data-verdict]");
    if (decision) {
      const verdict = decision.dataset.verdict,
        note = $("case-note").value.trim(),
        at = new Date().toISOString(),
        previous = reviews.get(selected);
      reviews.set(selected, {
        verdict,
        note,
        updated_at: at,
        history: [...(previous?.history ?? []), { verdict, note, at }].slice(
          -20,
        ),
      });
      drafts.delete(selected);
      renderStats();
      renderQueue();
      renderDetail();
      saveDevice();
      notice(
        `Decision recorded for ${selected}. ${persist ? "Saved on this device." : "Export or save the workspace to keep it after closing this page."}`,
      );
    }
    const view = event.target.closest("[data-view]");
    if (view) {
      for (const item of document.querySelectorAll("[data-view]"))
        item.setAttribute("aria-pressed", String(item === view));
      for (const name of ["desk", "lab", "method"])
        $(`view-${name}`).hidden = name !== view.dataset.view;
      if (view.dataset.view === "desk") {
        graph?.resize();
        graph?.fit(undefined, 30);
      }
    }
  });
  $("search").addEventListener("input", renderQueue);
  $("filter").addEventListener("change", renderQueue);
  $("sort-priority").addEventListener("click", () => {
    descending = !descending;
    renderQueue();
  });
  $("threshold").addEventListener("input", (event) => {
    data = retune(analysis, Number(event.target.value) / 100);
    renderStats();
    renderQueue();
    renderDetail();
    renderLab();
    saveDevice();
  });
  $("reset-threshold").addEventListener("click", () => {
    $("threshold").value = 50;
    $("threshold").dispatchEvent(new Event("input"));
  });
  $("sample").addEventListener("click", () =>
    download(
      globalThis.Papa.unparse(
        {
          fields: [...REQUIRED, "device_id", "reported_scam", "expected_fraud"],
          data: scenario("mixed"),
        },
        { escapeFormulae: true },
      ),
      "amastan-sample.csv",
      "text/csv;charset=utf-8",
    ),
  );
  $("export-csv").addEventListener("click", () =>
    download(
      exportCSV(viewRows(), reviews),
      "amastan-review.csv",
      "text/csv;charset=utf-8",
    ),
  );
  $("export-workspace").addEventListener("click", async () => {
    try {
      const bundle = await evidence(payload());
      download(JSON.stringify(bundle, null, 2), "amastan-workspace.json");
      notice(
        `Workspace exported with ${reviews.size} decisions and a SHA-256 integrity digest.`,
      );
    } catch (error) {
      notice(`Export failed: ${error.message}`, true);
    }
  });
  $("import-file").addEventListener("change", async (event) => {
    const file = event.target.files[0];
    if (!file) return;
    try {
      await importFile(file);
    } catch (error) {
      notice(`Import rejected: ${error.message}`, true);
    } finally {
      event.target.value = "";
    }
  });
  $("save-device").addEventListener("click", () => {
    persist = true;
    saveDevice();
    renderDetail();
  });
  $("forget-device").addEventListener("click", () => {
    try {
      localStorage.removeItem(STORAGE_KEY);
      persist = false;
      $("saved-state").textContent = "Session only";
      $("forget-device").hidden = true;
      renderDetail();
      notice("Saved browser copy removed. The current session is still open.");
    } catch {
      notice("Browser storage could not be accessed.", true);
    }
  });
  $("graph-fit").addEventListener("click", () => graph?.fit(undefined, 30));
  $("graph-reset").addEventListener("click", () => {
    $("search").value = "";
    $("filter").value = "review";
    renderQueue();
  });
  $("graph-export").addEventListener("click", () => {
    if (!graph) return;
    const link = document.createElement("a");
    link.href = graph.png({
      full: true,
      bg: "#f8faf5",
      maxWidth: 2400,
      maxHeight: 1800,
    });
    link.download = "amastan-account-network.png";
    link.click();
  });
}

function start() {
  try {
    if (!globalThis.Papa || !globalThis.cytoscape)
      throw new Error(
        "A bundled library failed to load. Reload the page to retry.",
      );
    $("rule-reference").innerHTML = Object.entries(RULE_NAMES)
      .map(
        ([key, name]) =>
          `<div class="rule-tile"><strong>+${RULE_WEIGHTS[key].toFixed(2)}</strong>${name}</div>`,
      )
      .join("");
    $("method-signals").innerHTML = Object.values(FINDINGS)
      .map((f) => `<dt>${f.title}</dt><dd>${f.detail}</dd>`)
      .join("");
    wire();
    let saved = null;
    try {
      saved = localStorage.getItem(STORAGE_KEY);
    } catch {
      saved = null;
    }
    if (saved) {
      try {
        const restored = validateWorkspace(JSON.parse(saved));
        persist = true;
        loadRows(restored.rows, restored);
        notice("Restored the workspace saved on this device.");
        return;
      } catch {
        loadScenario("mixed");
        notice(
          "The saved browser copy could not be restored. A fresh synthetic scenario is open.",
          true,
        );
        return;
      }
    }
    loadScenario("mixed");
  } catch (error) {
    notice(error.message, true);
  }
}

if (document.readyState === "loading")
  document.addEventListener("DOMContentLoaded", start, { once: true });
else start();
