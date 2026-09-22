import assert from "node:assert/strict";
import test from "node:test";

import { DEFAULT_CATALOG_EXPERIMENT } from "../src/experiment-catalog.js";
import { configStructure } from "../src/config/compiler.js";
import { initializerStructure } from "../src/initializer/compiler.js";
import { controllerStructure } from "../src/controller/compiler.js";
import { metricsStructure } from "../src/metrics/compiler.js";

const artifacts = Object.fromEntries(
  DEFAULT_CATALOG_EXPERIMENT.artifacts.map((artifact) => [artifact.id, artifact.content]),
);

test("#204 derives Configuration outline from compiler-accepted parameters", () => {
  const structure = configStructure(artifacts.configuration);
  assert.equal(structure.symbols[0].kind, "parameter");
  assert.ok(structure.symbols.some((symbol) => symbol.name === "N" && symbol.line > 0));
  assert.ok(structure.symbols.some((symbol) => symbol.name === "PROXIMAL_RANGE" && symbol.line > 0));
  assert.equal(structure.symbols.some((symbol) => symbol.name.includes("EXPERIMENT SETUP")), false);
});

test("#204 derives Initializer outline from the initializer parser", () => {
  const structure = initializerStructure(artifacts.initialization);
  assert.deepEqual(
    structure.symbols.map((symbol) => symbol.name),
    ["hexagon_perturbed", "random_uniform", "initialize"],
  );
  assert.ok(structure.symbols.every((symbol) => symbol.kind === "function" && symbol.line > 0));
});

test("#204 derives Controller outline from the controller grammar", () => {
  const structure = controllerStructure(artifacts.controller);
  assert.deepEqual(
    structure.symbols.map((symbol) => [symbol.kind, symbol.name]),
    [["class", "ActiveElasticAgent"], ["method", "step"]],
  );
  assert.ok(structure.symbols.every((symbol) => symbol.line > 0));
});

test("#204 derives Metrics outline from metric declarations and targets function definitions", () => {
  const structure = metricsStructure(artifacts.metrics);
  assert.deepEqual(
    structure.symbols.map((symbol) => symbol.id),
    ["polarization", "angular_momentum"],
  );
  assert.ok(structure.symbols.every((symbol) => symbol.kind === "metric"));
  assert.ok(structure.symbols.every((symbol) => symbol.line > symbol.metadataLine));
});

test("#204 UI consumes compiler structure and Ace commands instead of inventing sections", async () => {
  const { readFile } = await import("node:fs/promises");
  const [presentation, editor, structure] = await Promise.all([
    readFile(new URL("../src/authoring-react-presentation.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/authoring-code-editor.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/authoring-structure.js", import.meta.url), "utf8"),
  ]);

  assert.match(structure, /configStructure/);
  assert.match(structure, /initializerStructure/);
  assert.match(structure, /controllerStructure/);
  assert.match(structure, /metricsStructure/);
  assert.doesNotMatch(structure, /#\s+[A-Z][A-Z ]+/);

  assert.match(presentation, /data-vlab-authoring-outline/);
  assert.match(presentation, /artifactStructureSafe/);
  assert.match(presentation, /focusArtifactLine/);
  assert.match(presentation, /data-vlab-authoring-find/);
  assert.match(presentation, /openArtifactSearch/);

  assert.match(editor, /editor\.gotoLine/);
  assert.match(editor, /editor\.execCommand\('find'\)/);
  assert.match(editor, /showFoldWidgets: true/);
  assert.match(editor, /setFoldStyle\?\.\('markbeginend'\)/);
});
