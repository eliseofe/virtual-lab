import { createClient } from "https://esm.sh/@supabase/supabase-js@2.111.0";
import {
  applyExperimentArtifacts,
  captureExperimentArtifacts,
} from "./experiment-artifacts.js";
import { productionExperimentRunnability } from "./experiment-validation.js";

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
    .registry-heading { display: flex; justify-content: space-between; gap: 10px; align-items: center; }
    .registry-heading strong { font-size: 12px; }
    .registry-auth { display: grid; gap: 8px; }
    .registry-auth input { width: 100%; min-height: 38px; border: 1px solid #cfd8dc; border-radius: 9px; padding: 8px 10px; color: #172127; background: #fff; }
    .registry-auth input:focus { outline: 2px solid rgba(29,81,102,.16); border-color: #92acb7; }
    .registry-actions { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
    .registry-message { margin: 0; min-height: 1.4em; font-size: 11.5px; line-height: 1.4; color: #64757c; }
    .registry-message[data-state="error"] { color: #9e2d29; }
    .registry-message[data-state="success"] { color: #246240; }
    .registry-note { margin: 0; color: #78888e; font-size: 10.5px; line-height: 1.4; }
  `;
  document.head.append(style);
}

function buildPanel() {
  const panel = document.createElement("section");
  panel.className = "panel registry-panel";
  panel.setAttribute("aria-label", "Experiment registry connection");

  const heading = document.createElement("div");
  heading.className = "registry-heading";
  const label = document.createElement("span");
  label.className = "field-label";
  label.textContent = "Experiment registry";
  label.style.margin = "0";
  const identity = document.createElement("strong");
  identity.id = "registry-identity";
  identity.textContent = "Signed out";
  heading.append(label, identity);

  const auth = document.createElement("div");
  auth.id = "registry-auth";
  auth.className = "registry-auth";

  const email = document.createElement("input");
  email.id = "registry-email";
  email.type = "email";
  email.autocomplete = "email";
  email.placeholder = "Email";
  email.setAttribute("aria-label", "Registry email");

  const password = document.createElement("input");
  password.id = "registry-password";
  password.type = "password";
  password.autocomplete = "current-password";
  password.placeholder = "Password";
  password.setAttribute("aria-label", "Registry password");

  const signIn = document.createElement("button");
  signIn.id = "registry-sign-in";
  signIn.className = "primary";
  signIn.textContent = "Sign in";

  auth.append(email, password, signIn);

  const sessionActions = document.createElement("div");
  sessionActions.id = "registry-session-actions";
  sessionActions.className = "registry-actions";
  sessionActions.hidden = true;

  const refresh = document.createElement("button");
  refresh.id = "registry-refresh";
  refresh.textContent = "Refresh list";
  const signOut = document.createElement("button");
  signOut.id = "registry-sign-out";
  signOut.textContent = "Sign out";
  sessionActions.append(refresh, signOut);

  const message = document.createElement("p");
  message.id = "registry-message";
  message.className = "registry-message";
  message.setAttribute("role", "status");
  message.textContent = "Sign in to load your private registry experiments.";

  const note = document.createElement("p");
  note.className = "registry-note";
  note.textContent = "Read-only integration: loading/running never writes to the registry. Local edits are not saved remotely yet.";

  panel.append(heading, auth, sessionActions, message, note);
  experimentPanel.insertAdjacentElement("afterend", panel);

  return { panel, identity, auth, email, password, signIn, sessionActions, refresh, signOut, message };
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

function renderExperimentOptions() {
  const previous = experimentSelect.value;
  removeRegistryOptions();
  if (!user) {
    if (previous !== BUILTIN_VALUE) experimentSelect.value = BUILTIN_VALUE;
    return;
  }

  const group = document.createElement("optgroup");
  group.label = `Registry · ${user.email ?? "signed in"}`;
  group.dataset.registryOptions = "";

  if (!remoteExperiments.length) {
    const empty = document.createElement("option");
    empty.disabled = true;
    empty.textContent = "No runnable active private experiments";
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
    .select("id,owner_id,title,description,lifecycle,revision,config_source,initializer_source,controller_source,updated_at")
    .eq("id", id)
    .eq("owner_id", user.id)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Experiment was not found or is not visible to this account.");
  if (!productionExperimentRunnability(data).runnable) {
    throw new Error("Experiment is not runnable by the current production Lab and cannot be loaded.");
  }
  return data;
}

function setSignedOutUi() {
  ui.identity.textContent = "Signed out";
  ui.auth.hidden = false;
  ui.sessionActions.hidden = true;
  remoteExperiments = [];
  hiddenNonRunnableCount = 0;
  renderExperimentOptions();
}

function setSignedInUi() {
  ui.identity.textContent = profile?.display_name || user.email || "Signed in";
  ui.auth.hidden = true;
  ui.sessionActions.hidden = false;
}

async function waitForSimulatorReady() {
  const deadline = performance.now() + 15000;
  while (applySetup.disabled && performance.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  if (applySetup.disabled) throw new Error("Simulator is not ready to apply the loaded experiment yet.");
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
  setMessage(user ? "Built-in experiment loaded locally." : "Sign in to load your private registry experiments.");
  if (apply) await applyLoadedSources();
}

async function loadRemoteExperiment(id) {
  if (!user) throw new Error("Sign in before loading a registry experiment.");
  setMessage("Loading registry experiment…");
  const experiment = await readExperiment(id);
  applyExperimentArtifacts(experiment);
  currentRemote = experiment;
  metadataRevision.textContent = `registry r${experiment.revision}`;
  setMessage(`${experiment.title} · revision ${experiment.revision} loaded from registry. Applying to local simulator…`);
  await applyLoadedSources();
  setMessage(`${experiment.title} · revision ${experiment.revision} loaded. Run it locally when ready.`, "success");
}

function connectedMessage() {
  const hidden = hiddenNonRunnableCount > 0
    ? ` · ${hiddenNonRunnableCount} non-runnable active entr${hiddenNonRunnableCount === 1 ? "y" : "ies"} hidden`
    : "";
  return `Registry connected as ${user.email ?? profile?.display_name ?? user.id}${hidden}.`;
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
  if (!email || !password) throw new Error("Enter registry email and password.");
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
  setMessage("Refreshing registry list…");
  await loadExperimentList();
  if (currentRemote) {
    const stillVisible = remoteExperiments.some((experiment) => experiment.id === currentRemote.id);
    if (!stillVisible) {
      await restoreBuiltIn();
      setMessage("The previously loaded registry experiment is no longer runnable, active or visible.");
      return;
    }
    experimentSelect.value = `registry:${currentRemote.id}`;
  }
  const hidden = hiddenNonRunnableCount > 0 ? ` · ${hiddenNonRunnableCount} non-runnable hidden` : "";
  setMessage(`Registry list refreshed · ${remoteExperiments.length} runnable active experiment${remoteExperiments.length === 1 ? "" : "s"}${hidden}.`, "success");
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
