import { compileConfig, numericParameters } from "./config/compiler.js";
import { compileController, controllerCompletionItems, controllerStructure } from "./controller/compiler.js";
import { compileEnvironmentScalar, validateEnvironmentControllerPair } from "./environment/compiler.js";
import { compileInitializer, initializerStructure, validateInitializerControllerPrivateState } from "./initializer/compiler.js";
import { compileMetrics, metricsCompletionItems, metricsStructure } from "./metrics/compiler.js";
import { validateInitialStateForRuntime, validateRuntimeValues } from "./runtime/contract.js";

const ARTIFACT_IDS = ["configuration", "initialization", "controller", "metrics"];

function normalizedLocation(value) {
  return Number.isInteger(value) && value > 0 ? value : null;
}

function artifactForError(error, fallback) {
  if (error?.name === "ConfigCompileError") return "configuration";
  if (error?.name === "InitializerCompileError" || error?.name === "EnvironmentCompileError") return "initialization";
  if (error?.name === "ControllerCompileError") return "controller";
  if (error?.name === "MetricsCompileError") return "metrics";
  return fallback;
}

export function normalizeAuthoringDiagnostic(error, fallbackArtifact) {
  const artifact = artifactForError(error, fallbackArtifact);
  return {
    artifact,
    severity: "error",
    message: error instanceof Error ? error.message : String(error),
    line: normalizedLocation(error?.line),
    column: normalizedLocation(error?.column),
    category: typeof error?.category === "string" ? error.category : null,
  };
}

function appendDiagnostic(diagnostics, fallbackArtifact, error) {
  const diagnostic = normalizeAuthoringDiagnostic(error, fallbackArtifact);
  diagnostics[diagnostic.artifact]?.push(diagnostic);
}

function parseOnlyDiagnostics(diagnostics, id, source) {
  try {
    if (id === "initialization") initializerStructure(source);
    if (id === "controller") controllerStructure(source);
    if (id === "metrics") metricsStructure(source);
  } catch (error) {
    appendDiagnostic(diagnostics, id, error);
  }
}

export function collectArtifactDiagnostics(sources, { seed = 0 } = {}) {
  const diagnostics = Object.fromEntries(ARTIFACT_IDS.map((id) => [id, []]));
  let config = null;
  let runtime = null;
  let initializer = null;
  let environment = null;
  let controller = null;
  let parameterTypes = {};

  try {
    config = compileConfig(sources.configuration ?? "");
  } catch (error) {
    appendDiagnostic(diagnostics, "configuration", error);
  }

  if (!config) {
    parseOnlyDiagnostics(diagnostics, "initialization", sources.initialization ?? "");
    parseOnlyDiagnostics(diagnostics, "controller", sources.controller ?? "");
    parseOnlyDiagnostics(diagnostics, "metrics", sources.metrics ?? "");
    return diagnostics;
  }

  try {
    runtime = validateRuntimeValues(config.values);
  } catch (error) {
    appendDiagnostic(diagnostics, "configuration", error);
  }

  const parameters = numericParameters(config);
  parameterTypes = Object.fromEntries(Object.keys(parameters).map((name) => [name, "scalar"]));
  const initializerConfig = { ...config, values: { ...config.values, SEED: seed } };

  try {
    initializer = compileInitializer(sources.initialization ?? "", initializerConfig);
    if (runtime) validateInitialStateForRuntime(initializer.state, runtime);
    environment = compileEnvironmentScalar(sources.initialization ?? "", initializerConfig);
  } catch (error) {
    appendDiagnostic(diagnostics, "initialization", error);
  }

  try {
    controller = compileController(sources.controller ?? "", { parameters: parameterTypes });
    if (environment) validateEnvironmentControllerPair(environment, controller);
    if (initializer) validateInitializerControllerPrivateState(initializer, controller);
  } catch (error) {
    appendDiagnostic(diagnostics, "controller", error);
  }

  try {
    compileMetrics(sources.metrics ?? "", { parameters: parameterTypes });
  } catch (error) {
    appendDiagnostic(diagnostics, "metrics", error);
  }

  return diagnostics;
}

function uniqueCompletionItems(items) {
  return [...new Map(items.map((item) => [item.value, item])).values()];
}

export function artifactCompletionItems(id, sources) {
  let config = null;
  try {
    config = compileConfig(sources.configuration ?? "");
  } catch {
    // Completion remains conservative until Configuration parses.
  }
  const parameters = config ? numericParameters(config) : {};
  const parameterTypes = Object.fromEntries(Object.keys(parameters).map((name) => [name, "scalar"]));

  if (id === "controller") return controllerCompletionItems({ parameters: parameterTypes });
  if (id === "metrics") return metricsCompletionItems({ parameters: parameterTypes });

  if (id === "initialization") {
    const items = Object.keys(parameters).map((name) => ({
      value: `config.${name}`,
      caption: `config.${name}`,
      score: 900,
      meta: "configuration parameter",
    }));
    try {
      const structure = initializerStructure(sources.initialization ?? "");
      for (const symbol of structure.symbols) {
        items.push({
          value: symbol.name,
          caption: symbol.name,
          score: 700,
          meta: "initializer function",
        });
      }
    } catch {
      // Invalid source does not manufacture completion symbols.
    }
    return uniqueCompletionItems(items);
  }

  return [];
}
