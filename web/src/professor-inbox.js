import { createClient } from "https://esm.sh/@supabase/supabase-js@2.111.0";

const SUPABASE_URL = "https://izdmmudfrmqhvlgepwes.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_MKaLNxnqvYbJUyik9zN7WA_r4ie2P5d";
const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: { storageKey: "vlab-production-registry-auth-v1" },
});

const REQUEST_CLASS_LABELS = {
  semantic_capability: "Semantic capability",
  authoring_language: "Authoring language",
  runtime_configuration: "Runtime / configuration",
  artifact_workflow: "Artifact / workflow",
  implementation_optimization: "Implementation / optimization",
  security_boundary: "Security / forbidden boundary",
};

const accountPanel = document.querySelector(".registry-panel");
if (!accountPanel) throw new Error("Professor inbox requires the registry account panel.");

let profile = null;
let requests = [];
let canonicalCapabilities = [];
let busyRequestId = null;

function installStyles() {
  if (document.querySelector("style[data-vlab-professor-inbox]")) return;
  const style = document.createElement("style");
  style.dataset.vlabProfessorInbox = "";
  style.textContent = `
    .professor-panel[hidden], .professor-inbox[hidden] { display: none !important; }
    .professor-panel { display: grid; gap: 8px; }
    .professor-panel-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
    .professor-panel-title { margin: 0; font-size: 12px; font-weight: 750; color: #26373e; }
    .professor-inbox-open { width: 100%; min-height: 34px; display: flex; align-items: center; justify-content: space-between; gap: 8px; }
    .professor-pending-count { display: inline-flex; align-items: center; justify-content: center; min-width: 24px; min-height: 22px; padding: 2px 7px; border-radius: 999px; background: #edf4f6; color: #315a69; font-size: 10.5px; font-weight: 750; }
    .professor-panel-note { margin: 0; color: #78888e; font-size: 10.5px; line-height: 1.4; }
    .professor-inbox { width: min(900px, calc(100vw - 28px)); max-height: min(780px, calc(100vh - 28px)); border: 0; border-radius: 16px; padding: 0; box-shadow: 0 18px 70px rgba(16,35,44,.28); color: #172127; }
    .professor-inbox::backdrop { background: rgba(16,27,33,.42); }
    .professor-inbox-shell { display: grid; grid-template-rows: auto 1fr; max-height: inherit; min-height: 480px; background: #fff; }
    .professor-inbox-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 17px 18px 12px; border-bottom: 1px solid #e6ecef; }
    .professor-inbox-head h2 { margin: 0; font-size: 17px; }
    .professor-inbox-head-actions { display: flex; gap: 7px; }
    .professor-inbox-summary { margin: 0; padding: 11px 18px; color: #64757c; font-size: 11.5px; line-height: 1.4; border-bottom: 1px solid #eef2f4; }
    .professor-inbox-message { margin: 0; padding: 0 18px 10px; min-height: 1.4em; color: #64757c; font-size: 11px; }
    .professor-inbox-message[data-state="error"] { color: #9e2d29; }
    .professor-request-list { display: grid; align-content: start; gap: 10px; overflow: auto; padding: 0 18px 18px; }
    .professor-request-empty { margin: 16px 2px; color: #718087; font-size: 12px; }
    .professor-request-card { display: grid; gap: 9px; padding: 12px; border: 1px solid #dfe7ea; border-radius: 12px; background: #fff; }
    .professor-request-card[data-status="requested"] { border-color: #bdd1d9; }
    .professor-request-top { display: flex; align-items: flex-start; justify-content: space-between; gap: 10px; }
    .professor-request-top h3 { margin: 0; font-size: 13.5px; line-height: 1.35; }
    .professor-request-domain { margin: 2px 0 0; color: #6c7c83; font-size: 10.5px; }
    .professor-request-class { display: inline-flex; width: fit-content; padding: 3px 7px; border-radius: 999px; background: #edf4f6; color: #315a69; font-size: 10px; font-weight: 700; }
    .professor-status { display: inline-flex; align-items: center; min-height: 24px; padding: 3px 8px; border-radius: 999px; background: #eef3f5; color: #50626a; font-size: 10px; font-weight: 750; text-transform: capitalize; }
    .professor-status[data-status="requested"] { background: #fff4d8; color: #7a5712; }
    .professor-status[data-status="approved"] { background: #e7f3ec; color: #265f43; }
    .professor-status[data-status="declined"] { background: #f8e9e8; color: #8b3731; }
    .professor-request-context { margin: 0; white-space: pre-wrap; color: #344850; font-size: 11.5px; line-height: 1.45; }
    .professor-request-definition { margin: 0; color: #344850; font-size: 11px; line-height: 1.45; }
    .professor-request-meta { display: flex; flex-wrap: wrap; gap: 6px 12px; color: #708087; font-size: 10.5px; }
    .professor-request-draft, .professor-request-publication { margin: 0; color: #596b72; font-size: 10.5px; line-height: 1.4; }
    .professor-request-note { width: 100%; min-height: 70px; resize: vertical; border: 1px solid #cfd8dc; border-radius: 9px; padding: 8px 10px; font: inherit; color: #172127; background: #fff; }
    .professor-semantic-editor { display: grid; gap: 7px; padding: 9px; border: 1px solid #e1e8eb; border-radius: 9px; background: #f9fbfc; }
    .professor-semantic-editor label { display: grid; gap: 3px; color: #607179; font-size: 10px; font-weight: 650; }
    .professor-semantic-editor input, .professor-semantic-editor textarea, .professor-semantic-editor select { width: 100%; border: 1px solid #cfd8dc; border-radius: 7px; padding: 7px 8px; font: inherit; color: #172127; background: #fff; }
    .professor-semantic-editor textarea { min-height: 64px; resize: vertical; }
    .professor-request-actions { display: flex; flex-wrap: wrap; gap: 7px; }
    .professor-request-actions button { min-height: 32px; padding: 5px 10px; }
    .professor-request-review { margin: 0; color: #65767d; font-size: 10.5px; line-height: 1.4; }
    @media (max-width: 680px) { .professor-inbox-shell { min-height: min(620px, calc(100vh - 28px)); } }
  `;
  document.head.append(style);
}

function buildUi() {
  const panel = document.createElement("section");
  panel.className = "panel professor-panel";
  panel.hidden = true;
  panel.setAttribute("aria-label", "Professor extension requests");

  const head = document.createElement("div");
  head.className = "professor-panel-head";
  const title = document.createElement("p");
  title.className = "professor-panel-title";
  title.textContent = "Professor";
  head.append(title);

  const open = document.createElement("button");
  open.className = "professor-inbox-open";
  const openLabel = document.createElement("span");
  openLabel.textContent = "Extension requests";
  const count = document.createElement("span");
  count.className = "professor-pending-count";
  count.textContent = "0";
  open.append(openLabel, count);

  const note = document.createElement("p");
  note.className = "professor-panel-note";
  note.textContent = "Review classified research requests. Approval does not authorize implementation.";
  panel.append(head, open, note);
  accountPanel.insertAdjacentElement("afterend", panel);

  const dialog = document.createElement("dialog");
  dialog.className = "professor-inbox";
  dialog.setAttribute("aria-label", "Professor extension request inbox");
  const shell = document.createElement("div");
  shell.className = "professor-inbox-shell";
  const dialogHead = document.createElement("div");
  dialogHead.className = "professor-inbox-head";
  const heading = document.createElement("h2");
  heading.textContent = "Extension requests";
  const headActions = document.createElement("div");
  headActions.className = "professor-inbox-head-actions";
  const refresh = document.createElement("button");
  refresh.textContent = "Refresh";
  const close = document.createElement("button");
  close.textContent = "Close";
  headActions.append(refresh, close);
  dialogHead.append(heading, headActions);

  const summary = document.createElement("p");
  summary.className = "professor-inbox-summary";
  summary.textContent = "All six request classes remain visible for Professor triage. Approval accepts the scientific or product need into the design queue; canonical semantic identity is resolved later during developer generalization.";
  const message = document.createElement("p");
  message.className = "professor-inbox-message";
  message.setAttribute("role", "status");
  const list = document.createElement("div");
  list.className = "professor-request-list";

  const body = document.createElement("div");
  body.append(summary, message, list);
  shell.append(dialogHead, body);
  dialog.append(shell);
  document.body.append(dialog);

  return { panel, open, count, dialog, refresh, close, message, list };
}

function formatDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat(undefined, {
    year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
  }).format(date);
}

function artifactSummary(artifacts) {
  if (!Array.isArray(artifacts) || artifacts.length === 0) return "no preserved draft artifacts";
  return artifacts.map((artifact) => {
    const id = typeof artifact?.id === "string" ? artifact.id : "artifact";
    const type = typeof artifact?.type === "string" ? artifact.type : null;
    return type && type !== id ? `${id} (${type})` : id;
  }).join(", ");
}

function requestMeta(request) {
  const values = [];
  if (request.origin_experiment_id) {
    values.push(`Origin ${request.origin_experiment_id}${request.origin_experiment_revision ? ` · rev ${request.origin_experiment_revision}` : ""}`);
  }
  if (request.requested_artifact_type) values.push(`Artifact ${request.requested_artifact_type}`);
  if (request.requested_lifecycle_hook) values.push(`Hook ${request.requested_lifecycle_hook}`);
  if (request.canonical_capability_id) values.push(`Canonical ${request.canonical_capability_id}`);
  values.push(`Requested ${formatDate(request.created_at)}`);
  return values;
}

function setMessage(text, state = "idle") {
  ui.message.textContent = text;
  ui.message.dataset.state = state;
}

function pendingCount() {
  return requests.filter((request) => request.status === "requested").length;
}

function field(labelText, value, kind = "input") {
  const label = document.createElement("label");
  label.textContent = labelText;
  const control = document.createElement(kind);
  control.value = value || "";
  label.append(control);
  return { label, control };
}

function semanticApprovalEditor(request) {
  const editor = document.createElement("div");
  editor.className = "professor-semantic-editor";

  const choice = document.createElement("select");
  const createOption = document.createElement("option");
  createOption.value = "";
  createOption.textContent = "Create new canonical capability";
  choice.append(createOption);

  for (const capability of canonicalCapabilities.filter((item) => item.implementation_state !== "implemented")) {
    const option = document.createElement("option");
    option.value = capability.id;
    option.textContent = `Bind existing: ${capability.capability_key}`;
    choice.append(option);
  }

  if (request.canonical_capability_id) {
    const existing = canonicalCapabilities.find((item) => item.id === request.canonical_capability_id);
    if (existing && ![...choice.options].some((option) => option.value === existing.id)) {
      const option = document.createElement("option");
      option.value = existing.id;
      option.textContent = `Bound: ${existing.capability_key}`;
      choice.append(option);
    }
    choice.value = request.canonical_capability_id;
    choice.disabled = true;
  }

  const choiceLabel = document.createElement("label");
  choiceLabel.textContent = "Canonical disposition";
  choiceLabel.append(choice);

  const key = field("Canonical key", request.extension_key);
  const domain = field("Domain", request.extension_domain || request.capability_domain);
  const name = field("Generic name", request.extension_name || request.capability_name);
  const definition = field("Generic definition", request.extension_definition, "textarea");

  const syncDisabled = () => {
    const bindingExisting = Boolean(choice.value);
    for (const control of [key.control, domain.control, name.control, definition.control]) {
      control.disabled = bindingExisting;
    }
  };
  choice.addEventListener("change", syncDisabled);
  syncDisabled();

  editor.append(choiceLabel, key.label, domain.label, name.label, definition.label);

  return {
    editor,
    payload() {
      if (choice.value) return { bindCanonicalCapabilityId: choice.value };
      return {
        canonicalKey: key.control.value.trim(),
        canonicalDomain: domain.control.value.trim(),
        canonicalName: name.control.value.trim(),
        canonicalDefinition: definition.control.value.trim(),
      };
    },
    setDisabled(disabled) {
      choice.disabled = disabled || Boolean(request.canonical_capability_id);
      if (disabled) {
        for (const control of [key.control, domain.control, name.control, definition.control]) control.disabled = true;
      } else {
        syncDisabled();
      }
    },
  };
}

function render() {
  const pending = pendingCount();
  ui.count.textContent = String(pending);
  ui.count.setAttribute("aria-label", `${pending} pending extension request${pending === 1 ? "" : "s"}`);
  ui.list.replaceChildren();

  if (requests.length === 0) {
    const empty = document.createElement("p");
    empty.className = "professor-request-empty";
    empty.textContent = "No extension requests yet.";
    ui.list.append(empty);
    return;
  }

  const ordered = [...requests].sort((left, right) => {
    const leftPending = left.status === "requested" ? 0 : 1;
    const rightPending = right.status === "requested" ? 0 : 1;
    if (leftPending !== rightPending) return leftPending - rightPending;
    return new Date(right.created_at).getTime() - new Date(left.created_at).getTime();
  });

  for (const request of ordered) {
    const card = document.createElement("article");
    card.className = "professor-request-card";
    card.dataset.status = request.status;

    const top = document.createElement("div");
    top.className = "professor-request-top";
    const nameWrap = document.createElement("div");
    const title = document.createElement("h3");
    title.textContent = request.extension_name || request.capability_name;
    const domain = document.createElement("p");
    domain.className = "professor-request-domain";
    domain.textContent = request.extension_domain || request.capability_domain;
    nameWrap.append(title, domain);

    const status = document.createElement("span");
    status.className = "professor-status";
    status.dataset.status = request.status;
    status.textContent = request.status.replaceAll("_", " ");
    top.append(nameWrap, status);
    card.append(top);

    const requestClass = document.createElement("span");
    requestClass.className = "professor-request-class";
    requestClass.textContent = REQUEST_CLASS_LABELS[request.request_class] || "Legacy capability request";
    card.append(requestClass);

    if (request.extension_definition) {
      const definition = document.createElement("p");
      definition.className = "professor-request-definition";
      definition.textContent = request.extension_definition;
      card.append(definition);
    }

    if (request.context) {
      const context = document.createElement("p");
      context.className = "professor-request-context";
      context.textContent = request.context;
      card.append(context);
    }

    if (request.publication_identifier || request.publication_title) {
      const publication = document.createElement("p");
      publication.className = "professor-request-publication";
      publication.textContent = `Publication: ${request.publication_title || "Untitled"} · ${request.publication_identifier || "no identifier"}`;
      card.append(publication);
    }

    const meta = document.createElement("div");
    meta.className = "professor-request-meta";
    for (const value of requestMeta(request)) {
      const item = document.createElement("span");
      item.textContent = value;
      meta.append(item);
    }
    card.append(meta);

    const draft = document.createElement("p");
    draft.className = "professor-request-draft";
    const draftTitle = request.draft_title?.trim() || "Untitled preserved draft";
    draft.textContent = `${draftTitle} · ${artifactSummary(request.draft_artifacts)}`;
    card.append(draft);

    if (request.status === "requested") {
      const note = document.createElement("textarea");
      note.className = "professor-request-note";
      note.maxLength = 20000;
      note.placeholder = "Optional Professor note";
      note.setAttribute("aria-label", `Professor note for ${request.extension_name || request.capability_name}`);
      note.value = request.professor_notes || "";

      const actions = document.createElement("div");
      actions.className = "professor-request-actions";
      const approve = document.createElement("button");
      approve.className = "primary";
      approve.textContent = "Approve";
      const decline = document.createElement("button");
      decline.textContent = "Decline";
      const busy = busyRequestId === request.id;
      approve.disabled = busy;
      decline.disabled = busy;
      note.disabled = busy;

      approve.addEventListener("click", () => triage(
        request,
        "approved",
        note.value,
        {},
      ));
      decline.addEventListener("click", () => triage(request, "declined", note.value, {}));
      actions.append(approve, decline);
      card.append(note, actions);
    } else {
      const review = document.createElement("p");
      review.className = "professor-request-review";
      const parts = [
        request.status === "approved" ? "Approved"
          : request.status === "declined" ? "Declined"
          : request.status.replaceAll("_", " "),
      ];
      if (request.reviewed_at) parts.push(formatDate(request.reviewed_at));
      if (request.professor_notes) parts.push(request.professor_notes);
      review.textContent = parts.join(" · ");
      card.append(review);
    }

    ui.list.append(card);
  }
}

async function loadRequests() {
  if (profile?.role !== "professor") {
    requests = [];
    canonicalCapabilities = [];
    render();
    return;
  }

  ui.refresh.disabled = true;
  setMessage("Loading extension requests…");

  const [requestResult, capabilityResult] = await Promise.all([
    supabase
      .from("capability_requests")
      .select("id, requester_id, origin_experiment_id, origin_experiment_revision, draft_title, draft_description, draft_artifacts, capability_domain, capability_name, context, requested_artifact_type, requested_lifecycle_hook, status, professor_notes, reviewed_by, reviewed_at, created_at, updated_at, request_class, extension_key, extension_domain, extension_name, extension_definition, canonical_capability_id, publication_identifier, publication_title")
      .order("created_at", { ascending: false }),
    supabase.rpc("list_canonical_capability_registry"),
  ]);

  ui.refresh.disabled = false;
  if (requestResult.error) {
    setMessage(requestResult.error.message, "error");
    throw requestResult.error;
  }
  if (capabilityResult.error) {
    setMessage(capabilityResult.error.message, "error");
    throw capabilityResult.error;
  }

  requests = requestResult.data ?? [];
  canonicalCapabilities = capabilityResult.data ?? [];
  render();
  setMessage(`${pendingCount()} pending request${pendingCount() === 1 ? "" : "s"}.`);
}

async function triage(request, status, note, canonical = {}) {
  if (profile?.role !== "professor" || request.status !== "requested") return;
  busyRequestId = request.id;
  render();
  setMessage(`${status === "approved" ? "Approving" : "Declining"} request…`);
  try {
    const { data, error } = await supabase.rpc("triage_extension_request", {
      p_request_id: request.id,
      p_decision: status,
      p_professor_notes: note.trim() || null,
      p_bind_canonical_capability_id: canonical.bindCanonicalCapabilityId || null,
      p_canonical_key: canonical.canonicalKey || null,
      p_canonical_domain: canonical.canonicalDomain || null,
      p_canonical_name: canonical.canonicalName || null,
      p_canonical_definition: canonical.canonicalDefinition || null,
    });
    if (error) throw error;
    if (!data) throw new Error("This request is no longer pending. Refresh the inbox.");
    await loadRequests();
  } catch (error) {
    setMessage(error instanceof Error ? error.message : String(error), "error");
  } finally {
    busyRequestId = null;
    render();
  }
}

async function syncSession() {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  const user = data.session?.user ?? null;
  profile = null;
  requests = [];
  canonicalCapabilities = [];

  if (!user) {
    ui.panel.hidden = true;
    if (ui.dialog.open) ui.dialog.close();
    render();
    return;
  }

  const { data: nextProfile, error: profileError } = await supabase
    .from("profiles")
    .select("id, display_name, role")
    .eq("id", user.id)
    .maybeSingle();
  if (profileError) throw profileError;
  profile = nextProfile;

  const isProfessor = profile?.role === "professor";
  ui.panel.hidden = !isProfessor;
  if (!isProfessor) {
    if (ui.dialog.open) ui.dialog.close();
    render();
    return;
  }
  await loadRequests();
}

function run(task) {
  Promise.resolve().then(task).catch((error) => {
    console.error("Professor extension inbox error:", error);
    setMessage(error instanceof Error ? error.message : String(error), "error");
  });
}

installStyles();
const ui = buildUi();
ui.open.addEventListener("click", () => {
  if (profile?.role !== "professor") return;
  run(loadRequests);
  ui.dialog.showModal();
});
ui.refresh.addEventListener("click", () => run(loadRequests));
ui.close.addEventListener("click", () => ui.dialog.close());
ui.dialog.addEventListener("click", (event) => {
  if (event.target === ui.dialog) ui.dialog.close();
});

supabase.auth.onAuthStateChange(() => queueMicrotask(() => run(syncSession)));
run(syncSession);
