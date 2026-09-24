// Behaviour tests for the Showcase curation rules (#552), covering #149, #240,
// #413, #430, #444 and #480.

import assert from "node:assert/strict";
import test from "node:test";

import {
  PROFESSOR_REQUIRED,
  activeEntryForCatalog,
  activeEntryForExperiment,
  assertProfessor,
  catalogSourceTitle,
  collectionChoices,
  collectionLabel,
  collectionNameError,
  curationAvailable,
  deleteCollectionConfirmation,
  entryCountMessage,
  entryMeta,
  isProfessor,
  movedMessage,
  privateCopyTitle,
  promoteButtonState,
  promotionReadiness,
  removeEntryConfirmation,
  renamedCollectionName,
  showcaseSourceLabels,
} from "../src/showcase/curation.js";

const entries = [
  { showcase_id: "s1", title: "Flocking", source_experiment_id: "e1", source_revision: 3, published_at: "2026-09-01T12:00:00Z", showcase_collection_name: "Classics" },
  { showcase_id: "s2", title: "Aggregation", source_key: "catalog:aggregation", source_revision: null, published_at: "not a date", showcase_collection_name: null },
];

const professorRegistry = (overrides = {}) => promoteButtonState({
  professor: true,
  showcaseOpen: false,
  registryId: "e1",
  experiment: { id: "e1", revision: 3 },
  catalogSource: null,
  entries,
  saveState: "saved",
  busy: false,
  ...overrides,
});

test("#149/#430 only a Professor may curate the Showcase", () => {
  assert.equal(isProfessor({ role: "professor" }), true);
  assert.equal(isProfessor({ role: "student" }), false);
  assert.equal(isProfessor(null), false);
  assert.doesNotThrow(() => assertProfessor({ role: "professor" }));
  assert.throws(() => assertProfessor({ role: "student" }), { message: PROFESSOR_REQUIRED });
  assert.throws(() => assertProfessor(null), { message: "Professor role required." });
  assert.equal(curationAvailable({ professor: true, showcaseOpen: false }), true);
  assert.equal(curationAvailable({ professor: true, showcaseOpen: true }), false, "not while a Showcase entry itself is open");
  assert.equal(curationAvailable({ professor: false, showcaseOpen: false }), false);
});

test("#413 the promote button is hidden unless a Professor has an own or catalog Experiment open", () => {
  assert.deepEqual(professorRegistry({ professor: false }), { hidden: true });
  assert.deepEqual(professorRegistry({ showcaseOpen: true }), { hidden: true });
  assert.deepEqual(professorRegistry({ experiment: null }), { hidden: true }, "someone else's registry Experiment");
  assert.deepEqual(professorRegistry({ registryId: null, catalogSource: null }), { hidden: true });
});

test("#413/#444 an own Experiment: promote, publish a newer revision, or already in Showcase", () => {
  assert.deepEqual(professorRegistry(), { hidden: false, text: "In Showcase", disabled: true });
  assert.deepEqual(professorRegistry({ experiment: { id: "e1", revision: 4 } }), { hidden: false, text: "Publish current revision", disabled: false });
  assert.deepEqual(professorRegistry({ saveState: "dirty" }), { hidden: false, text: "Publish current revision", disabled: false }, "unsaved edits are published after saving");
  assert.deepEqual(professorRegistry({ experiment: { id: "e9", revision: 1 } }), { hidden: false, text: "Promote to Showcase", disabled: false });
  assert.deepEqual(professorRegistry({ experiment: { id: "e9", revision: 1 }, busy: true }), { hidden: false, text: "Promote to Showcase", disabled: true });
  assert.deepEqual(professorRegistry({ saveState: "conflict", experiment: { id: "e1", revision: 4 } }), {
    hidden: false, text: "Publish to Showcase", disabled: true, status: { text: "Save conflict", state: "error" },
  });
});

test("#240 a catalog Experiment can be promoted once", () => {
  const catalog = (key, busy = false) => promoteButtonState({ professor: true, showcaseOpen: false, registryId: null, catalogSource: { key }, entries, busy });
  assert.deepEqual(catalog("catalog:aggregation"), { hidden: false, text: "In Showcase", disabled: true });
  assert.deepEqual(catalog("catalog:flocking"), { hidden: false, text: "Promote to Showcase", disabled: false });
  assert.deepEqual(catalog("catalog:flocking", true), { hidden: false, text: "Promote to Showcase", disabled: true });
  assert.equal(catalogSourceTitle("Aggregation · Showcase", "catalog:aggregation"), "Aggregation");
  assert.equal(catalogSourceTitle("  ", "catalog:aggregation"), "catalog:aggregation");
  assert.equal(catalogSourceTitle(undefined, "catalog:x"), "catalog:x");
});

test("#240 an entry is matched to its source Experiment or catalog key", () => {
  assert.equal(activeEntryForExperiment(entries, "e1")?.showcase_id, "s1");
  assert.equal(activeEntryForExperiment(entries, "e9"), null);
  assert.equal(activeEntryForExperiment(entries, null), null);
  assert.equal(activeEntryForCatalog(entries, "catalog:aggregation")?.showcase_id, "s2");
  assert.equal(activeEntryForCatalog(entries, ""), null);
});

test("#240 promoting saves pending edits first and refuses a conflict", () => {
  assert.deepEqual(promotionReadiness("saved"), { action: "publish" });
  assert.deepEqual(promotionReadiness("dirty"), { action: "save" });
  assert.deepEqual(promotionReadiness("conflict"), { action: "error", error: "Resolve the save conflict before publishing this Experiment." });
  assert.deepEqual(promotionReadiness(""), { action: "error", error: "This Experiment is not ready for promotion yet." });
});

test("#480 entries are placed in collections, Uncategorized first", () => {
  const collections = [
    { showcase_collection_id: "c1", name: "Classics", experiment_count: 2 },
    { showcase_collection_id: "c2", name: "New", experiment_count: 0 },
  ];
  assert.deepEqual(collectionChoices(collections), [["", "Uncategorized"], ["c1", "Classics"], ["c2", "New"]]);
  assert.deepEqual(collectionChoices([]), [["", "Uncategorized"]]);
  assert.equal(collectionLabel(collections[0]), "Classics · 2");
  assert.equal(movedMessage(entries[0]), "Moved “Flocking” to Classics.");
  assert.equal(movedMessage(entries[1]), "Moved “Aggregation” to Showcase collection.");
});

test("#480 collection names are required, and renames that change nothing are ignored", () => {
  assert.equal(collectionNameError(""), "Enter a Showcase collection name.");
  assert.equal(collectionNameError("Classics"), null);
  assert.equal(renamedCollectionName("  Classics 2 ", "Classics"), "Classics 2");
  assert.equal(renamedCollectionName(" Classics ", "Classics"), null);
  assert.equal(renamedCollectionName("   ", "Classics"), null);
  assert.equal(renamedCollectionName(null, "Classics"), null, "the prompt was cancelled");
  assert.equal(deleteCollectionConfirmation({ name: "Classics" }), "Delete Showcase collection “Classics”? Its Experiments will move to Uncategorized.");
  assert.equal(removeEntryConfirmation(entries[0]), "Remove “Flocking” from Showcase?");
});

test("#149 entries show their revision and publication date", () => {
  const format = (value) => (value === "not a date" ? "" : `[${value}]`);
  assert.equal(entryMeta(entries[0], format), "R3 · [2026-09-01T12:00:00Z]");
  assert.equal(entryMeta(entries[1], format), "Catalog");
  assert.equal(entryMeta(entries[1]), "Catalog", "an invalid date is left out");
  assert.equal(entryCountMessage(1), "1 Showcase experiment.");
  assert.equal(entryCountMessage(0), "0 Showcase experiments.");
});

test("#149/#480 an open Showcase entry is read-only and says where it comes from", () => {
  assert.deepEqual(showcaseSourceLabels(entries[0]), {
    origin: "Showcase · Read-only",
    location: "Showcase / Classics",
    revision: "Showcase · R3",
    meta: "Curated revision 3.",
  });
  assert.deepEqual(showcaseSourceLabels(entries[1]), {
    origin: "Showcase · Read-only",
    location: "Showcase / Uncategorized",
    revision: "Showcase · Catalog",
    meta: "Curated snapshot.",
  });
  assert.equal(privateCopyTitle(entries[0]), "Flocking copy");
});
