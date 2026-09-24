// Experiment workspace labels and sharing rules (#76, #157, #287, #289, #299,
// #397), as pure functions: no DOM, no Supabase. registry-ui-v3.js asks these
// for every such label; web/tests/registry-labels.test.mjs tests them directly
// (#554).

export const AI_CLIENT_LABELS = Object.freeze({
  "f9ea9bbe-2e3f-497d-92b3-5f108b64593c": "Claude",
  "7f8986f1-11c3-4be5-8cc7-3887dfb038d9": "Claude",
  "12e106dc-4da6-49cd-9062-d0a4bb5c34c6": "Grok",
  "13c111c5-64f6-4be5-9e02-7188dd104cce": "Grok",
  "d3ab452e-1e41-4ceb-a694-645e2f03872a": "Grok",
  "ChatGPT-owner-authorized-AEM-metric": "ChatGPT",
  "mcp-client": "AI · legacy MCP client",
});

// Who made a revision: "Mine" or "Human" for people, the AI client's name for AI.
export function revisionActor(revision, userId) {
  const actor = revision.created_by_actor ?? revision.updated_by_actor;
  if (actor === "human") {
    const humanId = revision.created_by_user ?? revision.owner_id;
    return humanId === userId ? "Mine" : "Human";
  }
  if (actor !== "ai") return actor || "";
  const client = revision.created_by_ai_client ?? revision.updated_by_ai_client;
  if (!client) return "AI";
  return AI_CLIENT_LABELS[client] ?? "AI · " + client;
}

export function formatRevisionTime(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    timeZoneName: "short",
  }).format(date);
}

export function collectionName(collections, id) {
  if (!id) return "Unfiled";
  return collections.find((collection) => collection.id === id)?.name || "Unfiled";
}

export function supervisedResearcherName(supervisedProfiles, ownerId) {
  return supervisedProfiles.find((candidate) => candidate.id === ownerId)?.display_name?.trim() || "Student researcher";
}

// Where the open registry Experiment lives, from the reader's point of view.
export function currentLocationLabel({ remote, access, collections, supervisedProfiles }) {
  if (!remote) return "Showcase";
  if (access === "shared") return "Shared with me";
  if (access === "supervised") return `Supervised · ${supervisedResearcherName(supervisedProfiles, remote.owner_id)}`;
  return remote.collection_id ? `Collection · ${collectionName(collections, remote.collection_id)}` : "No collection";
}

// Shares of the open Experiment, visible only to its owner.
export function currentOutgoingShares({ remote, userId, outgoingShares }) {
  if (!remote || !userId || remote.owner_id !== userId) return [];
  return outgoingShares.filter((share) => share.experiment_id === remote.id);
}

// Researchers the open Experiment is not yet shared with.
export function availableShareRecipients(shareRecipients, currentShares) {
  const sharedIds = new Set(currentShares.map((share) => share.recipient_id));
  return shareRecipients.filter((recipient) => !sharedIds.has(recipient.id));
}

export function shareRecipientLabel(shareRecipients, recipientId) {
  const recipient = shareRecipients.find((candidate) => candidate.id === recipientId);
  if (!recipient) return "Researcher";
  return recipient.display_name?.trim() || recipient.role;
}

export function shareRecipientOptionLabel(recipient) {
  return recipient.display_name?.trim()
    ? `${recipient.display_name.trim()} · ${recipient.role}`
    : recipient.role;
}

export function sharedWithLabel(label) {
  return `Shared read-only with ${label}`;
}

// The "library is ready" summary after sign-in or refresh.
export function connectedMessage({ count, collectionCount, hiddenCount, sharedCount, supervisedCount, professor }) {
  const hidden = hiddenCount > 0
    ? ` ${hiddenCount} older or incompatible experiment${hiddenCount === 1 ? " is" : "s are"} hidden.`
    : "";
  const supervised = professor ? supervisedCount : 0;
  const supervision = professor ? ` and ${supervised} supervised` : "";
  return `Your library is ready: ${count} experiment${count === 1 ? "" : "s"} in ${collectionCount} collection${collectionCount === 1 ? "" : "s"} plus Unfiled, with ${sharedCount} shared with you${supervision}.${hidden}`;
}

// The notice when someone else saved a newer numbered revision.
export function newRevisionMessage(revision, actor) {
  return "New revision R" + revision + (actor ? " from " + actor : "") + " is available. Your current view was not changed.";
}
