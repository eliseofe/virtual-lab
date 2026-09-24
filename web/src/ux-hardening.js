import { onlyLiveRuntimeUpdates } from "./live-region.js";
import { runtimeModel } from "./runtime/runtime-model.js";
const root = document.documentElement;
root.dataset.vlabUxHardened = "true";

const enhancedDialogs = new WeakSet();
const dialogInvokers = new WeakMap();
const dialogObservers = new WeakMap();

const dialogSpecs = [
  { selector: "#workspace-utilities", triggers: ["#account-menu", '[data-vlab-nav="account"]', '[data-vlab-nav="account-mobile"]'], fallbackId: "workspace-utilities" },
  { selector: ".professor-inbox", triggers: ["#professor-menu", '[data-vlab-nav="professor"]', '[data-vlab-nav="professor-mobile"]'], fallbackId: "professor-extension-inbox" },
  { selector: ".vlab-library", triggers: [".experiment-browse"], fallbackId: "experiment-library-dialog" },
  { selector: "#collection-organizer", triggers: [".experiment-organize"], fallbackId: "collection-organizer" },
];

function visible(element) {
  if (!element || !element.isConnected || element.hidden || element.disabled) return false;
  return element.getClientRects().length > 0;
}

function dialogForTrigger(trigger) {
  const spec = dialogSpecs.find((candidate) => candidate.triggers.some((selector) => trigger.matches(selector)));
  if (!spec) return null;
  return document.querySelector(spec.selector);
}

function triggersForDialog(dialog) {
  const spec = dialogSpecs.find((candidate) => dialog.matches(candidate.selector));
  if (!spec) return [];
  return spec.triggers.flatMap((selector) => [...document.querySelectorAll(selector)]);
}

function syncDialogExpanded(dialog) {
  for (const trigger of triggersForDialog(dialog)) {
    if (trigger.getAttribute("aria-expanded") !== String(dialog.open)) {
      trigger.setAttribute("aria-expanded", String(dialog.open));
    }
  }
}

function restoreDialogFocus(dialog) {
  const trigger = dialogInvokers.get(dialog);
  if (!visible(trigger)) return;
  requestAnimationFrame(() => {
    if (visible(trigger)) trigger.focus({ preventScroll: true });
  });
}

function enhanceDialog(dialog) {
  if (!(dialog instanceof HTMLDialogElement) || enhancedDialogs.has(dialog)) return;
  const spec = dialogSpecs.find((candidate) => dialog.matches(candidate.selector));
  if (!spec) return;

  if (!dialog.id) dialog.id = spec.fallbackId;
  dialog.setAttribute("aria-modal", "true");
  enhancedDialogs.add(dialog);

  const observer = new MutationObserver(() => syncDialogExpanded(dialog));
  observer.observe(dialog, { attributes: true, attributeFilter: ["open"] });
  dialogObservers.set(dialog, observer);

  dialog.addEventListener("close", () => {
    syncDialogExpanded(dialog);
    restoreDialogFocus(dialog);
  });

  syncDialogExpanded(dialog);
}

function enhanceDialogTriggers() {
  for (const spec of dialogSpecs) {
    const dialog = document.querySelector(spec.selector);
    if (dialog) enhanceDialog(dialog);
    for (const selector of spec.triggers) {
      for (const trigger of document.querySelectorAll(selector)) {
        trigger.setAttribute("aria-haspopup", "dialog");
        if (dialog?.id && trigger.getAttribute("aria-controls") !== dialog.id) {
          trigger.setAttribute("aria-controls", dialog.id);
        }
        if (dialog && trigger.getAttribute("aria-expanded") !== String(dialog.open)) {
          trigger.setAttribute("aria-expanded", String(dialog.open));
        }
      }
    }
  }
}

function enhanceStatusSemantics() {
  const topbarStatus = document.querySelector(".topbar-status");
  if (topbarStatus) {
    topbarStatus.setAttribute("role", "status");
    topbarStatus.setAttribute("aria-live", "polite");
    topbarStatus.setAttribute("aria-atomic", "true");
  }

  const runtimeState = document.querySelector("#authoring-runtime-state");
  if (runtimeState) {
    runtimeState.setAttribute("role", "status");
    runtimeState.setAttribute("aria-live", "polite");
    runtimeState.setAttribute("aria-atomic", "true");
  }

  syncBusy();
}

// The arena is busy while the simulator is loading; read from the runtime
// model (#569), after the step that wrote it, as the attribute observer did.
function syncBusy() {
  const stage = document.querySelector(".stage-panel");
  if (!stage || !document.querySelector("#worker-status")) return;
  const busy = runtimeModel.get().simulatorStatus.state === "loading";
  if (stage.getAttribute("aria-busy") !== String(busy)) stage.setAttribute("aria-busy", String(busy));
}

let busyQueued = false;
runtimeModel.subscribe((_state, written) => {
  if (!written.includes("simulatorStatus") || busyQueued) return;
  busyQueued = true;
  queueMicrotask(() => { busyQueued = false; syncBusy(); });
});

function enhanceArenaSemantics() {
  const canvas = document.querySelector("#simulation-canvas");
  const note = document.querySelector(".stage-note");
  if (note && !note.id) note.id = "arena-instructions";
  if (canvas && note?.id) canvas.setAttribute("aria-describedby", note.id);
}

function enhanceAuthoringSemantics() {
  const tablist = document.querySelector("#authoring-tabs");
  if (!tablist) return;

  for (const tab of tablist.querySelectorAll('[role="tab"][data-artifact-id]')) {
    const id = tab.dataset.artifactId;
    if (!id) continue;
    if (!tab.id) tab.id = `authoring-tab-${id.replace(/[^a-zA-Z0-9_-]/g, "-")}`;
    const controls = tab.getAttribute("aria-controls");
    const pane = controls ? document.getElementById(controls) : null;
    if (pane && pane.getAttribute("aria-labelledby") !== tab.id) pane.setAttribute("aria-labelledby", tab.id);
  }
}

function enhanceAll() {
  enhanceDialogTriggers();
  enhanceStatusSemantics();
  enhanceArenaSemantics();
  enhanceAuthoringSemantics();
}

document.addEventListener("click", (event) => {
  const target = event.target instanceof Element ? event.target : null;
  if (!target) return;
  const trigger = target.closest("#account-menu, #professor-menu, [data-vlab-nav='account'], [data-vlab-nav='account-mobile'], [data-vlab-nav='professor'], [data-vlab-nav='professor-mobile'], .experiment-browse, .experiment-organize");
  if (!(trigger instanceof HTMLElement)) return;
  const dialog = dialogForTrigger(trigger);
  if (!dialog) return;
  if (visible(trigger)) dialogInvokers.set(dialog, trigger);
  queueMicrotask(() => syncDialogExpanded(dialog));
}, true);

document.addEventListener("focusin", (event) => {
  const tab = event.target instanceof Element ? event.target.closest(".authoring-tab") : null;
  if (tab instanceof HTMLElement) tab.scrollIntoView({ block: "nearest", inline: "nearest" });
});

// Skips pure live-runtime updates (#569).
const discoveryObserver = new MutationObserver((records) => {
  if (!onlyLiveRuntimeUpdates(records)) enhanceAll();
});
discoveryObserver.observe(document.body, { childList: true, subtree: true });

enhanceAll();
