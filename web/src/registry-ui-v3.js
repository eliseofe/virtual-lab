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
  auth: { storageKey: "vlab-production-registry-auth-v1" },
});

const experimentSelect = document.querySelector("#experiment-select");
const experimentPanel = experimentSelect?.closest(".experiment-panel");
const experimentLabel = experimentPanel?.querySelector('label[for="experiment-select"]');
const metadataRevision = document.querySelector(".metadata-panel .panel-heading strong");
const applySetup = document.querySelector("#apply-setup");

if (!experimentSelect || !experimentPanel || !experimentLabel || !metadataRevision || !applySetup) {
  throw new Error("Registry integration UI mismatch.");
}

const BUILTIN_VALUE = experimentSelect.value;
const BUILTIN_TITLE = experimentSelect.selectedOptions?.[0]?.textContent?.trim() || "Built-in experiment";
const BUILTIN_REVISION = metadataRevision.textContent;
const builtinArtifacts = captureExperimentArtifacts();
const WORKSPACE_KEY_PREFIX = "vlab-last-experiment-v1:";

const AI_CLIENT_LABELS = Object.freeze({
  "f9ea9bbe-2e3f-497d-92b3-5f108b64593c": "Claude",
  "7f8986f1-11c3-4be5-8cc7-3887dfb038d9": "Claude",
  "12e106dc-4da6-49cd-9062-d0a4bb5c34c6": "Grok",
  "13c111c5-64f6-4be5-9e02-7188dd104cce": "Grok",
  "d3ab452e-1e41-4ceb-a694-645e2f03872a": "Grok",
  "ChatGPT-owner-authorized-AEM-metric": "ChatGPT",
  "mcp-client": "AI · legacy MCP client",
});

let user = null;
let profile = null;
let remoteExperiments = [];
let sharedExperiments = [];
let supervisedProfiles = [];
let supervisedExperiments = [];
let shareRecipients = [];
let outgoingShares = [];
let collections = [];
let currentRemote = null;
let currentRemoteAccess = null;
let currentWorkingCopy = null;
let currentRevisions = [];
let currentRevisionView = { kind: "builtin", revision: null };
let revisionFilter = "all";
let currentExperimentChannel = null;
let workingCopyAutosave = Promise.resolve();
let hiddenNonRunnableCount = 0;
let browserSource = "builtin";
let browserCollection = "all";
let browserSearch = "";

function installStyles() {
  if (document.querySelector("style[data-vlab-registry-v3]")) return;
  const style = document.createElement("style");
  style.dataset.vlabRegistryV3 = "";
  style.textContent = `
    .registry-panel { display: grid; gap: 10px; }
    .registry-panel [hidden], .experiment-panel [hidden], .experiment-browser[hidden] { display: none !important; }
    .registry-heading { display: flex; justify-content: space-between; gap: 10px; align-items: center; }
    .registry-account { display: flex; align-items: center; justify-content: flex-end; gap: 7px; min-width: 0; }
    .registry-account strong { font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .registry-sign-out { min-height: 28px; padding: 3px 8px; font-size: 11px; white-space: nowrap; }
    .registry-auth { display: grid; gap: 8px; }
    .registry-auth input, .registry-new-form input, .registry-new-form select, .registry-move-select, .registry-share-select, .experiment-browser-search { width: 100%; min-height: 38px; border: 1px solid #cfd8dc; border-radius: 9px; padding: 8px 10px; color: #172127; background: #fff; }
    .registry-auth input:focus, .registry-new-form input:focus, .registry-new-form select:focus, .registry-move-select:focus, .registry-share-select:focus, .experiment-browser-search:focus { outline: 2px solid rgba(29,81,102,.16); border-color: #92acb7; }
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
    .registry-new-field, .registry-move-field { display: grid; gap: 4px; color: #52656d; font-size: 10.5px; font-weight: 650; }
    .registry-new-actions { display: flex; gap: 7px; justify-content: flex-end; }
    .registry-move-row { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 7px; align-items: end; }
    .registry-move-row button { min-height: 38px; padding: 7px 10px; }
    .registry-share-row { display: grid; gap: 7px; padding-top: 2px; }
    .registry-share-form { display: grid; grid-template-columns: minmax(0, 1fr) auto auto; gap: 7px; align-items: end; }
    .registry-share-field { display: grid; gap: 4px; color: #52656d; font-size: 10.5px; font-weight: 650; }
    .registry-share-form button { min-height: 38px; padding: 7px 10px; }
    .registry-share-list { display: grid; gap: 6px; }
    .registry-share-item { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 7px 8px; border: 1px solid #e0e7ea; border-radius: 8px; color: #52656d; font-size: 10.5px; }
    .registry-share-item button { min-height: 30px; padding: 4px 8px; font-size: 10.5px; }

    .experiment-current { display: grid; gap: 8px; margin-bottom: 10px; padding-bottom: 10px; border-bottom: 1px solid #e5ebee; }
    .experiment-current-main { display: flex; align-items: flex-start; justify-content: space-between; gap: 10px; }
    .experiment-current-title { font-size: 13px; line-height: 1.35; color: #172127; }
    .experiment-current-meta { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
    .experiment-origin, .experiment-location { display: inline-flex; align-items: center; min-height: 24px; padding: 3px 8px; border-radius: 999px; font-size: 10.5px; font-weight: 700; }
    .experiment-origin { background: #eef3f5; color: #50626a; }
    .experiment-origin[data-kind="owned"] { background: #e7f3ec; color: #265f43; }
    .experiment-origin[data-kind="readonly"] { background: #f1f2f3; color: #626c71; }
    .experiment-location { background: #edf4f6; color: #315a69; }
    .experiment-browse { min-height: 32px; padding: 5px 10px; white-space: nowrap; }
    .experiment-quick-hint { margin: 6px 0 0; color: #78888e; font-size: 10.5px; line-height: 1.35; }
    .experiment-revision-workflow { display: grid; gap: 8px; padding: 9px 10px; border: 1px solid #dfe7ea; border-radius: 11px; background: #f8fafb; }
    .experiment-revision-top { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
    .experiment-revision-trigger { display: grid; grid-template-columns: auto 1fr auto; gap: 7px; align-items: center; min-width: 0; min-height: 38px; padding: 6px 9px; text-align: left; flex: 1; background: #fff; }
    .experiment-revision-trigger strong { font-size: 12px; white-space: nowrap; }
    .experiment-revision-trigger span { min-width: 0; color: #64757c; font-size: 10.5px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .experiment-revision-trigger b { color: #718087; font-size: 12px; }
    .experiment-revision-actions { display: flex; flex-wrap: wrap; gap: 7px; align-items: center; }
    .experiment-revision-actions button { min-height: 36px; padding: 6px 10px; }
    .experiment-revision-notice { margin: 0; color: #315a69; font-size: 10.5px; font-weight: 700; }
    .experiment-revision-details { display: grid; gap: 3px; }
    .experiment-revision-details .registry-save-state, .experiment-revision-details .registry-note { margin: 0; }
    .experiment-history { width: min(620px, calc(100vw - 24px)); max-height: min(760px, calc(100vh - 24px)); border: 0; border-radius: 16px; padding: 0; box-shadow: 0 18px 70px rgba(16,35,44,.28); color: #172127; }
    .experiment-history::backdrop { background: rgba(16,27,33,.42); }
    .experiment-history-shell { display: grid; grid-template-rows: auto auto auto 1fr; max-height: inherit; min-height: min(560px, calc(100vh - 24px)); background: #fff; }
    .experiment-history-head { display: flex; justify-content: space-between; align-items: center; gap: 10px; padding: 16px 17px 11px; border-bottom: 1px solid #e6ecef; }
    .experiment-history-head h2 { margin: 0; font-size: 17px; }
    .experiment-history-filter { display: flex; gap: 5px; padding: 11px 17px 0; }
    .experiment-history-filter button { min-height: 32px; padding: 5px 10px; }
    .experiment-history-filter button[aria-pressed="true"] { background: #1d5166; border-color: #1d5166; color: #fff; }
    .experiment-history-help { margin: 0; padding: 9px 17px 6px; color: #687980; font-size: 10.5px; line-height: 1.4; }
    .experiment-history-list { display: grid; align-content: start; gap: 7px; overflow: auto; padding: 7px 17px 17px; }
    .experiment-history-item { display: grid; grid-template-columns: auto 1fr auto; gap: 10px; align-items: center; width: 100%; min-height: 54px; padding: 8px 10px; text-align: left; background: #fff; border-radius: 10px; }
    .experiment-history-item[aria-current="true"] { border-color: #6f97a6; box-shadow: 0 0 0 1px rgba(29,81,102,.12); background: #f4f8f9; }
    .experiment-history-revision { font-size: 12px; font-weight: 800; min-width: 70px; }
    .experiment-history-copy { display: grid; gap: 2px; min-width: 0; }
    .experiment-history-copy strong { font-size: 11.5px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .experiment-history-copy span { color: #718087; font-size: 10px; line-height: 1.35; }
    .experiment-history-kind { min-width: 44px; text-align: right; color: #607178; font-size: 10px; font-weight: 750; }
    .experiment-history-empty { margin: 16px 2px; color: #718087; font-size: 12px; }

    .experiment-browser { width: min(920px, calc(100vw - 32px)); max-height: min(740px, calc(100vh - 32px)); border: 0; border-radius: 16px; padding: 0; box-shadow: 0 18px 70px rgba(16,35,44,.28); color: #172127; }
    .experiment-browser::backdrop { background: rgba(16,27,33,.42); }
    .experiment-browser-shell { display: grid; grid-template-rows: auto 1fr; max-height: inherit; min-height: 500px; background: #fff; }
    .experiment-browser-head { display: flex; justify-content: space-between; align-items: center; gap: 12px; padding: 17px 18px 12px; border-bottom: 1px solid #e6ecef; }
    .experiment-browser-head h2 { margin: 0; font-size: 17px; }
    .experiment-browser-head-actions { display: flex; gap: 7px; }
    .experiment-browser-tabs { display: flex; gap: 6px; padding: 12px 18px 0; }
    .experiment-browser-tabs[hidden] { display: none !important; }
    .experiment-browser-tab[aria-selected="true"] { background: #1d5166; border-color: #1d5166; color: #fff; }
    .experiment-browser-body { display: grid; grid-template-columns: 190px 1fr; min-height: 0; padding: 12px 18px 18px; gap: 14px; }
    .experiment-browser-filters { display: grid; align-content: start; gap: 6px; padding-right: 12px; border-right: 1px solid #e6ecef; overflow: auto; }
    .experiment-filter { text-align: left; width: 100%; min-height: 32px; padding: 6px 8px; border-radius: 8px; }
    .experiment-filter[aria-selected="true"] { background: #edf4f6; border-color: #b8ccd4; color: #244e5f; font-weight: 700; }
    .experiment-browser-content { min-width: 0; display: grid; grid-template-rows: auto auto auto 1fr; gap: 8px; }
    .experiment-browser-context { display: grid; gap: 2px; }
    .experiment-browser-context strong { font-size: 13px; }
    .experiment-browser-context span { color: #6f7d83; font-size: 10.5px; line-height: 1.35; }
    .experiment-browser-search-row { display: flex; gap: 8px; }
    .experiment-browser-count { margin: 0; color: #6f7d83; font-size: 11px; }
    .experiment-results { display: grid; align-content: start; gap: 12px; overflow: auto; padding-right: 3px; }
    .experiment-group { display: grid; gap: 6px; }
    .experiment-group-head { display: flex; align-items: baseline; justify-content: space-between; gap: 10px; padding: 4px 2px; border-bottom: 1px solid #e7ecef; }
    .experiment-group-head strong { font-size: 12px; }
    .experiment-group-head span { color: #7a888e; font-size: 10px; }
    .experiment-group-items { display: grid; gap: 6px; }
    .experiment-result { display: grid; gap: 4px; text-align: left; width: 100%; padding: 10px 11px; border-radius: 10px; background: #fff; }
    .experiment-result:hover { background: #f6f9fa; }
    .experiment-result strong { font-size: 12.5px; }
    .experiment-result-meta { display: flex; flex-wrap: wrap; gap: 8px; color: #718087; font-size: 10.5px; }
    .experiment-browser-empty { margin: 10px 2px; color: #718087; font-size: 12px; }
    @media (max-width: 680px) {
      .experiment-browser-body { grid-template-columns: 1fr; }
      .experiment-browser-filters { display: flex; overflow-x: auto; border-right: 0; border-bottom: 1px solid #e6ecef; padding: 0 0 9px; }
      .experiment-filter { width: auto; white-space: nowrap; }
      .experiment-browser-shell { min-height: min(640px, calc(100vh - 32px)); }
      .registry-share-form { grid-template-columns: 1fr; }
      .registry-share-row button { min-height: 44px; }
      .experiment-revision-top { align-items: stretch; flex-direction: column; }
      .experiment-revision-actions { display: grid; grid-template-columns: 1fr 1fr; }
      .experiment-revision-actions button { min-height: 44px; }
      .experiment-history-item { grid-template-columns: 1fr auto; }
      .experiment-history-revision { grid-column: 1; }
      .experiment-history-copy { grid-column: 1; }
      .experiment-history-kind { grid-column: 2; grid-row: 1 / span 2; align-self: center; }
    }
  `;
  document.head.append(style);
}

function collectionName(id) {
  if (!id) return "Unfiled";
  return collections.find((collection) => collection.id === id)?.name || "Unfiled";
}

function populateCollectionSelect(select, selectedId = null) {
  select.replaceChildren();
  const unfiled = document.createElement("option");
  unfiled.value = "";
  unfiled.textContent = "Unfiled";
  select.append(unfiled);
  for (const collection of collections) {
    const option = document.createElement("option");
    option.value = collection.id;
    option.textContent = collection.name;
    select.append(option);
  }
  select.value = selectedId || "";
}

function selectedCollectionId(select) {
  return select.value || null;
}

function supervisedResearcherName(ownerId) {
  return supervisedProfiles.find((candidate) => candidate.id === ownerId)?.display_name?.trim() || "Student researcher";
}

function currentLocationLabel() {
  if (!currentRemote) return "Built-in";
  if (currentRemoteAccess === "shared") return "Shared with me";
  if (currentRemoteAccess === "supervised") return `Supervised · ${supervisedResearcherName(currentRemote.owner_id)}`;
  return currentRemote.collection_id ? `Collection · ${collectionName(currentRemote.collection_id)}` : "No collection";
}

function currentOutgoingShares() {
  if (!currentRemote || !user || currentRemote.owner_id !== user.id) return [];
  return outgoingShares.filter((share) => share.experiment_id === currentRemote.id);
}

function availableShareRecipients() {
  const sharedIds = new Set(currentOutgoingShares().map((share) => share.recipient_id));
  return shareRecipients.filter((recipient) => !sharedIds.has(recipient.id));
}

function shareRecipientLabel(recipientId) {
  const recipient = shareRecipients.find((candidate) => candidate.id === recipientId);
  if (!recipient) return "Researcher";
  return recipient.display_name?.trim() || recipient.role;
}

function populateShareRecipientSelect() {
  if (!ui?.shareRecipient) return;
  ui.shareRecipient.replaceChildren();
  for (const recipient of availableShareRecipients()) {
    const option = document.createElement("option");
    option.value = recipient.id;
    option.textContent = recipient.display_name?.trim()
      ? `${recipient.display_name.trim()} · ${recipient.role}`
      : recipient.role;
    ui.shareRecipient.append(option);
  }
}

function renderOutgoingShares() {
  if (!ui?.shareList) return;
  ui.shareList.replaceChildren();
  for (const share of currentOutgoingShares()) {
    const item = document.createElement("div");
    item.className = "registry-share-item";
    const label = document.createElement("span");
    label.textContent = `Shared read-only with ${shareRecipientLabel(share.recipient_id)}`;
    const revoke = document.createElement("button");
    revoke.textContent = "Revoke";
    revoke.addEventListener("click", () => run(() => revokeCurrentExperimentShare(share.recipient_id)));
    item.append(label, revoke);
    ui.shareList.append(item);
  }
}

function buildCurrentExperimentUi() {
  experimentLabel.textContent = "Experiment";
  experimentSelect.setAttribute("aria-label", "Switch experiment");

  const current = document.createElement("div");
  current.className = "experiment-current";

  const main = document.createElement("div");
  main.className = "experiment-current-main";
  const title = document.createElement("strong");
  title.className = "experiment-current-title";
  title.textContent = BUILTIN_TITLE;
  const browse = document.createElement("button");
  browse.className = "experiment-browse";
  browse.textContent = "Find experiment";
  main.append(title, browse);

  const meta = document.createElement("div");
  meta.className = "experiment-current-meta";
  const origin = document.createElement("span");
  origin.className = "experiment-origin";
  origin.dataset.kind = "readonly";
  origin.textContent = "Built-in · Read-only";
  const location = document.createElement("span");
  location.className = "experiment-location";
  location.textContent = "Built-in";
  meta.append(origin, location);

  const revisionWorkflow = document.createElement("div");
  revisionWorkflow.className = "experiment-revision-workflow";
  revisionWorkflow.hidden = true;
  const revisionTop = document.createElement("div");
  revisionTop.className = "experiment-revision-top";
  const revisionTrigger = document.createElement("button");
  revisionTrigger.className = "experiment-revision-trigger";
  revisionTrigger.setAttribute("aria-label", "Open revision history");
  const revisionPrimary = document.createElement("strong");
  revisionPrimary.textContent = "Built-in";
  const revisionSecondary = document.createElement("span");
  revisionSecondary.textContent = "No saved revision history";
  const revisionChevron = document.createElement("b");
  revisionChevron.setAttribute("aria-hidden", "true");
  revisionChevron.textContent = "▾";
  revisionTrigger.append(revisionPrimary, revisionSecondary, revisionChevron);
  const revisionActions = document.createElement("div");
  revisionActions.className = "experiment-revision-actions";
  const editFromRevision = document.createElement("button");
  editFromRevision.textContent = "Edit from this revision";
  editFromRevision.hidden = true;
  revisionActions.append(editFromRevision);
  revisionTop.append(revisionTrigger, revisionActions);
  const revisionNotice = document.createElement("p");
  revisionNotice.className = "experiment-revision-notice";
  revisionNotice.hidden = true;
  const revisionDetails = document.createElement("div");
  revisionDetails.className = "experiment-revision-details";
  revisionWorkflow.append(revisionTop, revisionNotice, revisionDetails);

  current.append(main, meta, revisionWorkflow);
  experimentPanel.insertBefore(current, experimentLabel);

  const quickHint = document.createElement("p");
  quickHint.className = "experiment-quick-hint";
  experimentSelect.insertAdjacentElement("afterend", quickHint);

  return {
    current, title, browse, origin, location, quickHint,
    revisionWorkflow, revisionTrigger, revisionPrimary, revisionSecondary,
    revisionActions, revisionNotice, revisionDetails, editFromRevision,
  };
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
  message.textContent = "Sign in to open and save your private experiments.";

  const saveRow = document.createElement("div");
  saveRow.className = "registry-save-row";
  saveRow.hidden = true;
  const saveState = document.createElement("p");
  saveState.className = "registry-save-state";
  const saveActions = document.createElement("div");
  saveActions.className = "registry-save-actions";
  const save = document.createElement("button");
  save.className = "primary";
  save.textContent = "Save Revision";
  const saveAsNew = document.createElement("button");
  saveAsNew.textContent = "Save as new…";
  saveActions.append(save, saveAsNew);

  const moveRow = document.createElement("div");
  moveRow.className = "registry-move-row";
  moveRow.hidden = true;
  const moveField = document.createElement("label");
  moveField.className = "registry-move-field";
  moveField.append("Collection");
  const moveCollection = document.createElement("select");
  moveCollection.className = "registry-move-select";
  moveCollection.setAttribute("aria-label", "Move current experiment to collection");
  moveField.append(moveCollection);
  const move = document.createElement("button");
  move.textContent = "Move";
  moveRow.append(moveField, move);

  const shareRow = document.createElement("div");
  shareRow.className = "registry-share-row";
  shareRow.hidden = true;
  const shareOpen = document.createElement("button");
  shareOpen.textContent = "Share read-only…";
  const shareForm = document.createElement("div");
  shareForm.className = "registry-share-form";
  shareForm.hidden = true;
  const shareField = document.createElement("label");
  shareField.className = "registry-share-field";
  shareField.append("Share with");
  const shareRecipient = document.createElement("select");
  shareRecipient.className = "registry-share-select";
  shareRecipient.setAttribute("aria-label", "Share current experiment with researcher");
  shareField.append(shareRecipient);
  const cancelShare = document.createElement("button");
  cancelShare.textContent = "Cancel";
  const confirmShare = document.createElement("button");
  confirmShare.className = "primary";
  confirmShare.textContent = "Share";
  shareForm.append(shareField, cancelShare, confirmShare);
  const shareList = document.createElement("div");
  shareList.className = "registry-share-list";
  shareRow.append(shareOpen, shareForm, shareList);

  saveRow.append(saveState, saveActions, moveRow, shareRow);

  const newForm = document.createElement("div");
  newForm.className = "registry-new-form";
  newForm.hidden = true;
  const newTitleField = document.createElement("label");
  newTitleField.className = "registry-new-field";
  newTitleField.append("Title");
  const newTitle = document.createElement("input");
  newTitle.type = "text";
  newTitle.maxLength = 300;
  newTitle.placeholder = "New experiment title";
  newTitle.setAttribute("aria-label", "New experiment title");
  newTitleField.append(newTitle);
  const newCollectionField = document.createElement("label");
  newCollectionField.className = "registry-new-field";
  newCollectionField.append("Collection");
  const newCollection = document.createElement("select");
  newCollection.setAttribute("aria-label", "New experiment collection");
  newCollectionField.append(newCollection);
  const newActions = document.createElement("div");
  newActions.className = "registry-new-actions";
  const cancelNew = document.createElement("button");
  cancelNew.textContent = "Cancel";
  const createNew = document.createElement("button");
  createNew.className = "primary";
  createNew.textContent = "Create private copy";
  newActions.append(cancelNew, createNew);
  newForm.append(newTitleField, newCollectionField, newActions);

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
    moveRow,
    moveCollection,
    move,
    shareRow,
    shareOpen,
    shareForm,
    shareRecipient,
    cancelShare,
    confirmShare,
    shareList,
    newForm,
    newTitle,
    newCollection,
    cancelNew,
    createNew,
    note,
  };
}

function buildRevisionHistory() {
  const dialog = document.createElement("dialog");
  dialog.className = "experiment-history";
  dialog.setAttribute("aria-label", "Revision history");

  const shell = document.createElement("div");
  shell.className = "experiment-history-shell";
  const head = document.createElement("div");
  head.className = "experiment-history-head";
  const heading = document.createElement("h2");
  heading.textContent = "Revision history";
  const close = document.createElement("button");
  close.textContent = "Close";
  head.append(heading, close);

  const filters = document.createElement("div");
  filters.className = "experiment-history-filter";
  filters.setAttribute("aria-label", "Filter revisions");
  const all = document.createElement("button");
  all.textContent = "All";
  all.dataset.revisionFilter = "all";
  const mine = document.createElement("button");
  mine.textContent = "Mine";
  mine.dataset.revisionFilter = "mine";
  const ai = document.createElement("button");
  ai.textContent = "AI";
  ai.dataset.revisionFilter = "ai";
  filters.append(all, mine, ai);

  const help = document.createElement("p");
  help.className = "experiment-history-help";
  help.textContent = "Choose any saved revision to inspect or continue from it. Numbered history is never rewritten.";
  const list = document.createElement("div");
  list.className = "experiment-history-list";

  shell.append(head, filters, help, list);
  dialog.append(shell);
  document.body.append(dialog);
  return { dialog, close, filters, all, mine, ai, help, list };
}

function buildBrowser() {
  const dialog = document.createElement("dialog");
  dialog.className = "experiment-browser";
  dialog.setAttribute("aria-label", "Experiment library");

  const shell = document.createElement("div");
  shell.className = "experiment-browser-shell";
  const head = document.createElement("div");
  head.className = "experiment-browser-head";
  const heading = document.createElement("h2");
  heading.textContent = "Experiment library";
  const headActions = document.createElement("div");
  headActions.className = "experiment-browser-head-actions";
  const refresh = document.createElement("button");
  refresh.textContent = "Refresh library";
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
  tabs.hidden = true;

  const body = document.createElement("div");
  body.className = "experiment-browser-body";
  const filters = document.createElement("nav");
  filters.className = "experiment-browser-filters";
  filters.setAttribute("aria-label", "Experiment collections");
  const content = document.createElement("div");
  content.className = "experiment-browser-content";

  const context = document.createElement("div");
  context.className = "experiment-browser-context";
  const contextTitle = document.createElement("strong");
  const contextHelp = document.createElement("span");
  context.append(contextTitle, contextHelp);

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
  content.append(context, searchRow, count, results);
  body.append(filters, content);

  shell.append(head, tabs, body);
  dialog.append(shell);
  document.body.append(dialog);

  return {
    dialog,
    refresh,
    close,
    builtinTab,
    mineTab,
    filters,
    contextTitle,
    contextHelp,
    searchRow,
    search,
    count,
    results,
  };
}

installStyles();
const currentUi = buildCurrentExperimentUi();
const ui = buildAccountPanel();
const revisionHistory = buildRevisionHistory();
const browser = buildBrowser();

// Revision state belongs to the Experiment itself, not to Account settings.
currentUi.revisionActions.append(ui.save);
currentUi.revisionDetails.append(ui.saveState, ui.note);

function setMessage(text, state = "idle") {
  ui.message.textContent = text;
  ui.message.dataset.state = state;
}

function artifactsEqual(left, right) {
  return experimentArtifactsEqual(left, right);
}

function currentRevisionSnapshot() {
  if (currentRevisionView.kind !== "revision") return null;
  return currentRevisions.find((revision) => revision.revision === currentRevisionView.revision)
    ?? (currentRemote?.revision === currentRevisionView.revision ? currentRemote : null);
}

function currentEditingBaseline() {
  if (currentRevisionView.kind === "working") return currentWorkingCopy;
  if (currentRevisionView.kind === "revision") return currentRevisionSnapshot();
  return currentRemote;
}

function artifactEditors() {
  const editors = [];
  for (const descriptor of EXPERIMENT_ARTIFACTS) {
    if (!descriptor.editorSelector) continue;
    const editor = document.querySelector(descriptor.editorSelector);
    if (editor) editors.push(editor);
  }
  for (const editor of document.querySelectorAll('[data-experiment-artifact-editor="true"]')) {
    if (!editors.includes(editor)) editors.push(editor);
  }
  return editors;
}

function setArtifactEditorsLocked(locked) {
  for (const editor of artifactEditors()) {
    if ("readOnly" in editor) editor.readOnly = locked;
    editor.setAttribute("aria-readonly", String(locked));
  }
}

function hasUnpersistedRemoteEdits() {
  const baseline = currentEditingBaseline();
  return currentRemote !== null && baseline !== null && !artifactsEqual(captureExperimentArtifacts(), baseline);
}

// Kept as the switching/loss predicate name used by existing callers. Under #397
// "unsaved" means only edits that have not yet reached the durable Working copy.
function hasUnsavedRemoteEdits() {
  return hasUnpersistedRemoteEdits();
}

async function persistWorkingCopy() {
  const owned = Boolean(user && currentRemote && currentRemote.owner_id === user.id);
  if (!owned || !hasUnpersistedRemoteEdits()) return currentWorkingCopy;

  // Working copy persistence is deliberately tolerant of temporarily invalid
  // scientific code. It must preserve text while the human is still editing.
  const artifacts = captureExperimentArtifacts();
  const selectedRevision = currentRevisionView.kind === "revision" ? currentRevisionView.revision : null;
  const baseRevision = currentWorkingCopy?.base_revision ?? selectedRevision ?? currentRemote.revision;
  setMessage("Autosaving Working copy…");
  const { data, error } = await supabase
    .from("experiment_working_copies")
    .upsert({
      experiment_id: currentRemote.id,
      owner_id: user.id,
      base_revision: baseRevision,
      title: currentRemote.title,
      description: currentRemote.description ?? "",
      ...artifacts,
    }, { onConflict: "experiment_id" })
    .select("*")
    .single();
  if (error) throw error;

  currentWorkingCopy = data;
  currentRevisionView = { kind: "working", revision: null };
  updateCurrentUi();
  renderRevisionHistory();
  setMessage(`Working copy autosaved · based on revision ${data.base_revision}.`, "success");
  return data;
}

function queueWorkingCopyAutosave() {
  workingCopyAutosave = workingCopyAutosave
    .catch(() => undefined)
    .then(() => persistWorkingCopy());
  return workingCopyAutosave;
}


async function loadRevisionHistory() {
  if (!user || !currentRemote) {
    currentRevisions = [];
    renderRevisionHistory();
    return;
  }
  const { data, error } = await supabase
    .from("experiment_revisions")
    .select("experiment_id,revision,base_revision,owner_id,title,description,artifacts,config_source,initializer_source,controller_source,created_at,created_by_actor,created_by_user,created_by_ai_client")
    .eq("experiment_id", currentRemote.id)
    .order("revision", { ascending: false });
  if (error) throw error;
  currentRevisions = data ?? [];
  renderRevisionHistory();
}

function revisionBelongsToMine(revision) {
  return Boolean(user && revision.created_by_actor === "human" && revision.created_by_user === user.id);
}

function revisionKindLabel(revision) {
  if (revision.created_by_actor === "ai") return "AI";
  return revisionBelongsToMine(revision) ? "Mine" : "Human";
}

function isCurrentRevisionEntry(revision) {
  return currentRevisionView.kind === "revision" && currentRevisionView.revision === revision.revision;
}

function revisionHistoryItem(revision) {
  const button = document.createElement("button");
  button.className = "experiment-history-item";
  button.setAttribute("aria-current", String(isCurrentRevisionEntry(revision)));

  const number = document.createElement("span");
  number.className = "experiment-history-revision";
  number.textContent = "R" + revision.revision;
  const copy = document.createElement("span");
  copy.className = "experiment-history-copy";
  const actor = document.createElement("strong");
  actor.textContent = revisionActor(revision);
  const meta = document.createElement("span");
  const time = formatRevisionTime(revision.created_at);
  const base = revision.base_revision ? "Based on R" + revision.base_revision : "Initial retained snapshot";
  meta.textContent = base + (time ? " · " + time : "");
  copy.append(actor, meta);
  const kind = document.createElement("span");
  kind.className = "experiment-history-kind";
  kind.textContent = revisionKindLabel(revision);
  button.append(number, copy, kind);
  button.addEventListener("click", () => run(() => selectNumberedRevision(revision)));
  return button;
}

function workingCopyHistoryItem() {
  if (!currentWorkingCopy) return null;
  const button = document.createElement("button");
  button.className = "experiment-history-item";
  button.setAttribute("aria-current", String(currentRevisionView.kind === "working"));
  const number = document.createElement("span");
  number.className = "experiment-history-revision";
  number.textContent = "Working";
  const copy = document.createElement("span");
  copy.className = "experiment-history-copy";
  const actor = document.createElement("strong");
  actor.textContent = profile?.display_name
    ? profile.display_name + (profile.role ? " (" + roleLabel(profile.role) + ")" : "")
    : "Mine";
  const meta = document.createElement("span");
  const time = formatRevisionTime(currentWorkingCopy.updated_at);
  meta.textContent = "Based on R" + currentWorkingCopy.base_revision + (time ? " · autosaved " + time : "");
  copy.append(actor, meta);
  const kind = document.createElement("span");
  kind.className = "experiment-history-kind";
  kind.textContent = "Mine";
  button.append(number, copy, kind);
  button.addEventListener("click", () => run(selectWorkingCopy));
  return button;
}

function renderRevisionHistory() {
  revisionHistory.all.setAttribute("aria-pressed", String(revisionFilter === "all"));
  revisionHistory.mine.setAttribute("aria-pressed", String(revisionFilter === "mine"));
  revisionHistory.ai.setAttribute("aria-pressed", String(revisionFilter === "ai"));
  revisionHistory.list.replaceChildren();

  if (!currentRemote) {
    const empty = document.createElement("p");
    empty.className = "experiment-history-empty";
    empty.textContent = "The built-in experiment has no saved revision history.";
    revisionHistory.list.append(empty);
    return;
  }

  if (currentWorkingCopy && revisionFilter !== "ai") {
    revisionHistory.list.append(workingCopyHistoryItem());
  }

  const revisions = currentRevisions.filter((revision) => {
    if (revisionFilter === "mine") return revisionBelongsToMine(revision);
    if (revisionFilter === "ai") return revision.created_by_actor === "ai";
    return true;
  });
  for (const revision of revisions) revisionHistory.list.append(revisionHistoryItem(revision));

  if (!revisionHistory.list.children.length) {
    const empty = document.createElement("p");
    empty.className = "experiment-history-empty";
    empty.textContent = revisionFilter === "mine"
      ? "No numbered revisions from this account yet."
      : revisionFilter === "ai"
        ? "No AI revisions yet."
        : "No retained revisions are available.";
    revisionHistory.list.append(empty);
  }
}

async function selectWorkingCopy() {
  if (!currentWorkingCopy) return;
  if (hasUnpersistedRemoteEdits() && !(await confirmDiscardIfNeeded())) return;
  applyExperimentArtifacts(currentWorkingCopy);
  currentRevisionView = { kind: "working", revision: null };
  updateCurrentUi();
  renderRevisionHistory();
  await applyLoadedSources();
  revisionHistory.dialog.close();
  setMessage("Working copy based on revision " + currentWorkingCopy.base_revision + " loaded.", "success");
}

async function selectNumberedRevision(revision) {
  if (hasUnpersistedRemoteEdits() && !(await confirmDiscardIfNeeded())) return;
  applyExperimentArtifacts(revision);
  currentRevisionView = { kind: "revision", revision: revision.revision };
  updateCurrentUi();
  renderRevisionHistory();
  await applyLoadedSources();
  revisionHistory.dialog.close();
  const preserved = currentWorkingCopy
    ? " Working copy based on R" + currentWorkingCopy.base_revision + " remains preserved."
    : "";
  setMessage("Revision " + revision.revision + " loaded." + preserved, "success");
}

async function editFromViewedRevision() {
  if (!user || !currentRemote || currentRemote.owner_id !== user.id) return;
  const revision = currentRevisionSnapshot();
  if (!revision) return;

  if (currentWorkingCopy) {
    const ok = window.confirm(
      "Replace the existing Working copy based on R" + currentWorkingCopy.base_revision
      + " with a new Working copy from R" + revision.revision + "?",
    );
    if (!ok) return;
    const { error } = await supabase
      .from("experiment_working_copies")
      .delete()
      .eq("experiment_id", currentRemote.id)
      .eq("owner_id", user.id);
    if (error) throw error;
    currentWorkingCopy = null;
  }

  applyExperimentArtifacts(revision);
  currentRevisionView = { kind: "revision", revision: revision.revision };
  updateCurrentUi();
  renderRevisionHistory();
  setMessage("Revision " + revision.revision + " is ready to edit. Your first edit will create a Working copy based on it.", "success");
}

async function openRevisionHistory() {
  if (!currentRemote) return;
  await queueWorkingCopyAutosave();
  await loadRevisionHistory();
  renderRevisionHistory();
  revisionHistory.dialog.showModal();
  const current = revisionHistory.list.querySelector('[aria-current="true"]');
  current?.focus({ preventScroll: true });
}

function clearCurrentExperimentSubscription() {
  if (!currentExperimentChannel) return;
  supabase.removeChannel(currentExperimentChannel);
  currentExperimentChannel = null;
}

function subscribeCurrentExperiment(id) {
  clearCurrentExperimentSubscription();
  if (!user || !id) return;
  currentExperimentChannel = supabase
    .channel("experiment-head:" + id)
    .on(
      "postgres_changes",
      { event: "UPDATE", schema: "public", table: "experiments", filter: "id=eq." + id },
      () => run(() => refreshCurrentExperimentHead(id)),
    )
    .subscribe();
}

async function refreshCurrentExperimentHead(id) {
  if (!currentRemote || currentRemote.id !== id) return;
  const previousHead = currentRemote.revision;
  const fresh = await readExperiment(id);
  if (fresh.revision <= previousHead) return;

  currentRemote = fresh;
  await Promise.all([loadExperimentList(), loadRevisionHistory()]);
  updateCurrentUi();
  renderBrowser();
  renderRevisionHistory();

  const newest = currentRevisions.find((revision) => revision.revision === fresh.revision);
  const actor = newest ? revisionActor(newest) : revisionActor(fresh);
  setMessage(
    "New revision R" + fresh.revision + (actor ? " from " + actor : "")
    + " is available. Your current view was not changed.",
    "success",
  );
}

function experimentsInCollection(collectionId) {
  return remoteExperiments.filter((experiment) => {
    if (!collectionId) return !experiment.collection_id;
    return experiment.collection_id === collectionId;
  });
}

function workspaceStorageKey() {
  return user ? `${WORKSPACE_KEY_PREFIX}${user.id}` : null;
}

function rememberCurrentWorkspace() {
  const key = workspaceStorageKey();
  if (!key) return;
  const value = currentRemote ? `registry:${currentRemote.id}` : BUILTIN_VALUE;
  try {
    window.localStorage.setItem(key, value);
  } catch (error) {
    console.warn("Could not persist the current Virtual Lab experiment.", error);
  }
}

function rememberedWorkspaceValue() {
  const key = workspaceStorageKey();
  if (!key) return null;
  try {
    return window.localStorage.getItem(key);
  } catch (error) {
    console.warn("Could not restore the previous Virtual Lab experiment.", error);
    return null;
  }
}

function clearRememberedWorkspace() {
  const key = workspaceStorageKey();
  if (!key) return;
  try {
    window.localStorage.removeItem(key);
  } catch (error) {
    console.warn("Could not clear the previous Virtual Lab experiment.", error);
  }
}

function setQuickSwitchOptions() {
  experimentSelect.replaceChildren();

  const builtin = document.createElement("option");
  builtin.value = BUILTIN_VALUE;
  builtin.textContent = BUILTIN_TITLE;
  experimentSelect.append(builtin);

  const ownedExperiments = [...remoteExperiments];
  if (currentRemote && currentRemote.owner_id === user?.id && !ownedExperiments.some((experiment) => experiment.id === currentRemote.id)) {
    ownedExperiments.unshift(currentRemote);
  }

  if (user && ownedExperiments.length) {
    const group = document.createElement("optgroup");
    group.label = "Your experiments";
    for (const experiment of ownedExperiments) {
      const option = document.createElement("option");
      option.value = `registry:${experiment.id}`;
      const location = experiment.collection_id ? collectionName(experiment.collection_id) : "No collection";
      option.textContent = `${experiment.title} · r${experiment.revision} · ${location}`;
      group.append(option);
    }
    experimentSelect.append(group);
  }

  if (user && currentRemote && currentRemote.owner_id !== user.id) {
    const group = document.createElement("optgroup");
    group.label = currentRemoteAccess === "shared" ? "Shared with me · Read-only" : "Supervised research · Read-only";
    const option = document.createElement("option");
    option.value = `registry:${currentRemote.id}`;
    option.textContent = currentRemoteAccess === "supervised"
      ? `${currentRemote.title} · ${supervisedResearcherName(currentRemote.owner_id)} · r${currentRemote.revision}`
      : `${currentRemote.title} · r${currentRemote.revision}`;
    group.append(option);
    experimentSelect.append(group);
  }

  experimentSelect.value = currentRemote ? `registry:${currentRemote.id}` : BUILTIN_VALUE;
  currentUi.quickHint.textContent = user
    ? "Switch directly here, or use Find experiment to search everything. Collections are optional organization. Shared and Professor-supervised work stay read-only and separate from your own Experiments."
    : "The built-in experiment is available now. Sign in to add your private experiments to this switcher.";
}
function updateMoveButton() {
  const owned = Boolean(user && currentRemote && currentRemote.owner_id === user.id);
  const target = selectedCollectionId(ui.moveCollection);
  const current = currentRemote?.collection_id || null;
  ui.move.disabled = !owned || target === current;
}

function updateCurrentUi() {
  const dirty = hasUnsavedRemoteEdits();
  const owned = Boolean(user && currentRemote && currentRemote.owner_id === user.id);
  const copyingReadable = Boolean(user && currentRemote && !owned);
  const viewedRevision = currentRevisionSnapshot();
  const viewingWorking = currentRevisionView.kind === "working" && Boolean(currentWorkingCopy);
  const viewingNumbered = currentRevisionView.kind === "revision" && Boolean(viewedRevision);
  const protectedWorkingCopy = Boolean(owned && currentWorkingCopy && viewingNumbered);

  if (currentRemote) {
    currentUi.title.textContent = currentRemote.title;
    currentUi.origin.dataset.kind = owned ? "owned" : "readonly";
    currentUi.origin.textContent = owned ? "Your experiment · Editable" : "Read-only";
    currentUi.location.textContent = currentLocationLabel();
    currentUi.revisionWorkflow.hidden = false;

    if (viewingWorking) {
      currentUi.revisionPrimary.textContent = "Working copy";
      currentUi.revisionSecondary.textContent =
        "Based on R" + currentWorkingCopy.base_revision + (dirty ? " · autosave pending" : " · autosaved");
      metadataRevision.textContent = "registry working · base r" + currentWorkingCopy.base_revision;
    } else {
      const revisionNumber = viewedRevision?.revision ?? currentRemote.revision;
      const revision = viewedRevision ?? currentRemote;
      const actor = revisionActor(revision);
      const time = formatRevisionTime(revision.created_at ?? revision.updated_at);
      currentUi.revisionPrimary.textContent = "R" + revisionNumber;
      currentUi.revisionSecondary.textContent = [actor, time].filter(Boolean).join(" · ") || "Saved revision";
      metadataRevision.textContent = "registry r" + revisionNumber;
    }

    const referenceRevision = viewingWorking
      ? currentWorkingCopy.base_revision
      : (viewedRevision?.revision ?? currentRemote.revision);
    if (currentRemote.revision > referenceRevision) {
      const newest = currentRevisions.find((revision) => revision.revision === currentRemote.revision) ?? currentRemote;
      const actor = revisionActor(newest);
      currentUi.revisionNotice.hidden = false;
      currentUi.revisionNotice.textContent =
        "New R" + currentRemote.revision + " available" + (actor ? " · " + actor : "");
    } else {
      currentUi.revisionNotice.hidden = true;
      currentUi.revisionNotice.textContent = "";
    }
  } else {
    currentUi.title.textContent = BUILTIN_TITLE;
    currentUi.origin.dataset.kind = "readonly";
    currentUi.origin.textContent = "Built-in · Read-only";
    currentUi.location.textContent = "Built-in";
    currentUi.revisionWorkflow.hidden = true;
    currentUi.revisionNotice.hidden = true;
    metadataRevision.textContent = BUILTIN_REVISION;
  }

  currentUi.editFromRevision.hidden = !protectedWorkingCopy;
  if (protectedWorkingCopy) {
    currentUi.editFromRevision.textContent = "Edit from R" + viewedRevision.revision;
  }
  setArtifactEditorsLocked(protectedWorkingCopy);

  ui.saveRow.hidden = !user;
  ui.saveAsNew.hidden = !user;
  ui.save.hidden = !owned || protectedWorkingCopy;
  ui.createNew.textContent = copyingReadable ? "Copy to my Experiments" : "Create private copy";
  const availableRecipients = availableShareRecipients();
  const hasOutgoingShares = currentOutgoingShares().length > 0;
  const canManageShares = Boolean(owned && (availableRecipients.length > 0 || hasOutgoingShares));
  ui.shareRow.hidden = !canManageShares;
  ui.shareOpen.hidden = !owned || availableRecipients.length === 0;
  if (!owned || availableRecipients.length === 0) ui.shareForm.hidden = true;
  populateShareRecipientSelect();
  renderOutgoingShares();
  ui.save.disabled = !owned || protectedWorkingCopy || (!dirty && !currentWorkingCopy);
  ui.moveRow.hidden = !owned;
  if (owned) populateCollectionSelect(ui.moveCollection, currentRemote.collection_id);
  updateMoveButton();

  if (!user) {
    ui.note.textContent = "You can edit and run the built-in experiment locally. Sign in to save a private copy or open your own library.";
  } else if (!currentRemote) {
    ui.saveState.dataset.state = "readonly";
    ui.saveState.textContent = "Read-only source";
    ui.note.textContent = "The built-in experiment cannot be overwritten. Save as new lets you choose where its private copy is stored.";
  } else if (!owned) {
    ui.saveState.dataset.state = "readonly";
    const revisionNumber = viewedRevision?.revision ?? currentRemote.revision;
    ui.saveState.textContent = "Viewing R" + revisionNumber + " · Read-only source";
    ui.note.textContent = currentRemoteAccess === "shared"
      ? "This shared revision stays read-only. Copy to my Experiments creates an independent private Experiment from the exact state you are viewing."
      : "This supervised revision stays read-only. Copy to my Experiments creates an independent private Experiment from the exact state you are viewing.";
  } else if (protectedWorkingCopy) {
    ui.saveState.dataset.state = "saved";
    ui.saveState.textContent =
      "Viewing R" + viewedRevision.revision + " · Working copy from R" + currentWorkingCopy.base_revision + " preserved";
    ui.note.textContent = "Select Working copy to resume it, or choose Edit from this revision to replace it explicitly.";
  } else if (dirty) {
    const baseRevision = currentWorkingCopy?.base_revision ?? viewedRevision?.revision ?? currentRemote.revision;
    ui.saveState.dataset.state = "dirty";
    ui.saveState.textContent = "Working copy · autosave pending · based on r" + baseRevision;
    ui.note.textContent = "Leaving the editor or taking another action autosaves the Working copy. Save Revision creates a numbered revision.";
  } else if (viewingWorking) {
    ui.saveState.dataset.state = "saved";
    ui.saveState.textContent = "Working copy · autosaved · based on r" + currentWorkingCopy.base_revision;
    ui.note.textContent = currentRemote.revision > currentWorkingCopy.base_revision
      ? "A newer numbered revision is available. Your Working copy remains preserved; Save Revision will create the next chronological revision."
      : "Working copy is durable. Save Revision crystallizes it as the next numbered revision.";
  } else if (viewingNumbered && viewedRevision.revision < currentRemote.revision) {
    ui.saveState.dataset.state = "saved";
    ui.saveState.textContent = "Viewing historical R" + viewedRevision.revision;
    ui.note.textContent = "Edit normally to start a Working copy from this revision. Numbered history remains unchanged.";
  } else {
    ui.saveState.dataset.state = "saved";
    ui.saveState.textContent = "Saved · r" + currentRemote.revision;
    ui.note.textContent = "Edit normally to create a Working copy; Save Revision crystallizes it as the next numbered revision.";
  }

  setQuickSwitchOptions();
  renderRevisionHistory();
}

function formatRevisionTime(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    timeZoneName: "short",
  }).format(date);
}

function roleLabel(role) {
  if (!role) return "";
  return role.charAt(0).toUpperCase() + role.slice(1);
}

function profileForHumanOwner(ownerId) {
  if (!ownerId) return null;
  if (profile?.id === ownerId) return profile;
  return supervisedProfiles.find((candidate) => candidate.id === ownerId)
    ?? shareRecipients.find((candidate) => candidate.id === ownerId)
    ?? null;
}

function revisionActor(revision) {
  const actor = revision.created_by_actor ?? revision.updated_by_actor;
  if (actor === "human") {
    const humanId = revision.created_by_user ?? revision.owner_id;
    const owner = profileForHumanOwner(humanId);
    if (!owner?.display_name) return humanId === user?.id ? "Mine" : "Human";
    const role = roleLabel(owner.role);
    return role ? owner.display_name + " (" + role + ")" : owner.display_name;
  }
  if (actor !== "ai") return actor || "";
  const client = revision.created_by_ai_client ?? revision.updated_by_ai_client;
  if (!client) return "AI";
  return AI_CLIENT_LABELS[client] ?? "AI · " + client;
}

function filterButton(label, value) {
  const button = document.createElement("button");
  button.className = "experiment-filter";
  button.textContent = label;
  button.dataset.collection = value;
  button.setAttribute("aria-selected", String(browserCollection === value));
  button.addEventListener("click", () => {
    browserCollection = value;
    browserSearch = "";
    browser.search.value = "";
    renderBrowser();
  });
  return button;
}

function filteredExperimentsForCollection(collectionId, search) {
  return remoteExperiments.filter((experiment) => {
    const inCollection = collectionId === "unfiled"
      ? !experiment.collection_id
      : experiment.collection_id === collectionId;
    const matchesSearch = !search || experiment.title.toLocaleLowerCase().includes(search);
    return inCollection && matchesSearch;
  });
}

function experimentResult(experiment, { access = "owned" } = {}) {
  const result = document.createElement("button");
  result.className = "experiment-result";
  const title = document.createElement("strong");
  title.textContent = experiment.title;
  const meta = document.createElement("span");
  meta.className = "experiment-result-meta";
  const revisionTime = formatRevisionTime(experiment.updated_at);
  const actor = revisionActor(experiment);
  const revisionMeta = `Revision ${experiment.revision}${revisionTime ? ` · ${revisionTime}` : ""}${actor ? ` · ${actor}` : ""}`;
  const location = experiment.collection_id ? collectionName(experiment.collection_id) : "No collection";
  meta.textContent = access === "shared"
    ? `Shared with me · Read-only · ${revisionMeta}`
    : access === "supervised"
      ? `${supervisedResearcherName(experiment.owner_id)} · Supervised · Read-only · ${revisionMeta}`
      : `Your experiment · ${location} · ${revisionMeta}`;
  result.append(title, meta);
  result.addEventListener("click", () => run(async () => {
    if (currentRemote?.id !== experiment.id && !(await confirmDiscardIfNeeded())) return;
    await loadRemoteExperiment(experiment.id, { access });
    browser.dialog.close();
  }));
  return result;
}

function experimentGroup(label, experiments, { showEmpty = false, access = "owned" } = {}) {
  if (!experiments.length && !showEmpty) return null;
  const section = document.createElement("section");
  section.className = "experiment-group";
  const head = document.createElement("div");
  head.className = "experiment-group-head";
  const name = document.createElement("strong");
  name.textContent = label;
  const count = document.createElement("span");
  count.textContent = `${experiments.length} experiment${experiments.length === 1 ? "" : "s"}`;
  head.append(name, count);
  const items = document.createElement("div");
  items.className = "experiment-group-items";
  if (!experiments.length) {
    const empty = document.createElement("p");
    empty.className = "experiment-browser-empty";
    empty.textContent = "No experiments here yet.";
    items.append(empty);
  } else {
    for (const experiment of experiments) items.append(experimentResult(experiment, { access }));
  }
  section.append(head, items);
  return section;
}

function builtInResult() {
  const button = document.createElement("button");
  button.className = "experiment-result";
  const title = document.createElement("strong");
  title.textContent = BUILTIN_TITLE;
  const meta = document.createElement("span");
  meta.className = "experiment-result-meta";
  meta.textContent = "Built-in · Read-only";
  button.append(title, meta);
  button.addEventListener("click", () => run(async () => {
    if (!(await confirmDiscardIfNeeded())) return;
    await restoreBuiltIn();
    browser.dialog.close();
  }));
  return button;
}

function renderBrowser() {
  browser.builtinTab.hidden = true;
  browser.mineTab.hidden = true;
  browser.searchRow.hidden = false;
  browser.filters.replaceChildren();
  browser.results.replaceChildren();

  browser.filters.append(filterButton("All experiments", "all"));
  if (user) {
    browser.filters.append(filterButton(`My experiments · ${remoteExperiments.length}`, "mine"));
    browser.filters.append(filterButton(`Shared with me · ${sharedExperiments.length}`, "shared"));
    if (profile?.role === "professor") {
      browser.filters.append(filterButton(`Supervised · ${supervisedExperiments.length}`, "supervised"));
    }
    browser.filters.append(filterButton("No collection", "unfiled"));
    for (const collection of collections) browser.filters.append(filterButton(collection.name, collection.id));
  }

  const search = browserSearch.trim().toLocaleLowerCase();
  const builtinMatches = browserCollection === "all" && (!search || BUILTIN_TITLE.toLocaleLowerCase().includes(search));
  const filtered = remoteExperiments.filter((experiment) => {
    const matchesSearch = !search || experiment.title.toLocaleLowerCase().includes(search);
    if (!matchesSearch || browserCollection === "shared" || browserCollection === "supervised") return false;
    if (browserCollection === "all" || browserCollection === "mine") return true;
    if (browserCollection === "unfiled") return !experiment.collection_id;
    return experiment.collection_id === browserCollection;
  });
  const filteredShared = sharedExperiments.filter((experiment) => {
    if (browserCollection !== "all" && browserCollection !== "shared") return false;
    return !search || experiment.title.toLocaleLowerCase().includes(search);
  });
  const filteredSupervised = supervisedExperiments.filter((experiment) => {
    if (browserCollection !== "all" && browserCollection !== "supervised") return false;
    const owner = supervisedResearcherName(experiment.owner_id).toLocaleLowerCase();
    return !search || experiment.title.toLocaleLowerCase().includes(search) || owner.includes(search);
  });

  if (!user) {
    browser.contextTitle.textContent = "Built-in experiments";
    browser.contextHelp.textContent = "Search the built-in experiments. Sign in to include your private experiments.";
  } else if (browserCollection === "shared") {
    browser.contextTitle.textContent = "Shared with me";
    browser.contextHelp.textContent = "Experiments another researcher shared with you. They remain read-only; copy one to create an independent editable Experiment.";
  } else if (browserCollection === "supervised") {
    browser.contextTitle.textContent = "Supervised research";
    browser.contextHelp.textContent = "Student and researcher Experiments available through Professor supervision. Inspect and run them read-only, or copy one into your workspace when you need an independent editable version.";
  } else if (browserCollection === "mine" || browserCollection === "unfiled" || collections.some((collection) => collection.id === browserCollection)) {
    browser.contextTitle.textContent = "My experiments";
    browser.contextHelp.textContent = "Experiments you own and can edit. Collections organize only your own workspace.";
  } else {
    browser.contextTitle.textContent = "All available experiments";
    browser.contextHelp.textContent = profile?.role === "professor"
      ? "Browse built-in, owned, explicitly shared, and supervised research in one place. Read-only sources remain separate from your own editable Experiments."
      : "Browse built-in, owned, and explicitly shared Experiments in one place. Read-only sources remain separate from your own editable Experiments.";
  }

  const total = filtered.length + filteredShared.length + filteredSupervised.length + (builtinMatches ? 1 : 0);
  browser.count.textContent = `${total} experiment${total === 1 ? "" : "s"}`;

  if (builtinMatches) {
    const section = document.createElement("section");
    section.className = "experiment-group";
    const head = document.createElement("div");
    head.className = "experiment-group-head";
    const name = document.createElement("strong");
    name.textContent = "Built-in";
    const count = document.createElement("span");
    count.textContent = "1 experiment";
    head.append(name, count);
    const items = document.createElement("div");
    items.className = "experiment-group-items";
    items.append(builtInResult());
    section.append(head, items);
    browser.results.append(section);
  }

  if (filtered.length) {
    const label = browserCollection === "all" || browserCollection === "mine"
      ? "Your experiments"
      : browserCollection === "unfiled"
        ? "No collection"
        : collectionName(browserCollection);
    browser.results.append(experimentGroup(label, filtered));
  }

  if (filteredShared.length) {
    browser.results.append(experimentGroup("Shared with me", filteredShared, { access: "shared" }));
  }

  if (filteredSupervised.length) {
    browser.results.append(experimentGroup("Supervised research", filteredSupervised, { access: "supervised" }));
  }

  if (!total) {
    const empty = document.createElement("p");
    empty.className = "experiment-browser-empty";
    empty.textContent = search ? "No experiments match this search." : "No experiments are available here.";
    browser.results.append(empty);
  }
}

async function loadProfile() {
  const { data, error } = await supabase.from("profiles").select("id, first_name, last_name, display_name, role").eq("id", user.id).maybeSingle();
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

async function loadShareRecipients() {
  if (!user) {
    shareRecipients = [];
    populateShareRecipientSelect();
    return;
  }
  const { data, error } = await supabase.rpc("list_experiment_share_recipients");
  if (error) throw error;
  shareRecipients = data ?? [];
  populateShareRecipientSelect();
}

async function loadOutgoingShares() {
  if (!user) {
    outgoingShares = [];
    renderOutgoingShares();
    return;
  }
  const { data, error } = await supabase
    .from("experiment_shares")
    .select("experiment_id,recipient_id,created_at")
    .eq("shared_by", user.id)
    .order("created_at", { ascending: false });
  if (error) throw error;
  outgoingShares = data ?? [];
  renderOutgoingShares();
}

async function loadSharedExperimentList() {
  if (!user) {
    sharedExperiments = [];
    setQuickSwitchOptions();
    return;
  }

  const { data: shares, error: sharesError } = await supabase
    .from("experiment_shares")
    .select("experiment_id,created_at")
    .eq("recipient_id", user.id)
    .order("created_at", { ascending: false });
  if (sharesError) throw sharesError;

  const ids = (shares ?? []).map((share) => share.experiment_id);
  if (!ids.length) {
    sharedExperiments = [];
    setQuickSwitchOptions();
    return;
  }

  const { data, error } = await supabase
    .from("experiments")
    .select("id,owner_id,collection_id,title,revision,updated_at,updated_by_actor,updated_by_ai_client,artifacts,config_source,initializer_source,controller_source")
    .in("id", ids)
    .eq("lifecycle", "active");
  if (error) throw error;

  const byId = new Map((data ?? []).map((experiment) => [experiment.id, experiment]));
  sharedExperiments = ids
    .map((id) => byId.get(id))
    .filter((experiment) => experiment && productionExperimentRunnability(experiment).runnable);
  setQuickSwitchOptions();
}

async function loadSupervisedExperimentList() {
  if (!user || profile?.role !== "professor") {
    supervisedProfiles = [];
    supervisedExperiments = [];
    setQuickSwitchOptions();
    return;
  }

  const { data: students, error: studentsError } = await supabase
    .from("profiles")
    .select("id,display_name,role")
    .eq("role", "student")
    .order("display_name", { ascending: true });
  if (studentsError) throw studentsError;
  supervisedProfiles = students ?? [];

  const ids = supervisedProfiles.map((student) => student.id);
  if (!ids.length) {
    supervisedExperiments = [];
    setQuickSwitchOptions();
    return;
  }

  const { data, error } = await supabase
    .from("experiments")
    .select("id,owner_id,collection_id,title,revision,updated_at,updated_by_actor,updated_by_ai_client,artifacts,config_source,initializer_source,controller_source")
    .in("owner_id", ids)
    .eq("lifecycle", "active")
    .order("updated_at", { ascending: false });
  if (error) throw error;

  supervisedExperiments = (data ?? [])
    .filter((experiment) => productionExperimentRunnability(experiment).runnable);
  setQuickSwitchOptions();
}

async function loadExperimentList() {
  if (!user) {
    remoteExperiments = [];
    hiddenNonRunnableCount = 0;
    setQuickSwitchOptions();
    return;
  }
  const { data, error } = await supabase
    .from("experiments")
    .select("id,owner_id,collection_id,title,revision,updated_at,updated_by_actor,updated_by_ai_client,artifacts,config_source,initializer_source,controller_source")
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
  setQuickSwitchOptions();
}

async function readExperiment(id) {
  const { data, error } = await supabase
    .from("experiments")
    .select("id,owner_id,collection_id,title,description,lifecycle,visibility,revision,artifacts,config_source,initializer_source,controller_source,created_at,updated_at,created_by_actor,created_by_ai_client,updated_by_actor,updated_by_ai_client")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Experiment not found in your library or not available to this account.");
  if (!productionExperimentRunnability(data).runnable) throw new Error("This experiment cannot run in the current simulator version.");
  return data;
}

async function readWorkingCopy(id) {
  const { data, error } = await supabase
    .from("experiment_working_copies")
    .select("*")
    .eq("experiment_id", id)
    .eq("owner_id", user.id)
    .maybeSingle();
  if (error) throw error;
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
  if (!hasUnpersistedRemoteEdits()) return true;
  const owned = Boolean(user && currentRemote && currentRemote.owner_id === user.id);
  if (owned) {
    try {
      await queueWorkingCopyAutosave();
      if (!hasUnpersistedRemoteEdits()) return true;
    } catch (error) {
      console.error("Could not autosave Working copy before navigation.", error);
    }
  }
  return window.confirm("Discard the unsaved changes to the current experiment?");
}

async function restoreBuiltIn({ apply = true } = {}) {
  clearCurrentExperimentSubscription();
  applyExperimentArtifacts(builtinArtifacts);
  currentRemote = null;
  currentRemoteAccess = null;
  currentWorkingCopy = null;
  currentRevisions = [];
  currentRevisionView = { kind: "builtin", revision: null };
  ui.newForm.hidden = true;
  updateCurrentUi();
  rememberCurrentWorkspace();
  setMessage(user ? "Built-in experiment loaded." : "Built-in experiment loaded. Sign in to open your private library.");
  if (apply) await applyLoadedSources();
}

async function loadRemoteExperiment(id, { access = "owned" } = {}) {
  if (!user) throw new Error("Sign in to open Experiments.");
  setMessage("Opening experiment…");
  const experiment = await readExperiment(id);
  const workingCopy = access === "owned" && experiment.owner_id === user.id
    ? await readWorkingCopy(id)
    : null;

  currentRemote = experiment;
  currentRemoteAccess = access;
  currentWorkingCopy = workingCopy;
  await loadRevisionHistory();
  currentRevisionView = workingCopy
    ? { kind: "working", revision: null }
    : { kind: "revision", revision: experiment.revision };

  const initial = workingCopy
    ?? currentRevisions.find((revision) => revision.revision === experiment.revision)
    ?? experiment;
  applyExperimentArtifacts(initial);
  ui.newForm.hidden = true;
  subscribeCurrentExperiment(id);
  updateCurrentUi();
  rememberCurrentWorkspace();
  await applyLoadedSources();
  setMessage(
    workingCopy
      ? experiment.title + " · Working copy based on revision " + workingCopy.base_revision + " loaded."
      : experiment.title + " · revision " + experiment.revision + " loaded.",
    "success",
  );
}

function connectedMessage() {
  const count = remoteExperiments.length;
  const collectionCount = collections.length;
  const hidden = hiddenNonRunnableCount > 0
    ? ` ${hiddenNonRunnableCount} older or incompatible experiment${hiddenNonRunnableCount === 1 ? " is" : "s are"} hidden.`
    : "";
  const shared = sharedExperiments.length;
  const supervised = profile?.role === "professor" ? supervisedExperiments.length : 0;
  const supervision = profile?.role === "professor" ? ` and ${supervised} supervised` : "";
  return `Your library is ready: ${count} experiment${count === 1 ? "" : "s"} in ${collectionCount} collection${collectionCount === 1 ? "" : "s"} plus Unfiled, with ${shared} shared with you${supervision}.${hidden}`;
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
  if (!currentRemote || currentRemote.owner_id !== user.id) throw new Error("This source is read-only. Use Save as new instead.");

  await queueWorkingCopyAutosave();
  if (!currentWorkingCopy) {
    setMessage("No Working copy changes to save.");
    return;
  }

  // Numbered revisions remain runnable scientific checkpoints even though the
  // durable Working copy can contain incomplete code between editing actions.
  registryArtifactsForSave();

  setMessage(`Saving ${currentRemote.title} as a new revision…`);
  const { data, error } = await supabase
    .rpc("crystallize_experiment_working_copy", { p_experiment_id: currentRemote.id })
    .single();
  if (error) throw error;

  currentRemote = data;
  currentWorkingCopy = null;
  await Promise.all([loadExperimentList(), loadRevisionHistory()]);
  currentRevisionView = { kind: "revision", revision: data.revision };
  const savedRevision = currentRevisions.find((revision) => revision.revision === data.revision) ?? data;
  applyExperimentArtifacts(savedRevision);
  updateCurrentUi();
  renderBrowser();
  renderRevisionHistory();
  setMessage(`${data.title} saved as revision ${data.revision}.`, "success");
}

async function moveCurrentExperiment() {
  if (!user) throw new Error("Sign in before moving an experiment.");
  if (!currentRemote || currentRemote.owner_id !== user.id) throw new Error("Only your own experiment can be moved.");

  await queueWorkingCopyAutosave();

  const targetCollectionId = selectedCollectionId(ui.moveCollection);
  const currentCollectionId = currentRemote.collection_id || null;
  if (targetCollectionId === currentCollectionId) {
    setMessage(`Already stored in My experiments / ${collectionName(currentCollectionId)}.`);
    return;
  }

  const targetName = collectionName(targetCollectionId);
  setMessage(`Moving ${currentRemote.title} to ${targetName}…`);
  const { data, error } = await supabase
    .from("experiments")
    .update({ collection_id: targetCollectionId })
    .eq("id", currentRemote.id)
    .eq("owner_id", user.id)
    .select("id,owner_id,collection_id,title,description,lifecycle,visibility,revision,artifacts,config_source,initializer_source,controller_source,created_at,updated_at,created_by_actor,created_by_ai_client,updated_by_actor,updated_by_ai_client")
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new Error("The Experiment is missing or is no longer owned by this account.");

  currentRemote = data;
  await loadExperimentList();
  updateCurrentUi();
  renderBrowser();
  setMessage(`${data.title} moved to My experiments / ${collectionName(data.collection_id)}. Revision remains r${data.revision}.`, "success");
}

function openShareForm() {
  if (!user || !currentRemote || currentRemote.owner_id !== user.id) {
    throw new Error("Open one of your Experiments before sharing.");
  }
  if (!availableShareRecipients().length) throw new Error("No additional share recipients are available for this Experiment.");
  populateShareRecipientSelect();
  ui.shareForm.hidden = false;
  ui.shareRecipient.focus();
}

function closeShareForm() {
  ui.shareForm.hidden = true;
}

async function shareCurrentExperiment() {
  if (!user || !currentRemote || currentRemote.owner_id !== user.id) {
    throw new Error("Only the Experiment owner can share it.");
  }
  const recipientId = ui.shareRecipient.value;
  const recipient = shareRecipients.find((candidate) => candidate.id === recipientId);
  if (!recipient) throw new Error("Choose a researcher to share with.");

  setMessage(`Sharing ${currentRemote.title} read-only with ${recipient.display_name || recipient.role}…`);
  const { error } = await supabase
    .from("experiment_shares")
    .insert({
      experiment_id: currentRemote.id,
      recipient_id: recipient.id,
      shared_by: user.id,
    });
  if (error?.code === "23505") throw new Error("This Experiment is already shared with that researcher.");
  if (error) throw error;

  await loadOutgoingShares();
  closeShareForm();
  updateCurrentUi();
  setMessage(
    `${currentRemote.title} is now shared read-only with ${recipient.display_name || recipient.role}.`,
    "success",
  );
}

async function revokeCurrentExperimentShare(recipientId) {
  if (!user || !currentRemote || currentRemote.owner_id !== user.id) {
    throw new Error("Only the Experiment owner can revoke sharing.");
  }
  const label = shareRecipientLabel(recipientId);
  setMessage(`Revoking read-only access for ${label}…`);
  const { error, count } = await supabase
    .from("experiment_shares")
    .delete({ count: "exact" })
    .eq("experiment_id", currentRemote.id)
    .eq("recipient_id", recipientId);
  if (error) throw error;
  if (count !== 1) throw new Error("The share was not found or could not be revoked.");

  await loadOutgoingShares();
  updateCurrentUi();
  setMessage(`${label} no longer has ordinary shared access to ${currentRemote.title}.`, "success");
}

function defaultCopyTitle() {
  return currentRemote?.title ? `${currentRemote.title} copy` : `${BUILTIN_TITLE} copy`;
}

function openSaveAsNew() {
  if (!user) throw new Error("Sign in before saving.");
  ui.newTitle.value = defaultCopyTitle();
  const ownsCurrent = Boolean(currentRemote && currentRemote.owner_id === user.id);
  populateCollectionSelect(ui.newCollection, ownsCurrent ? currentRemote.collection_id : null);
  ui.newForm.hidden = false;
  ui.newTitle.focus();
  ui.newTitle.select();
}

function closeSaveAsNew() {
  ui.newForm.hidden = true;
  ui.newTitle.value = "";
  ui.newCollection.replaceChildren();
}

async function copyCurrentReadableExperiment(title, collectionId) {
  if (!user || !currentRemote || currentRemote.owner_id === user.id) {
    throw new Error("Open a readable non-owned Experiment before copying.");
  }

  const sourceId = currentRemote.id;
  const sourceRevision = currentRemote.revision;
  setMessage(`Copying ${currentRemote.title} revision ${sourceRevision}…`);
  const { data: copyId, error } = await supabase.rpc("copy_experiment_to_workspace", {
    p_source_experiment_id: sourceId,
    p_expected_revision: sourceRevision,
    p_title: title,
    p_collection_id: collectionId,
  });
  if (error) throw error;
  if (typeof copyId !== "string" || !copyId) throw new Error("The copied Experiment identifier is missing.");
  return readExperiment(copyId);
}

async function createNewExperiment() {
  if (!user) throw new Error("Sign in before saving.");
  const title = ui.newTitle.value.trim();
  if (!title) throw new Error("Enter a title for the new experiment.");
  const collectionId = selectedCollectionId(ui.newCollection);
  const copyingReadable = Boolean(currentRemote && currentRemote.owner_id !== user.id);
  let data;

  if (copyingReadable) {
    data = await copyCurrentReadableExperiment(title, collectionId);
  } else {
    const artifacts = registryArtifactsForSave({ allowBuiltInCompatibility: true });
    setMessage(`Creating ${title}…`);
    const { data: created, error } = await supabase
      .from("experiments")
      .insert({
        owner_id: user.id,
        collection_id: collectionId,
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
      .select("id,owner_id,collection_id,title,description,lifecycle,visibility,revision,artifacts,config_source,initializer_source,controller_source,created_at,updated_at,created_by_actor,created_by_ai_client,updated_by_actor,updated_by_ai_client")
      .single();
    if (error) throw error;
    data = created;
  }

  applyExperimentArtifacts(data);
  currentRemote = data;
  currentRemoteAccess = "owned";
  currentWorkingCopy = null;
  await Promise.all([loadCollections(), loadExperimentList(), loadRevisionHistory()]);
  currentRevisionView = { kind: "revision", revision: data.revision };
  subscribeCurrentExperiment(data.id);
  closeSaveAsNew();
  updateCurrentUi();
  rememberCurrentWorkspace();
  renderBrowser();
  await applyLoadedSources();
  setMessage(
    copyingReadable
      ? `${data.title} copied to My experiments${data.collection_id ? ` / ${collectionName(data.collection_id)}` : ""}.`
      : `${data.title} created${data.collection_id ? ` in ${collectionName(data.collection_id)}` : " without a collection"}.`,
    "success",
  );
}

function setSignedOutUi() {
  ui.identity.textContent = "Signed out";
  ui.auth.hidden = false;
  ui.signOut.hidden = true;
  clearCurrentExperimentSubscription();
  remoteExperiments = [];
  currentWorkingCopy = null;
  currentRevisions = [];
  currentRevisionView = { kind: "builtin", revision: null };
  sharedExperiments = [];
  supervisedProfiles = [];
  supervisedExperiments = [];
  shareRecipients = [];
  outgoingShares = [];
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

async function restoreRememberedWorkspace() {
  if (!user || currentRemote) return false;
  const remembered = rememberedWorkspaceValue();
  if (!remembered || remembered === BUILTIN_VALUE) return false;
  if (!remembered.startsWith("registry:")) {
    clearRememberedWorkspace();
    return false;
  }
  const id = remembered.slice("registry:".length);
  if (remoteExperiments.some((experiment) => experiment.id === id)) {
    await loadRemoteExperiment(id, { access: "owned" });
    return true;
  }
  if (sharedExperiments.some((experiment) => experiment.id === id)) {
    await loadRemoteExperiment(id, { access: "shared" });
    return true;
  }
  if (supervisedExperiments.some((experiment) => experiment.id === id)) {
    await loadRemoteExperiment(id, { access: "supervised" });
    return true;
  }
  clearRememberedWorkspace();
  return false;
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
  await Promise.all([loadCollections(), loadExperimentList(), loadSharedExperimentList(), loadSupervisedExperimentList(), loadShareRecipients(), loadOutgoingShares()]);
  await restoreRememberedWorkspace();
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
  const previousAccess = currentRemoteAccess;

  if (previousRemote?.owner_id === user.id && hasUnpersistedRemoteEdits()) {
    await queueWorkingCopyAutosave();
  }

  setMessage("Refreshing your library…");
  await Promise.all([
    loadCollections(),
    loadExperimentList(),
    loadSharedExperimentList(),
    loadSupervisedExperimentList(),
    loadShareRecipients(),
    loadOutgoingShares(),
  ]);

  if (previousRemote) {
    const available = previousAccess === "shared"
      ? sharedExperiments
      : previousAccess === "supervised"
        ? supervisedExperiments
        : remoteExperiments;
    const fresh = available.find((experiment) => experiment.id === previousRemote.id);
    if (!fresh) {
      if (currentWorkingCopy) {
        setMessage("This experiment is no longer in your available library. Your durable Working copy is still preserved.", "error");
      } else {
        await restoreBuiltIn();
        setMessage("The previously loaded experiment is no longer available in this simulator version.");
      }
      renderBrowser();
      return;
    }

    currentRemote = fresh;
    await loadRevisionHistory();
    updateCurrentUi();
    renderRevisionHistory();
    if (fresh.revision > previousRemote.revision) {
      const newest = currentRevisions.find((revision) => revision.revision === fresh.revision);
      const actor = newest ? revisionActor(newest) : revisionActor(fresh);
      setMessage(
        "New revision R" + fresh.revision + (actor ? " from " + actor : "")
        + " is available. Your current view was not changed.",
        "success",
      );
      renderBrowser();
      return;
    }
  }

  updateCurrentUi();
  renderBrowser();
  setMessage(connectedMessage(), "success");
}

function openBrowser() {
  browserCollection = "all";
  browserSearch = "";
  browser.search.value = "";
  renderBrowser();
  browser.dialog.showModal();
  browser.search.focus({ preventScroll: true });
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
experimentSelect.addEventListener("change", () => run(async () => {
  const value = experimentSelect.value;
  if (value === BUILTIN_VALUE) {
    if (currentRemote && !(await confirmDiscardIfNeeded())) {
      setQuickSwitchOptions();
      return;
    }
    if (currentRemote) await restoreBuiltIn();
    return;
  }
  if (!value.startsWith("registry:")) return;
  const id = value.slice("registry:".length);
  if (currentRemote?.id === id) return;
  if (!(await confirmDiscardIfNeeded())) {
    setQuickSwitchOptions();
    return;
  }
  const access = sharedExperiments.some((experiment) => experiment.id === id)
    ? "shared"
    : supervisedExperiments.some((experiment) => experiment.id === id)
      ? "supervised"
      : "owned";
  await loadRemoteExperiment(id, { access });
}));

browser.close.addEventListener("click", () => browser.dialog.close());
browser.refresh.addEventListener("click", () => run(refreshRegistry));
browser.builtinTab.addEventListener("click", () => {
  browserSource = "builtin";
  browserCollection = "all";
  browserSearch = "";
  browser.search.value = "";
  renderBrowser();
});
browser.mineTab.addEventListener("click", () => {
  if (!user) return;
  browserSource = "mine";
  browserCollection = "all";
  browserSearch = "";
  browser.search.value = "";
  renderBrowser();
});
browser.search.addEventListener("input", () => {
  browserSearch = browser.search.value;
  if (browserSearch.trim()) browserCollection = "all";
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
ui.moveCollection.addEventListener("change", updateMoveButton);
ui.move.addEventListener("click", () => run(moveCurrentExperiment));
ui.shareOpen.addEventListener("click", () => run(openShareForm));
ui.cancelShare.addEventListener("click", closeShareForm);
ui.confirmShare.addEventListener("click", () => run(shareCurrentExperiment));
ui.cancelNew.addEventListener("click", closeSaveAsNew);
ui.createNew.addEventListener("click", () => run(createNewExperiment));
ui.newTitle.addEventListener("keydown", (event) => {
  if (event.key === "Enter") run(createNewExperiment);
  if (event.key === "Escape") closeSaveAsNew();
});

function autosaveAtInteractionBoundary() {
  if (!user || !currentRemote || currentRemote.owner_id !== user.id || !hasUnpersistedRemoteEdits()) return;
  run(queueWorkingCopyAutosave);
}

for (const descriptor of EXPERIMENT_ARTIFACTS) {
  const editor = descriptor.editorSelector ? document.querySelector(descriptor.editorSelector) : null;
  editor?.addEventListener("input", updateCurrentUi);
  editor?.addEventListener("blur", autosaveAtInteractionBoundary);
}
document.querySelector("#additional-experiment-artifacts")?.addEventListener("input", (event) => {
  if (event.target?.dataset?.experimentArtifactEditor === "true") updateCurrentUi();
});
document.querySelector("#additional-experiment-artifacts")?.addEventListener("focusout", (event) => {
  if (event.target?.dataset?.experimentArtifactEditor === "true") autosaveAtInteractionBoundary();
});

// Any action outside an artifact editor is also an autosave boundary. Pointer-down
// starts persistence before the action's click handler (including Run or Save Revision).
document.addEventListener("pointerdown", (event) => {
  const target = event.target instanceof Element ? event.target : null;
  const insideArtifactEditor = target?.matches(
    "#experiment-config, #initializer-source, #controller-source, [data-experiment-artifact-editor='true']",
  );
  if (!insideArtifactEditor) autosaveAtInteractionBoundary();
}, { capture: true });

window.addEventListener("beforeunload", (event) => {
  if (!hasUnpersistedRemoteEdits()) return;
  event.preventDefault();
  event.returnValue = "";
});

window.addEventListener("vlab:open-supervised-experiment", (event) => run(async () => {
  const id = event instanceof CustomEvent ? event.detail?.id : null;
  if (typeof id !== "string" || !id) throw new Error("Student Experiment identifier is missing.");
  if (profile?.role !== "professor") throw new Error("Professor supervision is not available to this account.");
  if (!(await confirmDiscardIfNeeded())) return;
  await loadRemoteExperiment(id, { access: "supervised" });
}));

supabase.auth.onAuthStateChange((_event, session) => {
  if (session?.user?.id === user?.id || (!session && !user)) return;
  queueMicrotask(() => run(initializeSession));
});

updateCurrentUi();
renderBrowser();
run(initializeSession);
