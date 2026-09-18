import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const index = readFileSync(new URL("../../supabase/functions/experiment-mcp/index.ts", import.meta.url), "utf8");

test("#298 visible Experiment discovery remains available explicitly after #334", () => {
  assert.match(index, /include_workspace_index: z\.boolean\(\)\.default\(false\)/);
  assert.match(index, /if \(!include_workspace_index\) return toolResult\(neutralLabKnowledge\)/);
  assert.match(index, /workspace_index:/);
  assert.match(index, /if \(owned_only\) query = query\.eq\('owner_id', userId\)/);
  assert.match(index, /if \(lifecycle !== 'all'\) query = query\.eq\('lifecycle', lifecycle\)/);
});

test("#298 explicit workspace index stays minimal while selected Experiment reads remain full", () => {
  const workspaceBlock = index.match(/server\.registerTool\(\s*'read_workspace',[\s\S]*?server\.registerTool\(\s*'manage_collection'/);
  assert.ok(workspaceBlock);
  assert.match(workspaceBlock[0], /id, owner_id, collection_id, title, lifecycle, visibility, revision, schema_version, interface_version, created_at, updated_at/);
  const indexQuery = workspaceBlock[0].match(/let query = supabase[\s\S]*?if \(experimentsError\)/)?.[0] ?? "";
  assert.doesNotMatch(indexQuery, /description/);
  assert.match(workspaceBlock[0], /if \(experiment_id\)[\s\S]*\.select\('\*'\)/);
});

test("#298 preserves owner-scoped mutation despite explicit broader read discovery", () => {
  assert.match(index, /\.update\(patch\)[\s\S]*\.eq\('owner_id', userId\)/);
  assert.match(index, /\.delete\(\)[\s\S]*\.eq\('owner_id', userId\)/);
});
