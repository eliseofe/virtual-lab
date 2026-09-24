import { runtimeModel } from "./runtime/runtime-model.js";
import { simulationCommands } from "./runtime/simulation-commands.js";
import { supabase } from "./supabase-client.js";
import { captureExperimentArtifacts } from "./experiment-artifacts.js";
import { isCatalogSelectValue } from "./experiment-catalog.js";
import {
  activeEntryForCatalog,
  activeEntryForExperiment,
  assertProfessor,
  catalogSourceTitle,
  collectionChoices,
  collectionLabel,
  collectionNameError,
  curationAvailable,
  deleteCollectionConfirmation,
  entryCountMessage,
  entryMeta,
  isProfessor,
  movedMessage,
  privateCopyTitle,
  promoteButtonState,
  promotionReadiness,
  removeEntryConfirmation,
  renamedCollectionName,
  showcaseSourceLabels,
} from "./showcase/curation.js";

const WORKSPACE_KEY_PREFIX = "vlab-last-experiment-v1:";
const SHOWCASE_QUERY = "showcase";
const REGISTRY_SCHEMA_VERSION = "vlab.registry-experiment/3";
const ARTIFACT_INTERFACE_VERSION = "vlab.experiment-artifacts/3";


const experimentSelect = document.querySelector("#experiment-select");
const experimentPanel = experimentSelect?.closest(".experiment-panel");
const accountPanel = document.querySelector(".registry-panel");
const registrySaveState = document.querySelector(".registry-save-state");
const setupFeedback = document.querySelector("#setup-feedback");
const runButton = document.querySelector("#run");
const runState = document.querySelector("#run-state");
const metadataRevision = document.querySelector(".metadata-panel .panel-heading strong");
const utilityLaunchers = document.querySelector(".utility-launchers");

if (!experimentSelect || !experimentPanel || !accountPanel || !registrySaveState || !setupFeedback || !runButton || !runState || !metadataRevision || !utilityLaunchers) {
  throw new Error("Showcase integration UI mismatch.");
}

let sessionUser = null;
let profile = null;
let entries = [];
let showcaseCollections = [];
let currentShowcase = null;
let busy = false;

function buildUi() {
  const launcher = document.createElement("button");
  launcher.type = "button";
  launcher.className = "showcase-launcher";
  launcher.textContent = "Manage Showcase";
  launcher.hidden = true;
  utilityLaunchers.prepend(launcher);

  const dialog = document.createElement("dialog");
  dialog.className = "showcase-dialog";
  dialog.setAttribute("aria-label", "Manage Showcase");

  const shell = document.createElement("div");
  shell.className = "showcase-shell";
  const head = document.createElement("div");
  head.className = "showcase-head";
  const title = document.createElement("h2");
  title.textContent = "Manage Showcase";
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

  const manager = document.createElement("section");
  manager.className = "showcase-manager";
  const createRow = document.createElement("div");
  createRow.className = "showcase-manager-create";
  const collectionName = document.createElement("input");
  collectionName.type = "text";
  collectionName.maxLength = 80;
  collectionName.placeholder = "New Showcase collection";
  collectionName.setAttribute("aria-label", "New Showcase collection name");
  const addCollection = document.createElement("button");
  addCollection.type = "button";
  addCollection.textContent = "Add collection";
  createRow.append(collectionName, addCollection);
  const collectionList = document.createElement("div");
  collectionList.className = "showcase-manager-collections";
  manager.append(createRow, collectionList);

  const list = document.createElement("div");
  list.className = "showcase-list";
  shell.append(head, message, manager, list);
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
    collectionName, addCollection, collectionList,
    current, currentTitle, currentMeta, saveCopy, leave,
    curationStatus, promote,
  };
}
const ui = buildUi();

function setMessage(text, state = "idle") {
  ui.message.textContent = text;
  ui.message.dataset.state = state;
}

function activeShowcaseId() {
  return new URL(window.location.href).searchParams.get(SHOWCASE_QUERY);
}

function currentRegistryId() {
  const value = experimentSelect.value;
  return typeof value === "string" && value.startsWith("registry:") ? value.slice("registry:".length) : null;
}

function currentCatalogSource() {
  const value = experimentSelect.value?.trim();
  if (!isCatalogSelectValue(value)) return null;
  return {
    key: value,
    title: catalogSourceTitle(experimentSelect.selectedOptions?.[0]?.textContent, value),
  };
}

function currentRegistryDirtyState() {
  return registrySaveState.dataset?.state || "";
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
  ui.launcher.hidden = !isProfessor(profile);
}

async function loadEntries() {
  const [entryResult, collectionResult] = await Promise.all([
    supabase.rpc("list_showcase_experiments"),
    supabase.rpc("list_showcase_collections"),
  ]);
  if (entryResult.error) throw entryResult.error;
  if (collectionResult.error) throw collectionResult.error;
  entries = Array.isArray(entryResult.data) ? entryResult.data : [];
  showcaseCollections = Array.isArray(collectionResult.data) ? collectionResult.data : [];
  renderCollectionManager();
  renderList();
  await syncCurationUi();
  return entries;
}

function collectionOptions(selectedId = null) {
  const select = document.createElement("select");
  select.className = "showcase-entry-collection";
  select.setAttribute("aria-label", "Showcase collection");
  for (const [value, label] of collectionChoices(showcaseCollections)) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = label;
    select.append(option);
  }
  select.value = selectedId || "";
  return select;
}

function renderCollectionManager() {
  ui.collectionList.replaceChildren();
  for (const collection of showcaseCollections) {
    const item = document.createElement("div");
    item.className = "showcase-manager-collection";
    const name = document.createElement("strong");
    name.textContent = collectionLabel(collection);
    const rename = document.createElement("button");
    rename.type = "button";
    rename.textContent = "Rename";
    rename.addEventListener("click", () => run(() => renameCollection(collection)));
    const remove = document.createElement("button");
    remove.type = "button";
    remove.textContent = "Delete";
    remove.addEventListener("click", () => run(() => deleteCollection(collection)));
    item.append(name, rename, remove);
    ui.collectionList.append(item);
  }
}

function renderList() {
  ui.list.replaceChildren();
  for (const entry of entries) {
    const row = document.createElement("div");
    row.className = "showcase-entry-row";

    const summary = document.createElement("div");
    summary.className = "showcase-entry";
    const title = document.createElement("strong");
    title.textContent = entry.title;
    const meta = document.createElement("span");
    meta.textContent = entryMeta(entry);
    summary.append(title, meta);

    const collection = collectionOptions(entry.showcase_collection_id);
    collection.addEventListener("change", () => run(async () => {
      collection.disabled = true;
      try {
        const { data, error } = await supabase.rpc("set_showcase_entry_collection", {
          p_showcase_id: entry.showcase_id,
          p_collection_id: collection.value || null,
        });
        if (error) throw error;
        if (data !== true) throw new Error("Showcase entry is no longer active.");
        await loadEntries();
        setMessage(movedMessage(entry));
      } finally {
        collection.disabled = false;
      }
    }));

    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "showcase-entry-remove";
    remove.textContent = "Remove";
    remove.setAttribute("aria-label", `Remove ${entry.title} from Showcase`);
    remove.addEventListener("click", () => run(() => removeEntry(entry, remove)));

    row.append(summary, collection, remove);
    ui.list.append(row);
  }
}

async function createCollection() {
  assertProfessor(profile);
  const name = ui.collectionName.value.trim();
  const nameError = collectionNameError(name);
  if (nameError) throw new Error(nameError);
  const { error } = await supabase.rpc("create_showcase_collection", { p_name: name });
  if (error) throw error;
  ui.collectionName.value = "";
  await loadEntries();
  setMessage(`Created Showcase collection “${name}”.`);
}

async function renameCollection(collection) {
  assertProfessor(profile);
  const name = renamedCollectionName(window.prompt("Rename Showcase collection", collection.name), collection.name);
  if (!name) return;
  const { data, error } = await supabase.rpc("rename_showcase_collection", {
    p_collection_id: collection.showcase_collection_id,
    p_name: name,
  });
  if (error) throw error;
  if (data !== true) throw new Error("Showcase collection not found.");
  await loadEntries();
  setMessage(`Renamed Showcase collection to “${name}”.`);
}

async function deleteCollection(collection) {
  assertProfessor(profile);
  if (!window.confirm(deleteCollectionConfirmation(collection))) return;
  const { data, error } = await supabase.rpc("delete_showcase_collection", {
    p_collection_id: collection.showcase_collection_id,
  });
  if (error) throw error;
  if (data !== true) throw new Error("Showcase collection not found.");
  await loadEntries();
  setMessage(`Deleted Showcase collection “${collection.name}”.`);
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
  const readiness = promotionReadiness(state);
  if (readiness.action === "error") throw new Error(readiness.error);
  if (readiness.action === "publish") return experiment;

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
  const professor = isProfessor(profile);
  const showcaseOpen = Boolean(currentShowcase);
  ui.promote.hidden = !curationAvailable({ professor, showcaseOpen });
  ui.curationStatus.textContent = "";
  ui.curationStatus.dataset.state = "idle";
  if (ui.promote.hidden) return;

  const registryId = currentRegistryId();
  const experiment = registryId ? await readCurrentOwnedExperiment() : null;
  const state = promoteButtonState({
    professor,
    showcaseOpen,
    registryId,
    experiment,
    catalogSource: registryId ? null : currentCatalogSource(),
    entries,
    saveState: currentRegistryDirtyState(),
    busy,
  });
  ui.promote.hidden = state.hidden;
  if (state.hidden) return;
  ui.promote.textContent = state.text;
  ui.promote.disabled = state.disabled;
  if (state.status) {
    ui.curationStatus.textContent = state.status.text;
    ui.curationStatus.dataset.state = state.status.state;
  }
}

async function promoteCurrent() {
  if (busy) return;
  assertProfessor(profile);

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
  assertProfessor(profile);
  if (!window.confirm(removeEntryConfirmation(entry))) return;

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
  while (!runtimeModel.get().controls.run && performance.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 100));
  if (!runtimeModel.get().controls.run) throw new Error("Showcase Experiment is not runnable yet.");
  if (runtimeModel.get().runState !== "running") simulationCommands.run();
}

function decorateShowcaseSource(entry) {
  currentShowcase = entry;
  const title = experimentPanel.querySelector(".experiment-current-title");
  const origin = experimentPanel.querySelector(".experiment-origin");
  const location = experimentPanel.querySelector(".experiment-location");
  if (title) title.textContent = entry.title;
  const labels = showcaseSourceLabels(entry);
  if (origin) {
    origin.dataset.kind = "readonly";
    origin.textContent = labels.origin;
  }
  if (location) location.textContent = labels.location;
  metadataRevision.textContent = labels.revision;
  ui.current.hidden = false;
  ui.currentTitle.textContent = entry.title;
  ui.currentMeta.textContent = labels.meta;
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
  const library = window.vlabExperimentLibraryBridge;
  if (!library) throw new Error("Experiment Library bridge is not ready.");
  const opened = await library.openShowcase(entry);
  if (opened === false) return;
  decorateShowcaseSource(entry);
  await waitForSetupApplied();
  await startShowcaseRun();
}

async function savePrivateCopy() {
  if (!sessionUser || !currentShowcase) throw new Error("Sign in and open a Showcase Experiment first.");
  const title = privateCopyTitle(currentShowcase);
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
  assertProfessor(profile);
  setMessage("Loading…");
  await loadEntries();
  setMessage(entryCountMessage(entries.length));
  ui.dialog.showModal();
  ui.collectionName.focus({ preventScroll: true });
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
    if (isProfessor(profile) && !ui.promote.hidden) {
      ui.curationStatus.textContent = message;
      ui.curationStatus.dataset.state = "error";
    }
  }
}

ui.launcher.addEventListener("click", () => run(openDialog));
ui.addCollection.addEventListener("click", () => run(createCollection));
ui.collectionName.addEventListener("keydown", (event) => {
  if (event.key === "Enter") run(createCollection);
});
ui.refresh.addEventListener("click", () => run(async () => {
  await loadEntries();
  setMessage(entryCountMessage(entries.length));
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
  if (isProfessor(profile)) queueMicrotask(() => run(syncCurationUi));
});
registrySaveObserver.observe(registrySaveState, { attributes: true, attributeFilter: ["data-state"] });

supabase.auth.onAuthStateChange((_event, session) => {
  const nextId = session?.user?.id ?? null;
  if (nextId === sessionUser?.id) return;
  queueMicrotask(() => run(initialize));
});

run(initialize);
