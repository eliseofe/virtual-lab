// Behaviour tests for the Experiment workspace labels and sharing rules
// (#554), covering #76, #157, #287, #289, #299 and #397.

import assert from "node:assert/strict";
import test from "node:test";

import {
  AI_CLIENT_LABELS,
  availableShareRecipients,
  collectionName,
  connectedMessage,
  currentLocationLabel,
  currentOutgoingShares,
  formatRevisionTime,
  newRevisionMessage,
  revisionActor,
  shareRecipientLabel,
  shareRecipientOptionLabel,
  sharedWithLabel,
  supervisedResearcherName,
} from "../src/registry/labels.js";

const collections = [{ id: "k1", name: "Thesis" }];
const supervisedProfiles = [{ id: "stu-1", display_name: " Ben " }, { id: "stu-2", display_name: "  " }];
const recipients = [
  { id: "r1", display_name: "Ada", role: "student" },
  { id: "r2", display_name: " ", role: "professor" },
];

test("#397 each revision says who made it: Mine, Human, or the AI client", () => {
  assert.equal(revisionActor({ created_by_actor: "human", created_by_user: "u1" }, "u1"), "Mine");
  assert.equal(revisionActor({ created_by_actor: "human", created_by_user: "u2" }, "u1"), "Human");
  assert.equal(revisionActor({ created_by_actor: "human", owner_id: "u1" }, "u1"), "Mine", "falls back to the owner");
  assert.equal(revisionActor({ updated_by_actor: "ai", updated_by_ai_client: "f9ea9bbe-2e3f-497d-92b3-5f108b64593c" }, "u1"), "Claude");
  assert.equal(revisionActor({ created_by_actor: "ai", created_by_ai_client: "unknown-client" }, "u1"), "AI · unknown-client");
  assert.equal(revisionActor({ created_by_actor: "ai" }, "u1"), "AI");
  assert.equal(revisionActor({ created_by_actor: "system" }, "u1"), "system");
  assert.equal(revisionActor({}, "u1"), "");
  assert.deepEqual(new Set(Object.values(AI_CLIENT_LABELS)), new Set(["Claude", "Grok", "ChatGPT", "AI · legacy MCP client"]));
});

test("#397 revision times are shown only when valid", () => {
  assert.equal(formatRevisionTime(null), "");
  assert.equal(formatRevisionTime("not a date"), "");
  assert.match(formatRevisionTime("2026-09-24T10:00:00Z"), /2026/);
});

test("#157 an Experiment without a known collection is Unfiled", () => {
  assert.equal(collectionName(collections, "k1"), "Thesis");
  assert.equal(collectionName(collections, null), "Unfiled");
  assert.equal(collectionName(collections, "gone"), "Unfiled");
});

test("#287/#289/#299 the location label says whose Experiment it is", () => {
  const base = { collections, supervisedProfiles };
  assert.equal(currentLocationLabel({ ...base, remote: null, access: null }), "Showcase");
  assert.equal(currentLocationLabel({ ...base, remote: { owner_id: "x" }, access: "shared" }), "Shared with me");
  assert.equal(currentLocationLabel({ ...base, remote: { owner_id: "stu-1" }, access: "supervised" }), "Supervised · Ben");
  assert.equal(currentLocationLabel({ ...base, remote: { owner_id: "stu-2" }, access: "supervised" }), "Supervised · Student researcher");
  assert.equal(currentLocationLabel({ ...base, remote: { collection_id: "k1" }, access: "owned" }), "Collection · Thesis");
  assert.equal(currentLocationLabel({ ...base, remote: { collection_id: null }, access: "owned" }), "No collection");
  assert.equal(supervisedResearcherName(supervisedProfiles, "missing"), "Student researcher");
});

test("#289 only the owner sees an Experiment's shares, and can share only with researchers not yet shared with", () => {
  const remote = { id: "e1", owner_id: "u1" };
  const outgoingShares = [
    { experiment_id: "e1", recipient_id: "r1" },
    { experiment_id: "e2", recipient_id: "r2" },
  ];
  const mine = currentOutgoingShares({ remote, userId: "u1", outgoingShares });
  assert.deepEqual(mine.map((share) => share.recipient_id), ["r1"]);
  assert.deepEqual(currentOutgoingShares({ remote, userId: "u2", outgoingShares }), [], "not the owner");
  assert.deepEqual(currentOutgoingShares({ remote: null, userId: "u1", outgoingShares }), []);
  assert.deepEqual(currentOutgoingShares({ remote, userId: undefined, outgoingShares }), [], "signed out");
  assert.deepEqual(availableShareRecipients(recipients, mine).map((recipient) => recipient.id), ["r2"]);
  assert.deepEqual(availableShareRecipients(recipients, []).map((recipient) => recipient.id), ["r1", "r2"]);
});

test("#289 share recipients are named by display name, else by role", () => {
  assert.equal(shareRecipientLabel(recipients, "r1"), "Ada");
  assert.equal(shareRecipientLabel(recipients, "r2"), "professor");
  assert.equal(shareRecipientLabel(recipients, "missing"), "Researcher");
  assert.equal(shareRecipientOptionLabel(recipients[0]), "Ada · student");
  assert.equal(shareRecipientOptionLabel(recipients[1]), "professor");
  assert.equal(sharedWithLabel("Ada"), "Shared read-only with Ada");
});

test("#299 the library summary counts supervised Experiments only for Professors", () => {
  const counts = { count: 1, collectionCount: 2, hiddenCount: 0, sharedCount: 3, supervisedCount: 4 };
  assert.equal(connectedMessage({ ...counts, professor: false }),
    "Your library is ready: 1 experiment in 2 collections plus Unfiled, with 3 shared with you.");
  assert.equal(connectedMessage({ ...counts, professor: true }),
    "Your library is ready: 1 experiment in 2 collections plus Unfiled, with 3 shared with you and 4 supervised.");
  assert.equal(connectedMessage({ ...counts, count: 0, collectionCount: 1, hiddenCount: 1, professor: false }),
    "Your library is ready: 0 experiments in 1 collection plus Unfiled, with 3 shared with you. 1 older or incompatible experiment is hidden.");
  assert.match(connectedMessage({ ...counts, hiddenCount: 2, professor: false }), / 2 older or incompatible experiments are hidden\.$/);
});

test("#397 a newer revision from someone else is announced without changing the view", () => {
  assert.equal(newRevisionMessage(7, "Claude"), "New revision R7 from Claude is available. Your current view was not changed.");
  assert.equal(newRevisionMessage(7, ""), "New revision R7 is available. Your current view was not changed.");
});
