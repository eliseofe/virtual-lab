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

function installStyles() {
  if (document.querySelector("style[data-vlab-authoring-workspace]")) return;
  const style = document.createElement("style");
  style.dataset.vlabAuthoringWorkspace = "";
  style.textContent = `
    #authoring-workbench { padding: 18px; overflow: hidden; }
    .authoring-body { padding-top: 13px; }
    .authoring-pane[hidden] { display: none !important; }
    .authoring-pane-head { margin-bottom: 10px; }
    .authoring-pane-head h3 { margin: 0; font-size: 15px; }
    .authoring-pane-head .muted { margin: 4px 0 0; }
    #authoring-workbench textarea { min-height: 390px; }
    #authoring-workbench #apply-setup,
    #authoring-workbench #compile { display: none !important; }
    #additional-experiment-artifacts { display: contents; }
    #additional-experiment-artifacts > .generic-artifact-panel { margin: 0; padding: 0; border: 0; border-radius: 0; box-shadow: none; background: transparent; }
    #additional-experiment-artifacts > .generic-artifact-panel .editor-heading { margin-bottom: 10px; }
    .authoring-persistence { margin-top: 14px; padding-top: 13px; border-top: 1px solid #e5ebed; }
    .authoring-persistence[hidden] { display: none !important; }
    .authoring-persistence-head { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; margin-bottom: 8px; }
    .authoring-persistence-head strong { font-size: 12px; }
    .authoring-persistence-message { margin: 0; color: #64757c; font-size: 11.5px; line-height: 1.4; }
    .authoring-persistence-message[data-state="error"] { color: #9e2d29; }
    .authoring-persistence-message[data-state="success"] { color: #246240; }
    #authoring-persistence-slot { display: grid; gap: 8px; }
    #authoring-persistence-slot .registry-save-row { margin-top: 2px; }
    #authoring-persistence-slot .registry-note { margin-top: 0; }
    .technical-ir-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; padding: 0 15px 15px 37px; }
    .technical-ir-grid .ir-details { margin: 0; padding: 10px 0 0; }
    @media (max-width: 720px) {
      #authoring-workbench textarea { min-height: 330px; }
      .technical-ir-grid { grid-template-columns: 1fr; padding-left: 15px; }
    }
  `;
  document.head.append(style);
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
  for (const pane of workbench.querySelectorAll("[data-authoring-artifact-pane]")) {
    pane.hidden = pane !== nextPane;
  }
  for (const tab of tablist.querySelectorAll(".authoring-tab")) {
    const selected = tab === nextTab;
    tab.setAttribute("aria-selected", String(selected));
    tab.tabIndex = selected ? 0 : -1;
  }
  if (focus) nextTab.focus();
}

function updateRuntimeUi() {
  const dirty = setupDirty || controllerDirty;
  tabFor("configuration")?.toggleAttribute("data-dirty", setupDirty);
  tabFor("initialization")?.toggleAttribute("data-dirty", setupDirty);
  tabFor("controller")?.toggleAttribute("data-dirty", controllerDirty);

  if (pendingApply) {
    runtimeState.textContent = "Applying runtime changes…";
    runtimeState.dataset.state = "working";
    applyWorkspace.disabled = true;
    return;
  }
  if (dirty) {
    runtimeState.textContent = "Runtime changes pending";
    runtimeState.dataset.state = "dirty";
    const legacyButton = setupDirty ? applySetup : compileController;
    applyWorkspace.disabled = legacyButton.disabled;
    return;
  }
  const hasError = setupFeedback.dataset.state === "error" || controllerFeedback.dataset.state === "error";
  runtimeState.textContent = hasError ? "Runtime source has an error" : "Runtime sources applied";
  runtimeState.dataset.state = hasError ? "error" : "clean";
  applyWorkspace.disabled = true;
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

installStyles();
syncAdditionalArtifacts();
activateArtifact(activeArtifact);
updateRuntimeUi();
