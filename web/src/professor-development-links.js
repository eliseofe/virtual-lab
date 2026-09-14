import { createClient } from "https://esm.sh/@supabase/supabase-js@2.111.0";

const SUPABASE_URL = "https://izdmmudfrmqhvlgepwes.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_MKaLNxnqvYbJUyik9zN7WA_r4ie2P5d";
const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: { storageKey: "vlab-production-registry-auth-v1" },
});

const dialog = document.querySelector(".professor-inbox");
const openButton = document.querySelector(".professor-inbox-open");
const summary = dialog?.querySelector(".professor-inbox-summary");
const refreshButton = dialog?.querySelector(".professor-inbox-head-actions button");

if (!dialog || !openButton || !summary || !refreshButton) {
  throw new Error("Professor development links require the Professor inbox UI.");
}

function installStyles() {
  if (document.querySelector("style[data-vlab-professor-development-links]")) return;
  const style = document.createElement("style");
  style.dataset.vlabProfessorDevelopmentLinks = "";
  style.textContent = `
    .professor-development-links[hidden] { display: none !important; }
    .professor-development-links { display: grid; gap: 7px; margin: 0; padding: 10px 18px; border-bottom: 1px solid #eef2f4; background: #fbfcfd; }
    .professor-development-links h3 { margin: 0; font-size: 11px; color: #52666f; }
    .professor-development-link-list { display: grid; gap: 5px; }
    .professor-development-link-row { display: flex; flex-wrap: wrap; align-items: baseline; gap: 5px 9px; font-size: 10.5px; line-height: 1.35; }
    .professor-development-link-name { color: #354950; font-weight: 650; }
    .professor-development-link-status { color: #718087; text-transform: capitalize; }
    .professor-development-link-row a { color: #1d5166; font-weight: 700; }
  `;
  document.head.append(style);
}

function buildUi() {
  const section = document.createElement("section");
  section.className = "professor-development-links";
  section.hidden = true;
  section.setAttribute("aria-label", "Capability request development links");

  const heading = document.createElement("h3");
  heading.textContent = "Development";
  const list = document.createElement("div");
  list.className = "professor-development-link-list";
  section.append(heading, list);
  summary.insertAdjacentElement("afterend", section);
  return { section, list };
}

function formatIssueLabel(request) {
  return request.github_issue_number
    ? `Issue #${request.github_issue_number}`
    : "Implementation issue";
}

function render(rows) {
  ui.list.replaceChildren();
  const linked = (rows ?? []).filter((row) => row.github_issue_url);
  ui.section.hidden = linked.length === 0;

  for (const request of linked) {
    const row = document.createElement("div");
    row.className = "professor-development-link-row";

    const name = document.createElement("span");
    name.className = "professor-development-link-name";
    name.textContent = request.capability_name;

    const status = document.createElement("span");
    status.className = "professor-development-link-status";
    status.textContent = request.status.replaceAll("_", " ");

    const issue = document.createElement("a");
    issue.href = request.github_issue_url;
    issue.target = "_blank";
    issue.rel = "noopener noreferrer";
    issue.textContent = formatIssueLabel(request);

    row.append(name, status, issue);

    if (request.github_pr_url) {
      const pr = document.createElement("a");
      pr.href = request.github_pr_url;
      pr.target = "_blank";
      pr.rel = "noopener noreferrer";
      pr.textContent = "Pull request";
      row.append(pr);
    }

    ui.list.append(row);
  }
}

async function loadLinks() {
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) throw sessionError;
  const user = sessionData.session?.user ?? null;
  if (!user) {
    render([]);
    return;
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  if (profileError) throw profileError;
  if (profile?.role !== "professor") {
    render([]);
    return;
  }

  const { data, error } = await supabase
    .from("capability_requests")
    .select("id, capability_name, status, github_issue_number, github_issue_url, github_pr_url, development_started_at, created_at")
    .order("created_at", { ascending: false });
  if (error) throw error;
  render(data);
}

function runLoad() {
  loadLinks().catch((error) => {
    console.error("Professor development-link error:", error);
    render([]);
  });
}

installStyles();
const ui = buildUi();
openButton.addEventListener("click", runLoad);
refreshButton.addEventListener("click", runLoad);
supabase.auth.onAuthStateChange(() => queueMicrotask(runLoad));
runLoad();
