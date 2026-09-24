const experimentPanel = document.querySelector(".experiment-panel");
const currentExperiment = document.querySelector(".experiment-current");
const currentMain = currentExperiment?.querySelector(".experiment-current-main");
const currentMeta = currentExperiment?.querySelector(".experiment-current-meta");
const revisionWorkflow = currentExperiment?.querySelector(".experiment-revision-workflow");
const experimentLabel = document.querySelector('label[for="experiment-select"]');
const experimentSelect = document.querySelector("#experiment-select");
const quickHint = document.querySelector(".experiment-quick-hint");
const browseButton = document.querySelector(".experiment-browse");
const accountButton = document.querySelector("#account-menu");
const professorButton = document.querySelector("#professor-menu");
const showcaseLauncher = document.querySelector(".showcase-launcher");
const legacyPersistence = document.querySelector("#authoring-persistence");
const legacyPersistenceSlot = document.querySelector("#authoring-persistence-slot");

if (!experimentPanel || !currentExperiment || !currentMain || !currentMeta || !revisionWorkflow
  || !experimentLabel || !experimentSelect || !browseButton || !accountButton
  || !professorButton || !legacyPersistence || !legacyPersistenceSlot) {
  throw new Error("Experiment management UI mismatch.");
}

function taskHeading(title) {
  const heading = document.createElement("div");
  heading.className = "experiment-task-heading";
  const label = document.createElement("strong");
  label.textContent = title;
  heading.append(label);
  return heading;
}

function buildControlPanel() {
  const panelTitle = document.createElement("h2");
  panelTitle.id = "control-panel-heading";
  panelTitle.className = "vlab-workspace-card-title";
  panelTitle.textContent = "Control Panel";
  experimentPanel.removeAttribute("aria-label");
  experimentPanel.setAttribute("aria-labelledby", panelTitle.id);
  experimentPanel.prepend(panelTitle);

  const grid = document.createElement("div");
  grid.className = "experiment-control-grid";

  currentExperiment.classList.add("experiment-task-card", "experiment-task-current");
  currentExperiment.setAttribute("aria-label", "Current experiment");

  const currentContext = document.createElement("div");
  currentContext.className = "experiment-current-context";
  const currentActions = document.createElement("div");
  currentActions.className = "experiment-current-actions";
  currentMain.after(currentContext, currentActions);
  currentContext.append(currentMeta);
  browseButton.classList.add("primary");
  currentActions.append(browseButton);

  const revisionTask = document.createElement("section");
  revisionTask.className = "experiment-task-card experiment-task-revisions";
  revisionTask.setAttribute("aria-label", "Experiment revisions");
  revisionTask.append(
    taskHeading("Revisions"),
    revisionWorkflow,
  );

  grid.append(currentExperiment, revisionTask);
  experimentPanel.append(grid);
  return { grid, revisionTask, currentActions };
}

function buildManagementRegion(currentActions) {
  const region = document.createElement("section");
  region.className = "experiment-task-card experiment-management";
  region.setAttribute("aria-label", "Save and share Experiment");
  region.append(taskHeading("Save & share"));

  const status = document.createElement("p");
  status.className = "experiment-management-status";
  status.setAttribute("role", "status");
  status.setAttribute("aria-live", "polite");

  const actions = document.createElement("div");
  actions.className = "experiment-management-actions";

  const saveAsNew = document.querySelector(".registry-save-actions button");
  const shareOpen = document.querySelector(".registry-share-row > button");
  if (!(saveAsNew instanceof HTMLButtonElement)
    || !(shareOpen instanceof HTMLButtonElement)) {
    throw new Error("Save & share action UI mismatch.");
  }
  shareOpen.textContent = "Share…";
  actions.append(saveAsNew, shareOpen);

  const slot = document.createElement("div");
  slot.className = "experiment-management-slot";

  const signIn = document.createElement("button");
  signIn.type = "button";
  signIn.className = "experiment-sign-in primary";
  signIn.textContent = "Sign In";
  signIn.addEventListener("click", () => accountButton.click());
  currentActions.append(signIn);

  region.append(status, actions, slot);
  return { region, status, actions, slot, signIn, saveAsNew, shareOpen };
}

function buildProfessorSection(currentActions) {
  const promote = document.querySelector(".showcase-promote-current");
  const curationStatus = document.querySelector(".showcase-curation-status");
  if (!(showcaseLauncher instanceof HTMLButtonElement) || !(promote instanceof HTMLButtonElement) || !curationStatus) {
    throw new Error("Professor curation UI mismatch.");
  }

  const region = document.createElement("section");
  region.className = "experiment-task-card experiment-professor-section";
  region.hidden = true;
  region.setAttribute("aria-label", "Professor controls");
  region.append(taskHeading("Professor controls"));

  const groups = document.createElement("div");
  groups.className = "experiment-professor-groups";

  const showcaseGroup = document.createElement("div");
  showcaseGroup.className = "experiment-professor-group";
  const showcaseTitle = document.createElement("strong");
  showcaseTitle.textContent = "Showcase";
  const showcaseActions = document.createElement("div");
  showcaseActions.className = "experiment-professor-actions";
  showcaseLauncher.textContent = "Browse";
  showcaseActions.append(showcaseLauncher, promote);
  const legacyCurrentActions = currentMain.querySelector(".experiment-current-actions");
  if (legacyCurrentActions && legacyCurrentActions !== currentActions) {
    for (const child of [...legacyCurrentActions.children]) currentActions.append(child);
    legacyCurrentActions.remove();
  }
  showcaseGroup.append(showcaseTitle, showcaseActions, curationStatus);

  const capabilityGroup = document.createElement("div");
  capabilityGroup.className = "experiment-professor-group";
  const capabilityTitle = document.createElement("strong");
  capabilityTitle.textContent = "Capability requests";
  const capabilityActions = document.createElement("div");
  capabilityActions.className = "experiment-professor-actions";
  const requests = document.createElement("button");
  requests.type = "button";
  requests.className = "experiment-capability-requests";
  requests.textContent = "Open";
  requests.addEventListener("click", () => {
    const inbox = document.querySelector(".professor-inbox-open");
    if (inbox instanceof HTMLButtonElement && !inbox.disabled) inbox.click();
    else professorButton.click();
  });
  capabilityActions.append(requests);
  capabilityGroup.append(capabilityTitle, capabilityActions);

  groups.append(showcaseGroup, capabilityGroup);
  region.append(groups);

  return { region, requests };
}
const control = buildControlPanel();
const management = buildManagementRegion(control.currentActions);
const professorSection = buildProfessorSection(control.currentActions);
control.grid.append(management.region, professorSection.region);

let sourceMessageObserver = null;
let authObserver = null;
let currentObserver = null;
let professorObserver = null;

function signedIn() {
  const signOut = document.querySelector(".registry-sign-out");
  return Boolean(signOut && !signOut.hidden);
}

function setText(element, text) {
  if (element && element.textContent !== text) element.textContent = text;
}

function mirrorOperationalMessage() {
  const source = document.querySelector(".registry-message");
  if (!source || !signedIn()) {
    setText(management.status, "");
    management.status.dataset.state = "idle";
    return;
  }
  const state = source.dataset.state || "idle";
  if (state !== "error") {
    setText(management.status, "");
    management.status.dataset.state = "idle";
    return;
  }
  setText(management.status, source.textContent?.trim() || "");
  management.status.dataset.state = "error";
}

function movePersistenceControls() {
  for (const selector of [".registry-share-row", ".registry-new-form"]) {
    const element = document.querySelector(selector);
    if (element && element.parentElement !== management.slot) management.slot.append(element);
  }
  const note = document.querySelector(".registry-note");
  if (note) note.hidden = true;
  legacyPersistence.hidden = true;
  legacyPersistence.setAttribute("aria-hidden", "true");
}

function simplifyIdentity() {
  experimentLabel.hidden = true;
  experimentSelect.hidden = true;
  experimentSelect.setAttribute("aria-hidden", "true");
  if (quickHint) quickHint.hidden = true;
  setText(browseButton, "Browse experiments");

  const origin = document.querySelector(".experiment-origin");
  const location = document.querySelector(".experiment-location");
  const locationText = location?.textContent?.trim() || "";
  const owned = origin?.dataset.kind === "owned";

  if (origin) {
    origin.dataset.managementDefault = String(Boolean(owned));
    if (!owned && locationText === "Shared with me") {
      setText(origin, "Shared · Read-only");
    } else if (!owned && locationText.startsWith("Supervised · ")) {
      setText(origin, locationText + " · Read-only");
    } else if (!owned && locationText !== "Showcase") {
      setText(origin, "Read-only");
    }
  }

  if (location) {
    const usefulCollection = owned && locationText.startsWith("Collection · ");
    location.dataset.managementRedundant = String(!usefulCollection);
  }

  const saveRevision = document.querySelector(".experiment-revision-actions .primary");
  if (saveRevision) setText(saveRevision, "Save Revision");

  if (locationText === "Student experiment" || locationText === "Shared with me") {
    setText(management.saveAsNew, "Copy to my Experiments…");
  } else {
    setText(management.saveAsNew, "Save as new…");
  }
}

function syncSignedOutState() {
  const isSignedIn = signedIn();
  management.signIn.hidden = isSignedIn;
  management.region.hidden = !isSignedIn;
  mirrorOperationalMessage();
}


function syncProfessorSection() {
  const available = !professorButton.hidden;
  professorSection.region.hidden = !available;
  professorSection.requests.disabled = !available;
  const pending = document.querySelector(".professor-pending-count")?.textContent?.trim();
  professorSection.requests.textContent = pending && pending !== "0"
    ? `Open · ${pending}`
    : "Open";
}

function attachObservers() {
  const sourceMessage = document.querySelector(".registry-message");
  if (sourceMessage && !sourceMessageObserver) {
    sourceMessageObserver = new MutationObserver(mirrorOperationalMessage);
    sourceMessageObserver.observe(sourceMessage, {
      attributes: true,
      attributeFilter: ["data-state"],
      childList: true,
      characterData: true,
      subtree: true,
    });
  }

  const signOut = document.querySelector(".registry-sign-out");
  if (signOut && !authObserver) {
    authObserver = new MutationObserver(syncSignedOutState);
    authObserver.observe(signOut, { attributes: true, attributeFilter: ["hidden"] });
  }

  if (!currentObserver) {
    currentObserver = new MutationObserver(() => {
      simplifyIdentity();
      movePersistenceControls();
    });
    currentObserver.observe(currentExperiment, {
      attributes: true,
      attributeFilter: ["data-kind"],
      childList: true,
      characterData: true,
      subtree: true,
    });
  }

  if (!professorObserver) {
    professorObserver = new MutationObserver(syncProfessorSection);
    professorObserver.observe(professorButton, {
      attributes: true,
      attributeFilter: ["hidden"],
      childList: true,
      characterData: true,
      subtree: true,
    });
  }

}

function sync() {
  movePersistenceControls();
  simplifyIdentity();
  syncSignedOutState();
  syncProfessorSection();
  attachObservers();
}

sync();
