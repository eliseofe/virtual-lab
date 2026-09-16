import { createClient } from "https://esm.sh/@supabase/supabase-js@2.111.0";
import { applyExperimentArtifacts } from "./experiment-artifacts.js";

const SUPABASE_URL = "https://izdmmudfrmqhvlgepwes.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_MKaLNxnqvYbJUyik9zN7WA_r4ie2P5d";
const AUTH_STORAGE_KEY = "vlab-production-registry-auth-v1";
const WORKSPACE_KEY_PREFIX = "vlab-last-experiment-v1:";
const SHOWCASE_QUERY = "showcase";

const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: { storageKey: AUTH_STORAGE_KEY },
});

const experimentSelect = document.querySelector("#experiment-select");
const experimentPanel = experimentSelect?.closest(".experiment-panel");
const accountPanel = document.querySelector(".registry-panel");
const applySetup = document.querySelector("#apply-setup");
const metadataRevision = document.querySelector(".metadata-panel .panel-heading strong");
const utilityLaunchers = document.querySelector(".utility-launchers");

if (!experimentSelect || !experimentPanel || !accountPanel || !applySetup || !metadataRevision || !utilityLaunchers) {
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
    .showcase-shell { display: grid; grid-template-rows: auto auto 1fr; max-height: inherit; min-height: min(520px, calc(100vh - 28px)); background: #fff; }
    .showcase-head { display: flex; justify-content: space-between; align-items: center; gap: 12px; padding: 17px 18px 12px; border-bottom: 1px solid #e6ecef; }
    .showcase-head h2 { margin: 0; font-size: 17px; }
    .showcase-head-actions { display: flex; gap: 7px; }
    .showcase-summary, .showcase-message { margin: 0; padding: 10px 18px; color: #64757c; font-size: 11.5px; line-height: 1.4; }
    .showcase-message { min-height: 1.4em; padding-top: 0; }
    .showcase-message[data-state="error"] { color: #9e2d29; }
    .showcase-list { display: grid; align-content: start; gap: 8px; overflow: auto; padding: 0 18px 18px; }
    .showcase-entry { display: grid; gap: 5px; width: 100%; padding: 11px 12px; text-align: left; border: 1px solid #dfe7ea; border-radius: 11px; background: #fff; }
    .showcase-entry:hover { background: #f6f9fa; }
    .showcase-entry strong { font-size: 13px; }
    .showcase-entry span { color: #718087; font-size: 10.5px; line-height: 1.4; }
    .showcase-empty { margin: 12px 2px; color: #718087; font-size: 12px; }
    .showcase-current { display: grid; gap: 7px; padding: 10px 12px; border: 1px solid #c9dce4; border-radius: 11px; background: #f5fafc; }
    .showcase-current[hidden] { display: none !important; }
    .showcase-current-head { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: 8px; }
    .showcase-current-title { margin: 0; font-size: 12px; font-weight: 750; }
    .showcase-current-meta { margin: 0; color: #64757c; font-size: 10.5px; }
    .showcase-current-actions { display: flex; flex-wrap: wrap; gap: 7px; }
    .showcase-curation { display: grid; gap: 7px; padding-top: 9px; border-top: 1px solid #e5ebee; }
    .showcase-curation[hidden] { display: none !important; }
    .showcase-curation strong { font-size: 11.5px; }
    .showcase-curation p { margin: 0; color: #6f7d83; font-size: 10.5px; line-height: 1.4; }
    .showcase-curation-actions { display: flex; flex-wrap: wrap; gap: 7px; }
    @media (max-width: 680px) {
      .showcase-dialog { width: calc(100vw - 20px); max-height: calc(100vh - 20px); }
      .showcase-shell { min-height: min(620px, calc(100vh - 20px)); }
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

  const summary = document.createElement("p");
  summary.className = "showcase-summary";
  summary.textContent = "Curated, read-only Experiment revisions. Open one to run it; signed-in users can make a private copy.";
  const message = document.createElement("p");
  message.className = "showcase-message";
  message.setAttribute("role", "status");
  const list = document.createElement("div");
  list.className = "showcase-list";
  shell.append(head, summary, message, list);
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

  const curation = document.createElement("section");
  curation.className = "showcase-curation";
  curation.hidden = true;
  const curationTitle = document.createElement("strong");
  curationTitle.textContent = "Showcase curation";
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
  accountPanel.append(curation);

  return {
    launcher, dialog, refresh, close, message, list,
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
  entries = Array.isArray(data) ? data : [];
  renderList();
  syncCurationUi();
  return entries;
}

function renderList() {
  ui.list.replaceChildren();
  if (!entries.length) {
    const empty = document.createElement("p");
    empty.className = "showcase-empty";
    empty.textContent = "No Showcase experiments yet.";
    ui.list.append(empty);
    return;
  }

  for (const entry of entries) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "showcase-entry";
    const title = document.createElement("strong");
    title.textContent = entry.title;
    const meta = document.createElement("span");
    const date = formatDate(entry.published_at);
    meta.textContent = `Source revision ${entry.source_revision}${date ? ` · Published ${date}` : ""}`;
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
  return accountPanel.querySelector(".registry-save-state")?.dataset?.state || "";
}

function activeEntryForExperiment(experimentId) {
  if (!experimentId) return null;
  return entries.find((entry) => entry.source_experiment_id === experimentId) || null;
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

async function syncCurationUi() {
  const professor = profile?.role === "professor";
  ui.curation.hidden = !professor;
  if (!professor) return;

  const experiment = await readCurrentOwnedExperiment();
  const state = currentRegistryDirtyState();
  const clean = state === "saved";
  const active = activeEntryForExperiment(experiment?.id);

  if (!experiment) {
    ui.curationStatus.textContent = "Open one of your saved Experiments to curate it.";
    ui.promote.hidden = false;
    ui.promote.textContent = "Promote to Showcase";
    ui.promote.disabled = true;
    ui.remove.hidden = true;
    return;
  }

  if (!clean) {
    ui.curationStatus.textContent = "Save the Experiment first. Showcase always freezes an exact saved revision.";
    ui.promote.hidden = false;
    ui.promote.textContent = active ? `Update Showcase to revision ${experiment.revision}` : "Promote to Showcase";
    ui.promote.disabled = true;
    ui.remove.hidden = !active;
    ui.remove.disabled = busy;
    return;
  }

  if (active?.source_revision === experiment.revision) {
    ui.curationStatus.textContent = `Revision ${experiment.revision} is currently in Showcase. Removal is reversible.`;
    ui.promote.hidden = true;
    ui.remove.hidden = false;
    ui.remove.disabled = busy;
  } else {
    ui.curationStatus.textContent = active
      ? `Showcase currently preserves revision ${active.source_revision}. You can publish the current revision ${experiment.revision} instead.`
      : `Revision ${experiment.revision} can be published as an immutable Showcase snapshot.`;
    ui.promote.hidden = false;
    ui.promote.textContent = active ? `Update Showcase to revision ${experiment.revision}` : "Promote to Showcase";
    ui.promote.disabled = busy;
    ui.remove.hidden = !active;
    ui.remove.disabled = busy;
  }
}

async function promoteCurrent() {
  if (busy) return;
  const experiment = await readCurrentOwnedExperiment();
  if (!experiment) throw new Error("Open one of your saved Experiments first.");
  if (profile?.role !== "professor") throw new Error("Professor role required.");
  if (currentRegistryDirtyState() !== "saved") throw new Error("Save the Experiment before promoting it.");

  busy = true;
  ui.promote.disabled = true;
  ui.remove.disabled = true;
  ui.curationStatus.textContent = `Publishing ${experiment.title} revision ${experiment.revision}…`;
  try {
    const { error } = await supabase.rpc("promote_experiment_to_showcase", {
      p_experiment_id: experiment.id,
      p_expected_revision: experiment.revision,
    });
    if (error) throw error;
    await loadEntries();
    ui.curationStatus.textContent = `${experiment.title} revision ${experiment.revision} is now in Showcase.`;
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
  ui.curationStatus.textContent = `Removing ${experiment.title} from Showcase…`;
  try {
    const { error } = await supabase.rpc("remove_experiment_from_showcase", {
      p_experiment_id: experiment.id,
    });
    if (error) throw error;
    await loadEntries();
    ui.curationStatus.textContent = `${experiment.title} is no longer in Showcase. You can promote it again later.`;
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
    origin.textContent = "Showcase · Read-only";
  }
  if (location) location.textContent = "Showcase";
  metadataRevision.textContent = `showcase · source r${entry.source_revision}`;
  ui.current.hidden = false;
  ui.currentTitle.textContent = entry.title;
  ui.currentMeta.textContent = `Curated source revision ${entry.source_revision}. The Showcase copy is immutable; local edits do not alter it.`;
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
  setMessage("Loading Showcase…");
  await loadEntries();
  setMessage(entries.length ? `${entries.length} curated Experiment${entries.length === 1 ? "" : "s"}.` : "No Showcase experiments yet.");
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
  setMessage(entries.length ? `${entries.length} curated Experiment${entries.length === 1 ? "" : "s"}.` : "No Showcase experiments yet.");
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

const registryObserver = new MutationObserver(() => {
  if (profile?.role === "professor") queueMicrotask(() => run(syncCurationUi));
});
registryObserver.observe(accountPanel, { childList: true, subtree: true, attributes: true, attributeFilter: ["data-state", "hidden"] });

supabase.auth.onAuthStateChange((_event, session) => {
  const nextId = session?.user?.id ?? null;
  if (nextId === sessionUser?.id) return;
  queueMicrotask(() => run(initialize));
});

run(initialize);
