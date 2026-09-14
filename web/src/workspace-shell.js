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

function syncUtilityPanels() {
  const accountPanel = document.querySelector(".registry-panel");
  const professorPanel = document.querySelector(".professor-panel");

  movePanel(accountPanel);
  movePanel(professorPanel);

  utilityLoading.hidden = Boolean(accountPanel);

  const professorAvailable = Boolean(professorPanel && !professorPanel.hidden);
  professorButton.hidden = !professorAvailable;

  const pendingCount = professorPanel?.querySelector(".professor-pending-count")?.textContent?.trim();
  professorButton.textContent = professorAvailable && pendingCount && pendingCount !== "0"
    ? `Professor · ${pendingCount}`
    : "Professor";
}

function openUtilities(target = "account") {
  syncUtilityPanels();
  if (!utilityDialog.open) utilityDialog.showModal();

  const panel = target === "professor"
    ? utilityContent.querySelector(".professor-panel:not([hidden])")
    : utilityContent.querySelector(".registry-panel");

  panel?.scrollIntoView({ block: "start" });
  const focusTarget = panel?.querySelector(
    "button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled)",
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
