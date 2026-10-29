/** Write normalized synthetic fixtures. Run: node scripts/generate_contract_fixtures.mjs. */
import { mkdir, writeFile } from "node:fs/promises";
import { normalizeRows } from "../site/investigation.js";
import { scenario, SCENARIOS } from "../site/scenarios.js";

await mkdir("data/contract/scenarios", { recursive: true });
for (const name of Object.keys(SCENARIOS)) {
  const rows = normalizeRows(scenario(name));
  const text = JSON.stringify(rows, null, 2) + "\n";
  await writeFile(`data/contract/scenarios/${name}.json`, text);
  if (name === "mixed") await writeFile("data/contract/payments.json", text);
}
console.log(
  "Generated six normalized synthetic payment batches in data/contract.",
);
