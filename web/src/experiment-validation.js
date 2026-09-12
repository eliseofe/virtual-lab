import { compileController } from "./controller/compiler.js";
import { compileConfig, numericParameters } from "./config/compiler.js";
import { compileInitializer } from "./initializer/compiler.js";
import {
  validateInitialStateForRuntime,
  validateRuntimeValues,
} from "./runtime/contract.js";

// Production-only compatibility for the pre-#63 built-in/legacy Active Elastic
// source. These aliases are deliberately not part of the science-free MCP
// authoring contract. New registry experiments use the generic runtime names.
export function runtimeValuesForProductionExperiment(values) {
  return {
    ...values,
    INTERACTION_RADIUS: values.INTERACTION_RADIUS ?? values.PROXIMAL_RANGE,
    MAX_FORWARD_SPEED: values.MAX_FORWARD_SPEED ?? values.U,
    MAX_ANGULAR_SPEED: values.MAX_ANGULAR_SPEED ?? values.OMEGA_MAX,
  };
}

function sourcesFromExperiment(experiment) {
  return {
    configSource: experiment?.config_source ?? experiment?.configSource ?? "",
    initializerSource: experiment?.initializer_source ?? experiment?.initializerSource ?? "",
    controllerSource: experiment?.controller_source ?? experiment?.controllerSource ?? "",
  };
}

export function compileProductionExperiment(experiment, { seed = 0 } = {}) {
  const { configSource, initializerSource, controllerSource } = sourcesFromExperiment(experiment);
  const config = compileConfig(configSource);
  const runtime = validateRuntimeValues(runtimeValuesForProductionExperiment(config.values));

  const initializerConfig = { ...config, values: { ...config.values, SEED: seed } };
  const initializer = compileInitializer(initializerSource, initializerConfig);
  validateInitialStateForRuntime(initializer.state, runtime);

  const parameters = numericParameters(config);
  const parameterTypes = Object.fromEntries(Object.keys(parameters).map((name) => [name, "scalar"]));
  const controller = compileController(controllerSource, { parameters: parameterTypes });

  return { config, runtime, initializer, controller, parameters };
}

export function productionExperimentRunnability(experiment, options) {
  try {
    compileProductionExperiment(experiment, options);
    return { runnable: true, error: null };
  } catch (error) {
    return {
      runnable: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
