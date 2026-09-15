import { BUILTIN_ACTIVE_ELASTIC_METRICS_SOURCE } from "./builtin-active-elastic-metrics-source.js";

export { BUILTIN_ACTIVE_ELASTIC_METRICS_SOURCE } from "./builtin-active-elastic-metrics-source.js";

const editor = document.querySelector("#metrics-source");
if (!editor) throw new Error("Virtual Lab artifact UI mismatch: missing built-in Metrics editor.");
editor.value = BUILTIN_ACTIVE_ELASTIC_METRICS_SOURCE;
