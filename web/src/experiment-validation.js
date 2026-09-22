import { compileController } from "./controller/compiler.js";
import { compileConfig, numericParameters } from "./config/compiler.js";
import { compileEnvironmentScalar, validateEnvironmentControllerPair } from "./environment/compiler.js";
import { compileInitializer, validateInitializerControllerPrivateState } from "./initializer/compiler.js";
import { compileMetrics } from "./metrics/compiler.js";
import {
  artifactWritePayload,
  experimentArtifactArray,
  sourceFieldsFromArtifactArray,
} from "./experiment-artifacts.js";
import {
  validateInitialStateForRuntime,
  validateRuntimeValues,
} from "./runtime/contract.js";

function sourcesFromExperiment(experiment) {
  const artifacts = experimentArtifactArray(experiment);
  const fields = sourceFieldsFromArtifactArray(artifacts);
  const byId = new Map(artifacts.map((artifact) => [artifact.id, artifact]));
  return {
    configSource: fields.config_source,
    initializerSource: fields.initializer_source,
    controllerSource: fields.controller_source,
    metricsSource: byId.get("metrics")?.content ?? "",
  };
}

function compileExperiment(experiment, runtimeValues, { seed = 0 } = {}) {
  const { configSource, initializerSource, controllerSource, metricsSource } = sourcesFromExperiment(experiment);
  const config = compileConfig(configSource);
  const runtime = validateRuntimeValues(runtimeValues(config.values));

  const initializerConfig = { ...config, values: { ...config.values, SEED: seed } };
  const initializer = compileInitializer(initializerSource, initializerConfig);
  validateInitialStateForRuntime(initializer.state, runtime);
  const environment = compileEnvironmentScalar(initializerSource, initializerConfig);

  const parameters = numericParameters(config);
  const parameterTypes = Object.fromEntries(Object.keys(parameters).map((name) => [name, "scalar"]));
  const controller = compileController(controllerSource, { parameters: parameterTypes });
  validateEnvironmentControllerPair(environment, controller);
  validateInitializerControllerPrivateState(initializer, controller);
  const metrics = compileMetrics(metricsSource, { parameters: parameterTypes });

  return { config, runtime, initializer, environment, controller, metrics, parameters };
}

export function compileProductionExperiment(experiment, options) {
  return compileExperiment(experiment, (values) => values, options);
}

export function compileRegistryExperiment(experiment, options) {
  return compileExperiment(experiment, (values) => values, options);
}

function runnability(compile, experiment, options) {
  try {
    compile(experiment, options);
    return { runnable: true, error: null };
  } catch (error) {
    return { runnable: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export function productionExperimentRunnability(experiment, options) { return runnability(compileProductionExperiment, experiment, options); }
export function registryExperimentRunnability(experiment, options) { return runnability(compileRegistryExperiment, experiment, options); }

