import { onlyLiveRuntimeUpdates } from "./live-region.js";
import { supabase } from "./supabase-client.js";


function buildOrganizer() {
  const dialog = document.createElement("dialog");
  dialog.id = "collection-organizer";
  dialog.className = "collection-organizer";
  dialog.setAttribute("aria-label", "Organize experiments");

  const shell = document.createElement("div");
  shell.className = "collection-organizer-shell";

  const head = document.createElement("div");
  head.className = "collection-organizer-head";
  const title = document.createElement("h2");
  title.textContent = "Organize experiments";
  const close = document.createElement("button");
  close.type = "button";
  close.textContent = "Close";
  head.append(title, close);

  const body = document.createElement("div");
  body.className = "collection-organizer-body";
  const intro = document.createElement("p");
  intro.className = "collection-organizer-intro";
  intro.textContent = "Collections are optional organization. They never limit which Experiments appear in your library or which Experiments you can run.";

  const assignment = document.createElement("section");
  assignment.className = "collection-organizer-section";
  const assignmentTitle = document.createElement("h3");
  assignmentTitle.textContent = "Current experiment";
  const assignmentHelp = document.createElement("p");
  assignmentHelp.className = "collection-organizer-intro";
  assignmentHelp.textContent = "Choose a collection for the current experiment, or leave it with no collection.";
  const assignmentSlot = document.createElement("div");
  assignmentSlot.id = "collection-assignment-slot";
  const noAssignment = document.createElement("p");
  noAssignment.className = "collection-organizer-intro";
  noAssignment.textContent = "Open one of your experiments to change its organization.";
  assignment.append(assignmentTitle, assignmentHelp, assignmentSlot, noAssignment);

  const manage = document.createElement("section");
  manage.className = "collection-organizer-section";
  const manageTitle = document.createElement("h3");
  manageTitle.textContent = "Manage collections";
  const manageHelp = document.createElement("p");
  manageHelp.className = "collection-organizer-intro";
  manageHelp.textContent = "Create or rename optional collections. Experiments remain globally searchable regardless of collection.";

  const createGrid = document.createElement("div");
  createGrid.className = "collection-organizer-manage-grid";
  const createField = document.createElement("label");
  createField.className = "collection-organizer-field";
  createField.append("New collection");
  const createName = document.createElement("input");
  createName.type = "text";
  createName.maxLength = 120;
  createName.placeholder = "Collection name";
  createName.setAttribute("aria-label", "New collection name");
  createField.append(createName);
  const create = document.createElement("button");
  create.type = "button";
  create.textContent = "Create collection";
  createGrid.append(createField, create);

  const renameGrid = document.createElement("div");
  renameGrid.className = "collection-organizer-manage-grid";
  const renameField = document.createElement("label");
  renameField.className = "collection-organizer-field";
  renameField.append("Rename collection");
  const renameSelect = document.createElement("select");
  renameSelect.setAttribute("aria-label", "Collection to rename");
  renameField.append(renameSelect);
  const renameNameField = document.createElement("label");
  renameNameField.className = "collection-organizer-field";
  renameNameField.append("New name");
  const renameName = document.createElement("input");
  renameName.type = "text";
  renameName.maxLength = 120;
  renameName.setAttribute("aria-label", "Renamed collection name");
  renameNameField.append(renameName);
  const rename = document.createElement("button");
  rename.type = "button";
  rename.textContent = "Rename";
  const renameFields = document.createElement("div");
  renameFields.style.display = "grid";
  renameFields.style.gridTemplateColumns = "minmax(0, 1fr) minmax(0, 1fr)";
  renameFields.style.gap = "8px";
  renameFields.append(renameField, renameNameField);
  renameGrid.append(renameFields, rename);

  const status = document.createElement("p");
  status.className = "collection-organizer-status";
  status.setAttribute("role", "status");

  manage.append(manageTitle, manageHelp, createGrid, renameGrid);
  body.append(intro, assignment, manage, status);
  shell.append(head, body);
  dialog.append(shell);
  document.body.append(dialog);

  return {
    dialog,
    close,
    assignmentSlot,
    noAssignment,
    createName,
    create,
    renameSelect,
    renameName,
    rename,
    status,
  };
}
const organizer = buildOrganizer();
let organizeButton = null;
let collectionRows = [];
let registryMessageObserver = null;

function setHidden(element, hidden) {
  if (element.hidden !== hidden) element.hidden = hidden;
}

function setText(element, text) {
  if (element.textContent !== text) element.textContent = text;
}

function setStatus(text, state = "idle") {
  setText(organizer.status, text);
  if (organizer.status.dataset.state !== state) organizer.status.dataset.state = state;
}

function signedIn() {
  const signOut = document.querySelector(".registry-sign-out");
  return Boolean(signOut && !signOut.hidden);
}

function currentOwnedExperiment() {
  const origin = document.querySelector(".experiment-origin");
  const value = document.querySelector("#experiment-select")?.value ?? "";
  return Boolean(origin?.dataset.kind === "owned" && value.startsWith("registry:"));
}

function ensureOrganizeButton() {
  const meta = document.querySelector(".experiment-current-meta");
  if (!meta) return false;
  const actions = document.querySelector(".experiment-current-actions");
  const host = actions || meta;
  if (!organizeButton) {
    organizeButton = document.createElement("button");
    organizeButton.type = "button";
    organizeButton.className = "experiment-organize";
    organizeButton.textContent = "Organize";
    organizeButton.addEventListener("click", () => openOrganizer());
  }
  if (organizeButton.parentElement !== host) host.append(organizeButton);
  setHidden(organizeButton, !signedIn());
  return true;
}

function normalizeCollectionLanguage() {
  for (const select of document.querySelectorAll(".registry-new-form select, .registry-move-select")) {
    const emptyOption = [...select.options].find((option) => option.value === "");
    if (emptyOption) setText(emptyOption, "No collection");
  }
  const newCollectionLabel = document.querySelector(".registry-new-form .registry-new-field:nth-of-type(2)");
  if (newCollectionLabel?.firstChild?.nodeType === Node.TEXT_NODE && newCollectionLabel.firstChild.textContent !== "Collection (optional)") {
    newCollectionLabel.firstChild.textContent = "Collection (optional)";
  }
  const moveLabel = document.querySelector(".registry-move-field");
  if (moveLabel?.firstChild?.nodeType === Node.TEXT_NODE && moveLabel.firstChild.textContent !== "Collection (optional)") {
    moveLabel.firstChild.textContent = "Collection (optional)";
  }
  const registryMessage = document.querySelector(".registry-message");
  if (registryMessage?.textContent?.includes("Unfiled")) {
    setText(registryMessage, registryMessage.textContent.replaceAll("Unfiled", "No collection"));
  }
}

function suppressNoCollectionOutsideOrganization() {
  const location = document.querySelector(".experiment-location");
  if (location) setHidden(location, location.textContent?.trim() === "No collection");

  const experimentSelect = document.querySelector("#experiment-select");
  for (const option of experimentSelect?.querySelectorAll("option") ?? []) {
    const label = option.textContent ?? "";
    if (label.endsWith(" · No collection")) setText(option, label.slice(0, -" · No collection".length));
  }
}

function relocateMoveControl() {
  const row = document.querySelector(".registry-move-row");
  if (!row) return false;
  if (row.parentElement !== organizer.assignmentSlot) organizer.assignmentSlot.append(row);
  const button = row.querySelector("button");
  if (button) setText(button, "Save organization");
  const owned = currentOwnedExperiment();
  setHidden(organizer.noAssignment, owned);
  setHidden(row, !owned);
  return true;
}

function syncPresentation() {
  ensureOrganizeButton();
  normalizeCollectionLanguage();
  suppressNoCollectionOutsideOrganization();
  relocateMoveControl();
}

async function requireUser() {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  const user = data.session?.user;
  if (!user) throw new Error("Sign in before managing collections.");
  return user;
}

async function loadCollections() {
  const user = await requireUser();
  const { data, error } = await supabase
    .from("experiment_collections")
    .select("id,name,updated_at")
    .eq("owner_id", user.id)
    .order("name", { ascending: true });
  if (error) throw error;
  collectionRows = data ?? [];
  organizer.renameSelect.replaceChildren();
  for (const collection of collectionRows) {
    const option = document.createElement("option");
    option.value = collection.id;
    option.textContent = collection.name;
    organizer.renameSelect.append(option);
  }
  const hasCollections = collectionRows.length > 0;
  organizer.renameSelect.disabled = !hasCollections;
  organizer.renameName.disabled = !hasCollections;
  organizer.rename.disabled = !hasCollections;
  syncRenameName();
}

function syncRenameName() {
  const selected = collectionRows.find((collection) => collection.id === organizer.renameSelect.value);
  organizer.renameName.value = selected?.name ?? "";
}

function refreshRegistry() {
  window.vlabExperimentLibraryBridge?.refreshRegistry?.();
  window.dispatchEvent(new Event("vlab:refresh-experiment-library"));
}

async function createCollection() {
  const user = await requireUser();
  const name = organizer.createName.value.trim();
  if (!name) throw new Error("Enter a collection name.");
  setStatus("Creating collection…");
  const { error } = await supabase.from("experiment_collections").insert({ owner_id: user.id, name });
  if (error) throw error;
  organizer.createName.value = "";
  await loadCollections();
  refreshRegistry();
  setStatus(`${name} created. It is available as optional organization.`, "success");
}

async function renameCollection() {
  const user = await requireUser();
  const id = organizer.renameSelect.value;
  const name = organizer.renameName.value.trim();
  if (!id) throw new Error("Choose a collection to rename.");
  if (!name) throw new Error("Enter the new collection name.");
  const original = collectionRows.find((collection) => collection.id === id);
  if (original?.name === name) {
    setStatus("The collection already has that name.");
    return;
  }
  setStatus("Renaming collection…");
  const { error } = await supabase
    .from("experiment_collections")
    .update({ name })
    .eq("id", id)
    .eq("owner_id", user.id);
  if (error) throw error;
  await loadCollections();
  organizer.renameSelect.value = id;
  syncRenameName();
  refreshRegistry();
  setStatus(`Collection renamed to ${name}.`, "success");
}

async function run(action) {
  try {
    await action();
  } catch (error) {
    console.error(error);
    setStatus(error instanceof Error ? error.message : String(error), "error");
  }
}

async function openOrganizer() {
  setStatus("");
  syncPresentation();
  await run(loadCollections);
  if (!organizer.dialog.open) organizer.dialog.showModal();
  const target = currentOwnedExperiment()
    ? organizer.assignmentSlot.querySelector("select:not(:disabled), button:not(:disabled)")
    : organizer.createName;
  target?.focus({ preventScroll: true });
}

organizer.close.addEventListener("click", () => organizer.dialog.close());
organizer.dialog.addEventListener("click", (event) => {
  if (event.target === organizer.dialog) organizer.dialog.close();
});
organizer.create.addEventListener("click", () => run(createCollection));
organizer.createName.addEventListener("keydown", (event) => {
  if (event.key === "Enter") run(createCollection);
});
organizer.renameSelect.addEventListener("change", syncRenameName);
organizer.rename.addEventListener("click", () => run(renameCollection));
organizer.renameName.addEventListener("keydown", (event) => {
  if (event.key === "Enter") run(renameCollection);
});

function attachRegistryMessageObserver() {
  const message = document.querySelector(".registry-message");
  if (!message || registryMessageObserver) return;
  registryMessageObserver = new MutationObserver(() => {
    normalizeCollectionLanguage();
    if (organizer.dialog.open && message.dataset.state === "success") {
      const text = message.textContent?.trim();
      if (text) setStatus(text.replaceAll("Unfiled", "No collection"), "success");
    }
  });
  registryMessageObserver.observe(message, {
    childList: true,
    characterData: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["data-state"],
  });
}

// Skips pure live-runtime updates (#569).
const observer = new MutationObserver((records) => {
  if (onlyLiveRuntimeUpdates(records)) return;
  syncPresentation();
  attachRegistryMessageObserver();
});
observer.observe(document.body, {
  childList: true,
  subtree: true,
  attributes: true,
  attributeFilter: ["hidden", "data-kind"],
  characterData: true,
});

supabase.auth.onAuthStateChange(() => queueMicrotask(syncPresentation));

syncPresentation();
attachRegistryMessageObserver();
