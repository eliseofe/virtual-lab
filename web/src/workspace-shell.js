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

if (!utilityDialog || !utilityContent || !utilityLoading || !accountButton || !professorButton || !closeButton || !utilityHeading) {
  throw new Error("Workspace shell UI mismatch.");
}

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

  if (accountPanel) accountPanel.style.display = utilityTarget === "account" ? "" : "none";
  if (professorPanel) professorPanel.style.display = utilityTarget === "professor" && professorAvailable ? "" : "none";
  utilityContent.dataset.view = utilityTarget;
}

function openUtilities(target = "account") {
  utilityTarget = target === "professor" ? "professor" : "account";
  syncUtilityPanels();

  utilityHeading.textContent = utilityTarget === "professor" ? "Professor tools" : "Account";
  utilityDialog.setAttribute("aria-label", utilityTarget === "professor" ? "Professor tools" : "Account");
  closeButton.setAttribute("aria-label", utilityTarget === "professor" ? "Close Professor tools" : "Close Account");
  if (!utilityDialog.open) utilityDialog.showModal();

  const panel = utilityTarget === "professor"
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
