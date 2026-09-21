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

function installStyles() {
  if (document.querySelector("style[data-vlab-experiment-management]")) return;
  const style = document.createElement("style");
  style.dataset.vlabExperimentManagement = "";
  style.textContent = `
    .experiment-control-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      align-items: stretch;
      gap: 12px;
    }
    .experiment-task-card {
      min-width: 0;
      padding: 14px;
      border: 1px solid #dfe7ea;
      border-radius: 12px;
      background: #fbfcfc;
    }
    .experiment-task-current {
      grid-column: 1 / -1;
      display: grid;
      gap: 9px;
      background: #fff;
      border-color: #d3e0e4;
    }
    .experiment-current-main {
      display: block !important;
    }
    .experiment-current-context {
      display: grid;
      gap: 5px;
      min-width: 0;
    }
    .experiment-current-actions {
      display: flex;
      flex-wrap: wrap;
      align-items: stretch;
      gap: 8px;
      width: fit-content;
      max-width: 100%;
    }
    .experiment-task-heading {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      gap: 10px;
      margin-bottom: 8px;
    }
    .experiment-task-heading strong {
      color: #344a54;
      font-size: 11px;
      letter-spacing: .055em;
      text-transform: uppercase;
    }
    .experiment-current { margin: 0 !important; padding: 0 !important; border: 0 !important; }
    .experiment-current-title {
      display: block;
      max-width: 70ch;
      font-size: 15px !important;
      line-height: 1.35;
    }
    .experiment-current-meta {
      display: grid !important;
      justify-items: start;
      gap: 4px !important;
    }
    .experiment-origin,
    .experiment-location {
      min-height: 0 !important;
      padding: 0 !important;
      border: 0 !important;
      border-radius: 0 !important;
      background: transparent !important;
      font-size: 10.75px !important;
      line-height: 1.35;
    }
    .experiment-origin {
      color: #687980 !important;
      font-weight: 700 !important;
    }
    .experiment-origin[data-management-default="true"],
    .experiment-location[data-management-redundant="true"] {
      display: none !important;
    }
    .experiment-location {
      color: #64757c !important;
      font-weight: 600 !important;
    }
    .experiment-browse,
    .experiment-organize {
      min-height: 44px !important;
      padding: 8px 12px !important;
      border-radius: 10px !important;
      font-size: 11.5px !important;
      white-space: nowrap;
    }
    .experiment-browse {
      font-weight: 700 !important;
    }
    .experiment-quick-hint { display: none !important; }
    .experiment-revision-workflow {
      display: grid;
      gap: 10px;
      align-content: start;
      padding: 0 !important;
      border: 0 !important;
      background: transparent !important;
    }
    .experiment-revision-trigger {
      display: inline-flex !important;
      align-items: center !important;
      justify-content: center !important;
      width: auto !important;
      min-width: 3ch !important;
      min-height: 44px !important;
      padding: 6px 12px !important;
      flex: 0 0 auto !important;
      text-align: center !important;
    }
    .experiment-revision-trigger > span,
    .experiment-revision-trigger > b {
      display: none !important;
    }
    .experiment-revision-trigger > strong {
      min-width: 0 !important;
      font-size: 13px !important;
      text-align: center;
    }
    .experiment-task-revisions,
    .experiment-management {
      display: grid;
      align-content: start;
      gap: 8px;
    }
    .experiment-revision-top {
      display: grid !important;
      grid-template-columns: max-content minmax(0, 1fr);
      align-items: stretch !important;
      gap: 8px !important;
    }
    .experiment-revision-actions,
    .experiment-management-slot .registry-new-actions {
      display: flex !important;
      align-items: stretch !important;
      gap: 8px !important;
    }
    .experiment-revision-actions button,
    .experiment-management-slot .registry-new-actions button {
      flex: 1 1 0;
    }
    .experiment-revision-actions button,
    .experiment-management-slot .registry-new-actions button,
    .experiment-management-slot .registry-share-form button,
    .experiment-sign-in-save {
      min-height: 44px !important;
      padding: 8px 12px !important;
      font-size: 11.5px !important;
    }
    .experiment-revision-workflow[hidden] { display: none !important; }
    .experiment-task-revisions:has(.experiment-revision-workflow[hidden]) { display: none; }
    .experiment-management-actions {
      display: flex;
      align-items: stretch;
      gap: 8px;
    }
    .experiment-management-actions button {
      flex: 1 1 0;
      width: auto;
      min-height: 44px !important;
      padding: 8px 10px !important;
      white-space: nowrap;
    }
    .experiment-management[hidden] { display: none !important; }
    .experiment-management-status {
      margin: 0;
      min-height: 0;
      color: #64757c;
      font-size: 11.5px;
      line-height: 1.4;
    }
    .experiment-management-status:empty { display: none; }
    .experiment-management-status[data-state="error"] { color: #9e2d29; }
    .experiment-management-status[data-state="success"] { color: #246240; }
    .experiment-management-slot { display: grid; gap: 8px; }
    .experiment-management-slot .registry-share-row,
    .experiment-management-slot .registry-new-form { margin: 0; }
    .experiment-sign-in-save { justify-self: stretch; width: 100%; }
    .experiment-professor-section {
      grid-column: 1 / -1;
      display: grid;
      gap: 12px;
      background: #f8f7fb;
      border-color: #e2ddea;
    }
    .experiment-professor-section[hidden] { display: none !important; }
    .experiment-professor-groups {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      align-items: stretch;
      gap: 12px;
    }
    .experiment-professor-group {
      display: flex;
      flex-direction: column;
      gap: 8px;
      min-width: 0;
      padding: 12px;
      border: 1px solid #e4dfeb;
      border-radius: 10px;
      background: #fff;
    }
    .experiment-professor-group strong { color: #554a61; font-size: 11px; }
    .experiment-professor-group p { margin: 0; color: #786e82; font-size: 10.5px; line-height: 1.4; }
    .experiment-professor-actions {
      display: flex;
      align-items: stretch;
      gap: 8px;
      margin-top: auto;
    }
    .experiment-professor-actions button {
      flex: 1 1 0;
      width: auto;
      min-height: 44px;
      padding: 8px 12px;
      font-size: 11.5px;
    }
    .experiment-professor-section .showcase-curation-status { margin: 0; }
    .experiment-professor-section .showcase-curation-status:empty { display: none; }
    @media (max-width: 680px) {
      .experiment-control-grid { grid-template-columns: 1fr; }
      .experiment-task-current, .experiment-professor-section { grid-column: auto; }
      .experiment-current-actions {
        width: 100%;
      }
      .experiment-current-actions button {
        flex: 1 1 150px;
      }
      .experiment-browse,
      .experiment-sign-in-save,
      .experiment-revision-actions button,
      .experiment-management-slot .registry-new-actions button,
      .experiment-management-slot .registry-share-form button,
      .experiment-professor-actions button { min-height: 44px !important; }
      .experiment-sign-in-save { width: 100%; }
      .experiment-revision-top { grid-template-columns: 1fr; }
      .experiment-revision-trigger { width: 100% !important; }
      .experiment-revision-actions,
      .experiment-management-slot .registry-new-actions,
      .experiment-professor-actions,
      .experiment-management-actions { flex-wrap: wrap; }
      .experiment-professor-groups { grid-template-columns: 1fr; }
      .experiment-task-revisions,
      .experiment-management,
      .experiment-professor-group { min-height: 0; }
      .experiment-task-heading { align-items: flex-start; }
    }
  `;
  document.head.append(style);
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
  experimentPanel.setAttribute("aria-label", "Control Panel");

  const grid = document.createElement("div");
  grid.className = "experiment-control-grid";

  currentExperiment.classList.add("experiment-task-card", "experiment-task-current");
  currentExperiment.insertBefore(
    taskHeading("Current Experiment"),
    currentExperiment.firstChild,
  );

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
  return { grid, revisionTask };
}

function buildManagementRegion() {
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
  signIn.className = "experiment-sign-in-save primary";
  signIn.textContent = "Sign in to save";
  signIn.addEventListener("click", () => accountButton.click());

  region.append(status, actions, slot, signIn);
  return { region, status, actions, slot, signIn, saveAsNew, shareOpen };
}

function buildProfessorSection() {
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
  if (legacyCurrentActions?.childElementCount === 0) legacyCurrentActions.remove();
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

installStyles();
const control = buildControlPanel();
const management = buildManagementRegion();
const professorSection = buildProfessorSection();
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
    } else if (!owned && locationText !== "Built-in") {
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
