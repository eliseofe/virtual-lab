import { existsSync, readFileSync } from "node:fs";

// #543 moved each module's injected CSS verbatim into web/src/styles/.
// Source-text regression tests written before the move read a module
// together with its moved stylesheet through this helper.
export const MOVED_STYLES = Object.freeze({
  "result-persistence.js": "result-persistence.css",
  "registry-ui-v3.js": "registry-ui-v3.css",
  "experiment-library.js": "experiment-library.css",
  "student-registration.js": "student-registration.css",
  "student-onboarding.js": "student-onboarding.css",
  "showcase.js": "showcase.css",
  "showcase-professor-placement.js": "showcase-touch-targets.css",
  "authoring-workspace.js": "authoring-workspace.css",
  "collection-organization.js": "collection-organization.css",
  "experiment-management.js": "experiment-management.css",
  "ui-clarity.js": "ui-clarity.css",
  "professor-inbox.js": "professor-inbox.css",
  "professor-development-links.js": "professor-development-links.css",
});

export function sourceWithStyles(name) {
  const src = new URL("../../src/", import.meta.url);
  const js = new URL(name, src);
  const parts = existsSync(js) ? [readFileSync(js, "utf8")] : [];
  if (MOVED_STYLES[name]) parts.push(readFileSync(new URL(`styles/${MOVED_STYLES[name]}`, src), "utf8"));
  return parts.join("\n");
}
