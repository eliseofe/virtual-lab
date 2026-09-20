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
let evidenceByRequest = new Map();
let candidateByRequest = new Map();
let busyRequestId = null;

const CANDIDATE_ARTIFACTS = ["configuration", "initialization", "controller", "metrics", "environment", "runtime"];

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
    .professor-request-card { display: grid; gap: 8px; padding: 11px 12px; border: 1px solid #dfe7ea; border-radius: 12px; background: #fff; }
    .professor-request-card[data-status="requested"] { border-color: #bdd1d9; }
    .professor-request-top { display: flex; align-items: flex-start; justify-content: space-between; gap: 10px; }
    .professor-request-top h3 { margin: 0; font-size: 13.5px; line-height: 1.35; }
    .professor-request-domain { margin: 2px 0 0; color: #6c7c83; font-size: 10.5px; }
    .professor-request-badges { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 5px; }
    .professor-request-class, .professor-evidence-count, .professor-generalization-needed { display: inline-flex; width: fit-content; min-height: 24px; align-items: center; padding: 3px 7px; border-radius: 999px; background: #edf4f6; color: #315a69; font-size: 10px; font-weight: 700; }
    .professor-evidence-count { background: #f2f0f7; color: #5a4d73; }
    .professor-generalization-needed { background: #fff0dd; color: #805018; }
    .professor-status { display: inline-flex; align-items: center; min-height: 24px; padding: 3px 8px; border-radius: 999px; background: #eef3f5; color: #50626a; font-size: 10px; font-weight: 750; text-transform: capitalize; }
    .professor-status[data-status="requested"] { background: #fff4d8; color: #7a5712; }
    .professor-status[data-status="approved"] { background: #e7f3ec; color: #265f43; }
    .professor-status[data-status="declined"] { background: #f8e9e8; color: #8b3731; }
    .professor-request-definition { margin: 0; color: #344850; font-size: 11.5px; line-height: 1.45; }
    .professor-request-details { border-top: 1px solid #edf1f3; padding-top: 6px; }
    .professor-request-details summary { cursor: pointer; color: #52666f; font-size: 10.5px; font-weight: 700; }
    .professor-request-detail-grid { display: grid; gap: 8px; padding: 8px 0 2px; }
    .professor-request-detail-source { display: grid; gap: 3px; padding: 8px 9px; border: 1px solid #e5ebed; border-radius: 8px; background: #fafcfc; }
    .professor-request-detail-source h4 { margin: 0; font-size: 10.8px; color: #334951; }
    .professor-request-detail-line { margin: 0; color: #62737a; font-size: 10.3px; line-height: 1.4; white-space: pre-wrap; }
    .professor-request-detail-line strong { color: #43575f; }
    .professor-request-note-label { display: grid; gap: 4px; color: #52666f; font-size: 10.5px; font-weight: 700; }
    .professor-request-note { width: 100%; min-height: 54px; resize: vertical; border: 1px solid #cfd8dc; border-radius: 9px; padding: 8px 10px; font: inherit; color: #172127; background: #fff; }
    .professor-request-actions { display: flex; flex-wrap: wrap; gap: 7px; }
    .professor-request-actions button { min-height: 32px; padding: 5px 10px; }
    .professor-request-review { margin: 0; color: #65767d; font-size: 10.5px; line-height: 1.4; }
    .professor-generalization-editor { border-top: 1px solid #edf1f3; padding-top: 7px; }
    .professor-generalization-editor > summary { cursor: pointer; color: #315a69; font-size: 10.8px; font-weight: 750; }
    .professor-generalization-form { display: grid; gap: 9px; padding: 9px 0 2px; }
    .professor-generalization-intro { margin: 0; color: #65767d; font-size: 10.5px; line-height: 1.45; }
    .professor-generalization-field { display: grid; gap: 4px; color: #52666f; font-size: 10.5px; font-weight: 700; }
    .professor-generalization-field input, .professor-generalization-field textarea, .professor-generalization-field select { width: 100%; border: 1px solid #cfd8dc; border-radius: 8px; padding: 7px 8px; font: inherit; color: #172127; background: #fff; }
    .professor-generalization-field textarea { min-height: 72px; resize: vertical; }
    .professor-generalization-surfaces { display: grid; gap: 6px; }
    .professor-generalization-surface { display: grid; grid-template-columns: 1.15fr 1fr 1.8fr 1fr auto; gap: 6px; align-items: end; padding: 7px; border: 1px solid #e1e8eb; border-radius: 9px; background: #fafcfc; }
    .professor-generalization-surface label { display: grid; gap: 3px; color: #65767d; font-size: 9.8px; font-weight: 700; }
    .professor-generalization-surface input, .professor-generalization-surface select { min-width: 0; border: 1px solid #cfd8dc; border-radius: 7px; padding: 6px 7px; font: inherit; }
    .professor-generalization-cover { display: flex; align-items: flex-start; gap: 7px; color: #52666f; font-size: 10.5px; line-height: 1.4; }
    .professor-generalization-cover input { margin-top: 2px; }
    .professor-generalization-actions { display: flex; flex-wrap: wrap; gap: 7px; align-items: center; }
    @media (max-width: 760px) { .professor-generalization-surface { grid-template-columns: 1fr 1fr; } }
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
  dialog.id = "professor-extension-inbox";
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
  summary.textContent = "Review the scientific need and decide Approve or Decline. Approval accepts the need into the design queue; implementation remains a separate step.";
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

function evidenceForRequest(requestId) {
  return evidenceByRequest.get(requestId) ?? [];
}

function candidateForRequest(requestId) {
  return candidateByRequest.get(requestId) ?? null;
}

function unresolvedGeneralizationEvidence(requestId) {
  return evidenceForRequest(requestId).filter(
    (item) => item.relationship === "generalization_needed" && !item.generalization_resolved_at,
  );
}

function candidateName(request) {
  const candidate = candidateForRequest(request.id);
  if (candidate?.kind === "semantic_capability") return candidate.data.capability_name;
  if (candidate?.kind === "contract_delta") return candidate.data.delta_name;
  return request.extension_name || request.capability_name;
}

function candidateDomain(request) {
  const candidate = candidateForRequest(request.id);
  if (candidate?.kind === "semantic_capability") return candidate.data.capability_domain;
  if (candidate?.kind === "contract_delta") return candidate.data.target_contract_path;
  return request.extension_domain || request.capability_domain;
}

function candidateDefinition(request) {
  const candidate = candidateForRequest(request.id);
  if (candidate?.kind === "semantic_capability") return candidate.data.canonical_definition;
  if (candidate?.kind === "contract_delta") return candidate.data.requested_change;
  return request.extension_definition || request.capability_name || "Scientific extension request";
}

function makeField(labelText, control) {
  const label = document.createElement("label");
  label.className = "professor-generalization-field";
  label.append(document.createTextNode(labelText), control);
  return label;
}

function textInput(value, ariaLabel) {
  const input = document.createElement("input");
  input.type = "text";
  input.value = value || "";
  input.setAttribute("aria-label", ariaLabel);
  return input;
}

function textArea(value, ariaLabel) {
  const area = document.createElement("textarea");
  area.value = value || "";
  area.setAttribute("aria-label", ariaLabel);
  return area;
}

function artifactSelect(value, ariaLabel) {
  const select = document.createElement("select");
  select.setAttribute("aria-label", ariaLabel);
  for (const artifact of CANDIDATE_ARTIFACTS) {
    const option = document.createElement("option");
    option.value = artifact;
    option.textContent = artifact;
    option.selected = artifact === value;
    select.append(option);
  }
  return select;
}

function makeSurfaceRow(surface = {}, fallbackArtifact = "controller") {
  const row = document.createElement("div");
  row.className = "professor-generalization-surface";
  const { artifact, kind, symbol, value_type: valueType, ...extra } = surface;
  row._surfaceExtra = extra;

  const artifactControl = artifactSelect(artifact || fallbackArtifact, "Authoring surface artifact");
  const kindControl = textInput(kind || "", "Authoring surface kind");
  const symbolControl = textInput(symbol || "", "Authoring surface symbol");
  const valueTypeControl = textInput(valueType || "", "Authoring surface value type");

  const remove = document.createElement("button");
  remove.type = "button";
  remove.textContent = "Remove";
  remove.addEventListener("click", () => row.remove());

  row._controls = { artifactControl, kindControl, symbolControl, valueTypeControl };
  row.append(
    makeField("Artifact", artifactControl),
    makeField("Kind", kindControl),
    makeField("Symbol", symbolControl),
    makeField("Value type", valueTypeControl),
    remove,
  );
  return row;
}

function collectSurfaces(container) {
  const rows = [...container.querySelectorAll(".professor-generalization-surface")];
  if (rows.length === 0) throw new Error("At least one authoring surface is required.");
  return rows.map((row) => {
    const controls = row._controls;
    const artifact = controls.artifactControl.value.trim();
    const kind = controls.kindControl.value.trim();
    const symbol = controls.symbolControl.value.trim();
    const valueType = controls.valueTypeControl.value.trim();
    if (!artifact || !kind || !symbol) {
      throw new Error("Each authoring surface needs artifact, kind and symbol.");
    }
    const surface = { ...(row._surfaceExtra || {}), artifact, kind, symbol };
    if (valueType) surface.value_type = valueType;
    else delete surface.value_type;
    return surface;
  });
}

function buildGeneralizationEditor(request) {
  const candidate = candidateForRequest(request.id);
  const unresolved = unresolvedGeneralizationEvidence(request.id);
  if (!candidate || candidate.data.availability !== "candidate_unavailable" || unresolved.length === 0) return null;

  const details = document.createElement("details");
  details.className = "professor-generalization-editor";
  const summary = document.createElement("summary");
  summary.textContent = "Generalize candidate";
  details.append(summary);

  const form = document.createElement("div");
  form.className = "professor-generalization-form";
  const intro = document.createElement("p");
  intro.className = "professor-generalization-intro";
  intro.textContent = `Broaden or refine this existing candidate for the linked scientific evidence. Its stable identity stays the same and it remains unavailable for authoring. Current revision: ${candidate.data.generalization_revision ?? 0}.`;
  form.append(intro);

  let collectCandidate;
  if (candidate.kind === "semantic_capability") {
    const data = candidate.data;
    const name = textInput(data.capability_name, "Candidate capability name");
    const domain = textInput(data.capability_domain, "Candidate scientific domain");
    const definition = textArea(data.canonical_definition, "Candidate scientific definition");
    const targetArtifact = artifactSelect(data.target_artifact, "Candidate target artifact");
    const runtimeDomain = textInput(data.target_runtime_domain, "Candidate runtime domain");
    const surfaces = document.createElement("div");
    surfaces.className = "professor-generalization-surfaces";
    for (const surface of data.authoring_surfaces || []) {
      surfaces.append(makeSurfaceRow(surface, data.target_artifact));
    }
    const addSurface = document.createElement("button");
    addSurface.type = "button";
    addSurface.textContent = "Add authoring surface";
    addSurface.addEventListener("click", () => surfaces.append(makeSurfaceRow({}, targetArtifact.value)));

    form.append(
      makeField("Candidate name", name),
      makeField("Scientific / model domain", domain),
      makeField("Scientific / model definition", definition),
      makeField("Target artifact", targetArtifact),
      makeField("Runtime domain", runtimeDomain),
      makeField("Authoring surfaces", surfaces),
      addSurface,
    );

    collectCandidate = () => ({
      capability_domain: domain.value.trim(),
      capability_name: name.value.trim(),
      scientific_definition: definition.value.trim(),
      target_artifact: targetArtifact.value,
      target_runtime_domain: runtimeDomain.value.trim(),
      authoring_surfaces: collectSurfaces(surfaces),
    });
  } else {
    const data = candidate.data;
    const name = textInput(data.delta_name, "Candidate contract delta name");
    const target = textInput(data.target_contract_path, "Candidate contract target");
    const change = textArea(data.requested_change, "Candidate requested contract change");
    form.append(
      makeField("Candidate name", name),
      makeField("Stable contract target", target),
      makeField("Requested contract change", change),
    );
    collectCandidate = () => ({
      delta_name: name.value.trim(),
      target_contract_path: target.value.trim(),
      requested_change: change.value.trim(),
    });
  }

  const note = textArea("", "Professor generalization note");
  note.placeholder = "Optional note explaining the scientific/model broadening";
  const cover = document.createElement("label");
  cover.className = "professor-generalization-cover";
  const resolve = document.createElement("input");
  resolve.type = "checkbox";
  resolve.checked = true;
  const coverText = document.createElement("span");
  coverText.textContent = `This revision covers the ${unresolved.length} currently flagged generalization evidence source${unresolved.length === 1 ? "" : "s"}.`;
  cover.append(resolve, coverText);

  const actions = document.createElement("div");
  actions.className = "professor-generalization-actions";
  const save = document.createElement("button");
  save.type = "button";
  save.className = "primary";
  save.textContent = "Save generalization";
  save.disabled = busyRequestId === request.id;
  save.addEventListener("click", () => {
    try {
      const payload = collectCandidate();
      generalizeCandidate(request, candidate, payload, resolve.checked, note.value);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error), "error");
    }
  });
  actions.append(save);

  form.append(makeField("Professor note", note), cover, actions);
  details.append(form);
  return details;
}

function addDetailLine(container, label, value) {
  if (value === null || value === undefined || String(value).trim() === "") return;
  const line = document.createElement("p");
  line.className = "professor-request-detail-line";
  const strong = document.createElement("strong");
  strong.textContent = `${label}: `;
  line.append(strong, document.createTextNode(String(value)));
  container.append(line);
}

function buildEvidenceDetails(request) {
  const details = document.createElement("details");
  details.className = "professor-request-details";
  const evidence = evidenceForRequest(request.id);
  const summary = document.createElement("summary");
  summary.textContent = "Evidence and details";
  details.append(summary);

  const grid = document.createElement("div");
  grid.className = "professor-request-detail-grid";

  if (evidence.length > 0) {
    evidence.forEach((item, index) => {
      const source = item.source ?? {};
      const analysis = item.analysis ?? {};
      const block = document.createElement("section");
      block.className = "professor-request-detail-source";
      const heading = document.createElement("h4");
      heading.textContent = source.publication_title || source.title || `Linked evidence ${index + 1}`;
      block.append(heading);
      addDetailLine(block, "Publication", source.publication_identifier);
      addDetailLine(block, "Experiment", source.title);
      if (analysis.analysis_sequence) {
        addDetailLine(block, "Closure analysis", `#${analysis.analysis_sequence} · ${analysis.analysis_status || "recorded"}`);
      }
      if (Array.isArray(item.requirement_keys) && item.requirement_keys.length > 0) {
        addDetailLine(block, "Requirements", item.requirement_keys.join(", "));
      }
      if (item.relationship === "generalization_needed") {
        addDetailLine(block, "Needs generalization", item.generalization_note);
        if (item.generalization_resolved_at) {
          addDetailLine(
            block,
            "Generalization resolved",
            `revision ${item.generalization_resolution_revision} · ${formatDate(item.generalization_resolved_at)}`,
          );
        }
      }
      addDetailLine(block, "Experiment description", source.description);
      addDetailLine(block, "Source context", source.source_context);
      grid.append(block);
    });
  } else {
    const block = document.createElement("section");
    block.className = "professor-request-detail-source";
    const heading = document.createElement("h4");
    heading.textContent = request.publication_title || request.draft_title || "Original request evidence";
    block.append(heading);
    addDetailLine(block, "Publication", request.publication_identifier);
    addDetailLine(block, "Experiment", request.draft_title);
    addDetailLine(block, "Experiment description", request.draft_description);
    addDetailLine(block, "Use-case context", request.context);
    grid.append(block);
  }

  const metadata = document.createElement("section");
  metadata.className = "professor-request-detail-source";
  const metadataHeading = document.createElement("h4");
  metadataHeading.textContent = "Request details";
  metadata.append(metadataHeading);
  addDetailLine(metadata, "Scientific domain", request.extension_domain || request.capability_domain);
  addDetailLine(metadata, "Requested", formatDate(request.created_at));
  addDetailLine(metadata, "Use-case context", request.context);
  addDetailLine(metadata, "Artifact", request.requested_artifact_type);
  addDetailLine(metadata, "Lifecycle hook", request.requested_lifecycle_hook);
  addDetailLine(metadata, "Preserved artifacts", artifactSummary(request.draft_artifacts));
  grid.append(metadata);

  details.append(grid);
  return details;
}

function setMessage(text, state = "idle") {
  ui.message.textContent = text;
  ui.message.dataset.state = state;
}

function pendingCount() {
  return requests.filter((request) => request.status === "requested").length;
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
    card.dataset.requestId = request.id;

    const top = document.createElement("div");
    top.className = "professor-request-top";
    const nameWrap = document.createElement("div");
    const title = document.createElement("h3");
    title.textContent = candidateName(request);
    const domain = document.createElement("p");
    domain.className = "professor-request-domain";
    domain.textContent = candidateDomain(request);
    nameWrap.append(title, domain);

    const badges = document.createElement("div");
    badges.className = "professor-request-badges";
    const requestClass = document.createElement("span");
    requestClass.className = "professor-request-class";
    requestClass.textContent = REQUEST_CLASS_LABELS[request.request_class] || "Extension request";
    const status = document.createElement("span");
    status.className = "professor-status";
    status.dataset.status = request.status;
    status.textContent = request.status.replaceAll("_", " ");
    badges.append(requestClass, status);

    const requestEvidence = evidenceForRequest(request.id);
    const evidenceCount = requestEvidence.length;
    if (evidenceCount > 1) {
      const count = document.createElement("span");
      count.className = "professor-evidence-count";
      count.textContent = `${evidenceCount} linked sources`;
      badges.append(count);
    }
    if (unresolvedGeneralizationEvidence(request.id).length > 0) {
      const generalization = document.createElement("span");
      generalization.className = "professor-generalization-needed";
      generalization.textContent = "Needs generalization";
      badges.append(generalization);
    }

    top.append(nameWrap, badges);
    card.append(top);

    const definition = document.createElement("p");
    definition.className = "professor-request-definition";
    definition.textContent = candidateDefinition(request);
    card.append(definition);

    card.append(buildEvidenceDetails(request));

    const generalizationEditor = buildGeneralizationEditor(request);
    if (generalizationEditor) card.append(generalizationEditor);

    if (request.status === "requested") {
      const noteLabel = document.createElement("label");
      noteLabel.className = "professor-request-note-label";
      noteLabel.textContent = "Professor note";
      const note = document.createElement("textarea");
      note.className = "professor-request-note";
      note.maxLength = 20000;
      note.placeholder = "Optional note";
      note.setAttribute("aria-label", `Professor note for ${request.extension_name || request.capability_name}`);
      note.value = request.professor_notes || "";
      noteLabel.append(note);

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

      approve.addEventListener("click", () => triage(request, "approved", note.value));
      decline.addEventListener("click", () => triage(request, "declined", note.value));
      actions.append(approve, decline);
      card.append(noteLabel, actions);
    } else {
      const review = document.createElement("p");
      review.className = "professor-request-review";
      const parts = [];
      if (request.reviewed_at) parts.push(formatDate(request.reviewed_at));
      if (request.professor_notes) parts.push(`Professor note: ${request.professor_notes}`);
      review.textContent = parts.join(" · ") || "No Professor note.";
      card.append(review);
    }

    ui.list.append(card);
  }
}

async function loadRequestEvidence(requestRows) {
  evidenceByRequest = new Map();
  const requestIds = requestRows.map((request) => request.id);
  if (requestIds.length === 0) return;

  const { data: links, error: linksError } = await supabase
    .from("capability_request_evidence")
    .select("request_id, closure_analysis_id, requirement_keys, relationship, generalization_note, generalization_resolved_at, generalization_resolution_revision, generalization_resolution_note, created_at")
    .in("request_id", requestIds)
    .order("created_at", { ascending: true });
  if (linksError) throw linksError;

  const analysisIds = [...new Set((links ?? []).map((link) => link.closure_analysis_id))];
  let analyses = [];
  if (analysisIds.length > 0) {
    const { data, error } = await supabase
      .from("capability_closure_analyses")
      .select("id, blocked_experiment_id, analysis_sequence, analysis_status, contract_version, created_at")
      .in("id", analysisIds);
    if (error) throw error;
    analyses = data ?? [];
  }

  const blockedExperimentIds = [...new Set(analyses.map((analysis) => analysis.blocked_experiment_id))];
  let sources = [];
  if (blockedExperimentIds.length > 0) {
    const { data, error } = await supabase
      .from("blocked_experiment_drafts")
      .select("id, title, description, source_context, publication_identifier, publication_title, created_at")
      .in("id", blockedExperimentIds);
    if (error) throw error;
    sources = data ?? [];
  }

  const analysesById = new Map(analyses.map((analysis) => [analysis.id, analysis]));
  const sourcesById = new Map(sources.map((source) => [source.id, source]));
  for (const link of links ?? []) {
    const analysis = analysesById.get(link.closure_analysis_id) ?? null;
    const source = analysis ? sourcesById.get(analysis.blocked_experiment_id) ?? null : null;
    const entry = { ...link, analysis, source };
    const current = evidenceByRequest.get(link.request_id) ?? [];
    current.push(entry);
    evidenceByRequest.set(link.request_id, current);
  }
}

async function loadCandidateExtensions(requestRows) {
  candidateByRequest = new Map();
  const requestIds = requestRows.map((request) => request.id);
  if (requestIds.length === 0) return;

  const [capabilityResult, deltaResult] = await Promise.all([
    supabase
      .from("candidate_capabilities")
      .select("request_id, capability_key, capability_domain, capability_name, canonical_definition, target_artifact, target_runtime_domain, authoring_surfaces, availability, request_status, generalization_revision, generalized_at")
      .in("request_id", requestIds),
    supabase
      .from("candidate_contract_deltas")
      .select("request_id, request_class, delta_key, delta_name, target_contract_path, requested_change, availability, request_status, generalization_revision, generalized_at")
      .in("request_id", requestIds),
  ]);
  if (capabilityResult.error) throw capabilityResult.error;
  if (deltaResult.error) throw deltaResult.error;

  for (const candidate of capabilityResult.data ?? []) {
    candidateByRequest.set(candidate.request_id, { kind: "semantic_capability", data: candidate });
  }
  for (const candidate of deltaResult.data ?? []) {
    candidateByRequest.set(candidate.request_id, { kind: "contract_delta", data: candidate });
  }
}

async function loadRequests() {
  if (profile?.role !== "professor") {
    requests = [];
    evidenceByRequest = new Map();
    candidateByRequest = new Map();
    render();
    return;
  }

  ui.refresh.disabled = true;
  setMessage("Loading extension requests…");

  const requestResult = await supabase
    .from("capability_requests")
    .select("id, draft_title, draft_description, draft_artifacts, capability_domain, capability_name, context, requested_artifact_type, requested_lifecycle_hook, status, professor_notes, reviewed_at, created_at, request_class, extension_domain, extension_name, extension_definition, publication_identifier, publication_title")
    .order("created_at", { ascending: false });

  ui.refresh.disabled = false;
  if (requestResult.error) {
    setMessage(requestResult.error.message, "error");
    throw requestResult.error;
  }

  requests = requestResult.data ?? [];
  try {
    await Promise.all([
      loadRequestEvidence(requests),
      loadCandidateExtensions(requests),
    ]);
  } catch (error) {
    evidenceByRequest = new Map();
    candidateByRequest = new Map();
    setMessage(error instanceof Error ? error.message : String(error), "error");
    throw error;
  }
  render();
  ui.dialog.dispatchEvent(new CustomEvent("vlab:professor-requests-rendered"));
  setMessage(`${pendingCount()} pending request${pendingCount() === 1 ? "" : "s"}.`);
}

async function generalizeCandidate(request, candidate, payload, resolveEvidence, note) {
  if (profile?.role !== "professor") return;
  busyRequestId = request.id;
  render();
  setMessage("Saving candidate generalization…");
  try {
    const { data, error } = await supabase.rpc("generalize_candidate_extension", {
      p_request_id: request.id,
      p_candidate_capability: candidate.kind === "semantic_capability" ? payload : null,
      p_candidate_contract_delta: candidate.kind === "contract_delta" ? payload : null,
      p_resolve_generalization_evidence: resolveEvidence,
      p_professor_note: note.trim() || null,
    });
    if (error) throw error;
    if (!data) throw new Error("Candidate generalization was not saved.");
    await loadRequests();
  } catch (error) {
    setMessage(error instanceof Error ? error.message : String(error), "error");
  } finally {
    busyRequestId = null;
    render();
  }
}

async function triage(request, status, note) {
  if (profile?.role !== "professor" || request.status !== "requested") return;
  busyRequestId = request.id;
  render();
  setMessage(`${status === "approved" ? "Approving" : "Declining"} request…`);
  try {
    const { data, error } = await supabase.rpc("triage_extension_request", {
      p_request_id: request.id,
      p_decision: status,
      p_professor_notes: note.trim() || null,
      p_bind_canonical_capability_id: null,
      p_canonical_key: null,
      p_canonical_domain: null,
      p_canonical_name: null,
      p_canonical_definition: null,
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
  evidenceByRequest = new Map();
  candidateByRequest = new Map();

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
