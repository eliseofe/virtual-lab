// Which Experiment the workspace has open, how it is remembered between
// visits, and how the quick switcher lists and routes Experiments (#76, #240,
// #287, #289, #299, #480), as pure functions: no DOM, no Supabase, no storage.
// registry-ui-v3.js asks these; web/tests/registry-workspace-location.test.mjs
// tests them directly (#554).

import { catalogSelectValue, isCatalogSelectValue } from "../experiment-catalog.js";
import { collectionName, supervisedResearcherName } from "./labels.js";

// The value that identifies the open Experiment, in the switcher and in storage.
export function workspaceValue({ remote, showcase, catalog }) {
  return remote
    ? `registry:${remote.id}`
    : showcase
      ? `showcase:${showcase.showcase_id}`
      : catalogSelectValue(catalog.key);
}

// What a remembered or selected value points at.
export function parseWorkspaceValue(value) {
  if (isCatalogSelectValue(value)) return { kind: "catalog", value };
  if (value.startsWith("showcase:")) return { kind: "showcase", id: value.slice("showcase:".length) };
  if (value.startsWith("registry:")) return { kind: "registry", id: value.slice("registry:".length) };
  return { kind: "unknown" };
}

const has = (experiments, id) => experiments.some((experiment) => experiment.id === id);

// Reopening a remembered Experiment: own first, then shared, then supervised;
// null when it is no longer available.
export function rememberedRegistryAccess(id, { owned, shared, supervised }) {
  if (has(owned, id)) return "owned";
  if (has(shared, id)) return "shared";
  if (has(supervised, id)) return "supervised";
  return null;
}

// Choosing an Experiment in the switcher: shared, then supervised, else own.
export function selectedRegistryAccess(id, { shared, supervised }) {
  if (has(shared, id)) return "shared";
  if (has(supervised, id)) return "supervised";
  return "owned";
}

// The quick switcher: catalog Experiments first (no group), then groups.
//   { groups: [{ label, options: [{ value, text }] }], value, hint }
export function quickSwitchOptions({ catalogExperiments, ownedExperiments, remote, userId, access, showcase, catalog, collections, supervisedProfiles }) {
  const groups = [{
    label: null,
    options: catalogExperiments.map((experiment) => ({ value: catalogSelectValue(experiment.key), text: `${experiment.title} · Showcase` })),
  }];

  const owned = [...ownedExperiments];
  if (remote && remote.owner_id === userId && !owned.some((experiment) => experiment.id === remote.id)) {
    owned.unshift(remote);
  }
  if (userId && owned.length) {
    groups.push({
      label: "Your experiments",
      options: owned.map((experiment) => {
        const location = experiment.collection_id ? collectionName(collections, experiment.collection_id) : "No collection";
        return { value: `registry:${experiment.id}`, text: `${experiment.title} · r${experiment.revision} · ${location}` };
      }),
    });
  }

  if (userId && remote && remote.owner_id !== userId) {
    groups.push({
      label: access === "shared" ? "Shared with me · Read-only" : "Supervised research · Read-only",
      options: [{
        value: `registry:${remote.id}`,
        text: access === "supervised"
          ? `${remote.title} · ${supervisedResearcherName(supervisedProfiles, remote.owner_id)} · r${remote.revision}`
          : `${remote.title} · r${remote.revision}`,
      }],
    });
  }

  if (showcase) {
    groups.push({
      label: "Showcase · Curated snapshot",
      options: [{
        value: `showcase:${showcase.showcase_id}`,
        text: showcase.source_revision == null
          ? `${showcase.title} · Catalog`
          : `${showcase.title} · R${showcase.source_revision}`,
      }],
    });
  }

  return {
    groups,
    value: workspaceValue({ remote, showcase, catalog }),
    hint: userId
      ? "Switch directly here, or use Browse experiments for Showcase, Mine, Shared and Supervised navigation."
      : "Browse Showcase Experiments now. Sign in to add your private Experiments.",
  };
}

// What the Experiment Library is told about the open Experiment (#480).
export function libraryLoadedState({ remote, access, viewedRevision, showcase, catalog }) {
  if (remote) {
    return {
      source: access === "shared" ? "shared" : access === "supervised" ? "supervised" : "mine",
      id: remote.id,
      title: remote.title,
      ownerId: remote.owner_id,
      collectionId: remote.collection_id ?? null,
      revision: viewedRevision?.revision ?? remote.revision,
    };
  }
  if (showcase) {
    return {
      source: "showcase",
      id: showcase.showcase_id,
      title: showcase.title,
      collectionId: showcase.showcase_collection_id ?? null,
      revision: showcase.source_revision ?? null,
    };
  }
  return { source: "showcase", id: catalogSelectValue(catalog.key), title: catalog.title, catalogKey: catalog.key, revision: null };
}
