export const RUNTIME_CONTRACT_VERSION = "vlab.runtime/0.1";

export const RUNTIME_CONTRACT = Object.freeze({
  version: RUNTIME_CONTRACT_VERSION,
  simulator_constants: Object.freeze({
    PHYSICS_DT: 0.01,
    METRIC_DT: 0.10,
  }),
  required_configuration: Object.freeze({
    N: "positive integer agent count",
    ARENA_SIZE: "positive finite scalar",
    CONTROL_DT: "positive finite scalar and integer multiple of PHYSICS_DT",
    SENSOR_NOISE: "non-negative finite scalar",
    EXPERIMENT_DURATION: "positive finite scalar",
    INTERACTION_RADIUS: "positive finite scalar used by neighbour observations",
    MAX_FORWARD_SPEED: "positive finite scalar actuator limit",
    MAX_ANGULAR_SPEED: "positive finite scalar actuator limit",
  }),
});

export class RuntimeContractError extends Error {
  constructor(parameter, message) {
    super(message);
    this.name = "RuntimeContractError";
    this.category = "runtime-parameter";
    this.parameter = parameter;
  }
}

function requireNumber(values, name, { integer = false, positive = false, nonnegative = false } = {}) {
  const value = values[name];
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new RuntimeContractError(name, `${name} must be numeric.`);
  }
  if (integer && !Number.isInteger(value)) {
    throw new RuntimeContractError(name, `${name} must be an integer.`);
  }
  if (positive && value <= 0) {
    throw new RuntimeContractError(name, `${name} must be positive.`);
  }
  if (nonnegative && value < 0) {
    throw new RuntimeContractError(name, `${name} must be non-negative.`);
  }
  return value;
}

function requireStride(period, physicsDt, name) {
  const ratio = period / physicsDt;
  const rounded = Math.round(ratio);
  if (rounded < 1 || Math.abs(ratio - rounded) > 1e-9) {
    throw new RuntimeContractError(
      name,
      `${name} must be an integer multiple of PHYSICS_DT=${physicsDt}.`,
    );
  }
}

export function validateRuntimeValues(values) {
  const physicsDt = RUNTIME_CONTRACT.simulator_constants.PHYSICS_DT;
  const metricDt = RUNTIME_CONTRACT.simulator_constants.METRIC_DT;
  const agentCount = requireNumber(values, "N", { integer: true, positive: true });
  const arenaSize = requireNumber(values, "ARENA_SIZE", { positive: true });
  const controlDt = requireNumber(values, "CONTROL_DT", { positive: true });
  const sensorNoise = requireNumber(values, "SENSOR_NOISE", { nonnegative: true });
  const experimentDuration = requireNumber(values, "EXPERIMENT_DURATION", { positive: true });
  const interactionRadius = requireNumber(values, "INTERACTION_RADIUS", { positive: true });
  const maxForwardSpeed = requireNumber(values, "MAX_FORWARD_SPEED", { positive: true });
  const maxAngularSpeed = requireNumber(values, "MAX_ANGULAR_SPEED", { positive: true });

  requireStride(controlDt, physicsDt, "CONTROL_DT");
  requireStride(metricDt, physicsDt, "METRIC_DT");

  return {
    version: RUNTIME_CONTRACT_VERSION,
    agentCount,
    arenaSize,
    controlDt,
    sensorNoise,
    experimentDuration,
    interactionRadius,
    maxForwardSpeed,
    maxAngularSpeed,
    physicsDt,
    metricDt,
  };
}

export function validateInitialStateForRuntime(state, runtime) {
  if (!Array.isArray(state) || state.length !== runtime.agentCount) {
    throw new RuntimeContractError(
      "N",
      `Initializer produced ${Array.isArray(state) ? state.length : 0} agents, expected N=${runtime.agentCount}.`,
    );
  }

  const half = runtime.arenaSize / 2;
  const outside = state.findIndex((agent) =>
    !agent ||
    typeof agent.x !== "number" || !Number.isFinite(agent.x) ||
    typeof agent.y !== "number" || !Number.isFinite(agent.y) ||
    typeof agent.heading !== "number" || !Number.isFinite(agent.heading) ||
    Math.abs(agent.x) > half || Math.abs(agent.y) > half
  );
  if (outside !== -1) {
    throw new RuntimeContractError(
      "ARENA_SIZE",
      `Initial agent ${outside} does not fit inside ARENA_SIZE=${runtime.arenaSize}.`,
    );
  }

  return state;
}

export function simulationSetupFromRuntime(runtime, seed, initialState) {
  return {
    initialState,
    simulation: {
      seed,
      physicsDt: runtime.physicsDt,
      controlDt: runtime.controlDt,
      metricDt: runtime.metricDt,
      interactionRadius: runtime.interactionRadius,
      arenaSize: runtime.arenaSize,
      sensorNoise: runtime.sensorNoise,
      maxForwardSpeed: runtime.maxForwardSpeed,
      maxAngularSpeed: runtime.maxAngularSpeed,
    },
  };
}
