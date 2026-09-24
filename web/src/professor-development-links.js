import { supabase } from "./supabase-client.js";


const dialog = document.querySelector(".professor-inbox");
if (!dialog) throw new Error("Professor development links require the Professor inbox UI.");

function formatIssueLabel(request) {
  return request.github_issue_number
    ? `Issue #${request.github_issue_number}`
    : "Implementation issue";
}

function render(rows) {
  dialog.querySelectorAll(".professor-request-development").forEach((node) => node.remove());

  for (const request of (rows ?? []).filter((row) => row.github_issue_url)) {
    const card = [...dialog.querySelectorAll(".professor-request-card")]
      .find((candidate) => candidate.dataset.requestId === request.id);
    const detailGrid = card?.querySelector(".professor-request-detail-grid");
    if (!detailGrid) continue;

    const block = document.createElement("section");
    block.className = "professor-request-detail-source professor-request-development";
    const heading = document.createElement("h4");
    heading.textContent = "Development";
    block.append(heading);

    const row = document.createElement("div");
    row.className = "professor-development-link-row";

    const status = document.createElement("span");
    status.className = "professor-development-link-status";
    status.textContent = request.status.replaceAll("_", " ");

    const issue = document.createElement("a");
    issue.href = request.github_issue_url;
    issue.target = "_blank";
    issue.rel = "noopener noreferrer";
    issue.textContent = formatIssueLabel(request);

    row.append(status, issue);

    if (request.github_pr_url) {
      const pr = document.createElement("a");
      pr.href = request.github_pr_url;
      pr.target = "_blank";
      pr.rel = "noopener noreferrer";
      pr.textContent = "Pull request";
      row.append(pr);
    }

    block.append(row);
    detailGrid.append(block);
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
    .select("id, status, github_issue_number, github_issue_url, github_pr_url")
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
dialog.addEventListener("vlab:professor-requests-rendered", runLoad);
supabase.auth.onAuthStateChange(() => queueMicrotask(runLoad));
runLoad();
