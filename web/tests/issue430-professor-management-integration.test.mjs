import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const [management, showcase, inbox, react, responsive] = await Promise.all([
  readFile(new URL("../src/experiment-management.js", import.meta.url), "utf8"),
  readFile(new URL("../src/showcase.js", import.meta.url), "utf8"),
  readFile(new URL("../src/professor-inbox.js", import.meta.url), "utf8"),
  readFile(new URL("../src/react-migration-root.tsx", import.meta.url), "utf8"),
  readFile(new URL("../scripts/responsive-smoke.mjs", import.meta.url), "utf8"),
]);

test("#430 replaces the temporary bridge with one Professor-only research-curation section", () => {
  assert.match(management, /experiment-professor-section/);
  assert.match(management, /taskHeading\("Research curation"\)/);
  assert.match(management, /professorSection\.region\.hidden = !available/);
  assert.doesNotMatch(management, /experiment-professor-compat|Temporary bridge until the final Professor integration|Professor tools/);
});

test("#430 places authoritative Showcase actions inside Research curation", () => {
  assert.match(management, /showcaseLauncher\.textContent = "Browse Showcase"/);
  assert.match(management, /showcaseActions\.append\(showcaseLauncher, promote\)/);
  assert.match(management, /showcaseGroup\.append\(showcaseTitle, showcaseActions, curationStatus\)/);
  assert.match(showcase, /ui\.launcher\.addEventListener\("click", \(\) => run\(openDialog\)\)/);
  assert.match(showcase, /ui\.promote\.addEventListener\("click", \(\) => run\(promoteCurrent\)\)/);
  assert.match(showcase, /supabase\.rpc\("promote_experiment_to_showcase"/);
  assert.match(showcase, /supabase\.rpc\("promote_catalog_to_showcase"/);
});

test("#430 exposes scientific Capability requests without a generic Professor launcher", () => {
  assert.match(management, /capabilityTitle\.textContent = "Capability requests"/);
  assert.match(management, /requests\.className = "experiment-capability-requests"/);
  assert.match(management, /querySelector\("\.professor-inbox-open"\)/);
  assert.match(management, /Capability requests · \$\{pending\}/);
  assert.match(inbox, /dialog\.id = "professor-extension-inbox"/);
  assert.match(inbox, /Review classified research requests/);
  assert.doesNotMatch(react, /data-vlab-nav="professor"|data-vlab-nav="showcase"/);
});

test("#430 removes Showcase publication from Current Experiment actions", () => {
  assert.match(management, /currentActions\?\.contains\(browseButton\)/);
  assert.match(management, /currentActions\.replaceWith\(browseButton\)/);
  assert.doesNotMatch(management, /Temporary bridge/);
});

test("#430 preserves role and publication semantics in authoritative modules", () => {
  assert.match(showcase, /profile\?\.role === "professor"/);
  assert.match(showcase, /Professor role required/);
  assert.match(inbox, /panel\.hidden = true/);
  assert.match(inbox, /professor-pending-count/);
});

test("#430 responsive verification waits for the reloaded document before asserting mobile UI", () => {
  assert.match(responsive, /function waitForFreshDocument/);
  assert.match(responsive, /__vlabResponsiveSmokeReloadToken/);
  assert.match(responsive, /await waitForFreshDocument\(cdp\.send, mobileReloadToken\)/);
});
