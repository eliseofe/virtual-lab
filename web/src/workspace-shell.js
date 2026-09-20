import "./registry-ui-v3.js";
import "./student-registration.js";
import "./student-onboarding.js";
import "./showcase.js";
import "./showcase-professor-placement.js";
import "./results-presentation-bridge.js";
import "./authoring-workspace.js";
import "./collection-organization.js";
import "./experiment-management.js";
import "./ux-hardening.js";
import "./ui-clarity.js";

const utilityDialog = document.querySelector("#workspace-utilities");
const utilityContent = document.querySelector("#workspace-utility-content");
const utilityLoading = document.querySelector("#utility-loading");
const accountButton = document.querySelector("#account-menu");
const professorButton = document.querySelector("#professor-menu");
const closeButton = document.querySelector("#utility-close");
const utilityHeading = utilityDialog?.querySelector(".utility-dialog-head h2");
const experimentPanel = document.querySelector(".experiment-panel");

if (!utilityDialog || !utilityContent || !utilityLoading || !accountButton || !professorButton || !closeButton || !utilityHeading || !experimentPanel) {
  throw new Error("Workspace shell UI mismatch.");
}

const professorBridge = document.createElement("section");
professorBridge.className = "control-panel-professor-bridge";
professorBridge.hidden = true;
professorBridge.setAttribute("aria-label", "Professor actions");

const professorBridgeLabel = document.createElement("strong");
professorBridgeLabel.textContent = "Professor";
const professorBridgeActions = document.createElement("div");
professorBridgeActions.className = "control-panel-professor-actions";

const showcaseBridge = document.createElement("button");
showcaseBridge.type = "button";
showcaseBridge.textContent = "Showcase";

const capabilityBridge = document.createElement("button");
capabilityBridge.type = "button";
capabilityBridge.textContent = "Capability requests";

professorBridgeActions.append(showcaseBridge, capabilityBridge);
professorBridge.append(professorBridgeLabel, professorBridgeActions);
experimentPanel.append(professorBridge);

const professorBridgeStyle = document.createElement("style");
professorBridgeStyle.dataset.vlabProfessorBridge = "";
professorBridgeStyle.textContent = `
  .control-panel-professor-bridge {
    display: flex; align-items: center; justify-content: space-between; gap: 12px;
    margin-top: 10px; padding-top: 10px; border-top: 1px solid #e4eaec;
  }
  .control-panel-professor-bridge[hidden] { display: none !important; }
  .control-panel-professor-bridge > strong { color: #52656d; font-size: 11px; text-transform: uppercase; letter-spacing: .08em; }
  .control-panel-professor-actions { display: flex; flex-wrap: wrap; gap: 7px; justify-content: flex-end; }
  .control-panel-professor-actions button { min-height: 34px; padding: 5px 10px; }
  @media (max-width: 680px) {
    .control-panel-professor-bridge { align-items: stretch; flex-direction: column; }
    .control-panel-professor-actions { display: grid; grid-template-columns: 1fr; }
    .control-panel-professor-actions button { min-height: 44px; width: 100%; }
  }
`;
document.head.append(professorBridgeStyle);

let utilityTarget = "account";

function movePanel(panel) {
  if (!panel || panel.parentElement === utilityContent) return;
  utilityContent.append(panel);
}

function setHidden(element, hidden) {
  if (element.hidden !== hidden) element.hidden = hidden;
}

function setText(element, text) {
  if (element.textContent !== text) element.textContent = text;
}

function syncUtilityPanels() {
  const accountPanel = document.querySelector(".registry-panel");
  const professorPanel = document.querySelector(".professor-panel");

  movePanel(accountPanel);
  movePanel(professorPanel);

  setHidden(utilityLoading, Boolean(accountPanel));

  const professorAvailable = Boolean(professorPanel && !professorPanel.hidden);
  setHidden(professorButton, !professorAvailable);

  const pendingCount = professorPanel?.querySelector(".professor-pending-count")?.textContent?.trim();
  const professorLabel = professorAvailable && pendingCount && pendingCount !== "0"
    ? `Professor · ${pendingCount}`
    : "Professor";
  setText(professorButton, professorLabel);
  syncProfessorBridge();

  if (accountPanel) accountPanel.style.display = "";
  if (professorPanel) professorPanel.style.display = "none";
  utilityContent.dataset.view = "account";
}

function openUtilities() {
  utilityTarget = "account";
  syncUtilityPanels();

  utilityHeading.textContent = "Account";
  utilityDialog.setAttribute("aria-label", "Account");
  closeButton.setAttribute("aria-label", "Close Account");
  if (!utilityDialog.open) utilityDialog.showModal();

  const panel = utilityContent.querySelector(".registry-panel");
  panel?.scrollIntoView({ block: "start" });
  const focusTarget = panel?.querySelector(
    "button:not(:disabled):not([hidden]), input:not(:disabled):not([hidden]), select:not(:disabled):not([hidden]), textarea:not(:disabled):not([hidden])",
  );
  focusTarget?.focus({ preventScroll: true });
}

function openProfessorInbox() {
  const open = document.querySelector(".professor-inbox-open");
  if (open instanceof HTMLButtonElement && !open.disabled) open.click();
}

function openShowcase() {
  const launcher = document.querySelector(".showcase-launcher");
  if (launcher instanceof HTMLButtonElement && !launcher.disabled) launcher.click();
}

function syncProfessorBridge() {
  const professorAvailable = !professorButton.hidden;
  setHidden(professorBridge, !professorAvailable);
  const showcaseLauncher = document.querySelector(".showcase-launcher");
  showcaseBridge.disabled = !(showcaseLauncher instanceof HTMLButtonElement) || showcaseLauncher.disabled;
  capabilityBridge.disabled = !professorAvailable;
}

accountButton.addEventListener("click", openUtilities);
professorButton.addEventListener("click", openProfessorInbox);
showcaseBridge.addEventListener("click", openShowcase);
capabilityBridge.addEventListener("click", openProfessorInbox);
closeButton.addEventListener("click", () => utilityDialog.close());
utilityDialog.addEventListener("click", (event) => {
  if (event.target === utilityDialog) utilityDialog.close();
});

const observer = new MutationObserver(syncUtilityPanels);
observer.observe(document.body, {
  childList: true,
  subtree: true,
  attributes: true,
  attributeFilter: ["hidden"],
  characterData: true,
});

syncUtilityPanels();
