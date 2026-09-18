const experimentPanel = document.querySelector(".experiment-panel");
const currentExperiment = document.querySelector(".experiment-current");
const experimentLabel = document.querySelector('label[for="experiment-select"]');
const experimentSelect = document.querySelector("#experiment-select");
const quickHint = document.querySelector(".experiment-quick-hint");
const browseButton = document.querySelector(".experiment-browse");
const accountButton = document.querySelector("#account-menu");
const legacyPersistence = document.querySelector("#authoring-persistence");
const legacyPersistenceSlot = document.querySelector("#authoring-persistence-slot");

if (!experimentPanel || !currentExperiment || !experimentLabel || !experimentSelect || !browseButton
  || !accountButton || !legacyPersistence || !legacyPersistenceSlot) {
  throw new Error("Experiment management UI mismatch.");
}

function installStyles() {
  if (document.querySelector("style[data-vlab-experiment-management]")) return;
  const style = document.createElement("style");
  style.dataset.vlabExperimentManagement = "";
  style.textContent = `
    .experiment-current { margin-bottom: 0 !important; padding-bottom: 0 !important; border-bottom: 0 !important; }
    .experiment-location[data-management-redundant="true"] { display: none !important; }
    .experiment-management { display: grid; gap: 8px; margin-top: 10px; padding-top: 10px; border-top: 1px solid #e5ebee; }
    .experiment-management[hidden] { display: none !important; }
    .experiment-management-status { margin: 0; min-height: 0; color: #64757c; font-size: 11.5px; line-height: 1.4; }
    .experiment-management-status:empty { display: none; }
    .experiment-management-status[data-state="error"] { color: #9e2d29; }
    .experiment-management-status[data-state="success"] { color: #246240; }
    .experiment-management-slot { display: grid; gap: 8px; }
    .experiment-management-slot .registry-save-row,
    .experiment-management-slot .registry-new-form { margin: 0; }
    .experiment-management-slot .registry-note { margin: 0; }
    .experiment-sign-in-save { justify-self: start; min-height: 36px; }
    @media (max-width: 680px) {
      .experiment-current-main { display: grid; grid-template-columns: minmax(0, 1fr); }
      .experiment-browse,
      .experiment-sign-in-save,
      .experiment-management-slot .registry-save-actions button { min-height: 44px; }
      .experiment-browse,
      .experiment-sign-in-save { width: 100%; }
      .experiment-management-slot .registry-save-actions { display: grid; grid-template-columns: 1fr; }
      .experiment-management-slot .registry-new-actions { display: grid; grid-template-columns: 1fr; }
      .experiment-management-slot .registry-new-actions button { min-height: 44px; }
    }
  `;
  document.head.append(style);
}

function buildManagementRegion() {
  const region = document.createElement("section");
  region.className = "experiment-management";
  region.setAttribute("aria-label", "Experiment save and management");

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
  currentExperiment.insertAdjacentElement("afterend", region);
  return { region, status, slot, signIn };
}

installStyles();
const management = buildManagementRegion();
let sourceMessageObserver = null;
let authObserver = null;
let currentObserver = null;

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
  setText(browseButton, "Switch experiment");

  const location = document.querySelector(".experiment-location");
  const locationText = location?.textContent?.trim();
  if (location) {
    const redundant = String(locationText === "Built-in" || locationText === "No collection");
    if (location.dataset.managementRedundant !== redundant) location.dataset.managementRedundant = redundant;
  }

  const save = document.querySelector(".registry-save-actions .primary");
  const saveAsNew = document.querySelector(".registry-save-actions button:not(.primary)");
  setText(save, "Save");
  if (locationText === "Student experiment" || locationText === "Shared with me") setText(saveAsNew, "Copy to my Experiments…");
  else setText(saveAsNew, "Save as new…");
}

function syncSignedOutState() {
  const isSignedIn = signedIn();
  management.signIn.hidden = isSignedIn;
  const note = management.slot.querySelector(".registry-note");
  if (note) note.hidden = !isSignedIn;
  mirrorOperationalMessage();
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
}

function sync() {
  movePersistenceControls();
  simplifyIdentity();
  syncSignedOutState();
  attachObservers();
}

sync();
