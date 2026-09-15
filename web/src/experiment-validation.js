import { compileController } from "./controller/compiler.js";
import { compileConfig, numericParameters } from "./config/compiler.js";
import { compileEnvironmentScalar, validateEnvironmentControllerPair } from "./environment/compiler.js";
import { compileInitializer } from "./initializer/compiler.js";
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

export function runtimeValuesForProductionExperiment(values) {
  return {
    ...values,
    INTERACTION_RADIUS: values.INTERACTION_RADIUS ?? values.PROXIMAL_RANGE,
    MAX_FORWARD_SPEED: values.MAX_FORWARD_SPEED ?? values.U,
    MAX_ANGULAR_SPEED: values.MAX_ANGULAR_SPEED ?? values.OMEGA_MAX,
  };
}

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
  const metrics = compileMetrics(metricsSource, { parameters: parameterTypes });

  return { config, runtime, initializer, environment, controller, metrics, parameters };
}

export function compileProductionExperiment(experiment, options) {
  return compileExperiment(experiment, runtimeValuesForProductionExperiment, options);
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

export function registryArtifactsFromProductionExperiment(experiment) {
  const artifacts = experimentArtifactArray(experiment);
  const fields = sourceFieldsFromArtifactArray(artifacts);
  const config = compileConfig(fields.config_source);
  const aliases = [];
  if (config.values.INTERACTION_RADIUS === undefined && config.values.PROXIMAL_RANGE !== undefined) aliases.push("INTERACTION_RADIUS = PROXIMAL_RANGE");
  if (config.values.MAX_FORWARD_SPEED === undefined && config.values.U !== undefined) aliases.push("MAX_FORWARD_SPEED = U");
  if (config.values.MAX_ANGULAR_SPEED === undefined && config.values.OMEGA_MAX !== undefined) aliases.push("MAX_ANGULAR_SPEED = OMEGA_MAX");
  const configSource = aliases.length ? `${fields.config_source.replace(/\s+$/, "")}\n${aliases.join("\n")}\n` : fields.config_source;
  const updated = artifacts.map((artifact) => artifact.id === "configuration" ? { ...artifact, content: configSource } : artifact);
  return artifactWritePayload(updated);
}
