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

test("#430 replaces the temporary bridge with one Professor-only Professor controls section", () => {
  assert.match(management, /experiment-professor-section/);
  assert.match(management, /taskHeading\("Professor controls"\)/);
  assert.match(management, /professorSection\.region\.hidden = !available/);
  assert.doesNotMatch(management, /experiment-professor-compat|Temporary bridge until the final Professor integration|Professor tools/);
});

test("#430 places authoritative Showcase actions inside Professor controls", () => {
  assert.match(management, /showcaseLauncher\.textContent = "Browse"/);
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
  assert.match(management, /Open · \$\{pending\}/);
  assert.match(inbox, /dialog\.id = "professor-extension-inbox"/);
  assert.match(inbox, /Review classified research requests/);
  assert.doesNotMatch(react, /data-vlab-nav="professor"|data-vlab-nav="showcase"/);
});

test("#430 keeps Showcase publication in Professor controls rather than Current Experiment actions", () => {
  assert.match(management, /currentActions\.append\(browseButton\)/);
  assert.match(management, /showcaseActions\.append\(showcaseLauncher, promote\)/);
  assert.doesNotMatch(management, /currentActions\.append\([^\n]*promote/);
  assert.doesNotMatch(management, /Temporary bridge/);
});

test("#430 preserves role and publication semantics in authoritative modules", () => {
  // #552: behaviour covered by showcase-curation.test.mjs; this checks showcase.js uses the rule.
  assert.match(showcase, /const professor = isProfessor\(profile\)/);
  assert.equal(showcase.match(/assertProfessor\(profile\);/g)?.length, 6, "every curation action requires the Professor role");
  assert.match(inbox, /panel\.hidden = true/);
  assert.match(inbox, /professor-pending-count/);
});

test("#430 responsive verification covers the accepted viewport classes", () => {
  assert.match(responsive, /label: "desktop", width: 1366/);
  assert.match(responsive, /label: "ultra-wide", width: 1920/);
  assert.match(responsive, /label: "foldable", width: 820/);
  assert.match(responsive, /label: "mobile", width: 390/);
});
