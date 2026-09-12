import { compileConfig, numericParameters } from "./vendor/config-compiler.js";
import { compileInitializer } from "./vendor/initializer-compiler.js";
import { compileController } from "./vendor/controller-compiler.js";
import {
  RUNTIME_CONTRACT,
  validateInitialStateForRuntime,
  validateRuntimeValues,
} from "./vendor/runtime-contract.js";

export const AUTHORING_CONTRACT = Object.freeze({
  contract_version: "vlab.authoring/0.3",
  experiment_interface_version: "4",
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
    initializer: {
      compiled_version: "vlab.initializer-state/0.2",
      syntax: "Restricted Python-like function definitions. Must define initialize(config, rng, place). Supports assignments, +=, if/elif/else, for ... in range(...), return, helper functions and approved intrinsics.",
      entry: "initialize(config, rng, place)",
      simulator_owned_inputs: ["config", "rng", "place", "SEED"],
      intrinsics: ["sqrt", "ceil", "floor", "abs", "max", "min", "range", "rng.uniform", "place"],
      constants: ["TAU", "SQRT3_OVER_2"]
    },
    controller: {
      language: "python-vlab/0.1",
      ir_schema: "vlab.controller-ir/0.1",
      syntax: "Restricted Python-compatible class syntax: class Name(Agent), optional scalar class-state declarations, and def step(self, obs). Supports assignments, +=, arithmetic, iteration over obs.neighbours and return Motion(...).",
      entry: "step(self, obs)",
      observations: {
        "obs.heading": "vec2",
        "obs.neighbours": "sequence<neighbour>",
        "neighbour.relative_position": "vec2"
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
  capability_model: {
    observations: [
      { id: "local.heading", source_name: "obs.heading", type: "vec2" },
      { id: "local.neighbours", source_name: "obs.neighbours", type: "sequence<neighbour>" },
      { id: "local.neighbour.relative_position", source_name: "neighbour.relative_position", type: "vec2" }
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
  try {
    const initializerConfig = { ...config, values: { ...config.values, SEED: 0 } };
    initializer = compileInitializer(initializer_source, initializerConfig);
    validateInitialStateForRuntime(initializer.state, runtime);
  } catch (error) {
    diagnostics.push(errorDiagnostic("initializer", error));
    return invalid(diagnostics);
  }

  let controller;
  try {
    const parameters = numericParameters(config);
    const parameterTypes = Object.fromEntries(Object.keys(parameters).map((name) => [name, "scalar"]));
    controller = compileController(controller_source, { parameters: parameterTypes });
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