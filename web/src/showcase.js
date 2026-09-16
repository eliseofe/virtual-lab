import { createClient } from "https://esm.sh/@supabase/supabase-js@2.111.0";
import { applyExperimentArtifacts, captureExperimentArtifacts } from "./experiment-artifacts.js";

const SUPABASE_URL = "https://izdmmudfrmqhvlgepwes.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_MKaLNxnqvYbJUyik9zN7WA_r4ie2P5d";
const AUTH_STORAGE_KEY = "vlab-production-registry-auth-v1";
const WORKSPACE_KEY_PREFIX = "vlab-last-experiment-v1:";
const SHOWCASE_QUERY = "showcase";
const BUILTIN_SHOWCASE_ID = "builtin-active-elastic";

const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: { storageKey: AUTH_STORAGE_KEY },
});

const experimentSelect = document.querySelector("#experiment-select");
const experimentPanel = experimentSelect?.closest(".experiment-panel");
const accountPanel = document.querySelector(".registry-panel");
const registrySaveState = document.querySelector(".registry-save-state");
const applySetup = document.querySelector("#apply-setup");
const metadataRevision = document.querySelector(".metadata-panel .panel-heading strong");
const utilityLaunchers = document.querySelector(".utility-launchers");

if (!experimentSelect || !experimentPanel || !accountPanel || !registrySaveState || !applySetup || !metadataRevision || !utilityLaunchers) {
  throw new Error("Showcase integration UI mismatch.");
}

const BUILTIN_VALUE = experimentSelect.value;
const BUILTIN_TITLE = experimentSelect.selectedOptions?.[0]?.textContent?.trim() || "Active Elastic";
const builtinPayload = captureExperimentArtifacts();
const builtinEntry = Object.freeze({
  showcase_id: BUILTIN_SHOWCASE_ID,
  source_experiment_id: null,
  source_owner_id: null,
  source_revision: null,
  title: BUILTIN_TITLE,
  description: "Canonical built-in Virtual Lab experiment.",
  artifacts: builtinPayload.artifacts,
  published_at: null,
  builtin: true,
});

let sessionUser = null;
let profile = null;
let entries = [builtinEntry];
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
    .showcase-entry { display: grid; gap: 5px; width: 100%; padding: 11px 12px; text-align: left; border: 1px solid #dfe7ea; border-radius: 11px; background: #fff; }
    .showcase-entry:hover { background: #f6f9fa; }
    .showcase-entry strong { font-size: 13px; }
    .showcase-entry span { color: #718087; font-size: 10.5px; line-height: 1.4; }
    .showcase-current { display: grid; gap: 7px; padding: 10px 12px; border: 1px solid #c9dce4; border-radius: 11px; background: #f5fafc; }
    .showcase-current[hidden] { display: none !important; }
    .showcase-current-head { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: 8px; }
    .showcase-current-title { margin: 0; font-size: 12px; font-weight: 750; }
    .showcase-current-meta { margin: 0; color: #64757c; font-size: 10.5px; }
    .showcase-current-actions { display: flex; flex-wrap: wrap; gap: 7px; }
    .showcase-curation { display: grid; gap: 7px; margin: 10px 18px 6px; padding: 10px 12px; border: 1px solid #d8e4e8; border-radius: 11px; background: #f7fafb; }
    .showcase-curation[hidden] { display: none !important; }
    .showcase-curation strong { font-size: 12px; }
    .showcase-curation p { margin: 0; color: #5f7077; font-size: 11.5px; line-height: 1.4; }
    .showcase-curation-actions { display: flex; flex-wrap: wrap; gap: 7px; }
    @media (max-width: 680px) {
      .showcase-dialog { width: calc(100vw - 20px); max-height: calc(100vh - 20px); }
      .showcase-shell { min-height: min(620px, calc(100vh - 20px)); }
      .showcase-curation-actions button { min-height: 44px; }
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

  const curation = document.createElement("section");
  curation.className = "showcase-curation";
  curation.hidden = true;
  const curationTitle = document.createElement("strong");
  curationTitle.textContent = "Professor curation";
  const curationStatus = document.createElement("p");
  const curationActions = document.createElement("div");
  curationActions.className = "showcase-curation-actions";
  const promote = document.createElement("button");
  promote.type = "button";
  promote.className = "primary";
  const remove = document.createElement("button");
  remove.type = "button";
  remove.textContent = "Remove from Showcase";
  curationActions.append(promote, remove);
  curation.append(curationTitle, curationStatus, curationActions);

  const message = document.createElement("p");
  message.className = "showcase-message";
  message.setAttribute("role", "status");
  const list = document.createElement("div");
  list.className = "showcase-list";
  shell.append(head, curation, message, list);
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
    launcher, dialog, shell, refresh, close, message, list,
    current, currentTitle, currentMeta, saveCopy, leave,
    curation, curationStatus, promote, remove,
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
  const curated = Array.isArray(data) ? data : [];
  entries = [builtinEntry, ...curated];
  renderList();
  await syncCurationUi();
  return entries;
}

function renderList() {
  ui.list.replaceChildren();
  for (const entry of entries) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "showcase-entry";
    const title = document.createElement("strong");
    title.textContent = entry.title;
    const meta = document.createElement("span");
    if (entry.builtin) {
      meta.textContent = "Built-in · Public example";
    } else {
      const date = formatDate(entry.published_at);
      meta.textContent = `Curated · revision ${entry.source_revision}${date ? ` · ${date}` : ""}`;
    }
    button.append(title, meta);
    button.addEventListener("click", () => openEntry(entry));
    ui.list.append(button);
  }
}

function currentRegistryId() {
  const value = experimentSelect.value;
  return typeof value === "string" && value.startsWith("registry:") ? value.slice("registry:".length) : null;
}

function currentRegistryDirtyState() {
  return registrySaveState.dataset?.state || "";
}

function activeEntryForExperiment(experimentId) {
  if (!experimentId) return null;
  return entries.find((entry) => !entry.builtin && entry.source_experiment_id === experimentId) || null;
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

  const saveButton = document.querySelector(".registry-save-actions .primary");
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
  ui.curation.hidden = !professor;
  if (!professor) return;

  if (!currentRegistryId()) {
    ui.curationStatus.textContent = `${BUILTIN_TITLE} is already in Showcase.`;
    ui.promote.hidden = true;
    ui.remove.hidden = true;
    return;
  }

  const experiment = await readCurrentOwnedExperiment();
  if (!experiment) {
    ui.curationStatus.textContent = "Open one of your Experiments to curate it.";
    ui.promote.hidden = true;
    ui.remove.hidden = true;
    return;
  }

  const state = currentRegistryDirtyState();
  const active = activeEntryForExperiment(experiment.id);

  if (active?.source_revision === experiment.revision && state === "saved") {
    ui.curationStatus.textContent = `Revision ${experiment.revision} is in Showcase.`;
    ui.promote.hidden = true;
    ui.remove.hidden = false;
    ui.remove.disabled = busy;
    return;
  }

  ui.promote.hidden = false;
  ui.promote.textContent = active ? "Publish current revision" : "Promote to Showcase";
  ui.promote.disabled = busy || state === "conflict";
  ui.remove.hidden = !active;
  ui.remove.disabled = busy;
  ui.curationStatus.textContent = state === "conflict"
    ? "Resolve the save conflict before publishing."
    : active
      ? `Showcase has revision ${active.source_revision}; publish the current version when ready.`
      : "Publish the current Experiment.";
}

async function promoteCurrent() {
  if (busy) return;
  if (profile?.role !== "professor") throw new Error("Professor role required.");

  busy = true;
  ui.promote.disabled = true;
  ui.remove.disabled = true;
  try {
    const experiment = await ensureCurrentSavedForPromotion();
    ui.curationStatus.textContent = `Publishing ${experiment.title}…`;
    const { error } = await supabase.rpc("promote_experiment_to_showcase", {
      p_experiment_id: experiment.id,
      p_expected_revision: experiment.revision,
    });
    if (error) throw error;
    await loadEntries();
    ui.curationStatus.textContent = `${experiment.title} is in Showcase.`;
  } finally {
    busy = false;
    await syncCurationUi();
  }
}

async function removeCurrent() {
  if (busy) return;
  const experiment = await readCurrentOwnedExperiment();
  if (!experiment) throw new Error("Open the source Experiment first.");
  if (profile?.role !== "professor") throw new Error("Professor role required.");

  busy = true;
  ui.promote.disabled = true;
  ui.remove.disabled = true;
  ui.curationStatus.textContent = `Removing ${experiment.title}…`;
  try {
    const { error } = await supabase.rpc("remove_experiment_from_showcase", {
      p_experiment_id: experiment.id,
    });
    if (error) throw error;
    await loadEntries();
    ui.curationStatus.textContent = `${experiment.title} was removed from Showcase.`;
  } finally {
    busy = false;
    await syncCurationUi();
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

async function forceBuiltInWorkspace() {
  const builtin = [...experimentSelect.options].find((option) => !option.value.startsWith("registry:"));
  if (!builtin) return;
  if (experimentSelect.value !== builtin.value) {
    experimentSelect.value = builtin.value;
    experimentSelect.dispatchEvent(new Event("change", { bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
}

async function waitForSimulatorReady() {
  const deadline = performance.now() + 15000;
  while (applySetup.disabled && performance.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 100));
  if (applySetup.disabled) throw new Error("Simulator is not ready yet.");
}

function decorateShowcaseSource(entry) {
  currentShowcase = entry;
  const title = experimentPanel.querySelector(".experiment-current-title");
  const origin = experimentPanel.querySelector(".experiment-origin");
  const location = experimentPanel.querySelector(".experiment-location");
  if (title) title.textContent = entry.title;
  if (origin) {
    origin.dataset.kind = "readonly";
    origin.textContent = entry.builtin ? "Showcase · Built-in" : "Showcase · Read-only";
  }
  if (location) location.textContent = "Showcase";
  metadataRevision.textContent = entry.builtin ? "showcase · built-in" : `showcase · source r${entry.source_revision}`;
  ui.current.hidden = false;
  ui.currentTitle.textContent = entry.title;
  ui.currentMeta.textContent = entry.builtin ? "Built-in public example." : `Curated revision ${entry.source_revision}.`;
  ui.saveCopy.hidden = !sessionUser;
}

async function loadShowcaseFromLocation() {
  const showcaseId = new URL(window.location.href).searchParams.get(SHOWCASE_QUERY);
  if (!showcaseId) return;
  const entry = entries.find((candidate) => candidate.showcase_id === showcaseId);
  if (!entry) {
    setMessage("This Showcase entry is no longer available.", "error");
    return;
  }

  await waitForRegistryReady();
  await forceBuiltInWorkspace();
  applyExperimentArtifacts({ artifacts: entry.artifacts });
  await waitForSimulatorReady();
  applySetup.click();
  decorateShowcaseSource(entry);
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
    if (profile?.role === "professor") ui.curationStatus.textContent = message;
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
ui.remove.addEventListener("click", () => run(removeCurrent));
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
