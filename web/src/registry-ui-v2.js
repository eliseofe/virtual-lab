import { createClient } from "https://esm.sh/@supabase/supabase-js@2.111.0";
import {
  EXPERIMENT_ARTIFACTS,
  applyExperimentArtifacts,
  captureExperimentArtifacts,
  experimentArtifactsEqual,
} from "./experiment-artifacts.js";
import {
  productionExperimentRunnability,
  registryArtifactsFromProductionExperiment,
  registryExperimentRunnability,
} from "./experiment-validation.js";

const SUPABASE_URL = "https://izdmmudfrmqhvlgepwes.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_MKaLNxnqvYbJUyik9zN7WA_r4ie2P5d";
const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    storageKey: "vlab-production-registry-auth-v1",
  },
});

const experimentSelect = document.querySelector("#experiment-select");
const experimentPanel = experimentSelect?.closest(".experiment-panel");
const metadataRevision = document.querySelector(".metadata-panel .panel-heading strong");
const applySetup = document.querySelector("#apply-setup");

if (!experimentSelect || !experimentPanel || !metadataRevision || !applySetup) {
  throw new Error("Registry integration UI mismatch.");
}

const BUILTIN_VALUE = experimentSelect.value;
const BUILTIN_TITLE = experimentSelect.selectedOptions?.[0]?.textContent?.trim() || "Built-in experiment";
const BUILTIN_REVISION = metadataRevision.textContent;
const builtinArtifacts = captureExperimentArtifacts();

let user = null;
let profile = null;
let remoteExperiments = [];
let collections = [];
let currentRemote = null;
let conflictRevision = null;
let hiddenNonRunnableCount = 0;
let browserSource = "builtin";
let browserCollection = "all";
let browserSearch = "";

function installStyles() {
  if (document.querySelector("style[data-vlab-registry-v2]")) return;
  const style = document.createElement("style");
  style.dataset.vlabRegistryV2 = "";
  style.textContent = `
    .registry-panel { display: grid; gap: 10px; }
    .registry-panel [hidden], .experiment-panel [hidden], .experiment-browser[hidden] { display: none !important; }
    .registry-heading { display: flex; justify-content: space-between; gap: 10px; align-items: center; }
    .registry-account { display: flex; align-items: center; justify-content: flex-end; gap: 7px; min-width: 0; }
    .registry-account strong { font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .registry-sign-out { min-height: 28px; padding: 3px 8px; font-size: 11px; white-space: nowrap; }
    .registry-auth { display: grid; gap: 8px; }
    .registry-auth input, .registry-new-form input, .experiment-browser-search { width: 100%; min-height: 38px; border: 1px solid #cfd8dc; border-radius: 9px; padding: 8px 10px; color: #172127; background: #fff; }
    .registry-auth input:focus, .registry-new-form input:focus, .experiment-browser-search:focus { outline: 2px solid rgba(29,81,102,.16); border-color: #92acb7; }
    .registry-message { margin: 0; min-height: 1.4em; font-size: 11.5px; line-height: 1.4; color: #64757c; }
    .registry-message[data-state="error"] { color: #9e2d29; }
    .registry-message[data-state="success"] { color: #246240; }
    .registry-note { margin: 0; color: #78888e; font-size: 10.5px; line-height: 1.4; }
    .registry-save-row { display: grid; gap: 7px; }
    .registry-save-actions { display: flex; flex-wrap: wrap; gap: 7px; }
    .registry-save-actions button { min-height: 32px; padding: 5px 10px; font-size: 11.5px; }
    .registry-save-state { margin: 0; font-size: 11.5px; font-weight: 650; color: #52656d; }
    .registry-save-state[data-state="dirty"] { color: #925f08; }
    .registry-save-state[data-state="conflict"] { color: #9e2d29; }
    .registry-save-state[data-state="saved"] { color: #246240; }
    .registry-new-form { display: grid; gap: 7px; padding-top: 2px; }
    .registry-new-actions { display: flex; gap: 7px; justify-content: flex-end; }
    .experiment-current { display: grid; gap: 9px; }
    .experiment-current-main { display: flex; align-items: flex-start; justify-content: space-between; gap: 10px; }
    .experiment-current-title { font-size: 13px; line-height: 1.35; color: #172127; }
    .experiment-current-meta { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
    .experiment-origin { display: inline-flex; align-items: center; min-height: 24px; padding: 3px 8px; border-radius: 999px; background: #eef3f5; color: #50626a; font-size: 10.5px; font-weight: 700; }
    .experiment-origin[data-kind="owned"] { background: #e7f3ec; color: #265f43; }
    .experiment-origin[data-kind="readonly"] { background: #f1f2f3; color: #626c71; }
    .experiment-browse { min-height: 32px; padding: 5px 10px; white-space: nowrap; }
    .experiment-browser { width: min(900px, calc(100vw - 32px)); max-height: min(720px, calc(100vh - 32px)); border: 0; border-radius: 16px; padding: 0; box-shadow: 0 18px 70px rgba(16,35,44,.28); color: #172127; }
    .experiment-browser::backdrop { background: rgba(16,27,33,.42); }
    .experiment-browser-shell { display: grid; grid-template-rows: auto auto 1fr; max-height: inherit; min-height: 480px; background: #fff; }
    .experiment-browser-head { display: flex; justify-content: space-between; align-items: center; gap: 12px; padding: 17px 18px 12px; border-bottom: 1px solid #e6ecef; }
    .experiment-browser-head h2 { margin: 0; font-size: 17px; }
    .experiment-browser-head-actions { display: flex; gap: 7px; }
    .experiment-browser-tabs { display: flex; gap: 6px; padding: 12px 18px 0; }
    .experiment-browser-tab[aria-selected="true"] { background: #1d5166; border-color: #1d5166; color: #fff; }
    .experiment-browser-body { display: grid; grid-template-columns: 190px 1fr; min-height: 0; padding: 12px 18px 18px; gap: 14px; }
    .experiment-browser-filters { display: grid; align-content: start; gap: 6px; padding-right: 12px; border-right: 1px solid #e6ecef; overflow: auto; }
    .experiment-filter { text-align: left; width: 100%; min-height: 32px; padding: 6px 8px; border-radius: 8px; }
    .experiment-filter[aria-selected="true"] { background: #edf4f6; border-color: #b8ccd4; color: #244e5f; font-weight: 700; }
    .experiment-browser-content { min-width: 0; display: grid; grid-template-rows: auto auto 1fr; gap: 9px; }
    .experiment-browser-search-row { display: flex; gap: 8px; }
    .experiment-browser-count { margin: 0; color: #6f7d83; font-size: 11px; }
    .experiment-results { display: grid; align-content: start; gap: 7px; overflow: auto; padding-right: 3px; }
    .experiment-result { display: grid; gap: 4px; text-align: left; width: 100%; padding: 10px 11px; border-radius: 10px; background: #fff; }
    .experiment-result:hover { background: #f6f9fa; }
    .experiment-result strong { font-size: 12.5px; }
    .experiment-result-meta { display: flex; flex-wrap: wrap; gap: 8px; color: #718087; font-size: 10.5px; }
    .experiment-browser-empty { margin: 18px 0; color: #718087; font-size: 12px; }
    @media (max-width: 680px) {
      .experiment-browser-body { grid-template-columns: 1fr; }
      .experiment-browser-filters { display: flex; overflow-x: auto; border-right: 0; border-bottom: 1px solid #e6ecef; padding: 0 0 9px; }
      .experiment-filter { width: auto; white-space: nowrap; }
      .experiment-browser-shell { min-height: min(620px, calc(100vh - 32px)); }
    }
  `;
  document.head.append(style);
}

function buildCurrentExperimentUi() {
  experimentSelect.hidden = true;

  const current = document.createElement("div");
  current.className = "experiment-current";

  const main = document.createElement("div");
  main.className = "experiment-current-main";
  const title = document.createElement("strong");
  title.className = "experiment-current-title";
  title.textContent = BUILTIN_TITLE;
  const browse = document.createElement("button");
  browse.className = "experiment-browse";
  browse.textContent = "Browse experiments";
  main.append(title, browse);

  const meta = document.createElement("div");
  meta.className = "experiment-current-meta";
  const origin = document.createElement("span");
  origin.className = "experiment-origin";
  origin.dataset.kind = "readonly";
  origin.textContent = "Built-in · Read-only";
  meta.append(origin);

  current.append(main, meta);
  experimentSelect.insertAdjacentElement("afterend", current);
  return { current, title, browse, origin };
}

function buildAccountPanel() {
  const panel = document.createElement("section");
  panel.className = "panel registry-panel";
  panel.setAttribute("aria-label", "Virtual Lab account");

  const heading = document.createElement("div");
  heading.className = "registry-heading";
  const label = document.createElement("span");
  label.className = "field-label";
  label.style.margin = "0";
  label.textContent = "Account";
  const account = document.createElement("div");
  account.className = "registry-account";
  const identity = document.createElement("strong");
  identity.textContent = "Signed out";
  const signOut = document.createElement("button");
  signOut.className = "registry-sign-out";
  signOut.textContent = "Sign out";
  signOut.hidden = true;
  account.append(identity, signOut);
  heading.append(label, account);

  const auth = document.createElement("div");
  auth.className = "registry-auth";
  const email = document.createElement("input");
  email.type = "email";
  email.autocomplete = "email";
  email.placeholder = "Email";
  email.setAttribute("aria-label", "Email");
  const password = document.createElement("input");
  password.type = "password";
  password.autocomplete = "current-password";
  password.placeholder = "Password";
  password.setAttribute("aria-label", "Password");
  const signIn = document.createElement("button");
  signIn.className = "primary";
  signIn.textContent = "Sign in";
  auth.append(email, password, signIn);

  const message = document.createElement("p");
  message.className = "registry-message";
  message.setAttribute("role", "status");
  message.textContent = "Sign in to access your experiments.";

  const saveRow = document.createElement("div");
  saveRow.className = "registry-save-row";
  saveRow.hidden = true;
  const saveState = document.createElement("p");
  saveState.className = "registry-save-state";
  const saveActions = document.createElement("div");
  saveActions.className = "registry-save-actions";
  const save = document.createElement("button");
  save.className = "primary";
  save.textContent = "Save changes";
  const saveAsNew = document.createElement("button");
  saveAsNew.textContent = "Save as new…";
  saveActions.append(save, saveAsNew);
  saveRow.append(saveState, saveActions);

  const newForm = document.createElement("div");
  newForm.className = "registry-new-form";
  newForm.hidden = true;
  const newTitle = document.createElement("input");
  newTitle.type = "text";
  newTitle.maxLength = 300;
  newTitle.placeholder = "Experiment title";
  newTitle.setAttribute("aria-label", "New experiment title");
  const newActions = document.createElement("div");
  newActions.className = "registry-new-actions";
  const cancelNew = document.createElement("button");
  cancelNew.textContent = "Cancel";
  const createNew = document.createElement("button");
  createNew.className = "primary";
  createNew.textContent = "Create";
  newActions.append(cancelNew, createNew);
  newForm.append(newTitle, newActions);

  const note = document.createElement("p");
  note.className = "registry-note";

  panel.append(heading, auth, message, saveRow, newForm, note);
  experimentPanel.insertAdjacentElement("afterend", panel);

  return {
    panel,
    identity,
    signOut,
    auth,
    email,
    password,
    signIn,
    message,
    saveRow,
    saveState,
    save,
    saveAsNew,
    newForm,
    newTitle,
    cancelNew,
    createNew,
    note,
  };
}

function buildBrowser() {
  const dialog = document.createElement("dialog");
  dialog.className = "experiment-browser";
  dialog.setAttribute("aria-label", "Experiment browser");

  const shell = document.createElement("div");
  shell.className = "experiment-browser-shell";
  const head = document.createElement("div");
  head.className = "experiment-browser-head";
  const heading = document.createElement("h2");
  heading.textContent = "Experiments";
  const headActions = document.createElement("div");
  headActions.className = "experiment-browser-head-actions";
  const refresh = document.createElement("button");
  refresh.textContent = "Refresh";
  const close = document.createElement("button");
  close.textContent = "Close";
  headActions.append(refresh, close);
  head.append(heading, headActions);

  const tabs = document.createElement("div");
  tabs.className = "experiment-browser-tabs";
  const builtinTab = document.createElement("button");
  builtinTab.className = "experiment-browser-tab";
  builtinTab.dataset.source = "builtin";
  builtinTab.textContent = "Built-in";
  const mineTab = document.createElement("button");
  mineTab.className = "experiment-browser-tab";
  mineTab.dataset.source = "mine";
  mineTab.textContent = "My experiments";
  tabs.append(builtinTab, mineTab);

  const body = document.createElement("div");
  body.className = "experiment-browser-body";
  const filters = document.createElement("nav");
  filters.className = "experiment-browser-filters";
  filters.setAttribute("aria-label", "Experiment collections");
  const content = document.createElement("div");
  content.className = "experiment-browser-content";
  const searchRow = document.createElement("div");
  searchRow.className = "experiment-browser-search-row";
  const search = document.createElement("input");
  search.className = "experiment-browser-search";
  search.type = "search";
  search.placeholder = "Search experiments";
  search.setAttribute("aria-label", "Search experiments");
  searchRow.append(search);
  const count = document.createElement("p");
  count.className = "experiment-browser-count";
  const results = document.createElement("div");
  results.className = "experiment-results";
  content.append(searchRow, count, results);
  body.append(filters, content);

  shell.append(head, tabs, body);
  dialog.append(shell);
  document.body.append(dialog);

  return { dialog, refresh, close, builtinTab, mineTab, filters, searchRow, search, count, results };
}

installStyles();
const currentUi = buildCurrentExperimentUi();
const ui = buildAccountPanel();
const browser = buildBrowser();

function setMessage(text, state = "idle") {
  ui.message.textContent = text;
  ui.message.dataset.state = state;
}

function artifactsEqual(left, right) {
  return experimentArtifactsEqual(left, right);
}

function hasUnsavedRemoteEdits() {
  return currentRemote !== null && !artifactsEqual(captureExperimentArtifacts(), currentRemote);
}

function collectionName(id) {
  if (!id) return "Unfiled";
  return collections.find((collection) => collection.id === id)?.name || "Unfiled";
}

function setNativeRegistryOptions() {
  experimentSelect.querySelector("optgroup[data-registry-options]")?.remove();
  if (!user) {
    experimentSelect.value = BUILTIN_VALUE;
    return;
  }
  const group = document.createElement("optgroup");
  group.label = "Registry";
  group.dataset.registryOptions = "";
  for (const experiment of remoteExperiments) {
    const option = document.createElement("option");
    option.value = `registry:${experiment.id}`;
    option.textContent = `${experiment.title} · r${experiment.revision}`;
    group.append(option);
  }
  experimentSelect.append(group);
  experimentSelect.value = currentRemote ? `registry:${currentRemote.id}` : BUILTIN_VALUE;
}

function updateCurrentUi() {
  const dirty = hasUnsavedRemoteEdits();
  const owned = Boolean(user && currentRemote && currentRemote.owner_id === user.id);

  if (currentRemote) {
    currentUi.title.textContent = currentRemote.title;
    currentUi.origin.dataset.kind = owned ? "owned" : "readonly";
    currentUi.origin.textContent = owned ? "Your experiment · Editable" : "Read-only";
    metadataRevision.textContent = `registry r${currentRemote.revision}`;
  } else {
    currentUi.title.textContent = BUILTIN_TITLE;
    currentUi.origin.dataset.kind = "readonly";
    currentUi.origin.textContent = "Built-in · Read-only";
    metadataRevision.textContent = BUILTIN_REVISION;
  }

  ui.saveRow.hidden = !user;
  ui.saveAsNew.hidden = !user;
  ui.save.hidden = !owned;
  ui.save.disabled = !owned || !dirty || conflictRevision !== null;

  if (!user) {
    ui.note.textContent = "Built-in experiments can be edited and run locally. Sign in to save a private copy.";
  } else if (!currentRemote) {
    ui.saveState.dataset.state = "readonly";
    ui.saveState.textContent = "Read-only";
    ui.note.textContent = "The built-in experiment cannot be overwritten. Save as new to keep your own copy.";
  } else if (!owned) {
    ui.saveState.dataset.state = "readonly";
    ui.saveState.textContent = "Read-only";
    ui.note.textContent = "This experiment cannot be overwritten from this account. Save as new to keep a private copy.";
  } else if (conflictRevision !== null) {
    ui.saveState.dataset.state = "conflict";
    ui.saveState.textContent = `Newer revision r${conflictRevision} available`;
    ui.note.textContent = "Your local edits are preserved. Reload the experiment before saving to the same record.";
  } else if (dirty) {
    ui.saveState.dataset.state = "dirty";
    ui.saveState.textContent = "Unsaved changes";
    ui.note.textContent = "Save changes updates this private experiment as a new revision.";
  } else {
    ui.saveState.dataset.state = "saved";
    ui.saveState.textContent = `Saved · r${currentRemote.revision}`;
    ui.note.textContent = "This private experiment belongs to your account and can be edited.";
  }

  setNativeRegistryOptions();
}

function formatUpdated(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" }).format(date);
}

function filterButton(label, value) {
  const button = document.createElement("button");
  button.className = "experiment-filter";
  button.textContent = label;
  button.dataset.collection = value;
  button.setAttribute("aria-selected", String(browserCollection === value));
  button.addEventListener("click", () => {
    browserCollection = value;
    renderBrowser();
  });
  return button;
}

function renderBrowser() {
  browser.builtinTab.setAttribute("aria-selected", String(browserSource === "builtin"));
  browser.mineTab.setAttribute("aria-selected", String(browserSource === "mine"));
  browser.mineTab.disabled = !user;
  browser.searchRow.hidden = browserSource !== "mine";
  browser.filters.replaceChildren();
  browser.results.replaceChildren();

  if (browserSource === "builtin") {
    browser.count.textContent = "Built-in experiment";
    const result = document.createElement("button");
    result.className = "experiment-result";
    const title = document.createElement("strong");
    title.textContent = BUILTIN_TITLE;
    const meta = document.createElement("span");
    meta.className = "experiment-result-meta";
    meta.textContent = "Built-in · Read-only";
    result.append(title, meta);
    result.addEventListener("click", () => run(async () => {
      if (!(await confirmDiscardIfNeeded())) return;
      await restoreBuiltIn();
      browser.dialog.close();
    }));
    browser.results.append(result);
    return;
  }

  browser.filters.append(filterButton("All", "all"));
  for (const collection of collections) browser.filters.append(filterButton(collection.name, collection.id));
  browser.filters.append(filterButton("Unfiled", "unfiled"));

  const search = browserSearch.trim().toLocaleLowerCase();
  const filtered = remoteExperiments.filter((experiment) => {
    const inCollection = browserCollection === "all"
      || (browserCollection === "unfiled" ? !experiment.collection_id : experiment.collection_id === browserCollection);
    const matchesSearch = !search || experiment.title.toLocaleLowerCase().includes(search);
    return inCollection && matchesSearch;
  });

  browser.count.textContent = `${filtered.length} experiment${filtered.length === 1 ? "" : "s"}`;
  if (!filtered.length) {
    const empty = document.createElement("p");
    empty.className = "experiment-browser-empty";
    empty.textContent = browserSearch ? "No experiments match this search." : "No experiments in this collection.";
    browser.results.append(empty);
    return;
  }

  for (const experiment of filtered) {
    const result = document.createElement("button");
    result.className = "experiment-result";
    const title = document.createElement("strong");
    title.textContent = experiment.title;
    const meta = document.createElement("span");
    meta.className = "experiment-result-meta";
    const updated = formatUpdated(experiment.updated_at);
    meta.textContent = `${collectionName(experiment.collection_id)} · r${experiment.revision}${updated ? ` · ${updated}` : ""}`;
    result.append(title, meta);
    result.addEventListener("click", () => run(async () => {
      if (currentRemote?.id !== experiment.id && !(await confirmDiscardIfNeeded())) return;
      await loadRemoteExperiment(experiment.id);
      browser.dialog.close();
    }));
    browser.results.append(result);
  }
}

async function loadProfile() {
  const { data, error } = await supabase.from("profiles").select("id, display_name").eq("id", user.id).maybeSingle();
  if (error) throw error;
  profile = data;
}

async function loadCollections() {
  if (!user) {
    collections = [];
    return;
  }
  const { data, error } = await supabase
    .from("experiment_collections")
    .select("id,name,updated_at")
    .order("name", { ascending: true });
  if (error) throw error;
  collections = data ?? [];
}

async function loadExperimentList() {
  if (!user) {
    remoteExperiments = [];
    hiddenNonRunnableCount = 0;
    setNativeRegistryOptions();
    return;
  }
  const { data, error } = await supabase
    .from("experiments")
    .select("id,owner_id,collection_id,title,revision,updated_at,artifacts,config_source,initializer_source,controller_source")
    .eq("owner_id", user.id)
    .eq("lifecycle", "active")
    .order("updated_at", { ascending: false });
  if (error) throw error;

  remoteExperiments = [];
  hiddenNonRunnableCount = 0;
  for (const experiment of data ?? []) {
    if (productionExperimentRunnability(experiment).runnable) remoteExperiments.push(experiment);
    else hiddenNonRunnableCount += 1;
  }
  setNativeRegistryOptions();
}

async function readExperiment(id) {
  const { data, error } = await supabase
    .from("experiments")
    .select("id,owner_id,collection_id,title,description,lifecycle,visibility,revision,artifacts,config_source,initializer_source,controller_source,updated_at")
    .eq("id", id)
    .eq("owner_id", user.id)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Experiment not found for this account.");
  if (!productionExperimentRunnability(data).runnable) throw new Error("This experiment is not compatible with the current simulator.");
  return data;
}

async function waitForSimulatorReady() {
  const deadline = performance.now() + 15000;
  while (applySetup.disabled && performance.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 100));
  if (applySetup.disabled) throw new Error("Simulator is not ready yet.");
}

async function applyLoadedSources() {
  await waitForSimulatorReady();
  applySetup.click();
}

async function confirmDiscardIfNeeded() {
  if (!hasUnsavedRemoteEdits()) return true;
  return window.confirm("Discard the unsaved changes to the current experiment?");
}

async function restoreBuiltIn({ apply = true } = {}) {
  applyExperimentArtifacts(builtinArtifacts);
  currentRemote = null;
  conflictRevision = null;
  ui.newForm.hidden = true;
  updateCurrentUi();
  setMessage(user ? "Built-in experiment loaded." : "Sign in to access your experiments.");
  if (apply) await applyLoadedSources();
}

async function loadRemoteExperiment(id) {
  if (!user) throw new Error("Sign in to load your experiments.");
  setMessage("Loading experiment…");
  const experiment = await readExperiment(id);
  applyExperimentArtifacts(experiment);
  currentRemote = experiment;
  conflictRevision = null;
  ui.newForm.hidden = true;
  updateCurrentUi();
  await applyLoadedSources();
  setMessage(`${experiment.title} · r${experiment.revision} loaded.`, "success");
}

function connectedMessage() {
  const count = remoteExperiments.length;
  const hidden = hiddenNonRunnableCount > 0 ? ` · ${hiddenNonRunnableCount} incompatible hidden` : "";
  return `${count} experiment${count === 1 ? "" : "s"} available${hidden}.`;
}

function registryArtifactsForSave({ allowBuiltInCompatibility = false } = {}) {
  const captured = captureExperimentArtifacts();
  let artifacts = captured;
  let validation = registryExperimentRunnability(artifacts);
  if (!validation.runnable && allowBuiltInCompatibility && currentRemote === null) {
    artifacts = registryArtifactsFromProductionExperiment(captured);
    validation = registryExperimentRunnability(artifacts);
  }
  if (!validation.runnable) {
    throw new Error(`Cannot save: ${validation.error || "experiment does not satisfy the registry authoring contract."}`);
  }
  return artifacts;
}

async function saveCurrentExperiment() {
  if (!user) throw new Error("Sign in before saving.");
  if (!currentRemote || currentRemote.owner_id !== user.id) throw new Error("This experiment is read-only. Use Save as new instead.");
  if (conflictRevision !== null) throw new Error("A newer revision exists. Reload the experiment before saving to the same record.");
  if (!hasUnsavedRemoteEdits()) {
    setMessage("No changes to save.");
    return;
  }

  const artifacts = registryArtifactsForSave();
  const baseRevision = currentRemote.revision;
  setMessage(`Saving ${currentRemote.title}…`);
  const { data, error } = await supabase
    .from("experiments")
    .update({ ...artifacts, updated_by_actor: "human", updated_by_ai_client: null })
    .eq("id", currentRemote.id)
    .eq("owner_id", user.id)
    .eq("revision", baseRevision)
    .select("id,owner_id,collection_id,title,description,lifecycle,visibility,revision,artifacts,config_source,initializer_source,controller_source,updated_at")
    .maybeSingle();

  if (error) throw error;
  if (!data) {
    const { data: fresh } = await supabase.from("experiments").select("revision").eq("id", currentRemote.id).eq("owner_id", user.id).maybeSingle();
    conflictRevision = fresh?.revision ?? baseRevision + 1;
    updateCurrentUi();
    throw new Error("Save conflict: a newer revision exists. Your local edits are still here.");
  }

  currentRemote = data;
  conflictRevision = null;
  await loadExperimentList();
  updateCurrentUi();
  renderBrowser();
  setMessage(`${data.title} saved as r${data.revision}.`, "success");
}

function defaultCopyTitle() {
  return currentRemote?.title ? `${currentRemote.title} copy` : `${BUILTIN_TITLE} copy`;
}

function openSaveAsNew() {
  if (!user) throw new Error("Sign in before saving.");
  ui.newTitle.value = defaultCopyTitle();
  ui.newForm.hidden = false;
  ui.newTitle.focus();
  ui.newTitle.select();
}

function closeSaveAsNew() {
  ui.newForm.hidden = true;
  ui.newTitle.value = "";
}

async function createNewExperiment() {
  if (!user) throw new Error("Sign in before saving.");
  const title = ui.newTitle.value.trim();
  if (!title) throw new Error("Enter a title for the new experiment.");
  const artifacts = registryArtifactsForSave({ allowBuiltInCompatibility: true });

  setMessage(`Creating ${title}…`);
  const { data, error } = await supabase
    .from("experiments")
    .insert({
      owner_id: user.id,
      collection_id: null,
      title,
      description: currentRemote?.description ?? "",
      lifecycle: "active",
      visibility: "private",
      ...artifacts,
      created_by_actor: "human",
      created_by_ai_client: null,
      updated_by_actor: "human",
      updated_by_ai_client: null,
    })
    .select("id,owner_id,collection_id,title,description,lifecycle,visibility,revision,artifacts,config_source,initializer_source,controller_source,updated_at")
    .single();
  if (error) throw error;

  applyExperimentArtifacts(data);
  currentRemote = data;
  conflictRevision = null;
  closeSaveAsNew();
  await Promise.all([loadCollections(), loadExperimentList()]);
  updateCurrentUi();
  renderBrowser();
  await applyLoadedSources();
  setMessage(`${data.title} created as a private experiment.`, "success");
}

function setSignedOutUi() {
  ui.identity.textContent = "Signed out";
  ui.auth.hidden = false;
  ui.signOut.hidden = true;
  remoteExperiments = [];
  collections = [];
  hiddenNonRunnableCount = 0;
  browserSource = "builtin";
  browserCollection = "all";
  updateCurrentUi();
  renderBrowser();
}

function setSignedInUi() {
  ui.identity.textContent = profile?.display_name || user.email || "Signed in";
  ui.auth.hidden = true;
  ui.signOut.hidden = false;
  updateCurrentUi();
}

async function initializeSession() {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  user = data.session?.user ?? null;
  profile = null;

  if (!user) {
    setSignedOutUi();
    return;
  }

  await loadProfile();
  await Promise.all([loadCollections(), loadExperimentList()]);
  setSignedInUi();
  renderBrowser();
  setMessage(connectedMessage(), "success");
}

async function signIn() {
  const email = ui.email.value.trim();
  const password = ui.password.value;
  if (!email || !password) throw new Error("Enter email and password.");
  setMessage("Signing in…");
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  ui.password.value = "";
  await initializeSession();
}

async function signOut() {
  if (!(await confirmDiscardIfNeeded())) return;
  setMessage("Signing out…");
  const { error } = await supabase.auth.signOut({ scope: "local" });
  if (error) throw error;
  user = null;
  profile = null;
  await restoreBuiltIn({ apply: currentRemote !== null });
  setSignedOutUi();
}

async function refreshRegistry() {
  if (!user) return;
  const previousRemote = currentRemote;
  const dirty = hasUnsavedRemoteEdits();
  setMessage("Refreshing…");
  await Promise.all([loadCollections(), loadExperimentList()]);

  if (previousRemote) {
    const fresh = remoteExperiments.find((experiment) => experiment.id === previousRemote.id);
    if (!fresh) {
      if (dirty) {
        setMessage("The loaded experiment is no longer available. Your local edits are still in the editors.", "error");
      } else {
        await restoreBuiltIn();
        setMessage("The previously loaded experiment is no longer available or compatible.");
      }
      renderBrowser();
      return;
    }
    if (fresh.revision > previousRemote.revision) {
      if (dirty) {
        conflictRevision = fresh.revision;
        updateCurrentUi();
        setMessage(`Newer registry revision r${fresh.revision} is available. Your local edits are preserved.`, "error");
      } else {
        await loadRemoteExperiment(previousRemote.id);
      }
      renderBrowser();
      return;
    }
  }

  updateCurrentUi();
  renderBrowser();
  setMessage(connectedMessage(), "success");
}

function openBrowser() {
  browserSource = currentRemote ? "mine" : "builtin";
  browserCollection = currentRemote?.collection_id || "all";
  browserSearch = "";
  browser.search.value = "";
  renderBrowser();
  browser.dialog.showModal();
}

async function run(action) {
  try {
    await action();
  } catch (error) {
    console.error(error);
    setMessage(error instanceof Error ? error.message : String(error), "error");
  }
}

currentUi.browse.addEventListener("click", openBrowser);
browser.close.addEventListener("click", () => browser.dialog.close());
browser.refresh.addEventListener("click", () => run(refreshRegistry));
browser.builtinTab.addEventListener("click", () => {
  browserSource = "builtin";
  renderBrowser();
});
browser.mineTab.addEventListener("click", () => {
  if (!user) return;
  browserSource = "mine";
  browserCollection = "all";
  renderBrowser();
});
browser.search.addEventListener("input", () => {
  browserSearch = browser.search.value;
  renderBrowser();
});
browser.dialog.addEventListener("click", (event) => {
  if (event.target === browser.dialog) browser.dialog.close();
});

ui.signIn.addEventListener("click", () => run(signIn));
ui.password.addEventListener("keydown", (event) => {
  if (event.key === "Enter") run(signIn);
});
ui.signOut.addEventListener("click", () => run(signOut));
ui.save.addEventListener("click", () => run(saveCurrentExperiment));
ui.saveAsNew.addEventListener("click", () => run(openSaveAsNew));
ui.cancelNew.addEventListener("click", closeSaveAsNew);
ui.createNew.addEventListener("click", () => run(createNewExperiment));
ui.newTitle.addEventListener("keydown", (event) => {
  if (event.key === "Enter") run(createNewExperiment);
  if (event.key === "Escape") closeSaveAsNew();
});

for (const descriptor of EXPERIMENT_ARTIFACTS) {
  document.querySelector(descriptor.editorSelector)?.addEventListener("input", updateCurrentUi);
}

supabase.auth.onAuthStateChange((_event, session) => {
  if (session?.user?.id === user?.id || (!session && !user)) return;
  queueMicrotask(() => run(initializeSession));
});

updateCurrentUi();
renderBrowser();
run(initializeSession);
