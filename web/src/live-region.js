// The live runtime region (#569): the simulation section, whose numbers and
// result labels change many times a second while a simulation runs. Page-wide
// structure watchers (which wait for panels, dialogs and controls to appear)
// have nothing to do there, so they skip change batches that consist only of
// text or attribute updates inside it. Element insertions and removals there
// (a new plot, a new status control) still reach them.

export const LIVE_RUNTIME_REGION = "#simulation";

function isLiveRuntimeUpdate(record) {
  const element = record.target.nodeType === Node.ELEMENT_NODE ? record.target : record.target.parentElement;
  if (!element?.closest(LIVE_RUNTIME_REGION)) return false;
  if (record.type === "characterData" || record.type === "attributes") return true;
  return [...record.addedNodes, ...record.removedNodes].every((node) => node.nodeType !== Node.ELEMENT_NODE);
}

// True when every change in the batch is a live runtime update.
export function onlyLiveRuntimeUpdates(records) {
  return records.length > 0 && records.every(isLiveRuntimeUpdate);
}
