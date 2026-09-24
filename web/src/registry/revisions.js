// Experiment revision and Working-copy rules (#397/#398/#399/#409), as pure
// functions: no DOM, no Supabase. registry-ui-v3.js asks these for every
// decision; web/tests/registry-revisions.test.mjs tests them directly (#545).
//
// A view is { kind: "catalog" | "showcase" | "revision" | "working", revision }.

export const WORKING_VIEW = Object.freeze({ kind: "working", revision: null });

export function revisionView(revision) {
  return { kind: "revision", revision };
}

// Only the owner of an Experiment has a Working copy and may manage it.
export function ownsExperiment(userId, remote) {
  return Boolean(userId && remote && remote.owner_id === userId);
}

// Reopening an Experiment always shows the newest numbered revision; an
// existing Working copy stays preserved but is not loaded (#409).
export function reentryView(experiment) {
  return revisionView(experiment.revision);
}

// The retained snapshot of the head revision, falling back to the head row.
export function latestSnapshot(revisions, remote) {
  return revisions.find((revision) => revision.revision === remote.revision) ?? remote;
}

// The numbered revision currently viewed, if any.
export function viewedRevisionSnapshot(view, revisions, remote) {
  if (view.kind !== "revision") return null;
  return revisions.find((revision) => revision.revision === view.revision)
    ?? (remote?.revision === view.revision ? remote : null);
}

// What the editors are compared against to decide whether edits are unsaved.
export function editingBaseline({ view, workingCopy, revisions, remote }) {
  if (view.kind === "working") return workingCopy;
  if (view.kind === "revision") return viewedRevisionSnapshot(view, revisions, remote);
  return remote;
}

// The revision a newly autosaved Working copy is based on: an existing Working
// copy keeps its base; otherwise the viewed revision; otherwise the head.
export function workingCopyBaseRevision({ workingCopy, view, remote }) {
  const selectedRevision = view.kind === "revision" ? view.revision : null;
  return workingCopy?.base_revision ?? selectedRevision ?? remote.revision;
}

export function revisionIsMine(revision, userId) {
  return Boolean(userId && revision.created_by_actor === "human" && revision.created_by_user === userId);
}

export function revisionKindLabel(revision, userId) {
  if (revision.created_by_actor === "ai") return "AI";
  return revisionIsMine(revision, userId) ? "Mine" : "Human";
}

export function isViewedRevision(view, revision) {
  return view.kind === "revision" && view.revision === revision.revision;
}

// The revision-history list for a filter ("all" | "mine" | "ai"): the Working
// copy first (never under "ai"), then matching numbered revisions newest
// first as loaded, or one empty-state message.
export function historyEntries({ remote, workingCopy, revisions, filter, userId, view }) {
  if (!remote) {
    return { entries: [], empty: "Showcase Experiments do not have private revision history here." };
  }
  const entries = [];
  if (workingCopy && filter !== "ai") {
    entries.push({ type: "working", current: view.kind === "working" });
  }
  for (const revision of revisions) {
    if (filter === "mine" && !revisionIsMine(revision, userId)) continue;
    if (filter === "ai" && revision.created_by_actor !== "ai") continue;
    entries.push({ type: "revision", revision, current: isViewedRevision(view, revision) });
  }
  if (entries.length) return { entries, empty: null };
  return {
    entries,
    empty: filter === "mine"
      ? "No numbered revisions from this account yet."
      : filter === "ai"
        ? "No AI revisions yet."
        : "No retained revisions are available.",
  };
}

export function openedMessage(experiment, workingCopy) {
  return workingCopy
    ? experiment.title + " · latest revision " + experiment.revision
      + " loaded. Working copy based on revision " + workingCopy.base_revision + " remains preserved."
    : experiment.title + " · revision " + experiment.revision + " loaded.";
}

export function selectedRevisionMessage(revision, workingCopy) {
  const preserved = workingCopy
    ? " Working copy based on R" + workingCopy.base_revision + " remains preserved."
    : "";
  return "Revision " + revision.revision + " loaded." + preserved;
}

export function replaceWorkingCopyQuestion(workingCopy, revision) {
  return "Replace the existing Working copy based on R" + workingCopy.base_revision
    + " with a new Working copy from R" + revision.revision + "?";
}

export function discardWorkingCopyQuestion(workingCopy) {
  return "Discard the Working copy based on R" + workingCopy.base_revision
    + "? Numbered revisions will remain unchanged.";
}

// After a discard the head revision is shown again.
export function afterDiscard(revisions, remote) {
  return {
    view: revisionView(remote.revision),
    snapshot: latestSnapshot(revisions, remote),
    message: "Working copy discarded. Latest revision R" + remote.revision + " loaded.",
  };
}
