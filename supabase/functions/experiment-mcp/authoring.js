import { compileConfig, numericParameters } from "./vendor/config-compiler.js";
import { compileInitializer } from "./vendor/initializer-compiler.js";
import { compileController } from "./vendor/controller-compiler.js";

export const AUTHORING_CONTRACT = Object.freeze({
  contract_version: "vlab.authoring/0.1",
  experiment_interface_version: "4",
  validation_mode: "compile-without-simulation",
  invalid_write_policy: "reject",
  artifacts: {
    configuration: {
      compiled_version: "vlab.config/0.2",
      syntax: "Restricted Python-like top-level NAME = value assignments. Values may be numeric/string/True/False/None literals or aliases to earlier parameters.",
      current_runtime_parameters: {
        N: "positive integer",
        ARENA_SIZE: "positive scalar",
        INITIALIZATION_METHOD: "string consumed by the initializer",
        INITIAL_POSITION_NOISE: "non-negative scalar",
        CONTROL_DT: "positive scalar",
        SENSOR_NOISE: "non-negative scalar",
        EXPERIMENT_DURATION: "positive scalar",
        U: "positive scalar",
        OMEGA_MAX: "positive scalar",
        K1: "scalar",
        K2: "scalar",
        POTENTIAL_ALPHA: "positive scalar",
        POTENTIAL_EPSILON: "positive scalar",
        DESIRED_DISTANCE: "positive scalar",
        PROXIMAL_RANGE: "positive scalar"
      }
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
  },
  reference_examples: {
    active_elastic_current: {
      note: "Mechanically mirrored from the current built-in production example for syntax/reference only; it is not new scientific guidance.",
      config_source: `# EXPERIMENTAL SETUP
# Number of agents in this run.
N = 91
# Side length of the square arena in model distance units. Boundaries are periodic.
ARENA_SIZE = 10.0
# Initial placement: "hexagon_perturbed" or "random".
INITIALIZATION_METHOD = "hexagon_perturbed"
# Maximum independent x/y displacement (distance units) added to each hex-lattice position.
# 0.0 gives a perfect lattice; increase this to perturb the initial positions.
INITIAL_POSITION_NOISE = 0.0
# Controller update period (s). Ferrante et al. (2012) use 0.1 s.
CONTROL_DT = 0.1
# Bearing-noise amount from Ferrante et al. (2012).
# The simulator applies a uniform bearing perturbation in [-2*pi*sigma, +2*pi*sigma].
SENSOR_NOISE = 0.1
# Duration (s) of one visual experiment. The run pauses when this is reached.
EXPERIMENT_DURATION = 25000.0

# CONTROLLER PARAMETERS — Adaptive Behavior (2012), MDMC + proximal control
# Maximum forward speed (distance units/s); the 2012 numeric default corresponds to m/s.
U = 0.005
# Maximum angular speed (rad/s).
OMEGA_MAX = 1.5707963267948966
# MDMC gains.
K1 = 0.005
K2 = 0.06
# Generalized Lennard-Jones proximal-control parameters.
POTENTIAL_ALPHA = 2.0
POTENTIAL_EPSILON = 1.5
# Desired inter-agent distance (distance units). Hex-lattice spacing is derived from this value.
DESIRED_DISTANCE = 0.45
# Maximum range (distance units) of proximal interaction.
PROXIMAL_RANGE = 0.81
`,
      initializer_source: `def hexagon_perturbed(config, rng, place):
    # Radius is bookkeeping, derived from N rather than exposed as an experiment parameter.
    radius = ceil((sqrt(12.0 * config.N - 3.0) - 3.0) / 6.0)
    i = 0
    for q in range(-radius, radius + 1):
        for r in range(-radius, radius + 1):
            s = -q - r
            if max(abs(q), abs(r), abs(s)) <= radius:
                if i < config.N:
                    x = config.DESIRED_DISTANCE * (q + 0.5 * r)
                    y = config.DESIRED_DISTANCE * SQRT3_OVER_2 * r
                    x += rng.uniform(-config.INITIAL_POSITION_NOISE, config.INITIAL_POSITION_NOISE)
                    y += rng.uniform(-config.INITIAL_POSITION_NOISE, config.INITIAL_POSITION_NOISE)
                    theta = rng.uniform(0.0, TAU)
                    place(i, x, y, theta)
                    i += 1

def random_uniform(config, rng, place):
    half = config.ARENA_SIZE / 2.0
    for i in range(config.N):
        x = rng.uniform(-half, half)
        y = rng.uniform(-half, half)
        theta = rng.uniform(0.0, TAU)
        place(i, x, y, theta)

def initialize(config, rng, place):
    if config.INITIALIZATION_METHOD == "hexagon_perturbed":
        hexagon_perturbed(config, rng, place)
    elif config.INITIALIZATION_METHOD == "random":
        random_uniform(config, rng, place)
`,
      controller_source: `class ActiveElasticAgent(Agent):
    def step(self, obs):
        proximal = Vec2(0.0, 0.0)
        sigma_lj = DESIRED_DISTANCE / pow(2.0, 1.0 / POTENTIAL_ALPHA)
        for neighbour in obs.neighbours:
            displacement = neighbour.relative_position
            distance = norm(displacement)
            ratio = sigma_lj / distance
            magnitude = -(4.0 * POTENTIAL_ALPHA * POTENTIAL_EPSILON / distance) * (2.0 * pow(ratio, 2.0 * POTENTIAL_ALPHA) - pow(ratio, POTENTIAL_ALPHA))
            proximal += magnitude * displacement / distance
        forward = K1 * dot(proximal, obs.heading) + U
        turning = K2 * dot(proximal, perpendicular(obs.heading))
        return Motion(forward, turning)
`
    }
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
    message,
    line: Number.isInteger(error?.line) ? error.line : null,
    column: Number.isInteger(error?.column) ? error.column : null
  };
}

function requireNumber(values, name, { integer = false, positive = false, nonnegative = false } = {}) {
  const value = values[name];
  if (typeof value !== "number" || !Number.isFinite(value)) throw new Error(`${name} must be numeric.`);
  if (integer && !Number.isInteger(value)) throw new Error(`${name} must be an integer.`);
  if (positive && value <= 0) throw new Error(`${name} must be positive.`);
  if (nonnegative && value < 0) throw new Error(`${name} must be non-negative.`);
  return value;
}

function validateCurrentRuntimeConfiguration(values) {
  requireNumber(values, "N", { integer: true, positive: true });
  requireNumber(values, "ARENA_SIZE", { positive: true });
  requireNumber(values, "CONTROL_DT", { positive: true });
  requireNumber(values, "SENSOR_NOISE", { nonnegative: true });
  requireNumber(values, "EXPERIMENT_DURATION", { positive: true });
  requireNumber(values, "U", { positive: true });
  requireNumber(values, "OMEGA_MAX", { positive: true });
  requireNumber(values, "K1");
  requireNumber(values, "K2");
  requireNumber(values, "POTENTIAL_ALPHA", { positive: true });
  requireNumber(values, "POTENTIAL_EPSILON", { positive: true });
  requireNumber(values, "DESIRED_DISTANCE", { positive: true });
  requireNumber(values, "PROXIMAL_RANGE", { positive: true });
  requireNumber(values, "INITIAL_POSITION_NOISE", { nonnegative: true });
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

  try {
    validateCurrentRuntimeConfiguration(config.values);
  } catch (error) {
    diagnostics.push({
      artifact: "configuration",
      category: "runtime-parameter",
      compiler_category: null,
      message: error instanceof Error ? error.message : String(error),
      line: null,
      column: null
    });
    return invalid(diagnostics);
  }

  let initializer;
  try {
    const initializerConfig = { ...config, values: { ...config.values, SEED: 0 } };
    initializer = compileInitializer(initializer_source, initializerConfig);
    const expected = config.values.N;
    if (initializer.state.length !== expected) throw new Error(`Initializer produced ${initializer.state.length} agents, expected N=${expected}.`);
    const arenaSize = config.values.ARENA_SIZE;
    const half = arenaSize / 2;
    const outside = initializer.state.findIndex((agent) => Math.abs(agent.x) > half || Math.abs(agent.y) > half);
    if (outside !== -1) throw new Error(`Initial agent ${outside} does not fit inside ARENA_SIZE=${arenaSize}.`);
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
      controller_ir_schema: controller.schema
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
