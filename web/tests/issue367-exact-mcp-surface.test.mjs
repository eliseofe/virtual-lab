import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const index = readFileSync(new URL("../../supabase/functions/experiment-mcp/index.ts", import.meta.url), "utf8");
const metrics = readFileSync(new URL("../../supabase/functions/experiment-mcp/metrics-results-tools.ts", import.meta.url), "utf8");
const surface = readFileSync(new URL("../../supabase/functions/experiment-mcp/tool-surface.ts", import.meta.url), "utf8");
const authoringSource = readFileSync(new URL("../../supabase/functions/experiment-mcp/authoring.js", import.meta.url), "utf8");
const authoringDoc = readFileSync(new URL("../../docs/AUTHORING_CONTRACT.md", import.meta.url), "utf8");
const mcpDoc = readFileSync(new URL("../../docs/EXPERIMENT_MCP.md", import.meta.url), "utf8");
const protocolDoc = readFileSync(new URL("../../docs/AI_LAB_PROTOCOL.md", import.meta.url), "utf8");
const registryDoc = readFileSync(new URL("../../docs/EXPERIMENT_REGISTRY_CONTRACT.md", import.meta.url), "utf8");

const expectedTools = [
  "read_workspace",
  "manage_collection",
  "create_experiment",
  "edit_experiment",
  "delete_experiment",
  "author_metrics_results",
  "request_capability",
  "resume_capability_closure",
  "revalidate_capability_closure",
];

function registeredTools(source) {
  return [...source.matchAll(/server\.registerTool\(\s*['"]([^'"]+)['"]/g)].map((match) => match[1]);
}

test("#367 exact formal tool surface is nine provider-independent research-AI operations", () => {
  const actual = [...registeredTools(index), ...registeredTools(metrics)].sort();
  assert.deepEqual(actual, [...expectedTools].sort());

  for (const name of expectedTools) assert.match(surface, new RegExp(`['"]${name}['"]`));
  assert.match(surface, /MCP_TOOL_COUNT = MCP_TOOL_NAMES\.length/);
  assert.match(index, /tools: MCP_TOOL_NAMES/);
  assert.match(index, /tool_count: MCP_TOOL_COUNT/);
  assert.match(index, /shared_tool_count: MCP_TOOL_COUNT/);
  assert.match(index, /student_tool_count: MCP_TOOL_COUNT/);
  assert.match(index, /professor_tool_count: MCP_TOOL_COUNT/);
});

test("#367 canonical Experiment authoring exposes only artifacts[] source input", () => {
  const create = index.match(/server\.registerTool\(\s*['"]create_experiment['"][\s\S]*?server\.registerTool\(\s*['"]edit_experiment['"]/)?.[0] ?? "";
  const edit = index.match(/server\.registerTool\(\s*['"]edit_experiment['"][\s\S]*?server\.registerTool\(\s*['"]delete_experiment['"]/)?.[0] ?? "";

  assert.match(create, /artifacts: z\.array\(ARTIFACT_INPUT\)\.min\(4\)/);
  assert.match(edit, /artifacts: z\.array\(ARTIFACT_INPUT\)\.min\(4\)\.optional\(\)/);
  for (const retired of ["config_source", "initializer_source", "controller_source", "legacySourceArgumentsPresent", "artifactsFromLegacySources", "mergeLegacySourcesIntoArtifacts"]) {
    assert.doesNotMatch(create, new RegExp(retired));
    assert.doesNotMatch(edit, new RegExp(retired));
  }
});

test("#367 the four compulsory artifacts are explicit rather than auto-filled", () => {
  assert.match(authoringSource, /canonical_input: "The ordered typed artifacts\[\] array is the only Experiment-authoring input/);
  assert.doesNotMatch(authoringSource, /compatibility_note/);
  assert.doesNotMatch(authoringSource, /artifactsFromLegacySources|mergeLegacySourcesIntoArtifacts/);

  const normalize = authoringSource.match(/export function normalizeExperimentArtifacts[\s\S]*?export function sourcesFromArtifacts/)?.[0] ?? "";
  assert.match(normalize, /if \(!artifact\) throw new Error\(\`Experiment is missing required artifact/);
  assert.doesNotMatch(normalize, /descriptor\.id === "metrics"[\s\S]*normalized\.push/);
});

test("#367 current documents contain one canonical-only surface and exact nine-tool contract", () => {
  for (const doc of [authoringDoc, mcpDoc, protocolDoc, registryDoc]) {
    assert.doesNotMatch(doc, /legacy three-source|bounded compatibility input|compatibility fields for the old three-source/i);
  }
  assert.match(authoringDoc, /vlab\.authoring\/0\.9/);
  assert.match(mcpDoc, /MCP server: `3\.14\.0`/);
  assert.match(mcpDoc, /interface: `17`/);
  assert.match(mcpDoc, /exactly \*\*9\*\* shared tools/i);
  assert.match(protocolDoc, /exact shared experiment-domain tool surface contains 9 tools/i);
});

test("#367 Student and Professor receive the same scientific tool set; authority remains data-scoped", () => {
  assert.doesNotMatch(index, /if \(profile\.role === 'professor'\)[\s\S]*server\.registerTool/);
  assert.match(index, /triage_authority: 'professor'/);
  assert.match(index, /simulator_access: false/);
  for (const forbidden of ["github", "shell", "sql", "deploy", "repository", "simulator_source"]) {
    assert.equal(expectedTools.some((tool) => tool.includes(forbidden)), false);
  }
});

test("#367 versions the breaking connector cutover explicitly", () => {
  assert.match(metrics, /MCP_SERVER_VERSION = '3\.14\.0'/);
  assert.match(metrics, /MCP_INTERFACE_VERSION = '17'/);
  assert.match(metrics, /contract_version: 'vlab\.authoring\/0\.9'/);
});
