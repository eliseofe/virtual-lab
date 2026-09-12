import { createClient } from "https://esm.sh/@supabase/supabase-js@2.111.0";
import {
  EXPERIMENT_ARTIFACTS,
  applyExperimentArtifacts,
  captureExperimentArtifacts,
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
    // The mock simulator and production Lab share the same github.io origin.
    // Give production its own browser session namespace so a historical mock-sim
    // login cannot silently authenticate the real Lab.
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
const BUILTIN_REVISION = metadataRevision.textContent;
const builtinArtifacts = captureExperimentArtifacts();

let user = null;
let profile = null;
let remoteExperiments = [];
let currentRemote = null;
let hiddenNonRunnableCount = 0;

function installStyles() {
  if (document.querySelector("style[data-vlab-registry]")) return;
  const style = document.createElement("style");
  style.dataset.vlabRegistry = "";
  style.textContent = `
    .registry-panel { display: grid; gap: 10px; }
    .registry-panel [hidden], .experiment-panel [hidden] { display: none !important; }
    .registry-heading { display: flex; justify-content: space-between; gap: 10px; align-items: center; }
    .registry-account { display: flex; align-items: center; justify-content: flex-end; gap: 7px; min-width: 0; }
    .registry-account strong { font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .registry-sign-out { min-height: 28px; padding: 3px 8px; font-size: 11px; white-space: nowrap; }
    .registry-auth { display: grid; gap: 8px; }
    .registry-auth input, .registry-new-form input { width: 100%; min-height: 38px; border: 1px solid #cfd8dc; border-radius: 9px; padding: 8px 10px; color: #172127; background: #fff; }
    .registry-auth input:focus, .registry-new-form input:focus { outline: 2px solid rgba(29,81,102,.16); border-color: #92acb7; }
    .registry-refresh-row { display: flex; justify-content: flex-end; margin-top: 8px; }
    .registry-refresh { min-height: 30px; padding: 4px 9px; font-size: 11px; }
    .registry-save-row { display: flex; flex-wrap: wrap; gap: 7px; }
    .registry-save-row button { min-height: 32px; padding: 5px 10px; font-size: 11.5px; }
    .registry-new-form { display: grid; gap: 7px; padding-top: 2px; }
    .registry-new-actions { display: flex; gap: 7px; justify-content: flex-end; }
    .registry-message { margin: 0; min-height: 1.4em; font-size: 11.5px; line-height: 1.4; color: #64757c; }
    .registry-message[data-state="error"] { color: #9e2d29; }
    .registry-message[data-state="success"] { color: #246240; }
    .registry-note { margin: 0; color: #78888e; font-size: 10.5px; line-height: 1.4; }
  `;
  document.head.append(style);
}

function buildPanel() {
  const refreshRow = document.createElement("div");
  refreshRow.className = "registry-refresh-row";
  refreshRow.hidden = true;
  const refresh = document.createElement("button");
  refresh.id = "registry-refresh";
  refresh.className = "registry-refresh";
  refresh.textContent = "Refresh";
  refreshRow.append(refresh);
  experimentSelect.insertAdjacentElement("afterend", refreshRow);

  const panel = document.createElement("section");
  panel.className = "panel registry-panel";
  panel.setAttribute("aria-label", "Experiment registry");

  const heading = document.createElement("div");
  heading.className = "registry-heading";
  const label = document.createElement("span");
  label.className = "field-label";
  label.textContent = "Registry";
  label.style.margin = "0";

  const account = document.createElement("div");
  account.className = "registry-account";
  const identity = document.createElement("strong");
  identity.id = "registry-identity";
  identity.textContent = "Signed out";
  const signOut = document.createElement("button");
  signOut.id = "registry-sign-out";
  signOut.className = "registry-sign-out";
  signOut.textContent = "Sign out";
  signOut.hidden = true;
  account.append(identity, signOut);
  heading.append(label, account);

  const auth = document.createElement("div");
  auth.id = "registry-auth";
  auth.className = "registry-auth";

  const email = document.createElement("input");
  email.id = "registry-email";
  email.type = "email";
  email.autocomplete = "email";
  email.placeholder = "Email";
  email.setAttribute("aria-label", "Email");

  const password = document.createElement("input");
  password.id = "registry-password";
  password.type = "password";
  password.autocomplete = "current-password";
  password.placeholder = "Password";
  password.setAttribute("aria-label", "Password");

  const signIn = document.createElement("button");
  signIn.id = "registry-sign-in";
  signIn.className = "primary";
  signIn.textContent = "Sign in";
  auth.append(email, password, signIn);

  const message = document.createElement("p");
  message.id = "registry-message";
  message.className = "registry-message";
  message.setAttribute("role", "status");
  message.textContent = "Sign in to access your experiments.";

  const saveRow = document.createElement("div");
  saveRow.className = "registry-save-row";
  saveRow.hidden = true;
  const save = document.createElement("button");
  save.id = "registry-save";
  save.className = "primary";
  save.textContent = "Save";
  save.disabled = true;
  const saveAsNew = document.createElement("button");
  saveAsNew.id = "registry-save-as-new";
  saveAsNew.textContent = "Save as new…";
  saveRow.append(save, saveAsNew);

  const newForm = document.createElement("div");
  newForm.className = "registry-new-form";
  newForm.hidden = true;
  const newTitle = document.createElement("input");
  newTitle.id = "registry-new-title";
  newTitle.type = "text";
  newTitle.maxLength = 300;
  newTitle.placeholder = "Experiment title";
  newTitle.setAttribute("aria-label", "New experiment title");
  const newActions = document.createElement("div");
  newActions.className = "registry-new-actions";
  const cancelNew = document.createElement("button");
  cancelNew.id = "registry-new-cancel";
  cancelNew.textContent = "Cancel";
  const createNew = document.createElement("button");
  createNew.id = "registry-new-create";
  createNew.className = "primary";
  createNew.textContent = "Create";
  newActions.append(cancelNew, createNew);
  newForm.append(newTitle, newActions);

  const note = document.createElement("p");
  note.className = "registry-note";
  note.textContent = "Edits stay local until you save them.";

  panel.append(heading, auth, message, saveRow, newForm, note);
  experimentPanel.insertAdjacentElement("afterend", panel);

  return {
    panel,
    identity,
    auth,
    email,
    password,
    signIn,
    signOut,
    refresh,
    refreshRow,
    message,
    saveRow,
    save,
    saveAsNew,
    newForm,
    newTitle,
    cancelNew,
    createNew,
  };
}

installStyles();
const ui = buildPanel();

function setMessage(text, state = "idle") {
  ui.message.textContent = text;
  ui.message.dataset.state = state;
}

function registryOptionGroup() {
  return experimentSelect.querySelector("optgroup[data-registry-options]");
}

function removeRegistryOptions() {
  registryOptionGroup()?.remove();
}

function artifactsEqual(left, right) {
  if (!left || !right) return false;
  return EXPERIMENT_ARTIFACTS.every(
    ({ registryField }) => left[registryField] === right[registryField],
  );
}

function hasUnsavedRemoteEdits() {
  return currentRemote !== null && !artifactsEqual(captureExperimentArtifacts(), currentRemote);
}

function updateSaveUi() {
  ui.saveRow.hidden = !user;
  ui.save.disabled = !user || !currentRemote || !hasUnsavedRemoteEdits();
  ui.saveAsNew.disabled = !user;
  if (!user) ui.newForm.hidden = true;
}

function renderExperimentOptions() {
  const previous = experimentSelect.value;
  removeRegistryOptions();
  if (!user) {
    if (previous !== BUILTIN_VALUE) experimentSelect.value = BUILTIN_VALUE;
    return;
  }

  const group = document.createElement("optgroup");
  group.label = "Registry";
  group.dataset.registryOptions = "";

  if (!remoteExperiments.length) {
    const empty = document.createElement("option");
    empty.disabled = true;
    empty.textContent = "No compatible experiments";
    group.append(empty);
  } else {
    for (const experiment of remoteExperiments) {
      const option = document.createElement("option");
      option.value = `registry:${experiment.id}`;
      option.textContent = `${experiment.title} · r${experiment.revision}`;
      group.append(option);
    }
  }

  experimentSelect.append(group);
  if ([...experimentSelect.options].some((option) => option.value === previous)) {
    experimentSelect.value = previous;
  }
}

async function loadProfile() {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, display_name")
    .eq("id", user.id)
    .maybeSingle();
  if (error) throw error;
  profile = data;
}

async function loadExperimentList() {
  const { data, error } = await supabase
    .from("experiments")
    .select("id,title,revision,updated_at,config_source,initializer_source,controller_source")
    .eq("owner_id", user.id)
    .eq("lifecycle", "active")
    .order("updated_at", { ascending: false });
  if (error) throw error;

  const active = data ?? [];
  remoteExperiments = [];
  hiddenNonRunnableCount = 0;
  for (const experiment of active) {
    if (productionExperimentRunnability(experiment).runnable) remoteExperiments.push(experiment);
    else hiddenNonRunnableCount += 1;
  }
  renderExperimentOptions();
}

async function readExperiment(id) {
  const { data, error } = await supabase
    .from("experiments")
    .select("id,owner_id,title,description,lifecycle,visibility,revision,config_source,initializer_source,controller_source,updated_at")
    .eq("id", id)
    .eq("owner_id", user.id)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Experiment not found for this account.");
  if (!productionExperimentRunnability(data).runnable) {
    throw new Error("This experiment is not compatible with the current simulator.");
  }
  return data;
}

function setSignedOutUi() {
  ui.identity.textContent = "Signed out";
  ui.auth.hidden = false;
  ui.signOut.hidden = true;
  ui.refreshRow.hidden = true;
  remoteExperiments = [];
  hiddenNonRunnableCount = 0;
  renderExperimentOptions();
  updateSaveUi();
}

function setSignedInUi() {
  ui.identity.textContent = profile?.display_name || user.email || "Signed in";
  ui.auth.hidden = true;
  ui.signOut.hidden = false;
  ui.refreshRow.hidden = false;
  updateSaveUi();
}

async function waitForSimulatorReady() {
  const deadline = performance.now() + 15000;
  while (applySetup.disabled && performance.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  if (applySetup.disabled) throw new Error("Simulator is not ready yet.");
}

async function applyLoadedSources() {
  await waitForSimulatorReady();
  applySetup.click();
}

async function restoreBuiltIn({ apply = true } = {}) {
  applyExperimentArtifacts(builtinArtifacts);
  currentRemote = null;
  experimentSelect.value = BUILTIN_VALUE;
  metadataRevision.textContent = BUILTIN_REVISION;
  ui.newForm.hidden = true;
  setMessage(user ? "Built-in experiment loaded." : "Sign in to access your experiments.");
  updateSaveUi();
  if (apply) await applyLoadedSources();
}

async function loadRemoteExperiment(id) {
  if (!user) throw new Error("Sign in to load registry experiments.");
  setMessage("Loading experiment…");
  const experiment = await readExperiment(id);
  applyExperimentArtifacts(experiment);
  currentRemote = experiment;
  metadataRevision.textContent = `registry r${experiment.revision}`;
  ui.newForm.hidden = true;
  setMessage(`Applying ${experiment.title} · r${experiment.revision}…`);
  updateSaveUi();
  await applyLoadedSources();
  setMessage(`${experiment.title} · r${experiment.revision} loaded.`, "success");
}

function connectedMessage() {
  const count = remoteExperiments.length;
  const hidden = hiddenNonRunnableCount > 0
    ? ` · ${hiddenNonRunnableCount} incompatible hidden`
    : "";
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
  if (!currentRemote) throw new Error("Use Save as new for the built-in experiment.");
  if (!hasUnsavedRemoteEdits()) {
    setMessage("No changes to save.");
    return;
  }

  const artifacts = registryArtifactsForSave();
  const baseRevision = currentRemote.revision;
  setMessage(`Saving ${currentRemote.title}…`);

  const { data, error } = await supabase
    .from("experiments")
    .update({
      ...artifacts,
      updated_by_actor: "human",
      updated_by_ai_client: null,
    })
    .eq("id", currentRemote.id)
    .eq("owner_id", user.id)
    .eq("revision", baseRevision)
    .select("id,owner_id,title,description,lifecycle,visibility,revision,config_source,initializer_source,controller_source,updated_at")
    .maybeSingle();

  if (error) throw error;
  if (!data) {
    throw new Error(
      "Save conflict: a newer revision exists. Your local edits are still here; refresh or reload the experiment before saving.",
    );
  }

  currentRemote = data;
  metadataRevision.textContent = `registry r${data.revision}`;
  await loadExperimentList();
  experimentSelect.value = `registry:${data.id}`;
  updateSaveUi();
  setMessage(`${data.title} saved as r${data.revision}.`, "success");
}

function defaultCopyTitle() {
  if (currentRemote?.title) return `${currentRemote.title} copy`;
  const selected = experimentSelect.selectedOptions?.[0]?.textContent?.trim();
  return selected ? `${selected} copy` : "New experiment";
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
    .select("id,owner_id,title,description,lifecycle,visibility,revision,config_source,initializer_source,controller_source,updated_at")
    .single();

  if (error) throw error;
  applyExperimentArtifacts(data);
  currentRemote = data;
  metadataRevision.textContent = `registry r${data.revision}`;
  closeSaveAsNew();
  await loadExperimentList();
  experimentSelect.value = `registry:${data.id}`;
  updateSaveUi();
  await applyLoadedSources();
  setMessage(`${data.title} created as a private experiment.`, "success");
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
  setSignedInUi();
  await loadExperimentList();
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
  await loadExperimentList();
  if (previousRemote) {
    const fresh = remoteExperiments.find((experiment) => experiment.id === previousRemote.id);
    if (!fresh) {
      if (dirty) {
        setMessage("The loaded experiment is no longer available. Your local edits are still in the editors.", "error");
        return;
      }
      await restoreBuiltIn();
      setMessage("The previously loaded experiment is no longer available or compatible.");
      return;
    }
    experimentSelect.value = `registry:${previousRemote.id}`;
    if (fresh.revision > previousRemote.revision) {
      if (dirty) {
        setMessage(
          `Newer registry revision r${fresh.revision} is available. Your local edits are preserved; reload before saving.`,
          "error",
        );
        return;
      }
      await loadRemoteExperiment(previousRemote.id);
      return;
    }
  }
  setMessage(connectedMessage(), "success");
}

async function run(action) {
  try {
    await action();
  } catch (error) {
    console.error(error);
    setMessage(error instanceof Error ? error.message : String(error), "error");
  }
}

ui.signIn.addEventListener("click", () => run(signIn));
ui.password.addEventListener("keydown", (event) => {
  if (event.key === "Enter") run(signIn);
});
ui.signOut.addEventListener("click", () => run(signOut));
ui.refresh.addEventListener("click", () => run(refreshRegistry));
ui.save.addEventListener("click", () => run(saveCurrentExperiment));
ui.saveAsNew.addEventListener("click", () => run(openSaveAsNew));
ui.cancelNew.addEventListener("click", closeSaveAsNew);
ui.createNew.addEventListener("click", () => run(createNewExperiment));
ui.newTitle.addEventListener("keydown", (event) => {
  if (event.key === "Enter") run(createNewExperiment);
  if (event.key === "Escape") closeSaveAsNew();
});

for (const descriptor of EXPERIMENT_ARTIFACTS) {
  document.querySelector(descriptor.editorSelector)?.addEventListener("input", updateSaveUi);
}

experimentSelect.addEventListener("change", () => run(async () => {
  const value = experimentSelect.value;
  if (value === BUILTIN_VALUE) {
    await restoreBuiltIn();
    return;
  }
  if (value.startsWith("registry:")) {
    await loadRemoteExperiment(value.slice("registry:".length));
  }
}));

supabase.auth.onAuthStateChange((_event, session) => {
  if (session?.user?.id === user?.id || (!session && !user)) return;
  queueMicrotask(() => run(initializeSession));
});

run(initializeSession);
