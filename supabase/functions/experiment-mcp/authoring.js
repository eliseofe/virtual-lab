import { compileConfig, numericParameters } from "./vendor/config-compiler.js";
import { compileEnvironmentScalar, validateEnvironmentControllerPair } from "./vendor/environment-compiler.js";
import { compileInitializer } from "./vendor/initializer-compiler.js";
import { compileController } from "./vendor/controller-compiler.js";
import { compileMetrics, METRIC_MEASUREMENT_PHASE, METRICS_IR_SCHEMA, METRICS_LANGUAGE } from "./vendor/metrics-compiler.js";
import {
  RUNTIME_CONTRACT,
  validateInitialStateForRuntime,
  validateRuntimeValues,
} from "./vendor/runtime-contract.js";
import { CANONICAL_CAPABILITY_BINDINGS } from "./canonical-capability-bindings.js";

export const CORE_EXPERIMENT_ARTIFACTS = Object.freeze([
  Object.freeze({ id: "configuration", type: "configuration", label: "Configuration", format: "python-vlab", order: 10 }),
  Object.freeze({ id: "initialization", type: "initialization", label: "Initialization", format: "python-vlab", order: 20 }),
  Object.freeze({ id: "controller", type: "controller", label: "Controller", format: "python-vlab", order: 30 }),
  Object.freeze({ id: "metrics", type: "metrics", label: "Metrics", format: METRICS_LANGUAGE, order: 40 }),
]);

export const AUTHORING_CONTRACT = Object.freeze({
  contract_version: "vlab.authoring/0.8",
  experiment_interface_version: "8",
  experiment_artifact_interface: "vlab.experiment-artifacts/3",
  validation_mode: "compile-without-simulation",
  invalid_write_policy: "reject",
  content_policy: {
    includes_scientific_models: false,
    includes_reference_experiments: false,
    purpose: "Expose only simulator-owned syntax, types, capabilities, runtime requirements, diagnostics, and metric measurement interfaces. Experiment science is authored outside the contract."
  },
  runtime_contract: RUNTIME_CONTRACT,
  artifacts: {
    configuration: {
      compiled_version: "vlab.config/0.2",
      syntax: "Restricted Python-like top-level NAME = value assignments. Values may be numeric/string/True/False/None literals or aliases to earlier parameters.",
      runtime_requirements: RUNTIME_CONTRACT.required_configuration,
      parameter_policy: "Configuration names beyond the simulator-owned runtime requirements are experiment-defined. Finite numeric values are exposed to controller and metric compilers as scalar parameters; the contract does not prescribe model-specific scientific parameter names or values."
    },
    initialization: {
      compiled_version: "vlab.initializer-state/0.2",
      syntax: "Restricted Python-like function definitions. Must define initialize(config, rng, place). Supports assignments, +=, if/elif/else, for ... in range(...), return, helper functions and approved intrinsics. It may additionally define the optional static Environment function environmental_scalar(x, y, config).",
      entry: "initialize(config, rng, place)",
      simulator_owned_inputs: ["config", "rng", "place", "SEED"],
      intrinsics: ["sqrt", "ceil", "floor", "abs", "max", "min", "range", "rng.uniform", "place"],
      constants: ["TAU", "SQRT3_OVER_2"],
      environment: {
        capability: "environment.static_scalar_field",
        optional_entry: "environmental_scalar(x, y, config)",
        syntax: "A single pure `return <scalar expression>` body. The expression may use x, y, finite numeric config parameters, TAU, SQRT3_OVER_2, and the approved pure scalar intrinsics.",
        intrinsics: ["sqrt", "abs", "sin", "cos", "exp", "pow", "min", "max"],
        semantics: "Defines a deterministic static scalar field over world position. The simulator samples this field locally; it does not derive or expose a spatial gradient.",
        artifact_policy: "This is a capability of the required Initialization artifact."
      }
    },
    controller: {
      language: "python-vlab/0.1",
      ir_schema: "vlab.controller-ir/0.1",
      syntax: "Restricted Python-compatible class syntax: class Name(Agent), optional scalar class-state declarations, and def step(self, obs). Supports assignments, +=, arithmetic, iteration over obs.neighbours and return Motion(...).",
      entry: "step(self, obs)",
      observations: {
        "obs.heading": "vec2",
        "obs.neighbours": "sequence<neighbour>",
        "neighbour.relative_position": "vec2",
        "obs.environmental_scalar": "scalar when Initialization defines environmental_scalar(x, y, config)"
      },
      actions: { Motion: { arguments: ["forward: scalar", "turning: scalar"], result: "action" } },
      intrinsics: { Vec2: ["scalar", "scalar"], dot: ["vec2", "vec2"], perpendicular: ["vec2"], norm: ["vec2"], pow: ["scalar", "scalar"] },
      forbidden_roots: ["random", "rng", "seed", "world", "simulator", "environment", "agents", "filesystem", "network"]
    },
    metrics: {
      language: METRICS_LANGUAGE,
      ir_schema: METRICS_IR_SCHEMA,
      required: true,
      empty_content_valid: true,
      syntax: "Zero or more @metric(...) declarations, each immediately followed by def name(snapshot): and a constrained read-only scalar computation. Multiple metric definitions live in this single compulsory Metrics artifact.",
      declaration: "@metric(id=\"stable.id\", name=\"Display name\", unit=None|\"unit\", sampling=every(<seconds>)|final())",
      sampling: {
        periodic: "every(seconds) where seconds is finite and positive; runtime integration in #195.2 will require exact schedulability against simulator time steps",
        final: "final() evaluates only at run completion/finalization"
      },
      measurement_phase: {
        id: METRIC_MEASUREMENT_PHASE,
        semantics: "Observe the canonical physical state after one physics integration update and periodic wrapping, at the resulting scientific_time. This freezes the already-existing kernel MetricRuntime hook rather than introducing a new timing convention."
      },
      observation: {
        mode: "read-only-global-snapshot",
        fields: ["snapshot.scientific_time", "snapshot.agent_count", "snapshot.agents[].position", "snapshot.agents[].heading", "snapshot.agents[].heading_angle"],
        mutation: false
      },
      intrinsics: ["Vec2", "dot", "norm", "abs", "sqrt", "pow", "min", "max"],
      forbidden_roots: ["random", "rng", "seed", "controller", "world", "simulator", "environment", "filesystem", "network", "actions", "actuators"]
    }
  },
  artifact_collection: {
    representation: "ordered typed artifact array",
    required_core_ids: CORE_EXPERIMENT_ARTIFACTS.map(({ id }) => id),
    required_fields: ["id", "type", "label", "format", "order", "content"],
    canonical_input: "The ordered typed artifacts[] array is the only Experiment-authoring input. All four compulsory core artifact IDs must be supplied explicitly; an empty Metrics artifact is valid."
  },
  canonical_capability_bindings: CANONICAL_CAPABILITY_BINDINGS,
  diagnostic_model: {
    classes: [
      "semantic_capability",
      "authoring_language",
      "runtime_configuration",
      "forbidden_security_boundary",
      "type_validation"
    ],
    extension_request_classes: [
      "semantic_capability",
      "authoring_language",
      "runtime_configuration",
      "artifact_workflow",
      "implementation_optimization",
      "security_boundary"
    ],
    compiler_categories: [
      "syntax", "configuration", "runtime-parameter", "initializer", "metrics", "sampling", "metric-id", "metric-name",
      "unsupported-capability", "unsupported-feature", "type", "forbidden-capability", "invalid-observation-field", "invalid-private-state"
    ],
    routing: "Compiler categories remain low-level validation evidence. diagnostic_class separates semantic capability, authoring-language, runtime/configuration, forbidden/security and ordinary type/validation failures. request_class is present only when the diagnostic directly represents a durable extension-request class."
  },
  execution_boundary: {
    validator_runs_simulation: false,
    ai_can_run_simulation: false,
    ai_can_observe_results: false,
    ai_can_modify_simulator: false
  }
});

function normalizeArtifact(artifact) {
  if (!artifact || typeof artifact !== "object") throw new Error("Each experiment artifact must be an object.");
  const { id, type, label, format, order, content } = artifact;
  if (typeof id !== "string" || !id.trim()) throw new Error("Each experiment artifact requires a non-empty id.");
  if (typeof type !== "string" || !type.trim()) throw new Error(`Artifact '${id}' requires a non-empty type.`);
  if (typeof label !== "string" || !label.trim()) throw new Error(`Artifact '${id}' requires a non-empty label.`);
  if (typeof format !== "string" || !format.trim()) throw new Error(`Artifact '${id}' requires a non-empty format.`);
  if (typeof order !== "number" || !Number.isFinite(order)) throw new Error(`Artifact '${id}' requires a finite numeric order.`);
  if (typeof content !== "string") throw new Error(`Artifact '${id}' content must be a string.`);
  return { id, type, label, format, order, content };
}

export function normalizeExperimentArtifacts(artifacts) {
  if (!Array.isArray(artifacts)) throw new Error("Experiment artifacts must be an array.");
  const normalized = artifacts.map(normalizeArtifact);
  const byId = new Map();
  for (const artifact of normalized) {
    if (byId.has(artifact.id)) throw new Error(`Duplicate experiment artifact id '${artifact.id}'.`);
    byId.set(artifact.id, artifact);
  }
  for (const descriptor of CORE_EXPERIMENT_ARTIFACTS) {
    const artifact = byId.get(descriptor.id);
    if (!artifact) throw new Error(`Experiment is missing required artifact '${descriptor.id}'.`);
    if (artifact.type !== descriptor.type) throw new Error(`Artifact '${descriptor.id}' must have type '${descriptor.type}'.`);
  }
  return normalized.sort((left, right) => left.order - right.order || left.id.localeCompare(right.id));
}

function artifactsFromSourceComponents({ config_source = "", initializer_source = "", controller_source = "", metrics_source = "" }) {
  const contents = {
    configuration: config_source,
    initialization: initializer_source,
    controller: controller_source,
    metrics: metrics_source,
  };
  return CORE_EXPERIMENT_ARTIFACTS.map((descriptor) => ({ ...descriptor, content: contents[descriptor.id] ?? "" }));
}

export function sourcesFromArtifacts(artifacts) {
  const normalized = normalizeExperimentArtifacts(artifacts);
  const byId = new Map(normalized.map((artifact) => [artifact.id, artifact]));
  return {
    config_source: byId.get("configuration").content,
    initializer_source: byId.get("initialization").content,
    controller_source: byId.get("controller").content,
  };
}

export function classifyAuthoringDiagnostic(artifact, compilerCategory, message) {
  const category = compilerCategory
    ?? (artifact === "configuration" ? "configuration"
      : artifact === "initializer" ? "initializer"
      : artifact === "metrics" ? "metrics"
      : "syntax");

  if (category === "unsupported-capability" || category === "invalid-observation-field") {
    return { category, diagnostic_class: "semantic_capability", request_class: "semantic_capability" };
  }

  if (category === "unsupported-feature") {
    return { category, diagnostic_class: "authoring_language", request_class: "authoring_language" };
  }

  if (category === "runtime-parameter" || category === "configuration") {
    return { category, diagnostic_class: "runtime_configuration", request_class: "runtime_configuration" };
  }

  if (category === "forbidden-capability") {
    return { category, diagnostic_class: "forbidden_security_boundary", request_class: "security_boundary" };
  }

  return { category, diagnostic_class: "type_validation", request_class: null };
}

function errorDiagnostic(artifact, error) {
  const message = error instanceof Error ? error.message : String(error);
  const compilerCategory = typeof error?.category === "string" ? error.category : null;
  const classification = classifyAuthoringDiagnostic(artifact, compilerCategory, message);
  return {
    artifact,
    ...classification,
    compiler_category: compilerCategory,
    parameter: typeof error?.parameter === "string" ? error.parameter : null,
    message,
    line: Number.isInteger(error?.line) ? error.line : null,
    column: Number.isInteger(error?.column) ? error.column : null
  };
}

export function validateExperimentArtifacts(artifacts) {
  let normalized;
  try { normalized = normalizeExperimentArtifacts(artifacts); }
  catch (error) { return invalid([errorDiagnostic("artifacts", error)]); }
  const byId = new Map(normalized.map((artifact) => [artifact.id, artifact]));
  return validateExperimentSources({
    ...sourcesFromArtifacts(normalized),
    metrics_source: byId.get("metrics")?.content ?? "",
  }, normalized);
}

export function validateExperimentSources({ config_source, initializer_source, controller_source, metrics_source = "" }, normalizedArtifacts = null) {
  const diagnostics = [];
  let config;
  try { config = compileConfig(config_source); }
  catch (error) { diagnostics.push(errorDiagnostic("configuration", error)); return invalid(diagnostics); }

  let runtime;
  try { runtime = validateRuntimeValues(config.values); }
  catch (error) { diagnostics.push(errorDiagnostic("configuration", error)); return invalid(diagnostics); }

  let initializer;
  let environment;
  try {
    const initializerConfig = { ...config, values: { ...config.values, SEED: 0 } };
    initializer = compileInitializer(initializer_source, initializerConfig);
    validateInitialStateForRuntime(initializer.state, runtime);
    environment = compileEnvironmentScalar(initializer_source, initializerConfig);
  } catch (error) { diagnostics.push(errorDiagnostic("initializer", error)); return invalid(diagnostics); }

  let controller;
  const parameters = numericParameters(config);
  const parameterTypes = Object.fromEntries(Object.keys(parameters).map((name) => [name, "scalar"]));
  try {
    controller = compileController(controller_source, { parameters: parameterTypes });
    validateEnvironmentControllerPair(environment, controller);
  } catch (error) { diagnostics.push(errorDiagnostic("controller", error)); return invalid(diagnostics); }

  let metrics;
  try { metrics = compileMetrics(metrics_source, { parameters: parameterTypes }); }
  catch (error) { diagnostics.push(errorDiagnostic("metrics", error)); return invalid(diagnostics); }

  return {
    valid: true,
    contract_version: AUTHORING_CONTRACT.contract_version,
    diagnostics: [],
    artifacts: normalizedArtifacts ?? artifactsFromSourceComponents({ config_source, initializer_source, controller_source, metrics_source }),
    compiled: {
      configuration: config.version,
      initializer: initializer.version,
      environment: environment?.schema ?? null,
      controller_language: controller.language,
      controller_ir_schema: controller.schema,
      metrics_language: metrics.language,
      metrics_ir_schema: metrics.schema,
      metric_measurement_phase: metrics.measurement_phase,
      metric_count: metrics.metrics.length,
      runtime_contract: runtime.version
    }
  };
}

function invalid(diagnostics) { return { valid: false, contract_version: AUTHORING_CONTRACT.contract_version, diagnostics }; }
