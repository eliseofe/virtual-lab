import { compileConfig, numericParameters } from "./vendor/config-compiler.js";
import { compileEnvironmentScalar, validateEnvironmentControllerPair } from "./vendor/environment-compiler.js";
import { compileInitializer } from "./vendor/initializer-compiler.js";
import { compileController } from "./vendor/controller-compiler.js";
import {
  RUNTIME_CONTRACT,
  validateInitialStateForRuntime,
  validateRuntimeValues,
} from "./vendor/runtime-contract.js";

export const CORE_EXPERIMENT_ARTIFACTS = Object.freeze([
  Object.freeze({ id: "configuration", type: "configuration", label: "Configuration", format: "python-vlab", order: 10 }),
  Object.freeze({ id: "initialization", type: "initialization", label: "Initialization", format: "python-vlab", order: 20 }),
  Object.freeze({ id: "controller", type: "controller", label: "Controller", format: "python-vlab", order: 30 }),
]);

export const AUTHORING_CONTRACT = Object.freeze({
  contract_version: "vlab.authoring/0.4",
  experiment_interface_version: "6",
  experiment_artifact_interface: "vlab.experiment-artifacts/2",
  validation_mode: "compile-without-simulation",
  invalid_write_policy: "reject",
  content_policy: {
    includes_scientific_models: false,
    includes_reference_experiments: false,
    purpose: "Expose only simulator-owned syntax, types, capabilities, runtime requirements, and diagnostics. Experiment science is authored outside the contract."
  },
  runtime_contract: RUNTIME_CONTRACT,
  artifacts: {
    configuration: {
      compiled_version: "vlab.config/0.2",
      syntax: "Restricted Python-like top-level NAME = value assignments. Values may be numeric/string/True/False/None literals or aliases to earlier parameters.",
      runtime_requirements: RUNTIME_CONTRACT.required_configuration,
      parameter_policy: "Configuration names beyond the simulator-owned runtime requirements are experiment-defined. Finite numeric values are exposed to the controller as scalar parameters; the contract does not prescribe model-specific scientific parameter names or values."
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
        artifact_policy: "This is a capability of the required Initialization artifact. It does not create a fourth required artifact."
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
      actions: {
        Motion: { arguments: ["forward: scalar", "turning: scalar"], result: "action" }
      },
      intrinsics: {
        Vec2: ["scalar", "scalar"],
        dot: ["vec2", "vec2"],
        perpendicular: ["vec2"],
        norm: ["vec2"],
        pow: ["scalar", "scalar"]
      },
      forbidden_roots: ["random", "rng", "seed", "world", "simulator", "environment", "agents", "filesystem", "network"]
    }
  },
  artifact_collection: {
    representation: "ordered typed artifact array",
    required_core_ids: CORE_EXPERIMENT_ARTIFACTS.map(({ id }) => id),
    required_fields: ["id", "type", "label", "format", "order", "content"],
    compatibility_note: "Legacy config_source/initializer_source/controller_source arguments may be accepted temporarily by the MCP, but artifacts are the canonical experiment representation."
  },
  capability_model: {
    observations: [
      { id: "local.heading", source_name: "obs.heading", type: "vec2" },
      { id: "local.neighbours", source_name: "obs.neighbours", type: "sequence<neighbour>" },
      { id: "local.neighbour.relative_position", source_name: "neighbour.relative_position", type: "vec2" },
      {
        id: "local.environmental_scalar",
        source_name: "obs.environmental_scalar",
        type: "scalar",
        requires: "environment.static_scalar_field",
        information_boundary: "local scalar measurement only; no global position, field function or gradient"
      }
    ],
    environment: [
      {
        id: "environment.static_scalar_field",
        definition: "Initialization environmental_scalar(x, y, config)",
        compiled_schema: "vlab.environment-scalar-ir/0.1",
        cadence: "static",
        deterministic: true,
        rendering: "same simulator field evaluator used for sensing"
      }
    ],
    actions: [
      { id: "motion.forward_turning", constructor: "Motion", arguments: ["scalar", "scalar"] }
    ],
    intrinsics: ["Vec2", "dot", "perpendicular", "norm", "pow"],
    extension_policy: "Capabilities are versioned simulator-defined interfaces. Unsupported capabilities are reported explicitly; the student channel cannot implement simulator capabilities."
  },
  diagnostic_categories: [
    "syntax",
    "configuration",
    "runtime-parameter",
    "initializer",
    "unsupported-capability",
    "unsupported-feature",
    "type",
    "forbidden-capability",
    "invalid-observation-field",
    "invalid-private-state"
  ],
  execution_boundary: {
    validator_runs_simulation: false,
    ai_can_run_simulation: false,
    ai_can_observe_results: false,
    ai_can_modify_simulator: false
  }
});

export function artifactsFromLegacySources({ config_source = "", initializer_source = "", controller_source = "" }) {
  const contents = {
    configuration: config_source,
    initialization: initializer_source,
    controller: controller_source,
  };
  return CORE_EXPERIMENT_ARTIFACTS.map((descriptor) => ({
    ...descriptor,
    content: contents[descriptor.id],
  }));
}

export function sourcesFromArtifacts(artifacts) {
  if (!Array.isArray(artifacts)) throw new Error("Experiment artifacts must be an array.");
  const byId = new Map();
  for (const artifact of artifacts) {
    if (!artifact || typeof artifact !== "object") throw new Error("Each experiment artifact must be an object.");
    const { id, type, label, format, order, content } = artifact;
    if (typeof id !== "string" || !id.trim()) throw new Error("Each experiment artifact requires a non-empty id.");
    if (byId.has(id)) throw new Error(`Duplicate experiment artifact id '${id}'.`);
    if (typeof type !== "string" || !type.trim()) throw new Error(`Artifact '${id}' requires a non-empty type.`);
    if (typeof label !== "string" || !label.trim()) throw new Error(`Artifact '${id}' requires a non-empty label.`);
    if (typeof format !== "string" || !format.trim()) throw new Error(`Artifact '${id}' requires a non-empty format.`);
    if (typeof order !== "number" || !Number.isFinite(order)) throw new Error(`Artifact '${id}' requires a finite numeric order.`);
    if (typeof content !== "string") throw new Error(`Artifact '${id}' content must be a string.`);
    byId.set(id, artifact);
  }

  for (const descriptor of CORE_EXPERIMENT_ARTIFACTS) {
    const artifact = byId.get(descriptor.id);
    if (!artifact) throw new Error(`Experiment is missing required artifact '${descriptor.id}'.`);
    if (artifact.type !== descriptor.type) {
      throw new Error(`Artifact '${descriptor.id}' must have type '${descriptor.type}'.`);
    }
  }

  return {
    config_source: byId.get("configuration").content,
    initializer_source: byId.get("initialization").content,
    controller_source: byId.get("controller").content,
  };
}

export function mergeLegacySourcesIntoArtifacts(artifacts, changes = {}) {
  const current = Array.isArray(artifacts) ? artifacts : artifactsFromLegacySources(changes);
  const replacements = {
    configuration: changes.config_source,
    initialization: changes.initializer_source,
    controller: changes.controller_source,
  };
  return current.map((artifact) => (
    replacements[artifact.id] === undefined
      ? { ...artifact }
      : { ...artifact, content: replacements[artifact.id] }
  ));
}

function errorDiagnostic(artifact, error) {
  const message = error instanceof Error ? error.message : String(error);
  const compilerCategory = typeof error?.category === "string" ? error.category : null;
  let category = compilerCategory ?? (artifact === "initializer" ? "initializer" : "syntax");
  if (
    category === "unsupported-feature" ||
    category === "invalid-observation-field" ||
    /unsupported call|unknown observation field|is not in python-vlab/i.test(message)
  ) {
    category = "unsupported-capability";
  }
  return {
    artifact,
    category,
    compiler_category: compilerCategory,
    parameter: typeof error?.parameter === "string" ? error.parameter : null,
    message,
    line: Number.isInteger(error?.line) ? error.line : null,
    column: Number.isInteger(error?.column) ? error.column : null
  };
}

export function validateExperimentArtifacts(artifacts) {
  let sources;
  try {
    sources = sourcesFromArtifacts(artifacts);
  } catch (error) {
    return invalid([{ artifact: "artifacts", category: "syntax", compiler_category: null, parameter: null, message: error instanceof Error ? error.message : String(error), line: null, column: null }]);
  }
  return validateExperimentSources(sources);
}

export function validateExperimentSources({ config_source, initializer_source, controller_source }) {
  const diagnostics = [];
  let config;
  try {
    config = compileConfig(config_source);
  } catch (error) {
    diagnostics.push(errorDiagnostic("configuration", error));
    return invalid(diagnostics);
  }

  let runtime;
  try {
    runtime = validateRuntimeValues(config.values);
  } catch (error) {
    diagnostics.push(errorDiagnostic("configuration", error));
    return invalid(diagnostics);
  }

  let initializer;
  let environment;
  try {
    const initializerConfig = { ...config, values: { ...config.values, SEED: 0 } };
    initializer = compileInitializer(initializer_source, initializerConfig);
    validateInitialStateForRuntime(initializer.state, runtime);
    environment = compileEnvironmentScalar(initializer_source, initializerConfig);
  } catch (error) {
    diagnostics.push(errorDiagnostic("initializer", error));
    return invalid(diagnostics);
  }

  let controller;
  try {
    const parameters = numericParameters(config);
    const parameterTypes = Object.fromEntries(Object.keys(parameters).map((name) => [name, "scalar"]));
    controller = compileController(controller_source, { parameters: parameterTypes });
    validateEnvironmentControllerPair(environment, controller);
  } catch (error) {
    diagnostics.push(errorDiagnostic("controller", error));
    return invalid(diagnostics);
  }

  return {
    valid: true,
    contract_version: AUTHORING_CONTRACT.contract_version,
    diagnostics: [],
    compiled: {
      configuration: config.version,
      initializer: initializer.version,
      environment: environment?.schema ?? null,
      controller_language: controller.language,
      controller_ir_schema: controller.schema,
      runtime_contract: runtime.version
    }
  };
}

function invalid(diagnostics) {
  return {
    valid: false,
    contract_version: AUTHORING_CONTRACT.contract_version,
    diagnostics
  };
}
