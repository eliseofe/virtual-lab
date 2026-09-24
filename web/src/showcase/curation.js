// Showcase curation rules (#149, #240, #413, #430, #444, #480), as pure
// functions: no DOM, no Supabase. showcase.js asks these for every decision;
// web/tests/showcase-curation.test.mjs tests them directly (#552).

export const PROFESSOR_REQUIRED = "Professor role required.";

export function isProfessor(profile) {
  return profile?.role === "professor";
}

// Curation actions are for Professors only.
export function assertProfessor(profile) {
  if (!isProfessor(profile)) throw new Error(PROFESSOR_REQUIRED);
}

// Promotion is offered only to a Professor, and not while a Showcase entry itself is open.
export function curationAvailable({ professor, showcaseOpen }) {
  return professor && !showcaseOpen;
}

export function formatDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(undefined, { year: "numeric", month: "short", day: "numeric" }).format(date);
}

export function activeEntryForExperiment(entries, experimentId) {
  if (!experimentId) return null;
  return entries.find((entry) => entry.source_experiment_id === experimentId) || null;
}

export function activeEntryForCatalog(entries, sourceKey) {
  if (!sourceKey) return null;
  return entries.find((entry) => entry.source_key === sourceKey) || null;
}

// A catalog Experiment's title, from its picker option text without the " · Showcase" suffix.
export function catalogSourceTitle(optionText, key) {
  return optionText?.replace(/\s+·\s+Showcase$/, "")?.trim() || key;
}

// The promote button for the currently open Experiment:
//   { hidden: true } or { hidden: false, text, disabled, status? }
// `experiment` is the open registry Experiment when the signed-in user owns it.
export function promoteButtonState({ professor, showcaseOpen, registryId, experiment, catalogSource, entries, saveState, busy }) {
  if (!curationAvailable({ professor, showcaseOpen })) return { hidden: true };
  if (registryId) {
    if (!experiment) return { hidden: true };
    const active = activeEntryForExperiment(entries, experiment.id);
    if (active?.source_revision === experiment.revision && saveState === "saved") {
      return { hidden: false, text: "In Showcase", disabled: true };
    }
    if (saveState === "conflict") {
      return { hidden: false, text: "Publish to Showcase", disabled: true, status: { text: "Save conflict", state: "error" } };
    }
    return { hidden: false, text: active ? "Publish current revision" : "Promote to Showcase", disabled: busy };
  }
  if (!catalogSource) return { hidden: true };
  const active = activeEntryForCatalog(entries, catalogSource.key);
  return { hidden: false, text: active ? "In Showcase" : "Promote to Showcase", disabled: busy || Boolean(active) };
}

// What promoting a registry Experiment must do first, given its save state:
// publish a saved revision, save pending edits first, or refuse.
export function promotionReadiness(saveState) {
  if (saveState === "conflict") return { action: "error", error: "Resolve the save conflict before publishing this Experiment." };
  if (saveState === "saved") return { action: "publish" };
  if (saveState === "dirty") return { action: "save" };
  return { action: "error", error: "This Experiment is not ready for promotion yet." };
}

// Collection choices for an entry: Uncategorized first, then the collections in order.
export function collectionChoices(collections) {
  return [["", "Uncategorized"], ...collections.map((collection) => [collection.showcase_collection_id, collection.name])];
}

export function collectionLabel(collection) {
  return `${collection.name} · ${collection.experiment_count}`;
}

export function entryMeta(entry, format = formatDate) {
  const date = format(entry.published_at);
  const revision = entry.source_revision == null ? "Catalog" : `R${entry.source_revision}`;
  return `${revision}${date ? ` · ${date}` : ""}`;
}

export function entryCountMessage(count) {
  return `${count} Showcase experiment${count === 1 ? "" : "s"}.`;
}

export function collectionNameError(name) {
  return name ? null : "Enter a Showcase collection name.";
}

// The new name from the rename prompt, or null when nothing should change.
export function renamedCollectionName(input, currentName) {
  const name = input?.trim();
  return !name || name === currentName ? null : name;
}

export function deleteCollectionConfirmation(collection) {
  return `Delete Showcase collection “${collection.name}”? Its Experiments will move to Uncategorized.`;
}

export function removeEntryConfirmation(entry) {
  return `Remove “${entry.title}” from Showcase?`;
}

export function movedMessage(entry) {
  return `Moved “${entry.title}” to ${entry.showcase_collection_name || "Showcase collection"}.`;
}

// How an open Showcase entry presents itself: read-only, placed in its collection, with its revision.
export function showcaseSourceLabels(entry) {
  return {
    origin: "Showcase · Read-only",
    location: `Showcase / ${entry.showcase_collection_name || "Uncategorized"}`,
    revision: entry.source_revision == null ? "Showcase · Catalog" : `Showcase · R${entry.source_revision}`,
    meta: entry.source_revision == null ? "Curated snapshot." : `Curated revision ${entry.source_revision}.`,
  };
}

export function privateCopyTitle(entry) {
  return `${entry.title} copy`;
}
