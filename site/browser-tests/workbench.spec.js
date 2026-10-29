import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { canonicalJSON } from "../investigation.js";

test("desktop investigation, graph, decisions, rule lab and research", async ({
  page,
}, testInfo) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1440, height: 1050 });
  await page.goto("/workbench.html");
  await expect(page.locator("#stats")).toContainText("32");
  await expect(page.locator("#payments tr")).toHaveCount(14);
  await expect(page.locator("#network canvas").first()).toBeVisible();
  await expect(page.locator("#notice.error")).toHaveCount(0);
  expect((await page.locator("#queue").boundingBox()).y).toBeLessThan(550);
  await page.screenshot({
    path: testInfo.outputPath("desk-desktop.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: /Follow the money/ }).click();
  await expect(page.locator("#graph-caption")).toContainText("accounts");
  await expect(page.locator("#case-detail")).toContainText("Shared");
  await page
    .getByLabel("Analyst note")
    .fill("Checked the shared device. Request source-of-funds context.");
  await page.getByRole("button", { name: "Need context", exact: true }).click();
  await expect(page.locator("#case-detail")).toContainText("Decision recorded");
  await expect(page.locator("#stats")).toContainText("ANALYST DECISIONS1");
  await page
    .getByRole("button", { name: "Save on this device", exact: true })
    .click();
  await page.reload();
  await expect(page.locator("#notice")).toContainText("Restored");
  await expect(page.getByLabel("Analyst note")).toHaveValue(
    "Checked the shared device. Request source-of-funds context.",
  );
  await page.getByRole("button", { name: "Rule lab", exact: true }).click();
  await page.getByLabel("Base-rule threshold").focus();
  await page.getByLabel("Base-rule threshold").press("End");
  await expect(page.locator("#threshold-value")).toHaveText("1.00");
  await expect(page.locator("#lab-metrics")).toContainText("0base-rule alerts");
  await page.screenshot({
    path: testInfo.outputPath("rule-lab.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: "Field notes", exact: true }).click();
  await expect(page.locator("#view-method")).toContainText("20 OCT 2026");
  await page.getByRole("button", { name: "Investigate", exact: true }).click();
  await page
    .getByRole("button", { name: "Remove saved copy", exact: true })
    .click();
  await expect(page.locator("#saved-state")).toHaveText("Session only");
  expect(errors).toEqual([]);
});

test("CSV import, safe rendering, evidence integrity and workspace round trip", async ({
  page,
}) => {
  await page.goto("/workbench.html");
  const sampleDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "Sample CSV", exact: false }).click();
  const sample = await readFile(await (await sampleDownload).path());
  await page.locator("#import-file").setInputFiles({
    name: "sample.csv",
    mimeType: "text/csv",
    buffer: sample,
  });
  await page.locator("#search").fill("REPORT-3");
  await page
    .getByRole("button", { name: "Inspect REPORT-3", exact: true })
    .click();
  await expect(page.locator("#case-detail")).toContainText(
    "Customer-reported scam",
  );
  const csv =
    'transaction_id,user_id,recipient_id,amount_tnd,timestamp,governorate,payment_method,reported_scam\nLOCAL-1,"<img src=x onerror=alert(1)>",SHOP,2500.000,2026-10-29T10:00:00Z,Tunis,flouci,true';
  await page.locator("#import-file").setInputFiles({
    name: "local.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(csv),
  });
  await expect(page.locator("#payments tr")).toHaveCount(1);
  await expect(page.locator("#case-detail")).toContainText(
    "<img src=x onerror=alert(1)>",
  );
  await expect(page.locator("#case-detail img")).toHaveCount(0);
  await page.getByLabel("Analyst note").fill("Independent review recorded.");
  await page
    .getByRole("button", { name: "Confirm fraud", exact: true })
    .click();
  const caseDownload = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Evidence JSON", exact: false })
    .click();
  const caseFile = JSON.parse(
    await readFile(await (await caseDownload).path(), "utf8"),
  );
  expect(caseFile.sha256).toBe(
    createHash("sha256").update(canonicalJSON(caseFile.payload)).digest("hex"),
  );
  expect(caseFile.payload.analyst_review.verdict).toBe("confirmed");
  expect(caseFile.payload.data_contract).toEqual({
    id: "urn:amastan:payments:normalized:v1",
    version: "1.0.0",
  });
  const workspaceDownload = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Export workspace", exact: true })
    .click();
  const workspace = await readFile(
    await (await workspaceDownload).path(),
    "utf8",
  );
  expect(JSON.parse(workspace).payload.data_contract.version).toBe("1.0.0");
  await page.getByRole("button", { name: /A quiet morning/ }).click();
  await expect(page.locator("#payments tr")).toHaveCount(0);
  await page.locator("#import-file").setInputFiles({
    name: "workspace.json",
    mimeType: "application/json",
    buffer: Buffer.from(workspace),
  });
  await expect(page.locator("#notice")).toContainText("Integrity verified");
  await expect(page.locator("#case-detail")).toContainText("FRAUD");
  await expect(page.getByLabel("Analyst note")).toHaveValue(
    "Independent review recorded.",
  );
  const tampered = JSON.parse(workspace);
  tampered.payload.transactions[0].amount_tnd = 1;
  await page.locator("#import-file").setInputFiles({
    name: "tampered.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(tampered)),
  });
  await expect(page.locator("#notice.error")).toContainText(
    "Integrity check failed",
  );
  await expect(page.locator("#case-detail")).toContainText("2,500.000");
  await page.getByRole("button", { name: "Rule lab", exact: true }).click();
  await expect(page.locator("#benchmark")).toContainText(
    "No ground-truth labels supplied",
  );
});

test("mobile layout and original-demo entry point", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/index.html");
  await page.getByRole("link", { name: /Open the investigation desk/ }).click();
  await expect(
    page.getByRole("heading", { name: "Investigation desk", exact: true }),
  ).toBeVisible();
  await expect(page.locator("#payments tr")).toHaveCount(14);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: testInfo.outputPath("desk-mobile.png"),
    fullPage: true,
  });
  await page
    .getByRole("button", { name: /The payment was authorised/ })
    .click();
  await expect(page.locator("#case-detail")).toContainText(
    "Customer-reported scam",
  );
  await page.getByRole("button", { name: "Rule lab", exact: true }).click();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});

test("payment contract documentation and normalized record export", async ({
  page,
}, testInfo) => {
  await page.goto("/workbench.html");
  await page.getByRole("button", { name: "Field notes", exact: true }).click();
  await expect(page.locator("#contract-summary")).toContainText(
    "Payment contract 1.0.0 · ODCS v3.2.0",
  );
  const contractPage = page.waitForEvent("popup");
  await page
    .getByRole("link", { name: "Read the contract", exact: false })
    .click();
  const documentation = await contractPage;
  await expect(
    documentation
      .getByRole("heading", {
        name: "Amastan normalized payment batch",
        exact: true,
      })
      .first(),
  ).toBeVisible();
  await documentation.close();
  const download = page.waitForEvent("download");
  await page
    .getByRole("button", { name: /Export payment records for CLI/ })
    .click();
  const records = JSON.parse(
    await readFile(await (await download).path(), "utf8"),
  );
  expect(records).toHaveLength(32);
  expect(Object.keys(records[0])).toHaveLength(10);
  expect(records[0].timestamp).toMatch(/\.\d{3}Z$/);
  expect(typeof records[0].reported_scam).toBe("boolean");
  const schema = await page.request.get("/contracts/payments.schema.json");
  expect(schema.ok()).toBe(true);
  expect((await schema.json()).properties.amount_tnd.minimum).toBe(0.001);
  await page.screenshot({
    path: testInfo.outputPath("payment-contract.png"),
    fullPage: true,
  });
});
