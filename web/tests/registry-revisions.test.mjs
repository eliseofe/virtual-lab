// Behaviour tests for Experiment revisions and the Working copy (#545), covering
// the rules introduced by #397 (Working copy), #398 (revision history),
// #399 (integrated workflow) and #409 (re-entry and discard).

import assert from "node:assert/strict";
import test from "node:test";

import {
  afterDiscard,
  discardWorkingCopyQuestion,
  editingBaseline,
  historyEntries,
  isViewedRevision,
  latestSnapshot,
  openedMessage,
  ownsExperiment,
  reentryView,
  replaceWorkingCopyQuestion,
  revisionIsMine,
  revisionKindLabel,
  selectedRevisionMessage,
  viewedRevisionSnapshot,
  workingCopyBaseRevision,
} from "../src/registry/revisions.js";

const me = "user-me";
const other = "user-other";
const remote = { id: "exp-1", owner_id: me, title: "Flocking", revision: 3 };
const r3 = { revision: 3, base_revision: 2, created_by_actor: "human", created_by_user: me };
const r2 = { revision: 2, base_revision: 1, created_by_actor: "ai", created_by_user: me };
const r1 = { revision: 1, base_revision: null, created_by_actor: "human", created_by_user: other };
const revisions = [r3, r2, r1];
const workingCopy = { experiment_id: "exp-1", base_revision: 2 };

test("#409 reopening shows the newest numbered revision even when a Working copy exists", () => {
  assert.deepEqual(reentryView(remote), { kind: "revision", revision: 3 });
  assert.equal(latestSnapshot(revisions, remote), r3);
  assert.equal(latestSnapshot([], remote), remote, "falls back to the head row when history is not retained");
  assert.equal(
    openedMessage(remote, workingCopy),
    "Flocking · latest revision 3 loaded. Working copy based on revision 2 remains preserved.",
  );
  assert.equal(openedMessage(remote, null), "Flocking · revision 3 loaded.");
});

test("#397 unsaved edits are judged against the Working copy, the viewed revision, or the head", () => {
  assert.equal(editingBaseline({ view: { kind: "working", revision: null }, workingCopy, revisions, remote }), workingCopy);
  assert.equal(editingBaseline({ view: { kind: "revision", revision: 2 }, workingCopy, revisions, remote }), r2);
  assert.equal(editingBaseline({ view: { kind: "catalog", revision: null }, workingCopy: null, revisions, remote }), remote);
  assert.equal(viewedRevisionSnapshot({ kind: "revision", revision: 3 }, [], remote), remote);
  assert.equal(viewedRevisionSnapshot({ kind: "revision", revision: 9 }, revisions, remote), null);
  assert.equal(viewedRevisionSnapshot({ kind: "working", revision: null }, revisions, remote), null);
});

test("#397 a new Working copy keeps an existing base, else the viewed revision, else the head", () => {
  assert.equal(workingCopyBaseRevision({ workingCopy, view: { kind: "revision", revision: 1 }, remote }), 2);
  assert.equal(workingCopyBaseRevision({ workingCopy: null, view: { kind: "revision", revision: 1 }, remote }), 1);
  assert.equal(workingCopyBaseRevision({ workingCopy: null, view: { kind: "working", revision: null }, remote }), 3);
});

test("#397 only the owner manages a Working copy", () => {
  assert.equal(ownsExperiment(me, remote), true);
  assert.equal(ownsExperiment(other, remote), false);
  assert.equal(ownsExperiment(null, remote), false);
  assert.equal(ownsExperiment(me, null), false);
});

test("#398 revisions are labelled Mine, Human or AI from the viewer's perspective", () => {
  assert.equal(revisionKindLabel(r3, me), "Mine");
  assert.equal(revisionKindLabel(r1, me), "Human");
  assert.equal(revisionKindLabel(r2, me), "AI", "AI edits are AI even when made through the owner's connection");
  assert.equal(revisionKindLabel(r3, null), "Human");
  assert.equal(revisionIsMine(r2, me), false);
});

test("#398 history lists the Working copy first, then filtered revisions, marking the current view", () => {
  const working = historyEntries({ remote, workingCopy, revisions, filter: "all", userId: me, view: { kind: "working", revision: null } });
  assert.deepEqual(working.entries.map((entry) => entry.type === "working" ? "W" : entry.revision.revision), ["W", 3, 2, 1]);
  assert.deepEqual(working.entries.map((entry) => entry.current), [true, false, false, false]);
  assert.equal(working.empty, null);

  const viewingR2 = historyEntries({ remote, workingCopy, revisions, filter: "all", userId: me, view: { kind: "revision", revision: 2 } });
  assert.deepEqual(viewingR2.entries.map((entry) => entry.current), [false, false, true, false]);

  const mine = historyEntries({ remote, workingCopy, revisions, filter: "mine", userId: me, view: { kind: "revision", revision: 3 } });
  assert.deepEqual(mine.entries.map((entry) => entry.type === "working" ? "W" : entry.revision.revision), ["W", 3]);

  const ai = historyEntries({ remote, workingCopy, revisions, filter: "ai", userId: me, view: { kind: "revision", revision: 3 } });
  assert.deepEqual(ai.entries.map((entry) => entry.revision.revision), [2], "the Working copy is never listed under AI");
});

test("#398 history explains every empty state", () => {
  const view = { kind: "revision", revision: 1 };
  assert.equal(historyEntries({ remote: null, workingCopy: null, revisions: [], filter: "all", userId: me, view }).empty,
    "Showcase Experiments do not have private revision history here.");
  assert.equal(historyEntries({ remote, workingCopy: null, revisions: [r1], filter: "mine", userId: me, view }).empty,
    "No numbered revisions from this account yet.");
  assert.equal(historyEntries({ remote, workingCopy: null, revisions: [r1], filter: "ai", userId: me, view }).empty,
    "No AI revisions yet.");
  assert.equal(historyEntries({ remote, workingCopy: null, revisions: [], filter: "all", userId: me, view }).empty,
    "No retained revisions are available.");
  assert.equal(historyEntries({ remote, workingCopy, revisions: [], filter: "mine", userId: me, view }).empty, null,
    "a Working copy alone is not an empty history");
});

test("#399 viewing another revision keeps the Working copy and says so", () => {
  assert.equal(selectedRevisionMessage(r1, workingCopy), "Revision 1 loaded. Working copy based on R2 remains preserved.");
  assert.equal(selectedRevisionMessage(r1, null), "Revision 1 loaded.");
  assert.equal(isViewedRevision({ kind: "revision", revision: 1 }, r1), true);
  assert.equal(isViewedRevision({ kind: "working", revision: null }, r1), false);
  assert.equal(replaceWorkingCopyQuestion(workingCopy, r1),
    "Replace the existing Working copy based on R2 with a new Working copy from R1?");
});

test("#409 discarding asks first, keeps numbered revisions, and returns to the head revision", () => {
  assert.equal(discardWorkingCopyQuestion(workingCopy),
    "Discard the Working copy based on R2? Numbered revisions will remain unchanged.");
  const discarded = afterDiscard(revisions, remote);
  assert.deepEqual(discarded.view, { kind: "revision", revision: 3 });
  assert.equal(discarded.snapshot, r3);
  assert.equal(discarded.message, "Working copy discarded. Latest revision R3 loaded.");
});
