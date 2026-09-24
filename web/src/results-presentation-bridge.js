import { resultsCommands } from "./results-panel/results-commands.js";
import { resultsModel } from "./results-panel/results-model.js";
import { supabase } from "./supabase-client.js";

const RESULTS_SCHEMA = "vlab.results-presentation/1";

let lastAppliedExperimentId = null;
let lastAppliedRevision = null;
let lastError = null;

function currentExperimentId() {
  const value = document.querySelector("#experiment-select")?.value ?? "";
  return value.startsWith("registry:") ? value.slice("registry:".length) : null;
}

// Plots are replaced through the results controller (#569), as the plot
// buttons do.
function clearPanels() {
  for (const { id } of resultsModel.get().panels) resultsCommands.removePanel(id);
}

function applyPanels(presentation, availableMetricIds) {
  const available = new Set(availableMetricIds);
  clearPanels();
  for (const panel of presentation?.panels ?? []) {
    if (panel?.type !== "time-series") continue;
    const ids = [...new Set((panel.metric_ids ?? []).filter((id) => available.has(id)))];
    if (ids.length) resultsCommands.addPanelWithMetrics(ids);
  }
}

async function loadCurrentPresentation(ir) {
  const experimentId = currentExperimentId();
  if (!experimentId) {
    lastAppliedExperimentId = null;
    lastAppliedRevision = null;
    lastError = null;
    return;
  }

  const { data, error } = await supabase
    .from("experiment_results_presentations")
    .select("schema_version,revision,panels")
    .eq("experiment_id", experimentId)
    .maybeSingle();

  if (error) {
    lastError = error.message;
    console.warn("Could not load Results presentation.", error);
    return;
  }

  if (!data) {
    // No persisted presentation means "use the Lab's normal default layout", not
    // "explicitly show zero panels". A stored row with panels=[] is the explicit
    // zero-panel state.
    lastAppliedExperimentId = experimentId;
    lastAppliedRevision = 0;
    lastError = null;
    return;
  }

  if (data.schema_version !== RESULTS_SCHEMA) {
    lastError = `Unsupported Results presentation schema '${data.schema_version}'.`;
    console.warn(lastError);
    return;
  }

  applyPanels(data, (ir?.metrics ?? []).map((metric) => metric.id));
  lastAppliedExperimentId = experimentId;
  lastAppliedRevision = data.revision;
  lastError = null;
}

document.addEventListener("vlab:metrics-definition", (event) => {
  queueMicrotask(() => loadCurrentPresentation(event.detail?.ir).catch((error) => {
    lastError = error instanceof Error ? error.message : String(error);
    console.warn("Could not apply Results presentation.", error);
  }));
});

Object.defineProperty(globalThis, "__vlabResultsPresentation", {
  configurable: false,
  enumerable: false,
  value: Object.freeze({
    diagnostics: () => ({
      schema: RESULTS_SCHEMA,
      experimentId: lastAppliedExperimentId,
      revision: lastAppliedRevision,
      error: lastError,
    }),
  }),
});
