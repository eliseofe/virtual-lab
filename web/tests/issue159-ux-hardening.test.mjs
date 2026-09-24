import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { sourceWithStyles } from "./support/source-with-styles.mjs";

const [index, baseCss, hardeningCss, workspaceShell, authoring, organization, hardening, responsiveSmoke, productSurfaceSource] = await Promise.all([
  readFile(new URL("../src/index.html", import.meta.url), "utf8"),
  readFile(new URL("../src/style.css", import.meta.url), "utf8"),
  readFile(new URL("../src/ux-hardening.css", import.meta.url), "utf8"),
  readFile(new URL("../src/workspace-shell.js", import.meta.url), "utf8"),
  sourceWithStyles("authoring-workspace.js"),
  sourceWithStyles("collection-organization.js"),
  readFile(new URL("../src/ux-hardening.js", import.meta.url), "utf8"),
  readFile(new URL("../scripts/responsive-smoke.mjs", import.meta.url), "utf8"),
  readFile(new URL("../product-surface.json", import.meta.url), "utf8"),
]);

const productSurface = JSON.parse(productSurfaceSource);

assert.ok(index.includes('href="./ux-hardening.css"'), "hardening stylesheet must load after the base stylesheet");
assert.ok(workspaceShell.includes('import "./ux-hardening.js";'), "workspace shell must load accessibility/focus hardening");

const experimentIndex = index.indexOf('class="panel experiment-panel"');
const stageIndex = index.indexOf('class="panel stage-panel"');
const authoringIndex = index.indexOf('id="authoring-workbench"');
const technicalIndex = index.indexOf('class="panel metadata-panel technical-panel"');
assert.ok(experimentIndex >= 0 && experimentIndex < stageIndex, "current Experiment must precede the simulation stage");
assert.ok(stageIndex < authoringIndex, "simulation stage must precede authoring");
assert.ok(authoringIndex < technicalIndex, "authoring must precede technical details");
assert.ok(!index.slice(index.indexOf('<main class="workspace">'), index.indexOf('</main>')).includes('workspace-utilities'), "admin utilities must remain outside the scientific workspace");

assert.match(index, /class="topbar-status"[^>]*role="status"[^>]*aria-live="polite"/);
assert.match(index, /id="simulation-canvas"[^>]*aria-describedby="arena-instructions"/);
assert.match(index, /id="authoring-runtime-state"[^>]*role="status"[^>]*aria-live="polite"/);
assert.ok(!index.includes('<details class="panel metadata-panel technical-panel" open'), "Technical details must stay collapsed by default");

assert.match(hardeningCss, /:focus-visible/);
assert.match(hardeningCss, /min-height:\s*44px/);
assert.match(hardeningCss, /100dvh/);
assert.match(hardeningCss, /prefers-reduced-motion/);
assert.match(hardeningCss, /body:has\(dialog\[open\]\)/);
assert.match(hardeningCss, /@media \(max-width: 720px\)/);
assert.match(hardeningCss, /@media \(hover: none\) and \(pointer: coarse\)/);
assert.ok(baseCss.includes(".workspace { display: grid; grid-template-columns: minmax(0, 1fr)"), "base shell must remain one coherent page flow");

assert.match(authoring, /\["ArrowLeft", "ArrowRight", "Home", "End"\]/);
assert.match(authoring, /pane\.hidden = pane !== nextPane/);
assert.match(authoring, /role", "tabpanel"/);
assert.match(hardening, /aria-haspopup/);
assert.match(hardening, /aria-expanded/);
assert.match(hardening, /requestAnimationFrame/);
assert.match(hardening, /trigger\.focus\(\{ preventScroll: true \}\)/);
assert.ok(hardening.includes("discoveryObserver.observe(document.body, { childList: true, subtree: true });"), "discovery observer must only watch structural child insertion");
assert.ok(!hardening.includes("attributes: true, subtree: true"), "discovery observer must not recreate the self-triggering attribute loop class");
assert.match(workspaceShell, /button:not\(:disabled\):not\(\[hidden\]\)/);

assert.match(organization, /#480 owns discovery/);
assert.match(organization, /vlab-refresh-experiment-library/);
assert.match(organization, /\.experiment-organize/);
assert.ok(!organization.includes("simulator"), "organization adapter must remain browser presentation/persistence only");

assert.match(responsiveSmoke, /Emulation\.setDeviceMetricsOverride/);
assert.match(responsiveSmoke, /width:\s*390/);
assert.match(responsiveSmoke, /expected at least 44px/);
assert.match(responsiveSmoke, /Experiment Library did not return focus/);
assert.match(responsiveSmoke, /utility dialog did not return focus/);
assert.match(responsiveSmoke, /expected exactly one visible authoring pane/);
assert.match(responsiveSmoke, /administrative surface re-entered the scientific workspace/);
assert.match(responsiveSmoke, /collection filters re-entered primary experiment navigation/);
const responsiveSurface = productSurface.surfaces.find((surface) => surface.id === "responsive-experiment-account");
assert.equal(responsiveSurface?.state, "active");
assert.ok(responsiveSurface.smoke.some((check) => check.script.endsWith("responsive-smoke.mjs")), "responsive hardening must remain covered through the active product-surface tracker");

console.log("Issue #159 UI hierarchy, responsive, keyboard/focus, and deployed-smoke invariants are locked.");
