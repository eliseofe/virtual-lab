import { supabase } from "./supabase-client.js";
import {
  CANDIDATE_ARTIFACTS,
  PROFESSOR_REVIEW_CONTRACT,
  PROFESSOR_REVIEW_DECISIONS,
  artifactSummary,
  candidateDefinition as candidateDefinitionFor,
  candidateDomain as candidateDomainFor,
  candidateName as candidateNameFor,
  canReview,
  checkDecision,
  evidenceBadge,
  formatDate,
  orderedRequests,
  parseContractPaths,
  pendingCount as pendingCountOf,
  pendingCountLabel,
  pendingSummary,
  progressMessage,
  requestClassLabel,
  requestCurrentState,
  reviewSummary,
  stateLabel,
  unresolvedGeneralization,
} from "./professor/requests.js";


const accountPanel = document.querySelector(".registry-panel");
if (!accountPanel) throw new Error("Professor inbox requires the registry account panel.");

let profile = null;
let requests = [];
let evidenceByRequest = new Map();
let candidateByRequest = new Map();
let supportByRequest = new Map();
let implementedCapabilities = [];
let busyRequestId = null;


function buildUi() {
  const panel = document.createElement("section");
  panel.className = "panel professor-panel";
  panel.hidden = true;
  panel.dataset.vlabProfessorReviewContract = PROFESSOR_REVIEW_CONTRACT;
  panel.dataset.vlabProfessorReviewDecisions = PROFESSOR_REVIEW_DECISIONS.map(([, decision]) => decision).join(",");
  panel.dataset.vlabProfessorReviseGuidanceRequired = "true";
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
  note.textContent = "Review classified research requests. A review decision does not authorize implementation.";
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
  summary.textContent = "Review the request: accept, revise, defer, mark future, reject, or resolve it as already supported. Approval accepts the need into the design queue; implementation remains a separate step.";
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

function evidenceForRequest(requestId) {
  return evidenceByRequest.get(requestId) ?? [];
}

function candidateForRequest(requestId) {
  return candidateByRequest.get(requestId) ?? null;
}

function unresolvedGeneralizationEvidence(requestId) {
  return unresolvedGeneralization(evidenceForRequest(requestId));
}

function candidateName(request) {
  return candidateNameFor(request, candidateForRequest(request.id));
}

function candidateDomain(request) {
  return candidateDomainFor(request, candidateForRequest(request.id));
}

function candidateDefinition(request) {
  return candidateDefinitionFor(request, candidateForRequest(request.id));
}

function supportForRequest(requestId) {
  return supportByRequest.get(requestId) ?? [];
}

function supportResolutionEditor(request) {
  const box = document.createElement("div");
  box.className = "professor-support-resolution";
  const capabilitiesLabel = document.createElement("label");
  capabilitiesLabel.textContent = "Existing implemented capabilities";
  const capabilities = document.createElement("select");
  capabilities.multiple = true;
  capabilities.className = "professor-support-capabilities";
  capabilities.setAttribute("aria-label", `Existing capabilities supporting ${candidateName(request)}`);
  for (const capability of implementedCapabilities) {
    const option = document.createElement("option");
    option.value = capability.id;
    option.textContent = `${capability.capability_key} — ${capability.capability_name}`;
    capabilities.append(option);
  }
  capabilitiesLabel.append(capabilities);

  const contractLabel = document.createElement("label");
  contractLabel.textContent = "Stable contract paths (optional, comma-separated)";
  const contractPaths = document.createElement("input");
  contractPaths.className = "professor-support-contract-paths";
  contractPaths.placeholder = "e.g. artifacts.configuration";
  contractLabel.append(contractPaths);
  box.append(capabilitiesLabel, contractLabel);
  return box;
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
  return pendingCountOf(requests);
}

function render() {
  const pending = pendingCount();
  ui.count.textContent = String(pending);
  ui.count.setAttribute("aria-label", pendingCountLabel(pending));
  ui.list.replaceChildren();

  if (requests.length === 0) {
    const empty = document.createElement("p");
    empty.className = "professor-request-empty";
    empty.textContent = "No extension requests yet.";
    ui.list.append(empty);
    return;
  }

  const ordered = orderedRequests(requests);

  for (const request of ordered) {
    const card = document.createElement("article");
    card.className = "professor-request-card";
    const currentState = requestCurrentState(request);
    card.dataset.status = currentState;
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
    requestClass.textContent = requestClassLabel(request);
    const status = document.createElement("span");
    status.className = "professor-status";
    status.dataset.status = currentState;
    status.textContent = stateLabel(currentState);
    badges.append(requestClass, status);

    const requestEvidence = evidenceForRequest(request.id);
    const evidenceText = evidenceBadge(requestEvidence.length);
    if (evidenceText) {
      const count = document.createElement("span");
      count.className = "professor-evidence-count";
      count.textContent = evidenceText;
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

    if (requestCurrentState(request) === "pending") {
      card.append(supportResolutionEditor(request));
      const noteLabel = document.createElement("label");
      noteLabel.className = "professor-request-note-label";
      noteLabel.textContent = "Professor guidance";
      const note = document.createElement("textarea");
      note.className = "professor-request-note";
      note.maxLength = 20000;
      note.placeholder = "Optional except for Revise";
      note.setAttribute("aria-label", `Professor guidance for ${request.extension_name || request.capability_name}`);
      note.value = request.professor_guidance || "";
      noteLabel.append(note);

      const actions = document.createElement("div");
      actions.className = "professor-request-actions";
      const busy = busyRequestId === request.id;
      for (const [label, decision, primary] of PROFESSOR_REVIEW_DECISIONS) {
        const button = document.createElement("button");
        if (primary) button.className = "primary";
        button.textContent = label;
        button.dataset.professorDecision = decision;
        button.disabled = busy;
        button.addEventListener("click", () => triage(request, decision, note.value, card));
        actions.append(button);
      }
      note.disabled = busy;
      card.append(noteLabel, actions);
    } else {
      const review = document.createElement("p");
      review.className = "professor-request-review";
      review.textContent = reviewSummary(request, supportForRequest(request.id));
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

async function loadSupportResolutions(requestRows) {
  supportByRequest = new Map();
  const requestIds = requestRows.map((request) => request.id);
  if (requestIds.length === 0) return;
  const { data, error } = await supabase
    .from("capability_request_support_resolutions")
    .select("request_id,support_kind,canonical_capability_id,contract_path,created_at")
    .in("request_id", requestIds)
    .order("created_at", { ascending: true });
  if (error) throw error;
  const capabilityById = new Map(implementedCapabilities.map((capability) => [capability.id, capability]));
  for (const item of data ?? []) {
    const capability = item.canonical_capability_id ? capabilityById.get(item.canonical_capability_id) : null;
    const enriched = capability
      ? { ...item, capability_key: capability.capability_key, capability_name: capability.capability_name }
      : item;
    const current = supportByRequest.get(item.request_id) ?? [];
    current.push(enriched);
    supportByRequest.set(item.request_id, current);
  }
}

async function loadImplementedCapabilities() {
  const { data, error } = await supabase
    .from("canonical_capabilities")
    .select("id,capability_key,capability_name,implementation_state")
    .eq("implementation_state", "implemented")
    .order("capability_key");
  if (error) throw error;
  implementedCapabilities = data ?? [];
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
    .select("id, draft_title, draft_description, draft_artifacts, capability_domain, capability_name, context, requested_artifact_type, requested_lifecycle_hook, status, professor_disposition, professor_guidance, professor_disposition_reviewed_at, professor_notes, reviewed_at, created_at, request_class, extension_domain, extension_name, extension_definition, publication_identifier, publication_title")
    .order("created_at", { ascending: false });

  ui.refresh.disabled = false;
  if (requestResult.error) {
    setMessage(requestResult.error.message, "error");
    throw requestResult.error;
  }

  requests = requestResult.data ?? [];
  try {
    await loadImplementedCapabilities();
    await Promise.all([
      loadRequestEvidence(requests),
      loadCandidateExtensions(requests),
      loadSupportResolutions(requests),
    ]);
  } catch (error) {
    evidenceByRequest = new Map();
    candidateByRequest = new Map();
    setMessage(error instanceof Error ? error.message : String(error), "error");
    throw error;
  }
  render();
  ui.dialog.dispatchEvent(new CustomEvent("vlab:professor-requests-rendered"));
  setMessage(pendingSummary(pendingCount()));
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

async function triage(request, decision, note, card) {
  if (!canReview(profile?.role, request)) return;
  const guidance = note.trim();
  if (decision === "already_supported") {
    const capabilityIds = [...card.querySelectorAll(".professor-support-capabilities option:checked")].map((option) => option.value);
    const contractPaths = parseContractPaths(card.querySelector(".professor-support-contract-paths")?.value);
    const check = checkDecision({ decision, guidance, requestClass: request.request_class, capabilityIds, contractPaths });
    if (!check.ok) {
      setMessage(check.error, "error");
      return;
    }
    busyRequestId = request.id;
    render();
    setMessage("Resolving request as already supported…");
    try {
      const { data, error } = await supabase.rpc("resolve_extension_request_already_supported", {
        p_request_id: request.id,
        p_canonical_capability_ids: capabilityIds,
        p_contract_paths: contractPaths,
        p_professor_notes: guidance || null,
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
    return;
  }
  const check = checkDecision({ decision, guidance, requestClass: request.request_class });
  if (!check.ok) {
    setMessage(check.error, "error");
    return;
  }
  busyRequestId = request.id;
  render();
  setMessage(progressMessage(decision));
  try {
    const { data, error } = await supabase.rpc("triage_extension_request", {
      p_request_id: request.id,
      p_decision: decision,
      p_professor_notes: guidance || null,
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
