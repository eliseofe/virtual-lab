// Behaviour tests for which Experiment the workspace has open, how it is
// remembered, and the quick switcher (#554), covering #76, #153, #240, #287,
// #289, #299 and #480.

import assert from "node:assert/strict";
import test from "node:test";

import {
  libraryLoadedState,
  parseWorkspaceValue,
  quickSwitchOptions,
  rememberedRegistryAccess,
  selectedRegistryAccess,
  workspaceValue,
} from "../src/registry/workspace-location.js";

const catalog = { key: "active-elastic", title: "Active elastic" };
const showcase = { showcase_id: "s1", title: "Curated", showcase_collection_id: "c1", source_revision: 4 };
const own = { id: "e1", owner_id: "u1", title: "Flocking", revision: 3, collection_id: "k1" };
const lists = {
  owned: [{ id: "e1" }, { id: "both" }],
  shared: [{ id: "x1" }, { id: "both" }],
  supervised: [{ id: "v1" }, { id: "sv" }],
};
lists.shared.push({ id: "sv" });

test("the open Experiment is identified by one value: own/shared first, then Showcase, else the catalog", () => {
  assert.equal(workspaceValue({ remote: own, showcase, catalog }), "registry:e1");
  assert.equal(workspaceValue({ remote: null, showcase, catalog }), "showcase:s1");
  assert.equal(workspaceValue({ remote: null, showcase: null, catalog }), "catalog:active-elastic");
});

test("remembered and selected values are parsed by kind", () => {
  assert.deepEqual(parseWorkspaceValue("catalog:active-elastic"), { kind: "catalog", value: "catalog:active-elastic" });
  assert.deepEqual(parseWorkspaceValue("showcase:s1"), { kind: "showcase", id: "s1" });
  assert.deepEqual(parseWorkspaceValue("registry:e1"), { kind: "registry", id: "e1" });
  assert.deepEqual(parseWorkspaceValue("something-else"), { kind: "unknown" });
});

test("#299 a remembered Experiment reopens with the access it is still available under", () => {
  assert.equal(rememberedRegistryAccess("e1", lists), "owned");
  assert.equal(rememberedRegistryAccess("x1", lists), "shared");
  assert.equal(rememberedRegistryAccess("v1", lists), "supervised");
  assert.equal(rememberedRegistryAccess("both", lists), "owned", "own Experiments win when remembered");
  assert.equal(rememberedRegistryAccess("gone", lists), null, "no longer available: forget it");
});

test("#289/#299 an Experiment chosen in the switcher opens shared or supervised when it is, else as your own", () => {
  assert.equal(selectedRegistryAccess("x1", lists), "shared");
  assert.equal(selectedRegistryAccess("v1", lists), "supervised");
  assert.equal(selectedRegistryAccess("e1", lists), "owned");
  assert.equal(selectedRegistryAccess("both", lists), "shared", "shared wins when chosen in the switcher");
  assert.equal(selectedRegistryAccess("sv", lists), "shared", "shared wins over supervised");
  assert.equal(rememberedRegistryAccess("sv", lists), "shared", "shared wins over supervised when remembered too");
});

function switcher(overrides = {}) {
  return quickSwitchOptions({
    catalogExperiments: [catalog, { key: "vicsek", title: "Vicsek" }],
    ownedExperiments: [own],
    remote: null,
    userId: "u1",
    access: null,
    showcase: null,
    catalog,
    collections: [{ id: "k1", name: "Thesis" }],
    supervisedProfiles: [{ id: "stu", display_name: "Ben" }],
    ...overrides,
  });
}

test("#153 signed out, the switcher offers only Showcase catalog Experiments", () => {
  const s = switcher({ userId: undefined });
  assert.deepEqual(s.groups, [{ label: null, options: [
    { value: "catalog:active-elastic", text: "Active elastic · Showcase" },
    { value: "catalog:vicsek", text: "Vicsek · Showcase" },
  ] }]);
  assert.equal(s.value, "catalog:active-elastic");
  assert.equal(s.hint, "Browse Showcase Experiments now. Sign in to add your private Experiments.");
});

test("#153/#157 signed in, your Experiments follow with revision and collection", () => {
  const s = switcher({ ownedExperiments: [own, { ...own, id: "e2", title: "Loose", collection_id: null }] });
  assert.deepEqual(s.groups[1], { label: "Your experiments", options: [
    { value: "registry:e1", text: "Flocking · r3 · Thesis" },
    { value: "registry:e2", text: "Loose · r3 · No collection" },
  ] });
  assert.equal(s.hint, "Switch directly here, or use Browse experiments for Showcase, Mine, Shared and Supervised navigation.");
  assert.equal(switcher({ ownedExperiments: [] }).groups.length, 1, "no empty group");
});

test("#153 an open own Experiment missing from the list is still offered, first", () => {
  const fresh = { id: "new", owner_id: "u1", title: "New", revision: 1, collection_id: null };
  const s = switcher({ remote: fresh, access: "owned" });
  assert.deepEqual(s.groups[1].options.map((option) => option.value), ["registry:new", "registry:e1"]);
  assert.equal(s.value, "registry:new");
});

test("#287/#289 an open shared or supervised Experiment gets its own read-only group", () => {
  const shared = switcher({ remote: { id: "x1", owner_id: "u2", title: "Theirs", revision: 5 }, access: "shared" });
  assert.deepEqual(shared.groups.at(-1), { label: "Shared with me · Read-only", options: [{ value: "registry:x1", text: "Theirs · r5" }] });
  const supervised = switcher({ remote: { id: "v1", owner_id: "stu", title: "Lab 1", revision: 2 }, access: "supervised" });
  assert.deepEqual(supervised.groups.at(-1), { label: "Supervised research · Read-only", options: [{ value: "registry:v1", text: "Lab 1 · Ben · r2" }] });
  const signedOut = switcher({ userId: undefined, remote: { id: "x1", owner_id: "u2", title: "Theirs", revision: 5 }, access: "shared" });
  assert.deepEqual(signedOut.groups.map((group) => group.label), [null], "signed out: no private or read-only groups");
});

test("#240 an open Showcase entry is offered as a curated snapshot", () => {
  const s = switcher({ showcase });
  assert.deepEqual(s.groups.at(-1), { label: "Showcase · Curated snapshot", options: [{ value: "showcase:s1", text: "Curated · R4" }] });
  assert.equal(s.value, "showcase:s1");
  assert.equal(switcher({ showcase: { ...showcase, source_revision: null } }).groups.at(-1).options[0].text, "Curated · Catalog");
});

test("#480 the Library is told which Experiment is open, from which source and revision", () => {
  assert.deepEqual(libraryLoadedState({ remote: own, access: "owned", viewedRevision: { revision: 2 }, showcase: null, catalog }), {
    source: "mine", id: "e1", title: "Flocking", ownerId: "u1", collectionId: "k1", revision: 2,
  });
  assert.equal(libraryLoadedState({ remote: own, access: "shared", viewedRevision: null, catalog }).source, "shared");
  assert.equal(libraryLoadedState({ remote: own, access: "supervised", viewedRevision: null, catalog }).revision, 3);
  assert.deepEqual(libraryLoadedState({ remote: null, showcase, catalog }), {
    source: "showcase", id: "s1", title: "Curated", collectionId: "c1", revision: 4,
  });
  assert.deepEqual(libraryLoadedState({ remote: null, showcase: null, catalog }), {
    source: "showcase", id: "catalog:active-elastic", title: "Active elastic", catalogKey: "active-elastic", revision: null,
  });
});
