import { createClient } from "https://esm.sh/@supabase/supabase-js@2.111.0";

const SUPABASE_URL = "https://izdmmudfrmqhvlgepwes.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_MKaLNxnqvYbJUyik9zN7WA_r4ie2P5d";
const AUTH_STORAGE_KEY = "vlab-production-registry-auth-v1";
const BUILTIN_SHOWCASE_ID = "builtin-active-elastic";

const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: { storageKey: AUTH_STORAGE_KEY },
});

const dialog = document.querySelector(".showcase-dialog");
const list = dialog?.querySelector(".showcase-list");
const curation = dialog?.querySelector(".showcase-curation");
const message = dialog?.querySelector(".showcase-message");
const refresh = dialog?.querySelector(".showcase-head-actions button");
const runButton = document.querySelector("#run");
const runState = document.querySelector("#run-state");

if (!dialog || !list || !curation || !message || !refresh || !runButton || !runState) {
  throw new Error("Showcase clarity UI mismatch.");
}

function installStyles() {
  if (document.querySelector("style[data-vlab-showcase-clarity]")) return;
  const style = document.createElement("style");
  style.dataset.vlabShowcaseClarity = "";
  style.textContent = `
    [data-showcase-legacy-remove] { display: none !important; }
    .showcase-entry-row { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 8px; align-items: stretch; }
    .showcase-entry-row[data-active="true"] .showcase-entry { border-color: #7ea8ba; background: #f0f7fa; box-shadow: inset 3px 0 0 #4f8399; }
    .showcase-entry .showcase-entry-action { color: #315e71; font-size: 11px; font-weight: 750; }
    .showcase-entry-row[data-active="true"] .showcase-entry-action { color: #214c60; }
    .showcase-entry-remove { min-width: 88px; padding-inline: 12px; }
    @media (max-width: 680px) {
      .showcase-entry-row { grid-template-columns: 1fr; }
      .showcase-entry-remove { min-height: 44px; width: 100%; }
    }
  `;
  document.head.append(style);
}

function hideLegacyRemove() {
  for (const button of curation.querySelectorAll("button")) {
    if (button.textContent?.trim() === "Remove from Showcase") {
      button.dataset.showcaseLegacyRemove = "";
      button.setAttribute("aria-hidden", "true");
      button.tabIndex = -1;
    }
  }
}

function activeShowcaseId() {
  return new URL(window.location.href).searchParams.get("showcase");
}

function professorCurationAvailable() {
  return !curation.hidden;
}

async function showcaseEntries() {
  const { data, error } = await supabase.rpc("list_showcase_experiments");
  if (error) throw error;
  const curated = Array.isArray(data) ? data : [];
  return [
    {
      showcase_id: BUILTIN_SHOWCASE_ID,
      source_experiment_id: null,
      title: "Active Elastic",
      source_revision: null,
      builtin: true,
    },
    ...curated.map((entry) => ({ ...entry, builtin: false })),
  ];
}

function actionText(entry, activeId) {
  return entry.showcase_id === activeId ? "Loaded in Lab" : "Open & run";
}

function setMessage(text, state = "idle") {
  message.textContent = text;
  message.dataset.state = state;
}

async function removeEntry(entry, button) {
  if (!entry?.source_experiment_id) return;
  if (!window.confirm(`Remove “${entry.title}” from Showcase?`)) return;

  button.disabled = true;
  const original = button.textContent;
  button.textContent = "Removing…";
  try {
    const { data, error } = await supabase.rpc("remove_experiment_from_showcase", {
      p_experiment_id: entry.source_experiment_id,
    });
    if (error) throw error;
    if (data !== true) throw new Error(`“${entry.title}” is no longer an active Showcase entry.`);
    setMessage(`Removed “${entry.title}” from Showcase.`);
    lastSignature = "";
    refresh.click();
  } catch (error) {
    console.error(error);
    const text = error instanceof Error ? error.message : String(error);
    setMessage(text, "error");
    button.disabled = false;
    button.textContent = original;
  }
}

let lastSignature = "";
let decorating = false;
let decorateQueued = false;

async function decorateEntries() {
  if (decorating) return;
  decorating = true;
  try {
    hideLegacyRemove();
    const entries = await showcaseEntries();
    const buttons = [...list.querySelectorAll(".showcase-entry")];
    const activeId = activeShowcaseId();
    const professor = professorCurationAvailable();
    const signature = JSON.stringify({
      activeId,
      professor,
      entries: entries.map((entry) => [entry.showcase_id, entry.source_experiment_id, entry.source_revision]),
    });
    const alreadyDecorated = buttons.length === entries.length && buttons.every((button, index) => (
      button.dataset.showcaseId === String(entries[index]?.showcase_id || "")
      && Boolean(button.querySelector(".showcase-entry-action"))
    ));
    if (signature === lastSignature && alreadyDecorated) return;

    for (let index = 0; index < buttons.length; index += 1) {
      const button = buttons[index];
      const entry = entries[index];
      if (!entry) continue;

      button.dataset.showcaseId = entry.showcase_id;
      button.setAttribute("aria-label", `Open ${entry.title} in Lab and run it`);
      if (entry.showcase_id === activeId) button.setAttribute("aria-current", "page");
      else button.removeAttribute("aria-current");

      let action = button.querySelector(".showcase-entry-action");
      if (!action) {
        action = document.createElement("span");
        action.className = "showcase-entry-action";
        button.append(action);
      }
      const nextAction = actionText(entry, activeId);
      if (action.textContent !== nextAction) action.textContent = nextAction;

      let row = button.closest(".showcase-entry-row");
      if (!row) {
        row = document.createElement("div");
        row.className = "showcase-entry-row";
        button.before(row);
        row.append(button);
      }
      row.dataset.active = entry.showcase_id === activeId ? "true" : "false";

      let remove = row.querySelector(".showcase-entry-remove");
      if (professor && !entry.builtin && entry.source_experiment_id) {
        if (!remove) {
          remove = document.createElement("button");
          remove.type = "button";
          remove.className = "showcase-entry-remove";
          remove.textContent = "Remove";
          row.append(remove);
        }
        remove.dataset.sourceExperimentId = entry.source_experiment_id;
        remove.setAttribute("aria-label", `Remove ${entry.title} from Showcase`);
        remove.onclick = () => removeEntry(entry, remove);
      } else {
        remove?.remove();
      }
    }

    lastSignature = signature;
  } catch (error) {
    console.error("Could not enhance Showcase entry controls.", error);
  } finally {
    decorating = false;
  }
}

function queueDecorate() {
  if (decorateQueued) return;
  decorateQueued = true;
  queueMicrotask(() => {
    decorateQueued = false;
    decorateEntries();
  });
}

async function startActiveShowcase() {
  if (!activeShowcaseId()) return;
  const deadline = performance.now() + 15000;
  while (performance.now() < deadline) {
    if (!runButton.disabled) {
      if (runState.textContent?.trim().toLowerCase() !== "running") runButton.click();
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}

installStyles();
hideLegacyRemove();

const listObserver = new MutationObserver(queueDecorate);
listObserver.observe(list, { childList: true, subtree: true });

const curationObserver = new MutationObserver(() => {
  hideLegacyRemove();
  lastSignature = "";
  queueDecorate();
});
curationObserver.observe(curation, { attributes: true, attributeFilter: ["hidden"], childList: true, subtree: true });

dialog.addEventListener("close", () => {
  lastSignature = "";
});

queueDecorate();
startActiveShowcase();
