// Behaviour tests for what the Experiment workspace shows for the open
// Experiment (#554), covering #157, #287, #288, #289, #290, #299, #397, #398,
// #399, #409 and #444.

import assert from "node:assert/strict";
import test from "node:test";

import { workspaceStatus } from "../src/registry/workspace-status.js";

const catalog = { key: "active-elastic", title: "Active elastic" };
const own = { id: "e1", owner_id: "u1", title: "Flocking", revision: 3, collection_id: "k1" };
const revisions = [
  { revision: 3, created_by_actor: "ai", created_by_ai_client: "f9ea9bbe-2e3f-497d-92b3-5f108b64593c" },
  { revision: 2, created_by_actor: "human", created_by_user: "u1" },
];

function status(overrides = {}) {
  return workspaceStatus({
    userId: "u1",
    remote: own,
    access: "owned",
    workingCopy: null,
    revisions,
    view: { kind: "revision", revision: 3 },
    showcase: null,
    catalog,
    dirty: false,
    collections: [{ id: "k1", name: "Thesis" }],
    supervisedProfiles: [{ id: "stu-1", display_name: "Ben" }],
    availableRecipientCount: 1,
    hasOutgoingShares: false,
    ...overrides,
  });
}

test("signed out: a Showcase Experiment can be edited locally but nothing can be saved", () => {
  const s = status({ userId: undefined, remote: null, view: { kind: "catalog", revision: null } });
  assert.equal(s.title, "Active elastic");
  assert.deepEqual(s.origin, { kind: "readonly", text: "Showcase · Read-only" });
  assert.equal(s.location, "Showcase");
  assert.equal(s.metadataRevision, "Showcase · Catalog");
  assert.equal(s.revisionWorkflowHidden, true);
  assert.equal(s.revisionBadge, null, "the revision badge is left as it is");
  assert.deepEqual(s.notice, { hidden: true, text: null });
  assert.equal(s.saveRowHidden, true);
  assert.equal(s.saveAsNewHidden, true);
  assert.equal(s.saveHidden, true);
  assert.equal(s.moveRowHidden, true);
  assert.equal(s.shareRowHidden, true);
  assert.equal(s.saveState, null, "the save state is left as it is");
  assert.equal(s.note, "You can edit and run this Showcase Experiment locally. Sign in to save a private copy or open your own library.");
});

test("#157 signed in on a Showcase source: read-only, Save as new makes a private copy", () => {
  const entry = { showcase_id: "s1", title: "Curated", showcase_collection_name: null, source_revision: 4 };
  const s = status({ remote: null, showcase: entry, view: { kind: "showcase", revision: 4 } });
  assert.equal(s.title, "Curated");
  assert.equal(s.location, "Showcase / Uncategorized");
  assert.equal(s.metadataRevision, "Showcase · R4");
  assert.equal(s.saveRowHidden, false);
  assert.equal(s.saveAsNewHidden, false);
  assert.equal(s.saveHidden, true);
  assert.equal(s.createNewText, "Create private copy");
  assert.deepEqual(s.saveState, { state: "readonly", text: "Read-only" });
  assert.equal(s.note, "The Showcase source cannot be overwritten. Save as new creates an independent private copy.");
});

test("#444 an own saved Experiment shows its revision tersely and can be edited", () => {
  const s = status();
  assert.equal(s.owned, true);
  assert.equal(s.title, "Flocking");
  assert.deepEqual(s.origin, { kind: "owned", text: "Your experiment · Editable" });
  assert.equal(s.location, "Collection · Thesis");
  assert.deepEqual(s.revisionBadge, { primary: "3", ariaLabel: "Open revision history. Revision 3" });
  assert.equal(s.metadataRevision, "Revision R3");
  assert.deepEqual(s.notice, { hidden: true, text: "" });
  assert.equal(s.saveHidden, false);
  assert.equal(s.saveDisabled, true, "nothing to save yet");
  assert.equal(s.moveRowHidden, false);
  assert.equal(s.lockEditors, false);
  assert.deepEqual(s.saveState, { state: "saved", text: "3 · Saved" });
  assert.equal(s.note, "Edit normally to create a Working copy; Save Revision crystallizes it as the next numbered revision.");
});

test("#397 unsaved edits are pending until autosaved to the Working copy", () => {
  const s = status({ dirty: true });
  assert.equal(s.saveDisabled, false);
  assert.deepEqual(s.saveState, { state: "dirty", text: "Working · pending · 3" });
  assert.equal(s.note, "Leaving the editor or taking another action autosaves the Working copy. Save Revision creates a numbered revision.");
});

test("#397/#444 viewing the durable Working copy", () => {
  const workingCopy = { base_revision: 3 };
  const s = status({ workingCopy, view: { kind: "working", revision: null } });
  assert.deepEqual(s.revisionBadge, { primary: "W", ariaLabel: "Open revision history. Working copy based on revision 3" });
  assert.equal(s.metadataRevision, "Working copy · based on R3");
  assert.equal(s.saveDisabled, false, "a Working copy can be saved as a revision");
  assert.equal(s.discardHidden, false);
  assert.deepEqual(s.saveState, { state: "saved", text: "Working · 3" });
  assert.equal(s.note, "Working copy is durable. Save Revision crystallizes it as the next numbered revision.");
});

test("#397/#398 a newer revision from someone else is announced; the Working copy is kept", () => {
  const workingCopy = { base_revision: 2 };
  const s = status({ workingCopy, view: { kind: "working", revision: null } });
  assert.deepEqual(s.notice, { hidden: false, text: "New · 3 · Claude" });
  assert.equal(s.note, "A newer numbered revision is available. Your Working copy remains preserved; Save Revision will create the next chronological revision.");
});

test("#398 inspecting an older revision is historical and starts a Working copy from it", () => {
  const s = status({ view: { kind: "revision", revision: 2 } });
  assert.deepEqual(s.revisionBadge, { primary: "2", ariaLabel: "Open revision history. Revision 2" });
  assert.deepEqual(s.notice, { hidden: false, text: "New · 3 · Claude" });
  assert.deepEqual(s.saveState, { state: "saved", text: "2 · Historical" });
  assert.equal(s.note, "Edit normally to start a Working copy from this revision. Numbered history remains unchanged.");
});

test("#398/#409 an existing Working copy is protected while inspecting numbered history", () => {
  const s = status({ workingCopy: { base_revision: 3 }, view: { kind: "revision", revision: 2 } });
  assert.deepEqual(s.editFromRevision, { hidden: false, text: "Edit from R2" });
  assert.equal(s.lockEditors, true);
  assert.equal(s.saveHidden, true);
  assert.equal(s.saveDisabled, true);
  assert.equal(s.discardHidden, false, "the owner can discard the Working copy");
  assert.deepEqual(s.saveState, { state: "saved", text: "2 · Working 3" });
  assert.equal(s.note, "Select Working copy to resume it, or choose Edit from this revision to replace it explicitly.");
  assert.deepEqual(status().editFromRevision, { hidden: true, text: null });
});

test("#289/#299 shared and supervised Experiments are read-only and can only be copied", () => {
  const shared = status({ remote: { ...own, owner_id: "u2" }, access: "shared" });
  assert.equal(shared.owned, false);
  assert.deepEqual(shared.origin, { kind: "readonly", text: "Read-only" });
  assert.equal(shared.location, "Shared with me");
  assert.equal(shared.saveHidden, true);
  assert.equal(status({ remote: { ...own, owner_id: "u2" }, access: "shared", dirty: true }).saveDisabled, true, "local edits never make someone else's Experiment saveable");
  assert.equal(shared.moveRowHidden, true);
  assert.equal(shared.discardHidden, true);
  assert.equal(shared.shareRowHidden, true);
  assert.equal(shared.createNewText, "Copy to my Experiments");
  assert.deepEqual(shared.saveState, { state: "readonly", text: "3 · Read-only" });
  assert.match(shared.note, /^This shared revision stays read-only\./);

  const supervised = status({ remote: { ...own, owner_id: "stu-1" }, access: "supervised", view: { kind: "revision", revision: 2 } });
  assert.equal(supervised.location, "Supervised · Ben");
  assert.deepEqual(supervised.saveState, { state: "readonly", text: "2 · Read-only" }, "copies the exact revision being viewed");
  assert.match(supervised.note, /^This supervised revision stays read-only\./);
});

test("#290 the owner manages shares only when someone can be shared with or is shared with", () => {
  assert.equal(status({ availableRecipientCount: 1 }).shareRowHidden, false);
  assert.equal(status({ availableRecipientCount: 1 }).shareOpenHidden, false);
  const onlyExisting = status({ availableRecipientCount: 0, hasOutgoingShares: true });
  assert.equal(onlyExisting.shareRowHidden, false, "existing shares stay revocable");
  assert.equal(onlyExisting.shareOpenHidden, true);
  assert.equal(onlyExisting.closeShareForm, true);
  assert.equal(status({ availableRecipientCount: 0, hasOutgoingShares: false }).shareRowHidden, true);
});
