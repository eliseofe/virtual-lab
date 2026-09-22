import { applyExperimentArtifacts } from "./experiment-artifacts.js";
import {
  DEFAULT_CATALOG_EXPERIMENT,
  EXPERIMENT_CATALOG,
  catalogExperimentByValue,
  catalogSelectValue,
} from "./experiment-catalog.js";

const experimentSelect = document.querySelector("#experiment-select");
if (!experimentSelect) throw new Error("Catalog bootstrap UI mismatch: missing Experiment selector.");

export function installCatalogOptions(select = experimentSelect) {
  const registryOptions = [...select.options].filter((option) => option.value.startsWith("registry:"));
  select.replaceChildren();
  for (const experiment of EXPERIMENT_CATALOG) {
    const option = document.createElement("option");
    option.value = catalogSelectValue(experiment.key);
    option.textContent = experiment.title;
    option.dataset.catalogKey = experiment.key;
    select.append(option);
  }
  for (const option of registryOptions) select.append(option);
}

export function loadCatalogExperiment(experiment, { apply = true } = {}) {
  if (!experiment) throw new Error("Catalog Experiment not found.");
  experimentSelect.value = catalogSelectValue(experiment.key);
  if (apply) applyExperimentArtifacts(experiment);
  return experiment;
}

export function selectedCatalogExperiment(select = experimentSelect) {
  return catalogExperimentByValue(select.value);
}

installCatalogOptions();
loadCatalogExperiment(DEFAULT_CATALOG_EXPERIMENT);
