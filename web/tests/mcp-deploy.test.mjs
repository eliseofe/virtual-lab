// #575: the Experiment MCP is deployed as a stub pinned to one commit and
// reports that commit in /health (deployment is manual; see docs/EXPERIMENT_MCP.md).

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { MCP_HEALTH_URL, stubFiles } from "../scripts/mcp-deploy.mjs";

const repo = (path) => readFile(new URL(`../../${path}`, import.meta.url), "utf8");
const COMMIT = "baf94062d7ab1f61cdd2a855984db6233114eff3";

test("the stub imports the MCP from GitHub at exactly the given commit", () => {
  const files = stubFiles(COMMIT);
  assert.deepEqual(Object.keys(files).sort(), ["deno.json", "index.ts"]);
  const imports = [...files["index.ts"].matchAll(/^import "([^"]+)";$/gm)].map(([, url]) => url);
  assert.deepEqual(imports, [`https://raw.githubusercontent.com/eliseofe/virtual-lab/${COMMIT}/supabase/functions/experiment-mcp/index.ts`]);
  assert.deepEqual(JSON.parse(files["deno.json"]), { compilerOptions: { lib: ["deno.window", "deno.ns"], strict: true }, imports: {} });
  assert.throws(() => stubFiles("main"), /full commit id/);
  assert.throws(() => stubFiles(COMMIT.slice(0, 7)), /full commit id/);
});

test("/health reports the commit read from the stub's import URL", async () => {
  const index = await repo("supabase/functions/experiment-mcp/index.ts");
  const pattern = index.match(/const SOURCE_COMMIT = import\.meta\.url\.match\((\/.*\/)\)\?\.\[1\] \?\? null/);
  assert.ok(pattern, "SOURCE_COMMIT is derived from import.meta.url");
  const regex = new RegExp(pattern[1].slice(1, -1));
  const url = stubFiles(COMMIT)["index.ts"].match(/import "([^"]+)"/)[1];
  assert.equal(url.match(regex)?.[1], COMMIT, "the stub's URL yields the commit");
  assert.equal("file:///tmp/source/index.ts".match(regex), null, "a local run reports no commit");
  assert.match(index, /source_commit: SOURCE_COMMIT,/);
  assert.equal(MCP_HEALTH_URL, "https://izdmmudfrmqhvlgepwes.supabase.co/functions/v1/experiment-mcp/health");
});
