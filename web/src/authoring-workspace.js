import { authoringModel, setArtifactDirty } from "./authoring-panel/authoring-model.js";
import { provideAuthoringCommands } from "./authoring-panel/authoring-commands.js";

const workbench = document.querySelector("#authoring-workbench");
const tablist = document.querySelector("#authoring-tabs");
const applyWorkspace = document.querySelector("#apply-workspace");
const runtimeState = document.querySelector("#authoring-runtime-state");
const applySetup = document.querySelector("#apply-setup");
const compileController = document.querySelector("#compile");
const setupFeedback = document.querySelector("#setup-feedback");
const controllerFeedback = document.querySelector("#compile-feedback");
const additionalArtifacts = document.querySelector("#additional-experiment-artifacts");
const persistence = document.querySelector("#authoring-persistence");
const persistenceSlot = document.querySelector("#authoring-persistence-slot");
const persistenceMessage = document.querySelector("#authoring-persistence-message");

if (!workbench || !tablist || !applyWorkspace || !runtimeState || !applySetup || !compileController
  || !setupFeedback || !controllerFeedback || !additionalArtifacts || !persistence
  || !persistenceSlot || !persistenceMessage) {
  throw new Error("Authoring workspace UI mismatch.");
}

let activeArtifact = "configuration";
let setupDirty = false;
let controllerDirty = false;
let pendingApply = null;

function paneFor(id) {
  return workbench.querySelector(`[data-authoring-artifact-pane="${CSS.escape(id)}"]`);
}

function tabFor(id) {
  return tablist.querySelector(`[data-artifact-id="${CSS.escape(id)}"]`);
}

function activateArtifact(id, { focus = false } = {}) {
  const nextPane = paneFor(id);
  const nextTab = tabFor(id);
  if (!nextPane || !nextTab) return;
  activeArtifact = id;
  authoringModel.set({ active: id });
  for (const pane of workbench.querySelectorAll("[data-authoring-artifact-pane]")) {
    pane.hidden = pane !== nextPane;
  }
  for (const tab of tablist.querySelectorAll(".authoring-tab")) {
    const selected = tab.dataset.artifactId === authoringModel.get().active;
    tab.setAttribute("aria-selected", String(selected));
    tab.tabIndex = selected ? 0 : -1;
  }
  if (focus) nextTab.focus();
}

function updateRuntimeUi() {
  const dirty = setupDirty || controllerDirty;
  for (const [id, value] of [["configuration", setupDirty], ["initialization", setupDirty], ["controller", controllerDirty]]) {
    setArtifactDirty(id, value);
    tabFor(id)?.toggleAttribute("data-dirty", authoringModel.get().dirty[id]);
  }

  if (pendingApply) {
    showRuntimeStatus({ text: "Applying runtime changes…", state: "working" }, true);
    return;
  }
  if (dirty) {
    const legacyButton = setupDirty ? applySetup : compileController;
    showRuntimeStatus({ text: "Runtime changes pending", state: "dirty" }, legacyButton.disabled);
    return;
  }
  const hasError = setupFeedback.dataset.state === "error" || controllerFeedback.dataset.state === "error";
  showRuntimeStatus(hasError
    ? { text: "Runtime source has an error", state: "error" }
    : { text: "Runtime sources applied", state: "clean" }, true);
}

// The runtime-apply status lives in the authoring model; the page shows it.
function showRuntimeStatus(status, applyDisabled) {
  authoringModel.set({ status: Object.freeze(status), applyDisabled });
  runtimeState.textContent = authoringModel.get().status.text;
  runtimeState.dataset.state = authoringModel.get().status.state;
  applyWorkspace.disabled = authoringModel.get().applyDisabled;
}

function markSetupDirty() {
  setupDirty = true;
  updateRuntimeUi();
}

function markControllerDirty() {
  controllerDirty = true;
  updateRuntimeUi();
}

document.querySelector("#experiment-config")?.addEventListener("input", markSetupDirty);
document.querySelector("#initializer-source")?.addEventListener("input", markSetupDirty);
document.querySelector("#controller-source")?.addEventListener("input", markControllerDirty);

applyWorkspace.addEventListener("click", () => {
  if (pendingApply) return;
  if (setupDirty) {
    pendingApply = "setup";
    updateRuntimeUi();
    applySetup.click();
    return;
  }
  if (controllerDirty) {
    pendingApply = "controller";
    updateRuntimeUi();
    compileController.click();
  }
});

function handleLegacyApplyClick(kind) {
  if (pendingApply) return;
  pendingApply = kind === "setup" ? "external-setup" : "external-controller";
  updateRuntimeUi();
}

applySetup.addEventListener("click", () => handleLegacyApplyClick("setup"));
compileController.addEventListener("click", () => handleLegacyApplyClick("controller"));

function settleFromFeedback() {
  if (!pendingApply) {
    updateRuntimeUi();
    return;
  }
  const setupState = setupFeedback.dataset.state;
  const controllerState = controllerFeedback.dataset.state;
  if (pendingApply.includes("setup")) {
    if (setupState === "success") {
      setupDirty = false;
      controllerDirty = false;
      pendingApply = null;
    } else if (setupState === "error") {
      pendingApply = null;
    }
  } else if (pendingApply.includes("controller")) {
    if (controllerState === "success") {
      controllerDirty = false;
      pendingApply = null;
    } else if (controllerState === "error") {
      pendingApply = null;
    }
  }
  updateRuntimeUi();
}

const feedbackObserver = new MutationObserver(settleFromFeedback);
for (const feedback of [setupFeedback, controllerFeedback]) {
  feedbackObserver.observe(feedback, { attributes: true, attributeFilter: ["data-state"], childList: true, characterData: true, subtree: true });
}
const enabledObserver = new MutationObserver(updateRuntimeUi);
enabledObserver.observe(applySetup, { attributes: true, attributeFilter: ["disabled"] });
enabledObserver.observe(compileController, { attributes: true, attributeFilter: ["disabled"] });

function makeTab(id, label, controls) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "authoring-tab";
  button.dataset.artifactId = id;
  button.setAttribute("role", "tab");
  button.setAttribute("aria-controls", controls);
  button.setAttribute("aria-selected", "false");
  button.tabIndex = -1;
  button.textContent = label;
  return button;
}

function syncAdditionalArtifacts() {
  const presentIds = new Set();
  for (const panel of additionalArtifacts.querySelectorAll(".generic-artifact-panel")) {
    const editor = panel.querySelector('[data-experiment-artifact-editor="true"]');
    const id = editor?.dataset.experimentArtifactId;
    if (!id) continue;
    presentIds.add(id);
    panel.dataset.authoringArtifactPane = id;
    panel.setAttribute("role", "tabpanel");
    panel.id = `authoring-pane-${id.replace(/[^a-zA-Z0-9_-]/g, "-")}`;
    let tab = tabFor(id);
    if (!tab) {
      tab = makeTab(id, editor.dataset.experimentArtifactLabel || id, panel.id);
      tablist.append(tab);
    } else {
      tab.setAttribute("aria-controls", panel.id);
      tab.textContent = editor.dataset.experimentArtifactLabel || id;
    }
  }

  for (const tab of [...tablist.querySelectorAll(".authoring-tab[data-dynamic-artifact='true']")]) {
    if (!presentIds.has(tab.dataset.artifactId)) tab.remove();
  }
  for (const tab of tablist.querySelectorAll(".authoring-tab")) {
    if (!["configuration", "initialization", "controller", "metrics"].includes(tab.dataset.artifactId)) {
      tab.dataset.dynamicArtifact = "true";
    }
  }
  if (!paneFor(activeArtifact)) activeArtifact = "configuration";
  authoringModel.set({
    artifacts: Object.freeze([...tablist.querySelectorAll(".authoring-tab")].map((tab) => Object.freeze({
      id: tab.dataset.artifactId,
      label: tab.textContent?.trim() || tab.dataset.artifactId,
      controls: tab.getAttribute("aria-controls"),
    }))),
  });
  activateArtifact(activeArtifact);
}

const additionalObserver = new MutationObserver(syncAdditionalArtifacts);
additionalObserver.observe(additionalArtifacts, { childList: true });

function handleTabClick(event) {
  const tab = event.target.closest(".authoring-tab");
  if (!tab || !tablist.contains(tab)) return;
  activateArtifact(tab.dataset.artifactId, { focus: true });
}

tablist.addEventListener("click", handleTabClick);
tablist.addEventListener("keydown", (event) => {
  if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
  const tabs = [...tablist.querySelectorAll(".authoring-tab")];
  const current = tabs.findIndex((tab) => tab.dataset.artifactId === activeArtifact);
  let next = current;
  if (event.key === "ArrowLeft") next = (current - 1 + tabs.length) % tabs.length;
  if (event.key === "ArrowRight") next = (current + 1) % tabs.length;
  if (event.key === "Home") next = 0;
  if (event.key === "End") next = tabs.length - 1;
  event.preventDefault();
  activateArtifact(tabs[next].dataset.artifactId, { focus: true });
});

let registryMessageObserver = null;
function attachPersistenceUi() {
  const registryPanel = document.querySelector(".registry-panel");
  if (!registryPanel) return false;
  for (const selector of [".registry-save-row", ".registry-new-form", ".registry-note"]) {
    const element = document.querySelector(selector);
    if (element && element.parentElement !== persistenceSlot) persistenceSlot.append(element);
  }

  const sourceMessage = registryPanel.querySelector(".registry-message");
  if (sourceMessage && !registryMessageObserver) {
    const mirror = () => {
      persistenceMessage.textContent = sourceMessage.textContent;
      persistenceMessage.dataset.state = sourceMessage.dataset.state || "idle";
    };
    mirror();
    registryMessageObserver = new MutationObserver(mirror);
    registryMessageObserver.observe(sourceMessage, { attributes: true, attributeFilter: ["data-state"], childList: true, characterData: true, subtree: true });
  }
  persistence.hidden = persistenceSlot.childElementCount === 0;
  return true;
}

if (!attachPersistenceUi()) {
  const discoveryObserver = new MutationObserver(() => {
    if (attachPersistenceUi()) discoveryObserver.disconnect();
  });
  discoveryObserver.observe(document.body, { childList: true, subtree: true });
}
// The authoring controller (#564). Apply still runs through the Apply button,
// which the metrics runtime intercepts for Metrics-only edits.
provideAuthoringCommands({
  selectArtifact: (id) => activateArtifact(id, { focus: true }),
  apply: () => applyWorkspace.click(),
});

syncAdditionalArtifacts();
activateArtifact(activeArtifact);
updateRuntimeUi();
