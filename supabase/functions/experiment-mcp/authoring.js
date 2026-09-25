import { compileConfig, numericParameters } from "./vendor/config-compiler.js";
import { compileEnvironmentScalar, validateEnvironmentControllerPair } from "./vendor/environment-compiler.js";
import { compileInitializer, validateInitializerControllerPrivateState } from "./vendor/initializer-compiler.js";
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
  contract_version: "vlab.authoring/0.11",
  experiment_interface_version: "9",
  experiment_artifact_interface: "vlab.experiment-artifacts/3",
  validation_mode: "compile-without-simulation",
  invalid_write_policy: "reject",
  content_policy: {
    includes_scientific_models: false,
    includes_reference_experiments: false,
    purpose: "Expose the stable authoring/compiler skeleton, runtime invariants, diagnostics, and security boundary. Extensible scientific/product abilities and their concrete authoring surfaces live in the capability registry."
  },
  runtime_contract: {
    version: RUNTIME_CONTRACT.version,
    simulator_constants: RUNTIME_CONTRACT.simulator_constants,
    required_configuration: Object.freeze({
      N: RUNTIME_CONTRACT.required_configuration.N,
      CONTROL_DT: RUNTIME_CONTRACT.required_configuration.CONTROL_DT,
      EXPERIMENT_DURATION: RUNTIME_CONTRACT.required_configuration.EXPERIMENT_DURATION,
    }),
    capability_parameter_policy: "Additional required runtime/configuration symbols are advertised by implemented capability authoring surfaces rather than frozen into the stable language contract.",
  },
  // #577 (D-021): one code grammar for Initialization, the environment field,
  // Controller and Metrics; artifacts differ in the names they may use.
  code_grammar: {
    arithmetic_operators: ["+", "-", "*", "/", "//", "%", "**"],
    comparison_operators: ["<", "<=", ">", ">=", "==", "!="],
    boolean_operators: ["and", "or", "not"],
    boolean_literals: ["True", "False"],
    range_loops: "for NAME in range(stop), range(start, stop) or range(start, stop, step), as in Python. In the Controller and Metrics every argument is a run constant (numbers and parameters combined with arithmetic) whose value must be an integer, with a nonzero step; the loop variable is a scalar visible only inside the loop. range(...) is only a loop iterable.",
    semantics: "a // b is floor division and a % b takes the sign of the divisor (as in Python); both are scalar-only. and/or/not take boolean operands, and both sides of and/or are always evaluated (random draws on either side are always consumed). while loops are not available in any artifact.",
    artifact_differences: "Artifacts differ only in their inputs, intrinsics and effects, listed per artifact below.",
  },
  artifacts: {
    configuration: {
      compiled_version: "vlab.config/0.2",
      syntax: "Restricted Python-like top-level NAME = value assignments. Values may be numeric/string/True/False/None literals or aliases to earlier parameters.",
      core_runtime_requirements: ["N", "CONTROL_DT", "EXPERIMENT_DURATION"],
      parameter_policy: "Configuration names beyond the stable runtime requirements are experiment-defined or capability-owned. Implemented capability bindings advertise any additional simulator-owned configuration symbols."
    },
    initialization: {
      compiled_version: "vlab.initializer-state/0.4",
      syntax: "Restricted Python-like function definitions. Must define initialize(config, rng, place). Supports assignments, +=, if/elif/else, for ... in range(...), return, helper functions and language intrinsics. Implemented capability surfaces may additionally assign deterministic per-agent initial controller-private scalar state. Additional callable/member surfaces and optional entries are capability-owned.",
      entry: "initialize(config, rng, place)",
      simulator_owned_inputs: ["config", "rng", "place"],
      language_intrinsics: ["abs", "sqrt", "exp", "log", "sin", "cos", "tan", "asin", "acos", "atan", "atan2", "floor", "ceil", "pow", "min", "max", "range"],
      arithmetic_operators: ["+", "-", "*", "/", "//", "%", "**"],
      comparison_operators: ["<", "<=", ">", ">=", "==", "!="],
      boolean_operators: ["and", "or", "not"],
      exponentiation_operator: "**",
      optional_environment_scalar_math: "The same standard scalar math intrinsics and arithmetic operators (including // and %) apply inside environmental_scalar(x, y, config), which is a single return expression.",
      constants: ["TAU", "SQRT3_OVER_2"],
      capability_resolution: "Capability-backed initializer calls, member access and optional entries are authorable only when an implemented capability advertises the corresponding Initialization surface."
    },
    controller: {
      language: "python-vlab/0.1",
      ir_schema: "vlab.controller-ir/0.1",
      syntax: "Restricted Python-compatible class syntax: class Name(Agent), optional capability-backed class state declarations, and def step(self, obs). Supports typed scalar/vector/boolean expressions, assignments, +=, arithmetic, scalar comparisons, boolean composition, if/elif/else, bounded iteration over capability-backed iterables, and return of capability-backed actions.",
      entry: "step(self, obs)",
      control_flow: {
        boolean_literals: ["True", "False"],
        comparison_operators: ["<", "<=", ">", ">=", "==", "!="],
        boolean_operators: ["and", "or", "not"],
        conditionals: ["if", "elif", "else"],
        iteration: "for ... in capability-backed iterable, or for ... in range(...) over run constants"
      },
      arithmetic_operators: ["+", "-", "*", "/", "//", "%", "**"],
      language_intrinsics: {
        Vec2: ["scalar", "scalar"],
        dot: ["vec2", "vec2"],
        perpendicular: ["vec2"],
        norm: ["vec2"],
        abs: ["scalar"],
        sqrt: ["scalar"],
        exp: ["scalar"],
        log: ["scalar"],
        sin: ["scalar"],
        cos: ["scalar"],
        tan: ["scalar"],
        asin: ["scalar"],
        acos: ["scalar"],
        atan: ["scalar"],
        atan2: ["scalar", "scalar"],
        floor: ["scalar"],
        ceil: ["scalar"],
        pow: ["scalar", "scalar"],
        min: ["scalar", "scalar"],
        max: ["scalar", "scalar"]
      },
      exponentiation_operator: "**",
      capability_resolution: "Observation fields, neighbour fields, private state and action constructors are resolved from implemented capability authoring surfaces. A surface absent from the implemented registry is rejected.",
      security_boundary: {
        forbidden_host_roots: ["filesystem", "network"]
      }
    },
    metrics: {
      language: METRICS_LANGUAGE,
      ir_schema: METRICS_IR_SCHEMA,
      required: true,
      empty_content_valid: true,
      syntax: "Zero or more @metric(...) declarations, each immediately followed by def name(snapshot): and a constrained read-only typed computation. Supports scalar/vector/boolean expressions, assignments, +=, arithmetic, scalar comparisons, boolean composition, if/elif/else, bounded iteration over capability-backed snapshot collections, and scalar returns. Snapshot fields and sampling constructors are capability-owned.",
      declaration: "@metric(id=\"stable.id\", name=\"Display name\", unit=None|\"unit\", sampling=<implemented sampling constructor>)",
      control_flow: {
        boolean_literals: ["True", "False"],
        comparison_operators: ["<", "<=", ">", ">=", "==", "!="],
        boolean_operators: ["and", "or", "not"],
        conditionals: ["if", "elif", "else"],
        iteration: "for ... in capability-backed snapshot collection, or for ... in range(...) over run constants"
      },
      arithmetic_operators: ["+", "-", "*", "/", "//", "%", "**"],
      measurement_phase: {
        id: METRIC_MEASUREMENT_PHASE,
        semantics: "Observe the canonical physical state after one physics integration update and periodic wrapping, at the resulting scientific_time. This freezes the already-existing kernel MetricRuntime hook rather than introducing a new timing convention."
      },
      observation: {
        mode: "read-only-global-snapshot",
        fields_from_capability_registry: true,
        mutation: false
      },
      language_intrinsics: ["Vec2", "dot", "cross2", "norm", "abs", "sqrt", "exp", "log", "sin", "cos", "tan", "asin", "acos", "atan", "atan2", "floor", "ceil", "pow", "min", "max"],
      exponentiation_operator: "**",
      security_boundary: {
        forbidden_host_roots: ["filesystem", "network"]
      }
    }
  },
  artifact_collection: {
    representation: "ordered typed artifact array",
    required_core_ids: CORE_EXPERIMENT_ARTIFACTS.map(({ id }) => id),
    required_fields: ["id", "type", "label", "format", "order", "content"],
    canonical_input: "The ordered typed artifacts[] array is the only Experiment-authoring input. All four compulsory core artifact IDs must be supplied explicitly; an empty Metrics artifact is valid."
  },
  capability_resolution: {
    authority: "capability_registry",
    authoring_surface_field: "authoring_surfaces",
    implemented_only: true,
    unregistered_surface_policy: "reject",
    candidate_surface_policy: "not_authorable",
    principle: "The authoring contract defines how programs are written. The capability registry defines which extensible abilities and concrete authoring surfaces currently exist."
  },
  artifact_execution: {
    version: "vlab.artifact-execution/1",
    lifecycle_hooks: ["setup", "initialize", "control", "measure", "finalize"],
    required_core: [
      {
        id: "configuration",
        behavior: "declarative",
        execution_hook: null,
        execution_scope: null,
        cadence: null
      },
      {
        id: "initialization",
        behavior: "executable",
        execution_hook: "initialize",
        execution_scope: "run",
        cadence: "once-per-fresh-run"
      },
      {
        id: "controller",
        behavior: "executable",
        execution_hook: "control",
        execution_scope: "agent",
        cadence: "CONTROL_DT"
      },
      {
        id: "metrics",
        behavior: "read-only-executable-observer",
        execution_hook: "measure",
        execution_scope: "run-global-read-only-snapshot",
        cadence: "per-metric declared sampling policy",
        empty_content_valid: true,
        measurement_phase: METRIC_MEASUREMENT_PHASE
      }
    ],
    optional_passive: {
      allowed: true,
      generic_browser_formats: ["python-vlab", "python-vlab-metrics/0.1", "text/plain", "text/markdown", "markdown"],
      execution_policy: "Optional artifacts are passive unless an executable artifact type is explicitly registered by the stable artifact-execution contract."
    },
    optional_executable: {
      registered_types: [],
      execution_policy: "No optional executable artifact type is registered. Metrics is a required core artifact and therefore does not use optional-artifact dispatch.",
      unsupported_request_class: "artifact_workflow"
    }
  },
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
  const references = initializer.world_references?.references?.map(({ name }) => name) ?? [];
  try {
    controller = compileController(controller_source, { parameters: parameterTypes, references });
    validateEnvironmentControllerPair(environment, controller);
  } catch (error) { diagnostics.push(errorDiagnostic("controller", error)); return invalid(diagnostics); }

  try { validateInitializerControllerPrivateState(initializer, controller); }
  catch (error) { diagnostics.push(errorDiagnostic("initializer", error)); return invalid(diagnostics); }

  let metrics;
  try {
    const agentState = Object.fromEntries((controller.state ?? []).map(({ name, type }) => [name, type]));
    metrics = compileMetrics(metrics_source, {
      parameters: parameterTypes,
      references,
      agentState,
      runtimeCapabilities: environment ? ["environment_scalar"] : [],
    });
  }
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
