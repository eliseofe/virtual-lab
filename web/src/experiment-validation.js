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

function compileExperiment(experiment, runtimeValues, { seed = 0 } = {}) {
  const { configSource, initializerSource, controllerSource } = sourcesFromExperiment(experiment);
  const config = compileConfig(configSource);
  const runtime = validateRuntimeValues(runtimeValues(config.values));

  const initializerConfig = { ...config, values: { ...config.values, SEED: seed } };
  const initializer = compileInitializer(initializerSource, initializerConfig);
  validateInitialStateForRuntime(initializer.state, runtime);

  const parameters = numericParameters(config);
  const parameterTypes = Object.fromEntries(Object.keys(parameters).map((name) => [name, "scalar"]));
  const controller = compileController(controllerSource, { parameters: parameterTypes });

  return { config, runtime, initializer, controller, parameters };
}

export function compileProductionExperiment(experiment, options) {
  return compileExperiment(experiment, runtimeValuesForProductionExperiment, options);
}

// Registry writes use the same science-neutral runtime requirements exposed to
// AI authors. Unlike the production loader, this path deliberately does not
// apply the built-in Active Elastic compatibility aliases.
export function compileRegistryExperiment(experiment, options) {
  return compileExperiment(experiment, (values) => values, options);
}

function runnability(compile, experiment, options) {
  try {
    compile(experiment, options);
    return { runnable: true, error: null };
  } catch (error) {
    return {
      runnable: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export function productionExperimentRunnability(experiment, options) {
  return runnability(compileProductionExperiment, experiment, options);
}

export function registryExperimentRunnability(experiment, options) {
  return runnability(compileRegistryExperiment, experiment, options);
}

// The built-in Active Elastic source predates the generic runtime contract.
// When a signed-in user explicitly saves that built-in example as a registry
// experiment, add only the generic runtime aliases already used mechanically by
// production. No scientific values are derived or changed.
export function registryArtifactsFromProductionExperiment(experiment) {
  const { configSource, initializerSource, controllerSource } = sourcesFromExperiment(experiment);
  const config = compileConfig(configSource);
  const aliases = [];
  if (config.values.INTERACTION_RADIUS === undefined && config.values.PROXIMAL_RANGE !== undefined) {
    aliases.push("INTERACTION_RADIUS = PROXIMAL_RANGE");
  }
  if (config.values.MAX_FORWARD_SPEED === undefined && config.values.U !== undefined) {
    aliases.push("MAX_FORWARD_SPEED = U");
  }
  if (config.values.MAX_ANGULAR_SPEED === undefined && config.values.OMEGA_MAX !== undefined) {
    aliases.push("MAX_ANGULAR_SPEED = OMEGA_MAX");
  }

  return {
    config_source: aliases.length
      ? `${configSource.replace(/\s+$/, "")}\n${aliases.join("\n")}\n`
      : configSource,
    initializer_source: initializerSource,
    controller_source: controllerSource,
  };
}
