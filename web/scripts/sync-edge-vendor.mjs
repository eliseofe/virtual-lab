// The Experiment MCP edge function must validate Experiments exactly as the
// browser does, but its Supabase bundle has to be self-contained. It therefore
// carries byte-identical copies of the browser compilers and runtime contract.
// This script is the single list of those copies.
//
//   node web/scripts/sync-edge-vendor.mjs          copy browser sources to the edge function
//   node web/scripts/sync-edge-vendor.mjs --check  fail if any copy differs (used by tests)

import { copyFile, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const edge = "supabase/functions/experiment-mcp";

// [browser source, edge copy], relative to the repository root. Relative
// imports inside these files resolve identically on both sides because the
// edge layout mirrors web/src (vendor/*.js import "../capability-bindings.js").
export const EDGE_VENDOR_PAIRS = Object.freeze([
  ["web/src/capability-bindings.js", `${edge}/capability-bindings.js`],
  ["web/src/authoring-core/expression.js", `${edge}/authoring-core/expression.js`],
  ["web/src/authoring-core/lines.js", `${edge}/authoring-core/lines.js`],
  ["web/src/authoring-core/statements.js", `${edge}/authoring-core/statements.js`],
  ["web/src/config/compiler.js", `${edge}/vendor/config-compiler.js`],
  ["web/src/controller/compiler.js", `${edge}/vendor/controller-compiler.js`],
  ["web/src/environment/compiler.js", `${edge}/vendor/environment-compiler.js`],
  ["web/src/initializer/compiler.js", `${edge}/vendor/initializer-compiler.js`],
  ["web/src/initializer/rng.js", `${edge}/vendor/rng.js`],
  ["web/src/metrics/compiler.js", `${edge}/vendor/metrics-compiler.js`],
  ["web/src/runtime/contract.js", `${edge}/vendor/runtime-contract.js`],
]);

export async function differingEdgeVendorPairs() {
  const differing = [];
  for (const [source, copy] of EDGE_VENDOR_PAIRS) {
    const [a, b] = await Promise.all([
      readFile(path.join(repo, source)),
      readFile(path.join(repo, copy)).catch(() => null),
    ]);
    if (!b || !a.equals(b)) differing.push([source, copy]);
  }
  return differing;
}

async function main() {
  if (process.argv.includes("--check")) {
    const differing = await differingEdgeVendorPairs();
    if (differing.length) {
      for (const [source, copy] of differing) console.error(`differs: ${copy} (from ${source})`);
      console.error("Run: node web/scripts/sync-edge-vendor.mjs");
      process.exit(1);
    }
    console.log(`All ${EDGE_VENDOR_PAIRS.length} edge copies match the browser sources.`);
    return;
  }
  for (const [source, copy] of EDGE_VENDOR_PAIRS) {
    await copyFile(path.join(repo, source), path.join(repo, copy));
    console.log(`copied ${source} -> ${copy}`);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
