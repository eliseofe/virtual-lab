// What the Experiment workspace shows for the open Experiment (#157, #287,
// #289, #299, #397, #398, #399, #444), as one pure function: no DOM, no
// Supabase. registry-ui-v3.js applies the result; web/tests/
// registry-workspace-status.test.mjs tests it directly (#554).
//
// A field that is null means "leave the control as it is" (the workspace never
// changed those controls in that situation).

import { currentLocationLabel, revisionActor } from "./labels.js";
import { viewedRevisionSnapshot } from "./revisions.js";

export function workspaceStatus({
  userId,
  remote,
  access,
  workingCopy,
  revisions,
  view,
  showcase,
  catalog,
  dirty,
  collections,
  supervisedProfiles,
  availableRecipientCount,
  hasOutgoingShares,
}) {
  const signedIn = Boolean(userId);
  const owned = Boolean(signedIn && remote && remote.owner_id === userId);
  const copyingReadable = Boolean(signedIn && remote && !owned);
  const viewedRevision = viewedRevisionSnapshot(view, revisions, remote);
  const viewingWorking = view.kind === "working" && Boolean(workingCopy);
  const viewingNumbered = view.kind === "revision" && Boolean(viewedRevision);
  const protectedWorkingCopy = Boolean(owned && workingCopy && viewingNumbered);

  const status = {
    owned,
    title: null,
    origin: null,
    location: null,
    revisionWorkflowHidden: null,
    revisionBadge: null,
    metadataRevision: null,
    notice: null,
    editFromRevision: { hidden: !protectedWorkingCopy, text: protectedWorkingCopy ? "Edit from R" + viewedRevision.revision : null },
    discardHidden: !owned || !workingCopy,
    lockEditors: protectedWorkingCopy,
    saveRowHidden: !signedIn,
    saveAsNewHidden: !signedIn,
    saveHidden: !owned || protectedWorkingCopy,
    saveDisabled: !owned || protectedWorkingCopy || (!dirty && !workingCopy),
    createNewText: copyingReadable ? "Copy to my Experiments" : "Create private copy",
    shareRowHidden: !(owned && (availableRecipientCount > 0 || hasOutgoingShares)),
    shareOpenHidden: !owned || availableRecipientCount === 0,
    closeShareForm: !owned || availableRecipientCount === 0,
    moveRowHidden: !owned,
    saveState: null,
    note: null,
  };

  if (remote) {
    status.title = remote.title;
    status.origin = owned ? { kind: "owned", text: "Your experiment · Editable" } : { kind: "readonly", text: "Read-only" };
    status.location = currentLocationLabel({ remote, access, collections, supervisedProfiles });
    status.revisionWorkflowHidden = false;

    if (viewingWorking) {
      status.revisionBadge = {
        primary: "W",
        ariaLabel: "Open revision history. Working copy based on revision " + workingCopy.base_revision,
      };
      status.metadataRevision = "Working copy · based on R" + workingCopy.base_revision;
    } else {
      const revisionNumber = viewedRevision?.revision ?? remote.revision;
      status.revisionBadge = {
        primary: String(revisionNumber),
        ariaLabel: "Open revision history. Revision " + revisionNumber,
      };
      status.metadataRevision = "Revision R" + revisionNumber;
    }

    const referenceRevision = viewingWorking
      ? workingCopy.base_revision
      : (viewedRevision?.revision ?? remote.revision);
    if (remote.revision > referenceRevision) {
      const newest = revisions.find((revision) => revision.revision === remote.revision) ?? remote;
      const actor = revisionActor(newest, userId);
      status.notice = { hidden: false, text: "New · " + remote.revision + (actor ? " · " + actor : "") };
    } else {
      status.notice = { hidden: true, text: "" };
    }
  } else {
    status.title = (showcase ?? catalog).title;
    status.origin = { kind: "readonly", text: "Showcase · Read-only" };
    status.location = showcase
      ? `Showcase / ${showcase.showcase_collection_name || "Uncategorized"}`
      : "Showcase";
    status.revisionWorkflowHidden = true;
    status.notice = { hidden: true, text: null };
    status.metadataRevision = showcase?.source_revision == null
      ? "Showcase · Catalog"
      : `Showcase · R${showcase.source_revision}`;
  }

  if (!signedIn) {
    status.note = "You can edit and run this Showcase Experiment locally. Sign in to save a private copy or open your own library.";
  } else if (!remote) {
    status.saveState = { state: "readonly", text: "Read-only" };
    status.note = "The Showcase source cannot be overwritten. Save as new creates an independent private copy.";
  } else if (!owned) {
    const revisionNumber = viewedRevision?.revision ?? remote.revision;
    status.saveState = { state: "readonly", text: revisionNumber + " · Read-only" };
    status.note = access === "shared"
      ? "This shared revision stays read-only. Copy to my Experiments creates an independent private Experiment from the exact state you are viewing."
      : "This supervised revision stays read-only. Copy to my Experiments creates an independent private Experiment from the exact state you are viewing.";
  } else if (protectedWorkingCopy) {
    status.saveState = { state: "saved", text: viewedRevision.revision + " · Working " + workingCopy.base_revision };
    status.note = "Select Working copy to resume it, or choose Edit from this revision to replace it explicitly.";
  } else if (dirty) {
    const baseRevision = workingCopy?.base_revision ?? viewedRevision?.revision ?? remote.revision;
    status.saveState = { state: "dirty", text: "Working · pending · " + baseRevision };
    status.note = "Leaving the editor or taking another action autosaves the Working copy. Save Revision creates a numbered revision.";
  } else if (viewingWorking) {
    status.saveState = { state: "saved", text: "Working · " + workingCopy.base_revision };
    status.note = remote.revision > workingCopy.base_revision
      ? "A newer numbered revision is available. Your Working copy remains preserved; Save Revision will create the next chronological revision."
      : "Working copy is durable. Save Revision crystallizes it as the next numbered revision.";
  } else if (viewingNumbered && viewedRevision.revision < remote.revision) {
    status.saveState = { state: "saved", text: viewedRevision.revision + " · Historical" };
    status.note = "Edit normally to start a Working copy from this revision. Numbered history remains unchanged.";
  } else {
    status.saveState = { state: "saved", text: remote.revision + " · Saved" };
    status.note = "Edit normally to create a Working copy; Save Revision crystallizes it as the next numbered revision.";
  }

  return status;
}
