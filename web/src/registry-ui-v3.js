import { runtimeModel } from "./runtime/runtime-model.js";
import { simulationCommands } from "./runtime/simulation-commands.js";
import { supabase } from "./supabase-client.js";
import {
  EXPERIMENT_ARTIFACTS,
  applyExperimentArtifacts,
  captureExperimentArtifacts,
  experimentArtifactsEqual,
} from "./experiment-artifacts.js";
import {
  productionExperimentRunnability,
  registryExperimentRunnability,
} from "./experiment-validation.js";
import {
  DEFAULT_CATALOG_EXPERIMENT,
  EXPERIMENT_CATALOG,
  catalogExperimentByValue,
} from "./experiment-catalog.js";
import { loadCatalogExperiment } from "./catalog-workspace.js";
import {
  afterDiscard,
  discardWorkingCopyQuestion,
  editingBaseline,
  historyEntries,
  isViewedRevision,
  latestSnapshot,
  openedMessage,
  ownsExperiment,
  reentryView,
  replaceWorkingCopyQuestion,
  revisionKindLabel as revisionKindLabelFor,
  selectedRevisionMessage,
  viewedRevisionSnapshot,
  workingCopyBaseRevision,
} from "./registry/revisions.js";
import {
  availableShareRecipients as availableShareRecipientsFor,
  collectionName as collectionNameFor,
  connectedMessage as connectedMessageFor,
  currentOutgoingShares as currentOutgoingSharesFor,
  formatRevisionTime,
  newRevisionMessage,
  revisionActor as revisionActorFor,
  shareRecipientLabel as shareRecipientLabelFor,
  shareRecipientOptionLabel,
  sharedWithLabel,
} from "./registry/labels.js";
import * as registryData from "./registry/data.js";
import { workspaceStatus } from "./registry/workspace-status.js";
import {
  libraryLoadedState,
  parseWorkspaceValue,
  quickSwitchOptions,
  rememberedRegistryAccess,
  selectedRegistryAccess,
  workspaceValue,
} from "./registry/workspace-location.js";


const experimentSelect = document.querySelector("#experiment-select");
const experimentPanel = experimentSelect?.closest(".experiment-panel");
const experimentLabel = experimentPanel?.querySelector('label[for="experiment-select"]');
const metadataRevision = document.querySelector(".metadata-panel .panel-heading strong");
const applySetup = document.querySelector("#apply-setup");

if (!experimentSelect || !experimentPanel || !experimentLabel || !metadataRevision || !applySetup) {
  throw new Error("Registry integration UI mismatch.");
}

const WORKSPACE_KEY_PREFIX = "vlab-last-experiment-v1:";

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
let currentCatalog = DEFAULT_CATALOG_EXPERIMENT;
let currentShowcase = null;
let currentRevisionView = { kind: "catalog", revision: null };
let revisionFilter = "all";
let currentExperimentChannel = null;
let workingCopyAutosave = Promise.resolve();
let hiddenNonRunnableCount = 0;

function collectionName(id) {
  return collectionNameFor(collections, id);
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

function currentOutgoingShares() {
  return currentOutgoingSharesFor({ remote: currentRemote, userId: user?.id, outgoingShares });
}

function availableShareRecipients() {
  return availableShareRecipientsFor(shareRecipients, currentOutgoingShares());
}

function shareRecipientLabel(recipientId) {
  return shareRecipientLabelFor(shareRecipients, recipientId);
}

function populateShareRecipientSelect() {
  if (!ui?.shareRecipient) return;
  ui.shareRecipient.replaceChildren();
  for (const recipient of availableShareRecipients()) {
    const option = document.createElement("option");
    option.value = recipient.id;
    option.textContent = shareRecipientOptionLabel(recipient);
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
    label.textContent = sharedWithLabel(shareRecipientLabel(share.recipient_id));
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
  title.textContent = DEFAULT_CATALOG_EXPERIMENT.title;
  const browse = document.createElement("button");
  browse.className = "experiment-browse";
  browse.textContent = "Browse experiments";
  main.append(title, browse);

  const meta = document.createElement("div");
  meta.className = "experiment-current-meta";
  const origin = document.createElement("span");
  origin.className = "experiment-origin";
  origin.dataset.kind = "readonly";
  origin.textContent = "Showcase · Read-only";
  const location = document.createElement("span");
  location.className = "experiment-location";
  location.textContent = "Showcase";
  meta.append(origin, location);

  const revisionWorkflow = document.createElement("div");
  revisionWorkflow.className = "experiment-revision-workflow";
  revisionWorkflow.hidden = true;
  const revisionTop = document.createElement("div");
  revisionTop.className = "experiment-revision-top";
  const revisionTrigger = document.createElement("button");
  revisionTrigger.className = "experiment-revision-trigger";
  revisionTrigger.setAttribute("aria-label", "Open revision history");
  revisionTrigger.setAttribute("aria-haspopup", "dialog");
  revisionTrigger.setAttribute("aria-expanded", "false");
  const revisionPrimary = document.createElement("strong");
  revisionPrimary.textContent = "Showcase";
  const revisionSecondary = document.createElement("span");
  revisionSecondary.textContent = "No private revision history";
  const revisionChevron = document.createElement("b");
  revisionChevron.setAttribute("aria-hidden", "true");
  revisionChevron.textContent = "▾";
  revisionTrigger.append(revisionPrimary, revisionSecondary, revisionChevron);
  const revisionActions = document.createElement("div");
  revisionActions.className = "experiment-revision-actions";
  const editFromRevision = document.createElement("button");
  editFromRevision.textContent = "Edit from this revision";
  editFromRevision.hidden = true;
  const discardWorkingCopy = document.createElement("button");
  discardWorkingCopy.textContent = "Discard Working copy";
  discardWorkingCopy.hidden = true;
  revisionActions.append(editFromRevision, discardWorkingCopy);
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
    revisionActions, revisionNotice, revisionDetails, editFromRevision, discardWorkingCopy,
  };
}

function buildAccountPanel() {
  const panel = document.createElement("section");
  panel.className = "panel registry-panel";
  panel.setAttribute("aria-label", "Sign In");

  const heading = document.createElement("div");
  heading.className = "registry-heading";
  const label = document.createElement("span");
  label.className = "field-label";
  label.style.margin = "0";
  label.textContent = "Sign In";
  const account = document.createElement("div");
  account.className = "registry-account";
  account.hidden = true;
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
  signIn.textContent = "Sign In";
  auth.append(email, password, signIn);

  const message = document.createElement("p");
  message.className = "registry-message";
  message.setAttribute("role", "status");
  message.textContent = "";

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
  heading.id = "experiment-revision-history-title";
  heading.textContent = "Revision history";
  dialog.setAttribute("aria-labelledby", heading.id);
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

const currentUi = buildCurrentExperimentUi();
const ui = buildAccountPanel();
const revisionHistory = buildRevisionHistory();

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
  return viewedRevisionSnapshot(currentRevisionView, currentRevisions, currentRemote);
}

function currentEditingBaseline() {
  return editingBaseline({
    view: currentRevisionView,
    workingCopy: currentWorkingCopy,
    revisions: currentRevisions,
    remote: currentRemote,
  });
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
  const owned = ownsExperiment(user?.id, currentRemote);
  if (!owned || !hasUnpersistedRemoteEdits()) return currentWorkingCopy;

  // Working copy persistence is deliberately tolerant of temporarily invalid
  // scientific code. It must preserve text while the human is still editing.
  const artifacts = captureExperimentArtifacts();
  const baseRevision = workingCopyBaseRevision({
    workingCopy: currentWorkingCopy,
    view: currentRevisionView,
    remote: currentRemote,
  });
  const baseline = currentEditingBaseline();
  setMessage("Autosaving Working copy…");
  const data = await registryData.upsertWorkingCopy(supabase, {
    experiment_id: currentRemote.id,
    owner_id: user.id,
    base_revision: baseRevision,
    title: baseline?.title ?? currentRemote.title,
    description: baseline?.description ?? currentRemote.description ?? "",
    ...artifacts,
  });

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
  currentRevisions = await registryData.listRevisions(supabase, currentRemote.id);
  renderRevisionHistory();
}

function revisionKindLabel(revision) {
  return revisionKindLabelFor(revision, user?.id);
}

function isCurrentRevisionEntry(revision) {
  return isViewedRevision(currentRevisionView, revision);
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
  actor.textContent = "Mine";
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

  const history = historyEntries({
    remote: currentRemote,
    workingCopy: currentWorkingCopy,
    revisions: currentRevisions,
    filter: revisionFilter,
    userId: user?.id,
    view: currentRevisionView,
  });
  for (const entry of history.entries) {
    revisionHistory.list.append(entry.type === "working" ? workingCopyHistoryItem() : revisionHistoryItem(entry.revision));
  }
  if (history.empty) {
    const empty = document.createElement("p");
    empty.className = "experiment-history-empty";
    empty.textContent = history.empty;
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
  setMessage(selectedRevisionMessage(revision, currentWorkingCopy), "success");
}

async function editFromViewedRevision() {
  if (!user || !currentRemote || currentRemote.owner_id !== user.id) return;
  const revision = currentRevisionSnapshot();
  if (!revision) return;

  if (currentWorkingCopy) {
    const ok = window.confirm(replaceWorkingCopyQuestion(currentWorkingCopy, revision));
    if (!ok) return;
    await registryData.deleteWorkingCopy(supabase, currentRemote.id, user.id);
    currentWorkingCopy = null;
  }

  applyExperimentArtifacts(revision);
  currentRevisionView = { kind: "revision", revision: revision.revision };
  updateCurrentUi();
  renderRevisionHistory();
  setMessage("Revision " + revision.revision + " is ready to edit. Your first edit will create a Working copy based on it.", "success");
}

async function discardCurrentWorkingCopy() {
  if (!user || !currentRemote || currentRemote.owner_id !== user.id || !currentWorkingCopy) return;

  const ok = window.confirm(discardWorkingCopyQuestion(currentWorkingCopy));
  if (!ok) return;

  // A pointer-down outside the editor is an autosave boundary. If that boundary
  // started immediately before this click, let it finish before deleting so it
  // cannot recreate the Working copy after the discard.
  try {
    await workingCopyAutosave;
  } catch (error) {
    console.error("Working-copy autosave failed before discard; discarding the durable copy anyway.", error);
  }

  await registryData.discardWorkingCopy(supabase, currentRemote.id, user.id);

  currentWorkingCopy = null;
  await loadRevisionHistory();
  const discarded = afterDiscard(currentRevisions, currentRemote);
  currentRevisionView = discarded.view;
  applyExperimentArtifacts(discarded.snapshot);
  updateCurrentUi();
  renderRevisionHistory();
  await applyLoadedSources();
  setMessage(discarded.message, "success");
}

async function openRevisionHistory() {
  if (!currentRemote) return;
  await queueWorkingCopyAutosave();
  await loadRevisionHistory();
  renderRevisionHistory();
  currentUi.revisionTrigger.setAttribute("aria-expanded", "true");
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
  renderRevisionHistory();

  const newest = currentRevisions.find((revision) => revision.revision === fresh.revision);
  const actor = newest ? revisionActor(newest) : revisionActor(fresh);
  setMessage(newRevisionMessage(fresh.revision, actor), "success");
}

function workspaceStorageKey() {
  return user ? `${WORKSPACE_KEY_PREFIX}${user.id}` : null;
}

function rememberCurrentWorkspace() {
  const key = workspaceStorageKey();
  if (!key) return;
  const value = workspaceValue({ remote: currentRemote, showcase: currentShowcase, catalog: currentCatalog ?? DEFAULT_CATALOG_EXPERIMENT });
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
  const switcher = quickSwitchOptions({
    catalogExperiments: EXPERIMENT_CATALOG,
    ownedExperiments: remoteExperiments,
    remote: currentRemote,
    userId: user?.id,
    access: currentRemoteAccess,
    showcase: currentShowcase,
    catalog: currentCatalog ?? DEFAULT_CATALOG_EXPERIMENT,
    collections,
    supervisedProfiles,
  });
  for (const { label, options } of switcher.groups) {
    const parent = label === null ? experimentSelect : document.createElement("optgroup");
    if (label !== null) parent.label = label;
    for (const { value, text } of options) {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = text;
      parent.append(option);
    }
    if (label !== null) experimentSelect.append(parent);
  }
  experimentSelect.value = switcher.value;
  currentUi.quickHint.textContent = switcher.hint;
}
function updateMoveButton() {
  const owned = Boolean(user && currentRemote && currentRemote.owner_id === user.id);
  const target = selectedCollectionId(ui.moveCollection);
  const current = currentRemote?.collection_id || null;
  ui.move.disabled = !owned || target === current;
}

function updateCurrentUi() {
  const status = workspaceStatus({
    userId: user?.id,
    remote: currentRemote,
    access: currentRemoteAccess,
    workingCopy: currentWorkingCopy,
    revisions: currentRevisions,
    view: currentRevisionView,
    showcase: currentShowcase,
    catalog: currentCatalog ?? DEFAULT_CATALOG_EXPERIMENT,
    dirty: hasUnsavedRemoteEdits(),
    collections,
    supervisedProfiles,
    availableRecipientCount: availableShareRecipients().length,
    hasOutgoingShares: currentOutgoingShares().length > 0,
  });

  currentUi.title.textContent = status.title;
  currentUi.origin.dataset.kind = status.origin.kind;
  currentUi.origin.textContent = status.origin.text;
  currentUi.location.textContent = status.location;
  currentUi.revisionWorkflow.hidden = status.revisionWorkflowHidden;
  if (status.revisionBadge) {
    currentUi.revisionPrimary.textContent = status.revisionBadge.primary;
    currentUi.revisionSecondary.textContent = "";
    currentUi.revisionTrigger.setAttribute("aria-label", status.revisionBadge.ariaLabel);
  }
  metadataRevision.textContent = status.metadataRevision;
  currentUi.revisionNotice.hidden = status.notice.hidden;
  if (status.notice.text !== null) currentUi.revisionNotice.textContent = status.notice.text;

  currentUi.editFromRevision.hidden = status.editFromRevision.hidden;
  if (status.editFromRevision.text !== null) currentUi.editFromRevision.textContent = status.editFromRevision.text;
  currentUi.discardWorkingCopy.hidden = status.discardHidden;
  setArtifactEditorsLocked(status.lockEditors);

  ui.saveRow.hidden = status.saveRowHidden;
  ui.saveAsNew.hidden = status.saveAsNewHidden;
  ui.save.hidden = status.saveHidden;
  ui.createNew.textContent = status.createNewText;
  ui.shareRow.hidden = status.shareRowHidden;
  ui.shareOpen.hidden = status.shareOpenHidden;
  if (status.closeShareForm) ui.shareForm.hidden = true;
  populateShareRecipientSelect();
  renderOutgoingShares();
  ui.save.disabled = status.saveDisabled;
  ui.moveRow.hidden = status.moveRowHidden;
  if (status.owned) populateCollectionSelect(ui.moveCollection, currentRemote.collection_id);
  updateMoveButton();

  if (status.saveState) {
    ui.saveState.dataset.state = status.saveState.state;
    ui.saveState.textContent = status.saveState.text;
  }
  ui.note.textContent = status.note;

  setQuickSwitchOptions();
  renderRevisionHistory();
}

function revisionActor(revision) {
  return revisionActorFor(revision, user?.id);
}

async function loadProfile() {
  profile = await registryData.readProfile(supabase, user.id);
}

async function loadCollections() {
  if (!user) {
    collections = [];
    return;
  }
  collections = await registryData.listCollections(supabase);
}

async function loadShareRecipients() {
  if (!user) {
    shareRecipients = [];
    populateShareRecipientSelect();
    return;
  }
  shareRecipients = await registryData.listShareRecipients(supabase);
  populateShareRecipientSelect();
}

async function loadOutgoingShares() {
  if (!user) {
    outgoingShares = [];
    renderOutgoingShares();
    return;
  }
  outgoingShares = await registryData.listOutgoingShares(supabase, user.id);
  renderOutgoingShares();
}

async function loadSharedExperimentList() {
  if (!user) {
    sharedExperiments = [];
    setQuickSwitchOptions();
    return;
  }

  sharedExperiments = (await registryData.listSharedExperiments(supabase, user.id))
    .filter((experiment) => productionExperimentRunnability(experiment).runnable);
  setQuickSwitchOptions();
}

async function loadSupervisedExperimentList() {
  if (!user || profile?.role !== "professor") {
    supervisedProfiles = [];
    supervisedExperiments = [];
    setQuickSwitchOptions();
    return;
  }

  supervisedProfiles = await registryData.listStudents(supabase);

  const ids = supervisedProfiles.map((student) => student.id);
  if (!ids.length) {
    supervisedExperiments = [];
    setQuickSwitchOptions();
    return;
  }

  supervisedExperiments = (await registryData.listExperimentsOwnedBy(supabase, ids))
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
  const data = await registryData.listOwnExperiments(supabase, user.id);

  remoteExperiments = [];
  hiddenNonRunnableCount = 0;
  for (const experiment of data) {
    if (productionExperimentRunnability(experiment).runnable) remoteExperiments.push(experiment);
    else hiddenNonRunnableCount += 1;
  }
  setQuickSwitchOptions();
}

async function readExperiment(id) {
  const data = await registryData.readExperiment(supabase, id);
  if (!data) throw new Error("Experiment not found in your library or not available to this account.");
  if (!productionExperimentRunnability(data).runnable) throw new Error("This experiment cannot run in the current simulator version.");
  return data;
}

async function readWorkingCopy(id) {
  return registryData.readWorkingCopy(supabase, id, user.id);
}
async function waitForSimulatorReady() {
  const deadline = performance.now() + 15000;
  while (!runtimeModel.get().controls.applySources && performance.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 100));
  if (!runtimeModel.get().controls.applySources) throw new Error("Simulator is not ready yet.");
}

async function applyLoadedSources() {
  await waitForSimulatorReady();
  simulationCommands.applySetup();
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

async function restoreCatalog(experiment = DEFAULT_CATALOG_EXPERIMENT, { apply = true } = {}) {
  clearCurrentExperimentSubscription();
  currentCatalog = loadCatalogExperiment(experiment);
  currentShowcase = null;
  currentRemote = null;
  currentRemoteAccess = null;
  currentWorkingCopy = null;
  currentRevisions = [];
  currentRevisionView = { kind: "catalog", revision: null };
  ui.newForm.hidden = true;
  updateCurrentUi();
  rememberCurrentWorkspace();
  setMessage(user ? `${experiment.title} loaded from Showcase.` : `${experiment.title} loaded from Showcase. Sign in to open your private library.`);
  if (apply) await applyLoadedSources();
}

async function loadRemoteExperiment(id, { access = "owned" } = {}) {
  if (!user) throw new Error("Sign in to open Experiments.");
  setMessage("Opening experiment…");
  const experiment = await readExperiment(id);
  const workingCopy = access === "owned" && experiment.owner_id === user.id
    ? await readWorkingCopy(id)
    : null;

  currentCatalog = null;
  currentShowcase = null;
  currentRemote = experiment;
  currentRemoteAccess = access;
  currentWorkingCopy = workingCopy;
  await loadRevisionHistory();
  currentRevisionView = reentryView(experiment);

  const initial = latestSnapshot(currentRevisions, experiment);
  applyExperimentArtifacts(initial);
  ui.newForm.hidden = true;
  subscribeCurrentExperiment(id);
  updateCurrentUi();
  rememberCurrentWorkspace();
  await applyLoadedSources();
  setMessage(openedMessage(experiment, workingCopy), "success");
}

async function loadShowcaseExperiment(entry) {
  if (!entry?.showcase_id || !entry?.artifacts) throw new Error("Showcase Experiment is unavailable.");
  const runnable = productionExperimentRunnability(entry);
  if (!runnable.runnable) throw new Error(runnable.error || "Showcase Experiment is not runnable.");

  clearCurrentExperimentSubscription();
  currentCatalog = null;
  currentShowcase = entry;
  currentRemote = null;
  currentRemoteAccess = "showcase";
  currentWorkingCopy = null;
  currentRevisions = [];
  currentRevisionView = { kind: "showcase", revision: entry.source_revision ?? null };
  applyExperimentArtifacts(entry);
  ui.newForm.hidden = true;
  updateCurrentUi();
  rememberCurrentWorkspace();
  await applyLoadedSources();
  setMessage(`${entry.title} loaded from Showcase.`, "success");
}

function currentLibraryLoadedState() {
  return libraryLoadedState({
    remote: currentRemote,
    access: currentRemoteAccess,
    viewedRevision: currentRevisionSnapshot(),
    showcase: currentShowcase,
    catalog: currentCatalog ?? DEFAULT_CATALOG_EXPERIMENT,
  });
}

async function copyShowcaseToWorkspace(entry, title, collectionId) {
  if (!user) throw new Error("Sign in before copying.");
  if (!entry?.artifacts) throw new Error("Showcase snapshot is unavailable.");
  const validation = registryExperimentRunnability(entry);
  if (!validation.runnable) throw new Error(validation.error || "Showcase Experiment cannot be copied.");

  const data = await registryData.insertExperiment(supabase, {
    owner_id: user.id,
    collection_id: collectionId,
    title,
    description: entry.description || "",
    lifecycle: "active",
    visibility: "private",
    artifacts: entry.artifacts,
    created_by_actor: "human",
    created_by_ai_client: null,
    updated_by_actor: "human",
    updated_by_ai_client: null,
  });
  await loadExperimentList();
  await loadRemoteExperiment(data.id, { access: "owned" });
  return data;
}

async function copyRegistryRevisionToWorkspace(experimentId, revision, title, collectionId) {
  if (!user) throw new Error("Sign in before copying.");
  const copyId = await registryData.copyExperimentToWorkspace(supabase, {
    sourceId: experimentId,
    revision,
    title,
    collectionId,
  });
  await loadExperimentList();
  await loadRemoteExperiment(copyId, { access: "owned" });
  return copyId;
}

function connectedMessage() {
  return connectedMessageFor({
    count: remoteExperiments.length,
    collectionCount: collections.length,
    hiddenCount: hiddenNonRunnableCount,
    sharedCount: sharedExperiments.length,
    supervisedCount: supervisedExperiments.length,
    professor: profile?.role === "professor",
  });
}

function registryArtifactsForSave() {
  const artifacts = captureExperimentArtifacts();
  const validation = registryExperimentRunnability(artifacts);
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
  const data = await registryData.crystallizeWorkingCopy(supabase, currentRemote.id);

  currentRemote = data;
  currentWorkingCopy = null;
  await Promise.all([loadExperimentList(), loadRevisionHistory()]);
  currentRevisionView = { kind: "revision", revision: data.revision };
  const savedRevision = currentRevisions.find((revision) => revision.revision === data.revision) ?? data;
  applyExperimentArtifacts(savedRevision);
  updateCurrentUi();
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
  const data = await registryData.moveExperiment(supabase, {
    experimentId: currentRemote.id,
    ownerId: user.id,
    collectionId: targetCollectionId,
  });

  currentRemote = data;
  await loadExperimentList();
  updateCurrentUi();
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
  await registryData.shareExperiment(supabase, {
    experimentId: currentRemote.id,
    recipientId: recipient.id,
    sharedBy: user.id,
  });

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
  await registryData.revokeShare(supabase, { experimentId: currentRemote.id, recipientId });

  await loadOutgoingShares();
  updateCurrentUi();
  setMessage(`${label} no longer has ordinary shared access to ${currentRemote.title}.`, "success");
}

function defaultCopyTitle() {
  const source = currentRevisionSnapshot() ?? currentRemote;
  return source?.title
    ? `${source.title} copy`
    : `${(currentShowcase ?? currentCatalog ?? DEFAULT_CATALOG_EXPERIMENT).title} copy`;
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
  const sourceSnapshot = currentRevisionSnapshot();
  const sourceRevision = sourceSnapshot?.revision ?? currentRemote.revision;
  const sourceTitle = sourceSnapshot?.title ?? currentRemote.title;
  setMessage(`Copying ${sourceTitle} revision ${sourceRevision}…`);
  const copyId = await registryData.copyExperimentToWorkspace(supabase, {
    sourceId,
    revision: sourceRevision,
    title,
    collectionId,
  });
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
    const artifacts = registryArtifactsForSave();
    setMessage(`Creating ${title}…`);
    data = await registryData.insertExperiment(supabase, {
      owner_id: user.id,
      collection_id: collectionId,
      title,
      description: currentRemote?.description ?? currentShowcase?.description ?? currentCatalog?.description ?? "",
      lifecycle: "active",
      visibility: "private",
      ...artifacts,
      created_by_actor: "human",
      created_by_ai_client: null,
      updated_by_actor: "human",
      updated_by_ai_client: null,
    });
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
  currentRevisionView = { kind: "catalog", revision: null };
  sharedExperiments = [];
  supervisedProfiles = [];
  supervisedExperiments = [];
  shareRecipients = [];
  outgoingShares = [];
  collections = [];
  hiddenNonRunnableCount = 0;
  updateCurrentUi();
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
  if (!remembered) return false;
  const target = parseWorkspaceValue(remembered);
  if (target.kind === "catalog") {
    const experiment = catalogExperimentByValue(remembered);
    if (experiment) {
      await restoreCatalog(experiment, { apply: currentRemote !== null });
      return true;
    }
    clearRememberedWorkspace();
    return false;
  }
  if (target.kind === "showcase") {
    const entry = (await registryData.listShowcaseEntries(supabase)).find((candidate) => candidate.showcase_id === target.id);
    if (entry) {
      await loadShowcaseExperiment(entry);
      return true;
    }
    clearRememberedWorkspace();
    return false;
  }
  if (target.kind !== "registry") {
    clearRememberedWorkspace();
    return false;
  }
  const access = rememberedRegistryAccess(target.id, {
    owned: remoteExperiments,
    shared: sharedExperiments,
    supervised: supervisedExperiments,
  });
  if (access) {
    await loadRemoteExperiment(target.id, { access });
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
  await restoreCatalog({ apply: currentRemote !== null });
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
        await restoreCatalog();
        setMessage("The previously loaded experiment is no longer available in this simulator version.");
      }
      return;
    }

    currentRemote = fresh;
    await loadRevisionHistory();
    updateCurrentUi();
    renderRevisionHistory();
    if (fresh.revision > previousRemote.revision) {
      const newest = currentRevisions.find((revision) => revision.revision === fresh.revision);
      const actor = newest ? revisionActor(newest) : revisionActor(fresh);
      setMessage(newRevisionMessage(fresh.revision, actor), "success");
      return;
    }
  }

  updateCurrentUi();
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

window.vlabExperimentLibraryBridge = Object.freeze({
  getState: () => ({
    user: user ? { id: user.id } : null,
    profile: profile ? { id: profile.id, display_name: profile.display_name, role: profile.role } : null,
    loaded: currentLibraryLoadedState(),
  }),
  openShowcase: async (entry) => {
    if (!(await confirmDiscardIfNeeded())) return false;
    await loadShowcaseExperiment(entry);
    return true;
  },
  openRegistry: async (experimentId, access) => {
    if (!(await confirmDiscardIfNeeded())) return false;
    await loadRemoteExperiment(experimentId, { access });
    return true;
  },
  copyShowcase: copyShowcaseToWorkspace,
  copyRegistry: copyRegistryRevisionToWorkspace,
  refreshRegistry,
});

currentUi.browse.addEventListener("click", () => {
  window.dispatchEvent(new CustomEvent("vlab:open-experiment-library"));
});
currentUi.revisionTrigger.addEventListener("click", () => run(openRevisionHistory));
currentUi.editFromRevision.addEventListener("click", () => run(editFromViewedRevision));
currentUi.discardWorkingCopy.addEventListener("click", () => run(discardCurrentWorkingCopy));
revisionHistory.close.addEventListener("click", () => revisionHistory.dialog.close());
revisionHistory.dialog.addEventListener("close", () => {
  currentUi.revisionTrigger.setAttribute("aria-expanded", "false");
  currentUi.revisionTrigger.focus({ preventScroll: true });
});
for (const button of [revisionHistory.all, revisionHistory.mine, revisionHistory.ai]) {
  button.addEventListener("click", () => {
    revisionFilter = button.dataset.revisionFilter;
    renderRevisionHistory();
  });
}
revisionHistory.dialog.addEventListener("click", (event) => {
  if (event.target === revisionHistory.dialog) revisionHistory.dialog.close();
});

experimentSelect.addEventListener("change", () => run(async () => {
  const value = experimentSelect.value;
  const target = parseWorkspaceValue(value);
  if (target.kind === "catalog") {
    const experiment = catalogExperimentByValue(value);
    if (!experiment) throw new Error("Catalog Experiment not found.");
    if ((currentRemote || currentShowcase) && !(await confirmDiscardIfNeeded())) {
      setQuickSwitchOptions();
      return;
    }
    if (currentRemote || currentShowcase || currentCatalog?.key !== experiment.key) await restoreCatalog(experiment);
    return;
  }
  if (target.kind === "showcase") {
    if (currentShowcase?.showcase_id === target.id) return;
    setQuickSwitchOptions();
    return;
  }
  if (target.kind !== "registry") return;
  const id = target.id;
  if (currentRemote?.id === id) return;
  if (!(await confirmDiscardIfNeeded())) {
    setQuickSwitchOptions();
    return;
  }
  const access = selectedRegistryAccess(id, { shared: sharedExperiments, supervised: supervisedExperiments });
  await loadRemoteExperiment(id, { access });
}));

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
  const insideArtifactEditor = Boolean(target?.closest(
    "#experiment-config, #initializer-source, #controller-source, [data-experiment-artifact-editor='true'], [data-vlab-artifact-editor-surface='true']",
  ));
  if (!insideArtifactEditor) autosaveAtInteractionBoundary();
}, { capture: true });

window.addEventListener("beforeunload", (event) => {
  if (!hasUnpersistedRemoteEdits()) return;
  event.preventDefault();
  event.returnValue = "";
});

supabase.auth.onAuthStateChange((_event, session) => {
  if (session?.user?.id === user?.id || (!session && !user)) return;
  queueMicrotask(() => run(initializeSession));
});

updateCurrentUi();
run(initializeSession);
