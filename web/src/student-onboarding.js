import { MCP_URL } from "./supabase-config.js";
const SEEN_KEY = "vlab-student-getting-started-v1";

function installStyles() {
  if (document.querySelector("style[data-vlab-student-onboarding]")) return;
  const style = document.createElement("style");
  style.dataset.vlabStudentOnboarding = "";
  style.textContent = `
    .vlab-student-help-button {
      min-height: 34px; padding: 0 12px; border: 1px solid rgba(255,255,255,.18); border-radius: 10px;
      color: #e9f5f7; background: transparent; font: inherit; font-size: 13px; font-weight: 650; cursor: pointer;
    }
    .vlab-student-help-button:hover { background: rgba(255,255,255,.08); border-color: rgba(255,255,255,.32); }
    .vlab-student-help-mobile { min-height: 44px; width: 100%; border: 1px solid #d4dee1; border-radius: 10px; background: #f5f8f9; color: #173a47; font: inherit; font-weight: 700; cursor: pointer; }
    .vlab-student-help-panel {
      position: fixed; top: 74px; right: 18px; z-index: 205; width: min(440px, calc(100vw - 28px));
      max-height: calc(100vh - 92px); overflow: auto; border: 1px solid #cad7db; border-radius: 18px;
      background: #fff; color: #15262d; box-shadow: 0 22px 60px rgba(12,34,43,.22);
    }
    .vlab-student-help-panel[hidden] { display: none !important; }
    .vlab-student-help-head { position: sticky; top: 0; z-index: 1; display: flex; justify-content: space-between; gap: 16px; align-items: flex-start; padding: 18px 18px 14px; border-bottom: 1px solid #e1e8ea; background: rgba(255,255,255,.97); }
    .vlab-student-help-kicker { margin: 0 0 3px; color: #17758d; font-size: 10px; font-weight: 800; letter-spacing: .12em; text-transform: uppercase; }
    .vlab-student-help-head h2 { margin: 0; font-size: 20px; letter-spacing: -.02em; }
    .vlab-student-help-close { border: 0; background: transparent; color: #52656d; font: inherit; font-weight: 700; cursor: pointer; }
    .vlab-student-help-body { display: grid; gap: 14px; padding: 16px 18px 20px; }
    .vlab-student-help-intro { margin: 0; color: #52656d; font-size: 13px; line-height: 1.5; }
    .vlab-student-help-step { padding: 13px 14px; border: 1px solid #dce5e8; border-radius: 13px; background: #f8fafb; }
    .vlab-student-help-step strong { display: block; margin-bottom: 4px; font-size: 13px; }
    .vlab-student-help-step p, .vlab-student-help-step ol { margin: 0; color: #52656d; font-size: 12px; line-height: 1.5; }
    .vlab-student-help-step ol { padding-left: 18px; }
    .vlab-student-provider-actions { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
    .vlab-student-provider-actions button { min-height: 40px; border: 1px solid #b9cdd4; border-radius: 10px; background: #edf5f7; color: #17485b; font: inherit; font-weight: 750; cursor: pointer; }
    .vlab-student-provider-actions button[aria-pressed="true"] { border-color: #17758d; background: #17758d; color: #fff; }
    .vlab-student-provider { display: grid; gap: 9px; padding: 13px 14px; border: 1px solid #dce5e8; border-radius: 13px; }
    .vlab-student-provider[hidden] { display: none !important; }
    .vlab-student-provider h3 { margin: 0; font-size: 14px; }
    .vlab-student-provider ol { margin: 0; padding-left: 19px; color: #52656d; font-size: 12px; line-height: 1.55; }
    .vlab-student-inline-actions { display: flex; flex-wrap: wrap; gap: 8px; }
    .vlab-student-inline-actions button, .vlab-student-inline-actions a { min-height: 36px; display: inline-flex; align-items: center; justify-content: center; padding: 6px 10px; border: 1px solid #c6d5da; border-radius: 9px; background: #fff; color: #17485b; text-decoration: none; font: inherit; font-size: 12px; font-weight: 700; cursor: pointer; }
    .vlab-student-code { margin: 0; padding: 10px 11px; overflow-wrap: anywhere; border: 1px solid #d8e1e4; border-radius: 9px; background: #f5f8f9; color: #263b44; font: 11px/1.45 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
    .vlab-student-help-note { margin: 0; color: #718187; font-size: 11px; line-height: 1.45; }
    .vlab-student-first-prompt { display: grid; gap: 8px; padding: 13px 14px; border: 1px solid #bcd7df; border-radius: 13px; background: #f0f7f9; }
    .vlab-student-first-prompt strong { font-size: 13px; }
    @media (max-width: 720px) {
      .vlab-student-help-panel { top: 8px; right: 8px; width: calc(100vw - 16px); max-height: calc(100vh - 16px); border-radius: 14px; z-index: 400; }
      .vlab-student-provider-actions { grid-template-columns: 1fr; }
      .vlab-student-help-body { padding: 14px; }
    }
  `;
  document.head.append(style);
}

function makeButton(text, className, attributes = {}) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = className;
  button.textContent = text;
  for (const [name, value] of Object.entries(attributes)) button.setAttribute(name, value);
  return button;
}

function copyText(value, button) {
  const original = button.textContent;
  const done = () => {
    button.textContent = "Copied";
    window.setTimeout(() => { button.textContent = original; }, 1400);
  };
  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(value).then(done).catch(() => window.prompt("Copy this text:", value));
  } else {
    window.prompt("Copy this text:", value);
  }
}

const panel = document.createElement("aside");
panel.className = "vlab-student-help-panel";
panel.id = "vlab-student-help";
panel.hidden = true;
panel.setAttribute("role", "dialog");
panel.setAttribute("aria-modal", "false");
panel.setAttribute("aria-labelledby", "vlab-student-help-title");

panel.innerHTML = `
  <div class="vlab-student-help-head">
    <div><p class="vlab-student-help-kicker">Getting started</p><h2 id="vlab-student-help-title">Use Virtual Lab</h2></div>
    <button type="button" class="vlab-student-help-close" aria-label="Close Getting started">Close</button>
  </div>
  <div class="vlab-student-help-body">
    <p class="vlab-student-help-intro">You can explore the Lab directly, or connect an AI assistant to help manage your private Experiments. The simulator keeps running independently of this guide.</p>
    <section class="vlab-student-help-step"><strong>1 · Sign in</strong><p>Create an account from the header. If confirmation is required, use the email link, return here, and sign in.</p></section>
    <section class="vlab-student-help-step"><strong>2 · Start from an Experiment</strong><p>Use <b>Experiments</b> to open one. To let an AI assistant edit a Showcase Experiment, first save a private copy to your account.</p></section>
    <section class="vlab-student-help-step"><strong>3 · Know the workbench</strong><p><b>Simulation</b> runs the current Experiment and includes its live Results. <b>Authoring</b> edits Configuration, Initialization, Controller and Metrics.</p></section>
    <section class="vlab-student-help-step"><strong>4 · Connect an AI assistant</strong><p>Choose the assistant you use. Both connect to the same production Virtual Lab server.</p></section>
    <div class="vlab-student-provider-actions" role="group" aria-label="AI assistant setup">
      <button type="button" data-vlab-provider="grok" aria-pressed="true">Use with Grok</button>
      <button type="button" data-vlab-provider="claude" aria-pressed="false">Use with Claude</button>
    </div>
    <section class="vlab-student-provider" data-vlab-provider-panel="grok">
      <h3>Grok</h3>
      <ol><li>Open Grok Connectors and choose <b>New Connector → Custom</b>.</li><li>Name it <b>Virtual Lab</b> and paste the server URL below.</li><li>Complete the authentication flow with your Virtual Lab account.</li><li>In a chat, enable Virtual Lab from <b>+ → Connectors</b>.</li></ol>
      <p class="vlab-student-code">${MCP_URL}</p>
      <div class="vlab-student-inline-actions"><a href="https://grok.com/connectors" target="_blank" rel="noopener noreferrer">Open Grok Connectors</a><button type="button" data-copy="mcp">Copy server URL</button></div>
      <p class="vlab-student-help-note">On a managed Business or Enterprise account, your team admin may need to add the custom connector first.</p>
    </section>
    <section class="vlab-student-provider" data-vlab-provider-panel="claude" hidden>
      <h3>Claude</h3>
      <ol><li>Open <b>Customize → Connectors</b> and choose <b>+ → Add custom connector</b>.</li><li>Name it <b>Virtual Lab</b> and paste the server URL below.</li><li>Click <b>Add</b>, then <b>Connect</b> and authenticate with your Virtual Lab account.</li><li>In a chat, use <b>+ → Connectors</b> to enable Virtual Lab.</li></ol>
      <p class="vlab-student-code">${MCP_URL}</p>
      <div class="vlab-student-inline-actions"><a href="https://claude.ai/settings/connectors" target="_blank" rel="noopener noreferrer">Open Claude Connectors</a><button type="button" data-copy="mcp">Copy server URL</button></div>
      <p class="vlab-student-help-note">On Team or Enterprise, an Owner may need to register the custom connector for the organization first.</p>
    </section>
    <section class="vlab-student-first-prompt">
      <strong>First connection check</strong>
      <p class="vlab-student-help-note">After enabling the connector, paste this into the AI chat. It is deliberately read-only.</p>
      <p class="vlab-student-code" data-vlab-first-prompt>Use the Virtual Lab connector. Read my workspace and list the Experiments available to me. Do not edit anything. If I have no private Experiment yet, tell me to return to the Lab and save a private copy first.</p>
      <div class="vlab-student-inline-actions"><button type="button" data-copy="prompt">Copy first prompt</button><button type="button" data-vlab-onboarding-done>Got it</button></div>
    </section>
    <p class="vlab-student-help-note">The connector can work with your Experiment workspace. It does not give the assistant GitHub, shell, deployment or hidden simulator-development access.</p>
  </div>
`;
document.body.append(panel);

const firstPrompt = panel.querySelector("[data-vlab-first-prompt]").textContent;

function markSeen() {
  localStorage.setItem(SEEN_KEY, "1");
}

function openHelp() {
  panel.hidden = false;
  requestAnimationFrame(() => panel.querySelector(".vlab-student-help-close")?.focus({ preventScroll: true }));
}

function closeHelp({ remember = false } = {}) {
  panel.hidden = true;
  if (remember) markSeen();
}

panel.querySelector(".vlab-student-help-close").addEventListener("click", () => closeHelp({ remember: true }));
panel.querySelector("[data-vlab-onboarding-done]").addEventListener("click", () => closeHelp({ remember: true }));
panel.addEventListener("keydown", (event) => {
  if (event.key === "Escape") closeHelp({ remember: true });
});

for (const button of panel.querySelectorAll("[data-vlab-provider]")) {
  button.addEventListener("click", () => {
    const provider = button.dataset.vlabProvider;
    for (const choice of panel.querySelectorAll("[data-vlab-provider]")) choice.setAttribute("aria-pressed", String(choice === button));
    for (const section of panel.querySelectorAll("[data-vlab-provider-panel]")) section.hidden = section.dataset.vlabProviderPanel !== provider;
  });
}

for (const button of panel.querySelectorAll("[data-copy]")) {
  button.addEventListener("click", () => copyText(button.dataset.copy === "mcp" ? MCP_URL : firstPrompt, button));
}

function installHelpButtons() {
  const desktopAccount = document.querySelector('[data-vlab-nav="account"]');
  if (desktopAccount && !document.querySelector('[data-vlab-nav="help"]')) {
    const help = makeButton("Help", "vlab-student-help-button", { "data-vlab-nav": "help", "aria-controls": panel.id, "aria-haspopup": "dialog" });
    help.addEventListener("click", openHelp);
    desktopAccount.parentElement?.insertBefore(help, desktopAccount);
  }

  const mobileAccount = document.querySelector('[data-vlab-nav="account-mobile"]');
  if (mobileAccount && !document.querySelector('[data-vlab-nav="help-mobile"]')) {
    const help = makeButton("Help", "vlab-student-help-mobile", { "data-vlab-nav": "help-mobile", "aria-controls": panel.id, "aria-haspopup": "dialog" });
    help.addEventListener("click", openHelp);
    mobileAccount.parentElement?.insertBefore(help, mobileAccount);
  }
}

let autoOpenTimer = null;
function maybeOpenForNewStudent() {
  if (localStorage.getItem(SEEN_KEY) === "1" || !panel.hidden) return;
  if (document.body.dataset.vlabAuthState !== "signed-in") return;
  const professor = document.querySelector("#professor-menu");
  if (professor && !professor.hidden) return;

  window.clearTimeout(autoOpenTimer);
  autoOpenTimer = window.setTimeout(() => {
    const currentProfessor = document.querySelector("#professor-menu");
    if (
      document.body.dataset.vlabAuthState === "signed-in"
      && (!currentProfessor || currentProfessor.hidden)
      && localStorage.getItem(SEEN_KEY) !== "1"
    ) {
      markSeen();
      openHelp();
    }
  }, 700);
}

const authObserver = new MutationObserver(maybeOpenForNewStudent);
authObserver.observe(document.body, {
  attributes: true,
  attributeFilter: ["data-vlab-auth-state"],
});

const professor = document.querySelector("#professor-menu");
if (professor) {
  const professorObserver = new MutationObserver(maybeOpenForNewStudent);
  professorObserver.observe(professor, {
    attributes: true,
    attributeFilter: ["hidden"],
  });
}

const reactRoot = document.querySelector("#react-migration-root");
if (reactRoot) {
  const chromeObserver = new MutationObserver(installHelpButtons);
  chromeObserver.observe(reactRoot, {
    childList: true,
    subtree: true,
  });
}

installStyles();
installHelpButtons();
maybeOpenForNewStudent();
