import "./registry-ui-v3.js";
import "./showcase.js";
import "./showcase-professor-placement.js";
import "./results-presentation-bridge.js";
import "./authoring-workspace.js";
import "./collection-organization.js";
import "./ux-hardening.js";

const utilityDialog = document.querySelector("#workspace-utilities");
const utilityContent = document.querySelector("#workspace-utility-content");
const utilityLoading = document.querySelector("#utility-loading");
const accountButton = document.querySelector("#account-menu");
const professorButton = document.querySelector("#professor-menu");
const closeButton = document.querySelector("#utility-close");

if (!utilityDialog || !utilityContent || !utilityLoading || !accountButton || !professorButton || !closeButton) {
  throw new Error("Workspace shell UI mismatch.");
}

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
}

function openUtilities(target = "account") {
  syncUtilityPanels();
  if (!utilityDialog.open) utilityDialog.showModal();

  const panel = target === "professor"
    ? utilityContent.querySelector(".professor-panel:not([hidden])")
    : utilityContent.querySelector(".registry-panel");

  panel?.scrollIntoView({ block: "start" });
  const focusTarget = panel?.querySelector(
    "button:not(:disabled):not([hidden]), input:not(:disabled):not([hidden]), select:not(:disabled):not([hidden]), textarea:not(:disabled):not([hidden])",
  );
  focusTarget?.focus({ preventScroll: true });
}

accountButton.addEventListener("click", () => openUtilities("account"));
professorButton.addEventListener("click", () => openUtilities("professor"));
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
