import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { DEFAULT_CATALOG_EXPERIMENT } from "../src/experiment-catalog.js";
import {
  artifactCompletionItems,
  collectArtifactDiagnostics,
} from "../src/authoring-language-support.js";

const sources = Object.fromEntries(
  DEFAULT_CATALOG_EXPERIMENT.artifacts.map((artifact) => [artifact.id, artifact.content]),
);

test("#205 keeps valid catalog artifacts diagnostic-free", () => {
  const diagnostics = collectArtifactDiagnostics(sources);
  assert.deepEqual(
    Object.fromEntries(Object.entries(diagnostics).map(([id, items]) => [id, items.length])),
    { configuration: 0, initialization: 0, controller: 0, metrics: 0 },
  );
});

test("#205 preserves artifact identity and source locations for simultaneous compiler errors", () => {
  const diagnostics = collectArtifactDiagnostics({
    ...sources,
    initialization: "def initialize(config, rng, place):\n\tplace(0, 0, 0, 0)",
    controller: "class Broken(Agent):\n    def step(self, obs):\n        return @",
  });

  assert.equal(diagnostics.initialization.length, 1);
  assert.equal(diagnostics.initialization[0].artifact, "initialization");
  assert.equal(diagnostics.initialization[0].line, 2);

  assert.equal(diagnostics.controller.length, 1);
  assert.equal(diagnostics.controller[0].artifact, "controller");
  assert.equal(diagnostics.controller[0].line, 3);
  assert.equal(diagnostics.controller[0].column, 1);
  assert.equal(diagnostics.configuration.length, 0);
  assert.equal(diagnostics.metrics.length, 0);
});

test("#205 completion comes only from supported constrained-language/compiler surfaces", () => {
  const controller = new Set(artifactCompletionItems("controller", sources).map((item) => item.value));
  assert.ok(controller.has("dot"));
  assert.ok(controller.has("obs.heading"));
  assert.ok(controller.has("K1"));
  assert.equal(controller.has("filesystem"), false);
  assert.equal(controller.has("network"), false);

  const metrics = new Set(artifactCompletionItems("metrics", sources).map((item) => item.value));
  assert.ok(metrics.has("cross2"));
  assert.ok(metrics.has("snapshot.scientific_time"));
  assert.ok(metrics.has("snapshot.agents"));
  assert.ok(metrics.has("K1"));
  assert.equal(metrics.has("snapshot.agents[].position"), false);

  const initializer = new Set(artifactCompletionItems("initialization", sources).map((item) => item.value));
  assert.ok(initializer.has("config.K1"));
  assert.ok(initializer.has("initialize"));
});

test("#205 UI renders compiler diagnostics in Ace and exposes only explicit completion items", async () => {
  const [editor, presentation, support, browserController, mcpController, browserMetrics, mcpMetrics] = await Promise.all([
    readFile(new URL("../src/authoring-code-editor.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/authoring-react-presentation.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/authoring-language-support.js", import.meta.url), "utf8"),
    readFile(new URL("../src/controller/compiler.js", import.meta.url), "utf8"),
    readFile(new URL("../../supabase/functions/experiment-mcp/vendor/controller-compiler.js", import.meta.url), "utf8"),
    readFile(new URL("../src/metrics/compiler.js", import.meta.url), "utf8"),
    readFile(new URL("../../supabase/functions/experiment-mcp/vendor/metrics-compiler.js", import.meta.url), "utf8"),
  ]);

  assert.match(editor, /session\.setAnnotations/);
  assert.match(editor, /enableBasicAutocompletion/);
  assert.match(editor, /ext-language_tools\.js/);
  assert.match(editor, /vlab-contract-completer/);
  assert.match(presentation, /data-vlab-authoring-diagnostics/);
  assert.match(presentation, /data-vlab-diagnostic-count/);
  assert.match(presentation, /focusArtifactLine/);

  assert.match(support, /compileConfig/);
  assert.match(support, /compileInitializer/);
  assert.match(support, /compileController/);
  assert.match(support, /compileMetrics/);
  assert.match(support, /validateEnvironmentControllerPair/);
  assert.match(support, /validateInitializerControllerPrivateState/);

  assert.equal(browserController, mcpController);
  assert.equal(browserMetrics, mcpMetrics);
});
