import { MCP_URL } from "./supabase-config.js";
const SEEN_KEY = "vlab-student-getting-started-v1";

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
installHelpButtons();
maybeOpenForNewStudent();
