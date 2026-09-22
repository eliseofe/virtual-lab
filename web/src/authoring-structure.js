import { configStructure } from "./config/compiler.js";
import { initializerStructure } from "./initializer/compiler.js";
import { controllerStructure } from "./controller/compiler.js";
import { metricsStructure } from "./metrics/compiler.js";

export function artifactStructure(id, source) {
  if (id === "configuration") return configStructure(source);
  if (id === "initialization") return initializerStructure(source);
  if (id === "controller") return controllerStructure(source);
  if (id === "metrics") return metricsStructure(source);
  return { language: "text/plain", symbols: [] };
}

export function artifactStructureSafe(id, source) {
  try {
    const structure = artifactStructure(id, source);
    return { ...structure, error: null };
  } catch (error) {
    return {
      language: "unknown",
      symbols: [],
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export function symbolLabel(symbol) {
  const kind = symbol?.kind ?? "symbol";
  const name = symbol?.name ?? symbol?.id ?? "Unnamed";
  if (kind === "parameter") return `Parameter · ${name}`;
  if (kind === "function") return `Function · ${name}`;
  if (kind === "class") return `Class · ${name}`;
  if (kind === "state") return `State · ${name}`;
  if (kind === "method") return `Method · ${name}`;
  if (kind === "metric") return `Metric · ${name}`;
  return `${kind} · ${name}`;
}
