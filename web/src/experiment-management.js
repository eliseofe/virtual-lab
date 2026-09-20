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
    .experiment-control-head {
      display: flex;
      align-items: end;
      justify-content: space-between;
      gap: 18px;
      margin-bottom: 14px;
      padding-bottom: 13px;
      border-bottom: 1px solid #e2e8ea;
    }
    .experiment-control-heading { display: grid; gap: 2px; min-width: 0; }
    .experiment-control-kicker {
      margin: 0;
      color: #17758d;
      font-size: 10.5px;
      font-weight: 800;
      letter-spacing: .12em;
      text-transform: uppercase;
    }
    .experiment-control-title { margin: 0; color: #172127; font-size: 18px; line-height: 1.2; }
    .experiment-control-help {
      margin: 0;
      max-width: 44rem;
      color: #66777e;
      font-size: 11.5px;
      line-height: 1.45;
    }
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
    .experiment-task-heading span {
      color: #7a898f;
      font-size: 10.5px;
      line-height: 1.35;
      text-align: right;
    }
    .experiment-current { margin: 0 !important; padding: 0 !important; border: 0 !important; }
    .experiment-current-main { align-items: center !important; }
    .experiment-current-title { font-size: 15px !important; }
    .experiment-current-meta { gap: 7px !important; }
    .experiment-location[data-management-redundant="true"] { display: none !important; }
    .experiment-origin, .experiment-location { min-height: 26px !important; }
    .experiment-browse { min-height: 38px; padding: 7px 12px; white-space: nowrap; }
    .experiment-quick-hint { display: none !important; }
    .experiment-revision-workflow {
      display: grid;
      gap: 10px;
      align-content: start;
      padding: 0 !important;
      border: 0 !important;
      background: transparent !important;
    }
    .experiment-task-revisions,
    .experiment-management {
      display: grid;
      grid-template-rows: auto 1fr;
      align-content: stretch;
      min-height: 154px;
    }
    .experiment-revision-actions,
    .experiment-management-slot .registry-save-actions,
    .experiment-management-slot .registry-new-actions {
      display: grid !important;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 8px !important;
      align-items: stretch !important;
    }
    .experiment-revision-actions button,
    .experiment-management-slot .registry-save-actions button,
    .experiment-management-slot .registry-new-actions button,
    .experiment-management-slot .registry-move-row button,
    .experiment-management-slot .registry-share-form button,
    .experiment-sign-in-save {
      min-height: 38px !important;
      padding: 7px 12px !important;
      font-size: 11.5px !important;
    }
    .experiment-revision-workflow[hidden] { display: none !important; }
    .experiment-task-revisions:has(.experiment-revision-workflow[hidden]) { display: none; }
    .experiment-management {
      gap: 10px;
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
    .experiment-management-slot .registry-save-row,
    .experiment-management-slot .registry-new-form { margin: 0; }
    .experiment-management-slot .registry-note { margin: 0; }
    .experiment-sign-in-save { justify-self: stretch; width: 100%; }
    .experiment-current-actions { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 7px; }
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
      grid-auto-rows: 1fr;
      gap: 12px;
    }
    .experiment-professor-group {
      display: grid;
      grid-template-rows: auto 1fr auto;
      align-content: stretch;
      gap: 8px;
      min-width: 0;
      min-height: 132px;
      padding: 12px;
      border: 1px solid #e4dfeb;
      border-radius: 10px;
      background: #fff;
    }
    .experiment-professor-group strong { color: #554a61; font-size: 11px; }
    .experiment-professor-group p { margin: 0; color: #786e82; font-size: 10.5px; line-height: 1.4; }
    .experiment-professor-actions {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 8px;
      align-items: stretch;
    }
    .experiment-professor-actions button {
      width: 100%;
      min-height: 38px;
      padding: 7px 12px;
      font-size: 11.5px;
    }
    .experiment-professor-section .showcase-curation-status { margin: 0; }
    .experiment-organize {
      min-height: 30px !important;
      padding: 4px 10px !important;
      border-radius: 999px !important;
      font-size: 10.5px !important;
      font-weight: 700 !important;
    }
    @media (max-width: 680px) {
      .experiment-control-head { align-items: stretch; flex-direction: column; gap: 6px; }
      .experiment-control-grid { grid-template-columns: 1fr; }
      .experiment-task-current, .experiment-professor-section { grid-column: auto; }
      .experiment-current-main { display: grid !important; grid-template-columns: minmax(0, 1fr); align-items: stretch !important; }
      .experiment-browse,
      .experiment-sign-in-save,
      .experiment-revision-actions button,
      .experiment-management-slot .registry-save-actions button,
      .experiment-management-slot .registry-new-actions button,
      .experiment-management-slot .registry-move-row button,
      .experiment-management-slot .registry-share-form button,
      .experiment-professor-actions button { min-height: 44px !important; }
      .experiment-browse,
      .experiment-sign-in-save { width: 100%; }
      .experiment-current-actions { display: grid; grid-template-columns: 1fr; width: 100%; }
      .experiment-revision-actions,
      .experiment-management-slot .registry-save-actions,
      .experiment-management-slot .registry-new-actions,
      .experiment-professor-actions { grid-template-columns: 1fr !important; }
      .experiment-professor-groups { grid-template-columns: 1fr; }
      .experiment-task-revisions,
      .experiment-management,
      .experiment-professor-group { min-height: 0; }
      .experiment-task-heading { align-items: flex-start; flex-direction: column; }
      .experiment-task-heading span { text-align: left; }
    }
  `;
  document.head.append(style);
}

function taskHeading(title, help) {
  const heading = document.createElement("div");
  heading.className = "experiment-task-heading";
  const label = document.createElement("strong");
  label.textContent = title;
  const description = document.createElement("span");
  description.textContent = help;
  heading.append(label, description);
  return heading;
}

function buildControlPanel() {
  const head = document.createElement("header");
  head.className = "experiment-control-head";
  const heading = document.createElement("div");
  heading.className = "experiment-control-heading";
  const kicker = document.createElement("p");
  kicker.className = "experiment-control-kicker";
  kicker.textContent = "Experiment";
  const title = document.createElement("h2");
  title.className = "experiment-control-title";
  title.textContent = "Control panel";
  const help = document.createElement("p");
  help.className = "experiment-control-help";
  help.textContent = "Open, revise, organize and share the current Experiment from one place.";
  heading.append(kicker, title);
  head.append(heading, help);

  const grid = document.createElement("div");
  grid.className = "experiment-control-grid";

  currentExperiment.classList.add("experiment-task-card", "experiment-task-current");
  currentExperiment.insertBefore(
    taskHeading("Current Experiment", "Identity, access and organization"),
    currentExperiment.firstChild,
  );

  const revisionTask = document.createElement("section");
  revisionTask.className = "experiment-task-card experiment-task-revisions";
  revisionTask.setAttribute("aria-label", "Experiment revisions");
  revisionTask.append(
    taskHeading("Revisions", "Working copy and numbered history"),
    revisionWorkflow,
  );

  experimentPanel.prepend(head);
  grid.append(currentExperiment, revisionTask);
  experimentPanel.append(grid);
  return { head, grid, revisionTask };
}

function buildManagementRegion() {
  const region = document.createElement("section");
  region.className = "experiment-task-card experiment-management";
  region.setAttribute("aria-label", "Save and share Experiment");
  region.append(taskHeading("Save & share", "Persistence, copies and collaboration"));

  const status = document.createElement("p");
  status.className = "experiment-management-status";
  status.setAttribute("role", "status");
  status.setAttribute("aria-live", "polite");

  const slot = document.createElement("div");
  slot.className = "experiment-management-slot";

  const signIn = document.createElement("button");
  signIn.type = "button";
  signIn.className = "experiment-sign-in-save primary";
  signIn.textContent = "Sign in to save";
  signIn.addEventListener("click", () => accountButton.click());

  region.append(status, slot, signIn);
  return { region, status, slot, signIn };
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
  region.setAttribute("aria-label", "Research curation");
  region.append(taskHeading("Research curation", "Showcase publication and scientific capability requests"));

  const groups = document.createElement("div");
  groups.className = "experiment-professor-groups";

  const showcaseGroup = document.createElement("div");
  showcaseGroup.className = "experiment-professor-group";
  const showcaseTitle = document.createElement("strong");
  showcaseTitle.textContent = "Showcase";
  const showcaseHelp = document.createElement("p");
  showcaseHelp.textContent = "Browse curated Experiments or publish the current scientific state.";
  const showcaseActions = document.createElement("div");
  showcaseActions.className = "experiment-professor-actions";
  showcaseLauncher.textContent = "Browse Showcase";
  showcaseActions.append(showcaseLauncher, promote);
  showcaseGroup.append(showcaseTitle, showcaseHelp, showcaseActions, curationStatus);

  const capabilityGroup = document.createElement("div");
  capabilityGroup.className = "experiment-professor-group";
  const capabilityTitle = document.createElement("strong");
  capabilityTitle.textContent = "Capability requests";
  const capabilityHelp = document.createElement("p");
  capabilityHelp.textContent = "Review scientific needs that the current Lab cannot yet express or run.";
  const capabilityActions = document.createElement("div");
  capabilityActions.className = "experiment-professor-actions";
  const requests = document.createElement("button");
  requests.type = "button";
  requests.className = "experiment-capability-requests";
  requests.textContent = "Capability requests";
  requests.addEventListener("click", () => {
    const inbox = document.querySelector(".professor-inbox-open");
    if (inbox instanceof HTMLButtonElement && !inbox.disabled) inbox.click();
    else professorButton.click();
  });
  capabilityActions.append(requests);
  capabilityGroup.append(capabilityTitle, capabilityHelp, capabilityActions);

  groups.append(showcaseGroup, capabilityGroup);
  region.append(groups);

  const currentActions = currentMain.querySelector(".experiment-current-actions");
  if (currentActions?.contains(browseButton)) currentActions.replaceWith(browseButton);

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
  if (state !== "error" && state !== "success") {
    setText(management.status, "");
    management.status.dataset.state = "idle";
    return;
  }
  setText(management.status, source.textContent?.trim() || "");
  management.status.dataset.state = state;
}

function movePersistenceControls() {
  for (const selector of [".registry-save-row", ".registry-new-form", ".registry-note"]) {
    const element = document.querySelector(selector);
    if (element && element.parentElement !== management.slot) management.slot.append(element);
  }
  legacyPersistence.hidden = true;
  legacyPersistence.setAttribute("aria-hidden", "true");
}

function simplifyIdentity() {
  experimentLabel.hidden = true;
  experimentSelect.hidden = true;
  experimentSelect.setAttribute("aria-hidden", "true");
  if (quickHint) quickHint.hidden = true;
  setText(browseButton, "Experiments");

  const origin = document.querySelector(".experiment-origin");
  const location = document.querySelector(".experiment-location");
  const locationText = location?.textContent?.trim() || "";
  if (location) {
    const redundant = String(locationText === "Built-in" || locationText === "No collection");
    if (location.dataset.managementRedundant !== redundant) location.dataset.managementRedundant = redundant;
  }

  if (origin?.dataset.kind === "owned") setText(origin, "My Experiment");
  else if (origin?.dataset.kind === "readonly" && locationText !== "Built-in") setText(origin, "Read-only");

  const saveRevision = document.querySelector(".experiment-revision-actions .primary");
  if (saveRevision) setText(saveRevision, "Save Revision");

  const saveAsNew = document.querySelector(".registry-save-actions button:not(.primary)");
  if (locationText === "Student experiment" || locationText === "Shared with me") {
    setText(saveAsNew, "Copy to my Experiments…");
  } else {
    setText(saveAsNew, "Save as new…");
  }
}

function syncSignedOutState() {
  const isSignedIn = signedIn();
  management.signIn.hidden = isSignedIn;
  const note = management.slot.querySelector(".registry-note");
  if (note) note.hidden = !isSignedIn;
  mirrorOperationalMessage();
}

function syncProfessorSection() {
  const available = !professorButton.hidden;
  professorSection.region.hidden = !available;
  professorSection.requests.disabled = !available;
  const pending = document.querySelector(".professor-pending-count")?.textContent?.trim();
  professorSection.requests.textContent = pending && pending !== "0"
    ? `Capability requests · ${pending}`
    : "Capability requests";
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
