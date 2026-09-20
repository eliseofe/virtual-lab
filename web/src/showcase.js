import { createClient } from "https://esm.sh/@supabase/supabase-js@2.111.0";
import { applyExperimentArtifacts, captureExperimentArtifacts } from "./experiment-artifacts.js";

const SUPABASE_URL = "https://izdmmudfrmqhvlgepwes.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_MKaLNxnqvYbJUyik9zN7WA_r4ie2P5d";
const AUTH_STORAGE_KEY = "vlab-production-registry-auth-v1";
const WORKSPACE_KEY_PREFIX = "vlab-last-experiment-v1:";
const SHOWCASE_QUERY = "showcase";
const CATALOG_SOURCE_PREFIX = "catalog:";
const REGISTRY_SCHEMA_VERSION = "vlab.registry-experiment/3";
const ARTIFACT_INTERFACE_VERSION = "vlab.experiment-artifacts/3";

const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: { storageKey: AUTH_STORAGE_KEY },
});

const experimentSelect = document.querySelector("#experiment-select");
const experimentPanel = experimentSelect?.closest(".experiment-panel");
const accountPanel = document.querySelector(".registry-panel");
const registrySaveState = document.querySelector(".registry-save-state");
const applySetup = document.querySelector("#apply-setup");
const setupFeedback = document.querySelector("#setup-feedback");
const runButton = document.querySelector("#run");
const runState = document.querySelector("#run-state");
const metadataRevision = document.querySelector(".metadata-panel .panel-heading strong");
const utilityLaunchers = document.querySelector(".utility-launchers");

if (!experimentSelect || !experimentPanel || !accountPanel || !registrySaveState || !applySetup || !setupFeedback || !runButton || !runState || !metadataRevision || !utilityLaunchers) {
  throw new Error("Showcase integration UI mismatch.");
}

let sessionUser = null;
let profile = null;
let entries = [];
let currentShowcase = null;
let busy = false;

function installStyles() {
  if (document.querySelector("style[data-vlab-showcase]")) return;
  const style = document.createElement("style");
  style.dataset.vlabShowcase = "";
  style.textContent = `
    .showcase-launcher { min-height: 34px; }
    .showcase-dialog { width: min(820px, calc(100vw - 28px)); max-height: min(760px, calc(100vh - 28px)); border: 0; border-radius: 16px; padding: 0; box-shadow: 0 18px 70px rgba(16,35,44,.28); color: #172127; }
    .showcase-dialog::backdrop { background: rgba(16,27,33,.42); }
    .showcase-shell { display: grid; grid-template-rows: auto auto auto 1fr; max-height: inherit; min-height: min(520px, calc(100vh - 28px)); background: #fff; }
    .showcase-head { display: flex; justify-content: space-between; align-items: center; gap: 12px; padding: 17px 18px 12px; border-bottom: 1px solid #e6ecef; }
    .showcase-head h2 { margin: 0; font-size: 17px; }
    .showcase-head-actions { display: flex; gap: 7px; }
    .showcase-message { margin: 0; padding: 8px 18px; min-height: 1.4em; color: #64757c; font-size: 11.5px; line-height: 1.4; }
    .showcase-message:empty { display: none; }
    .showcase-message[data-state="error"] { color: #9e2d29; }
    .showcase-list { display: grid; align-content: start; gap: 8px; overflow: auto; padding: 0 18px 18px; }
    .showcase-entry-row { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 8px; align-items: stretch; }
    .showcase-entry { display: grid; gap: 5px; width: 100%; padding: 11px 12px; text-align: left; border: 1px solid #dfe7ea; border-radius: 11px; background: #fff; }
    .showcase-entry:hover { background: #f6f9fa; }
    .showcase-entry strong { font-size: 13px; }
    .showcase-entry span { color: #718087; font-size: 10.5px; line-height: 1.4; }
    .showcase-entry .showcase-entry-action { color: #315e71; font-size: 11px; font-weight: 750; }
    .showcase-entry-row[data-active="true"] .showcase-entry { border-color: #7ea8ba; background: #f0f7fa; box-shadow: inset 3px 0 0 #4f8399; }
    .showcase-entry-row[data-active="true"] .showcase-entry-action { color: #214c60; }
    .showcase-entry-remove { min-width: 88px; padding-inline: 12px; }
    .showcase-current { display: grid; gap: 7px; padding: 10px 12px; border: 1px solid #c9dce4; border-radius: 11px; background: #f5fafc; }
    .showcase-current[hidden] { display: none !important; }
    .showcase-current-head { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: 8px; }
    .showcase-current-title { margin: 0; font-size: 12px; font-weight: 750; }
    .showcase-current-meta { margin: 0; color: #64757c; font-size: 10.5px; }
    .showcase-current-actions { display: flex; flex-wrap: wrap; gap: 7px; }
    .showcase-promote-current[hidden] { display: none !important; }
    .showcase-curation-status { margin: 5px 0 0; color: #5f7077; font-size: 11.5px; line-height: 1.4; }
    .showcase-curation-status:empty { display: none; }
    .showcase-curation-status[data-state="error"] { color: #9e2d29; }
    .showcase-curation-status[data-state="success"] { color: #246240; }
    @media (max-width: 680px) {
      .showcase-dialog { width: calc(100vw - 20px); max-height: calc(100vh - 20px); }
      .showcase-shell { min-height: min(620px, calc(100vh - 20px)); }
      .showcase-head-actions button, .showcase-promote-current, .showcase-entry-remove { min-height: 44px; }
      .showcase-entry-row { grid-template-columns: 1fr; }
      .showcase-entry-remove { width: 100%; }
    }
  `;
  document.head.append(style);
}

function buildUi() {
  const launcher = document.createElement("button");
  launcher.type = "button";
  launcher.className = "showcase-launcher";
  launcher.textContent = "Showcase";
  utilityLaunchers.prepend(launcher);

  const dialog = document.createElement("dialog");
  dialog.className = "showcase-dialog";
  dialog.setAttribute("aria-label", "Showcase experiments");

  const shell = document.createElement("div");
  shell.className = "showcase-shell";
  const head = document.createElement("div");
  head.className = "showcase-head";
  const title = document.createElement("h2");
  title.textContent = "Showcase";
  const headActions = document.createElement("div");
  headActions.className = "showcase-head-actions";
  const refresh = document.createElement("button");
  refresh.type = "button";
  refresh.textContent = "Refresh";
  const close = document.createElement("button");
  close.type = "button";
  close.textContent = "Close";
  headActions.append(refresh, close);
  head.append(title, headActions);

  const currentExperimentMain = experimentPanel.querySelector(".experiment-current-main");
  const browseExperiment = currentExperimentMain?.querySelector(".experiment-browse");
  if (!currentExperimentMain || !browseExperiment) throw new Error("Showcase current-Experiment UI mismatch.");

  const currentExperimentActions = document.createElement("div");
  currentExperimentActions.className = "experiment-current-actions";
  browseExperiment.replaceWith(currentExperimentActions);
  currentExperimentActions.append(browseExperiment);

  const promote = document.createElement("button");
  promote.type = "button";
  promote.className = "primary showcase-promote-current";
  promote.hidden = true;
  currentExperimentActions.append(promote);

  const curationStatus = document.createElement("p");
  curationStatus.className = "showcase-curation-status";
  curationStatus.setAttribute("role", "status");
  curationStatus.setAttribute("aria-live", "polite");
  curationStatus.dataset.state = "idle";
  currentExperimentMain.insertAdjacentElement("afterend", curationStatus);

  const message = document.createElement("p");
  message.className = "showcase-message";
  message.setAttribute("role", "status");
  const list = document.createElement("div");
  list.className = "showcase-list";
  shell.append(head, message, list);
  dialog.append(shell);
  document.body.append(dialog);

  const current = document.createElement("section");
  current.className = "showcase-current";
  current.hidden = true;
  const currentHead = document.createElement("div");
  currentHead.className = "showcase-current-head";
  const currentTitle = document.createElement("p");
  currentTitle.className = "showcase-current-title";
  const currentMeta = document.createElement("p");
  currentMeta.className = "showcase-current-meta";
  const currentActions = document.createElement("div");
  currentActions.className = "showcase-current-actions";
  const saveCopy = document.createElement("button");
  saveCopy.type = "button";
  saveCopy.textContent = "Save private copy";
  const leave = document.createElement("button");
  leave.type = "button";
  leave.textContent = "Leave Showcase";
  currentActions.append(saveCopy, leave);
  currentHead.append(currentTitle, currentActions);
  current.append(currentHead, currentMeta);
  experimentPanel.append(current);

  return {
    launcher, dialog, refresh, close, message, list,
    current, currentTitle, currentMeta, saveCopy, leave,
    curationStatus, promote,
  };
}

installStyles();
const ui = buildUi();

function setMessage(text, state = "idle") {
  ui.message.textContent = text;
  ui.message.dataset.state = state;
}

function formatDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(undefined, { year: "numeric", month: "short", day: "numeric" }).format(date);
}

function activeShowcaseId() {
  return new URL(window.location.href).searchParams.get(SHOWCASE_QUERY);
}

function currentRegistryId() {
  const value = experimentSelect.value;
  return typeof value === "string" && value.startsWith("registry:") ? value.slice("registry:".length) : null;
}

function currentCatalogSource() {
  if (currentRegistryId()) return null;
  const value = experimentSelect.value?.trim();
  if (!value) return null;
  return {
    key: `${CATALOG_SOURCE_PREFIX}${value}`,
    title: experimentSelect.selectedOptions?.[0]?.textContent?.trim() || value,
  };
}

function currentRegistryDirtyState() {
  return registrySaveState.dataset?.state || "";
}

function activeEntryForExperiment(experimentId) {
  if (!experimentId) return null;
  return entries.find((entry) => entry.source_experiment_id === experimentId) || null;
}

function activeEntryForCatalog(sourceKey) {
  if (!sourceKey) return null;
  return entries.find((entry) => entry.source_key === sourceKey) || null;
}

async function loadSessionAndProfile() {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  sessionUser = data.session?.user ?? null;
  profile = null;
  if (!sessionUser) return;
  const { data: profileData, error: profileError } = await supabase
    .from("profiles")
    .select("id, display_name, role")
    .eq("id", sessionUser.id)
    .maybeSingle();
  if (profileError) throw profileError;
  profile = profileData;
}

async function loadEntries() {
  const { data, error } = await supabase.rpc("list_showcase_experiments");
  if (error) throw error;
  entries = Array.isArray(data) ? data : [];
  renderList();
  await syncCurationUi();
  return entries;
}

function renderList() {
  ui.list.replaceChildren();
  const activeId = activeShowcaseId();
  for (const entry of entries) {
    const row = document.createElement("div");
    row.className = "showcase-entry-row";
    row.dataset.active = entry.showcase_id === activeId ? "true" : "false";

    const button = document.createElement("button");
    button.type = "button";
    button.className = "showcase-entry";
    button.dataset.showcaseId = entry.showcase_id;
    button.setAttribute("aria-label", `Open ${entry.title} in Lab and run it`);
    if (entry.showcase_id === activeId) button.setAttribute("aria-current", "page");

    const title = document.createElement("strong");
    title.textContent = entry.title;
    const meta = document.createElement("span");
    const date = formatDate(entry.published_at);
    const revision = entry.source_revision == null ? "" : ` · revision ${entry.source_revision}`;
    meta.textContent = `Curated${revision}${date ? ` · ${date}` : ""}`;
    const action = document.createElement("span");
    action.className = "showcase-entry-action";
    action.textContent = entry.showcase_id === activeId ? "Loaded in Lab" : "Open & run";
    button.append(title, meta, action);
    button.addEventListener("click", () => openEntry(entry));
    row.append(button);

    if (profile?.role === "professor") {
      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "showcase-entry-remove";
      remove.textContent = "Remove";
      remove.setAttribute("aria-label", `Remove ${entry.title} from Showcase`);
      remove.addEventListener("click", () => run(() => removeEntry(entry, remove)));
      row.append(remove);
    }

    ui.list.append(row);
  }
}

async function readCurrentOwnedExperiment() {
  if (!sessionUser) return null;
  const id = currentRegistryId();
  if (!id) return null;
  const { data, error } = await supabase
    .from("experiments")
    .select("id, owner_id, title, revision, lifecycle")
    .eq("id", id)
    .eq("owner_id", sessionUser.id)
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function ensureCurrentSavedForPromotion() {
  let experiment = await readCurrentOwnedExperiment();
  if (!experiment) throw new Error("Open one of your Experiments to promote it.");

  let state = currentRegistryDirtyState();
  if (state === "conflict") throw new Error("Resolve the save conflict before publishing this Experiment.");
  if (state === "saved") return experiment;
  if (state !== "dirty") throw new Error("This Experiment is not ready for promotion yet.");

  const saveButton = document.querySelector(".experiment-revision-actions .primary");
  if (!saveButton || saveButton.hidden || saveButton.disabled) throw new Error("The current Experiment cannot be saved right now.");

  saveButton.click();
  const deadline = performance.now() + 15000;
  while (performance.now() < deadline) {
    state = currentRegistryDirtyState();
    if (state === "saved") {
      experiment = await readCurrentOwnedExperiment();
      if (!experiment) throw new Error("The saved Experiment could not be reloaded for promotion.");
      return experiment;
    }
    if (state === "conflict") throw new Error("Save conflict while preparing this Experiment for Showcase.");
    const registryMessage = document.querySelector(".registry-message");
    if (registryMessage?.dataset?.state === "error") {
      throw new Error(registryMessage.textContent?.trim() || "The Experiment could not be saved for Showcase.");
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("Saving the Experiment for Showcase timed out.");
}

async function syncCurationUi() {
  const professor = profile?.role === "professor";
  ui.promote.hidden = !professor || Boolean(currentShowcase);
  ui.curationStatus.textContent = "";
  ui.curationStatus.dataset.state = "idle";
  if (!professor || currentShowcase) return;

  const registryId = currentRegistryId();
  if (registryId) {
    const experiment = await readCurrentOwnedExperiment();
    if (!experiment) {
      ui.promote.hidden = true;
      return;
    }

    const state = currentRegistryDirtyState();
    const active = activeEntryForExperiment(experiment.id);
    ui.promote.hidden = false;

    if (active?.source_revision === experiment.revision && state === "saved") {
      ui.promote.textContent = "In Showcase";
      ui.promote.disabled = true;
      return;
    }

    if (state === "conflict") {
      ui.promote.textContent = "Publish to Showcase";
      ui.promote.disabled = true;
      ui.curationStatus.textContent = "Save conflict";
      ui.curationStatus.dataset.state = "error";
      return;
    }

    ui.promote.textContent = active ? "Publish current revision" : "Promote to Showcase";
    ui.promote.disabled = busy;
    return;
  }

  const source = currentCatalogSource();
  if (!source) {
    ui.promote.hidden = true;
    return;
  }

  const active = activeEntryForCatalog(source.key);
  ui.promote.hidden = false;
  ui.promote.textContent = active ? "In Showcase" : "Promote to Showcase";
  ui.promote.disabled = busy || Boolean(active);
}

async function promoteCurrent() {
  if (busy) return;
  if (profile?.role !== "professor") throw new Error("Professor role required.");

  busy = true;
  ui.promote.disabled = true;
  try {
    const registryId = currentRegistryId();
    if (registryId) {
      const experiment = await ensureCurrentSavedForPromotion();
      ui.promote.textContent = "Publishing…";
      ui.curationStatus.textContent = `Publishing · ${experiment.title}`;
      ui.curationStatus.dataset.state = "idle";
      const { error } = await supabase.rpc("promote_experiment_to_showcase", {
        p_experiment_id: experiment.id,
        p_expected_revision: experiment.revision,
      });
      if (error) throw error;
      await loadEntries();
      ui.curationStatus.textContent = `Published · ${experiment.title}`;
      ui.curationStatus.dataset.state = "success";
      return;
    }

    const source = currentCatalogSource();
    if (!source) throw new Error("Open an Experiment to promote it.");
    const payload = captureExperimentArtifacts();
    ui.promote.textContent = "Publishing…";
    ui.curationStatus.textContent = `Publishing · ${source.title}`;
    ui.curationStatus.dataset.state = "idle";
    const { error } = await supabase.rpc("promote_catalog_to_showcase", {
      p_source_key: source.key,
      p_title: source.title,
      p_description: "",
      p_schema_version: REGISTRY_SCHEMA_VERSION,
      p_interface_version: ARTIFACT_INTERFACE_VERSION,
      p_artifacts: payload.artifacts,
    });
    if (error) throw error;
    await loadEntries();
    ui.curationStatus.textContent = `Published · ${source.title}`;
    ui.curationStatus.dataset.state = "success";
  } finally {
    busy = false;
    await syncCurationUi();
  }
}

async function removeEntry(entry, button) {
  if (busy) return;
  if (profile?.role !== "professor") throw new Error("Professor role required.");
  if (!window.confirm(`Remove “${entry.title}” from Showcase?`)) return;

  busy = true;
  button.disabled = true;
  const original = button.textContent;
  button.textContent = "Removing…";
  try {
    const { data, error } = await supabase.rpc("remove_showcase_entry", {
      p_showcase_id: entry.showcase_id,
    });
    if (error) throw error;
    if (data !== true) throw new Error(`“${entry.title}” is no longer an active Showcase entry.`);
    if (currentShowcase?.showcase_id === entry.showcase_id) {
      clearShowcaseLocation();
      return;
    }
    await loadEntries();
    setMessage(`Removed “${entry.title}” from Showcase.`);
  } finally {
    busy = false;
    button.disabled = false;
    button.textContent = original;
  }
}

function hasUnsavedPrivateEdits() {
  return currentRegistryDirtyState() === "dirty" || currentRegistryDirtyState() === "conflict";
}

function navigateToShowcase(showcaseId) {
  const url = new URL(window.location.href);
  url.searchParams.set(SHOWCASE_QUERY, showcaseId);
  window.location.assign(url);
}

function openEntry(entry) {
  if (hasUnsavedPrivateEdits() && !window.confirm("Discard the unsaved changes to the current experiment and open this Showcase revision?")) return;
  navigateToShowcase(entry.showcase_id);
}

function clearShowcaseLocation() {
  const url = new URL(window.location.href);
  url.searchParams.delete(SHOWCASE_QUERY);
  window.location.assign(url);
}

async function waitForRegistryReady() {
  const deadline = performance.now() + 15000;
  while (performance.now() < deadline) {
    const accountIdentity = accountPanel.querySelector(".registry-account strong")?.textContent?.trim();
    if (accountIdentity && accountIdentity !== "Signed out") return;
    if (!sessionUser && accountIdentity === "Signed out") return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}

async function forceCatalogWorkspace() {
  const catalog = [...experimentSelect.options].find((option) => !option.value.startsWith("registry:"));
  if (!catalog) return;
  if (experimentSelect.value !== catalog.value) {
    experimentSelect.value = catalog.value;
    experimentSelect.dispatchEvent(new Event("change", { bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
}

async function waitForSimulatorReady() {
  const deadline = performance.now() + 15000;
  while (applySetup.disabled && performance.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 100));
  if (applySetup.disabled) throw new Error("Simulator is not ready yet.");
}

async function waitForSetupApplied() {
  const deadline = performance.now() + 15000;
  while (performance.now() < deadline) {
    const state = setupFeedback.dataset.state;
    if (state === "success") return;
    if (state === "error") throw new Error(setupFeedback.textContent?.trim() || "Showcase Experiment could not be applied.");
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("Applying the Showcase Experiment timed out.");
}

async function startShowcaseRun() {
  const deadline = performance.now() + 15000;
  while (runButton.disabled && performance.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 100));
  if (runButton.disabled) throw new Error("Showcase Experiment is not runnable yet.");
  if (runState.textContent?.trim().toLowerCase() !== "running") runButton.click();
}

function decorateShowcaseSource(entry) {
  currentShowcase = entry;
  const title = experimentPanel.querySelector(".experiment-current-title");
  const origin = experimentPanel.querySelector(".experiment-origin");
  const location = experimentPanel.querySelector(".experiment-location");
  if (title) title.textContent = entry.title;
  if (origin) {
    origin.dataset.kind = "readonly";
    origin.textContent = "Showcase · Read-only";
  }
  if (location) location.textContent = "Showcase";
  metadataRevision.textContent = entry.source_revision == null ? "showcase · curated snapshot" : `showcase · source r${entry.source_revision}`;
  ui.current.hidden = false;
  ui.currentTitle.textContent = entry.title;
  ui.currentMeta.textContent = entry.source_revision == null ? "Curated snapshot." : `Curated revision ${entry.source_revision}.`;
  ui.saveCopy.hidden = !sessionUser;
}

async function loadShowcaseFromLocation() {
  const showcaseId = activeShowcaseId();
  if (!showcaseId) return;
  const entry = entries.find((candidate) => candidate.showcase_id === showcaseId);
  if (!entry) {
    setMessage("This Showcase entry is no longer available.", "error");
    return;
  }

  await waitForRegistryReady();
  await forceCatalogWorkspace();
  applyExperimentArtifacts({ artifacts: entry.artifacts });
  await waitForSimulatorReady();
  applySetup.click();
  decorateShowcaseSource(entry);
  await waitForSetupApplied();
  await startShowcaseRun();
}

async function savePrivateCopy() {
  if (!sessionUser || !currentShowcase) throw new Error("Sign in and open a Showcase Experiment first.");
  const title = `${currentShowcase.title} copy`;
  const { data, error } = await supabase
    .from("experiments")
    .insert({
      owner_id: sessionUser.id,
      collection_id: null,
      title,
      description: currentShowcase.description || "",
      lifecycle: "active",
      visibility: "private",
      artifacts: currentShowcase.artifacts,
      created_by_actor: "human",
      created_by_ai_client: null,
      updated_by_actor: "human",
      updated_by_ai_client: null,
    })
    .select("id")
    .single();
  if (error) throw error;

  try {
    window.localStorage.setItem(`${WORKSPACE_KEY_PREFIX}${sessionUser.id}`, `registry:${data.id}`);
  } catch (storageError) {
    console.warn("Could not remember the new private Experiment.", storageError);
  }
  clearShowcaseLocation();
}

async function openDialog() {
  setMessage("Loading…");
  await loadEntries();
  setMessage(`${entries.length} Showcase experiment${entries.length === 1 ? "" : "s"}.`);
  ui.dialog.showModal();
  ui.close.focus({ preventScroll: true });
}

async function initialize() {
  await loadSessionAndProfile();
  await loadEntries();
  await loadShowcaseFromLocation();
  await syncCurationUi();
}

async function run(action) {
  try {
    await action();
  } catch (error) {
    console.error(error);
    const message = error instanceof Error ? error.message : String(error);
    setMessage(message, "error");
    if (profile?.role === "professor" && !ui.promote.hidden) {
      ui.curationStatus.textContent = message;
      ui.curationStatus.dataset.state = "error";
    }
  }
}

ui.launcher.addEventListener("click", () => run(openDialog));
ui.refresh.addEventListener("click", () => run(async () => {
  await loadEntries();
  setMessage(`${entries.length} Showcase experiment${entries.length === 1 ? "" : "s"}.`);
}));
ui.close.addEventListener("click", () => ui.dialog.close());
ui.dialog.addEventListener("click", (event) => {
  if (event.target === ui.dialog) ui.dialog.close();
});
ui.promote.addEventListener("click", () => run(promoteCurrent));
ui.saveCopy.addEventListener("click", () => run(savePrivateCopy));
ui.leave.addEventListener("click", clearShowcaseLocation);
experimentSelect.addEventListener("change", () => {
  if (!currentShowcase) {
    queueMicrotask(() => run(syncCurationUi));
    return;
  }
  const url = new URL(window.location.href);
  url.searchParams.delete(SHOWCASE_QUERY);
  window.history.replaceState(null, "", url);
  currentShowcase = null;
  ui.current.hidden = true;
  queueMicrotask(() => run(syncCurationUi));
});

const registrySaveObserver = new MutationObserver(() => {
  if (profile?.role === "professor") queueMicrotask(() => run(syncCurationUi));
});
registrySaveObserver.observe(registrySaveState, { attributes: true, attributeFilter: ["data-state"] });

supabase.auth.onAuthStateChange((_event, session) => {
  const nextId = session?.user?.id ?? null;
  if (nextId === sessionUser?.id) return;
  queueMicrotask(() => run(initialize));
});

run(initialize);
