import { createClient } from "https://esm.sh/@supabase/supabase-js@2.111.0";

const SUPABASE_URL = "https://izdmmudfrmqhvlgepwes.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_MKaLNxnqvYbJUyik9zN7WA_r4ie2P5d";
const RESULTS_SCHEMA = "vlab.results-presentation/1";
const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: { storageKey: "vlab-production-registry-auth-v1" },
});

let lastAppliedExperimentId = null;
let lastAppliedRevision = null;
let lastError = null;

function currentExperimentId() {
  const value = document.querySelector("#experiment-select")?.value ?? "";
  return value.startsWith("registry:") ? value.slice("registry:".length) : null;
}

function clearPanels() {
  for (const button of [...document.querySelectorAll('.results-plot-action[data-action="remove"]')]) button.click();
}

function applyPanels(presentation, availableMetricIds) {
  const api = globalThis.__vlabResultsUI;
  if (!api) return;
  const available = new Set(availableMetricIds);
  clearPanels();
  for (const panel of presentation?.panels ?? []) {
    if (panel?.type !== "time-series") continue;
    const ids = [...new Set((panel.metric_ids ?? []).filter((id) => available.has(id)))];
    if (ids.length) api.addPanel(ids);
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

  const presentation = data ?? { schema_version: RESULTS_SCHEMA, revision: 0, panels: [] };
  if (presentation.schema_version !== RESULTS_SCHEMA) {
    lastError = `Unsupported Results presentation schema '${presentation.schema_version}'.`;
    console.warn(lastError);
    return;
  }

  applyPanels(presentation, (ir?.metrics ?? []).map((metric) => metric.id));
  lastAppliedExperimentId = experimentId;
  lastAppliedRevision = presentation.revision;
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
