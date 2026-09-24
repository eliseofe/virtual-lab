// Behaviour tests for the Experiment Library's browsing rules (#547), covering
// the source hierarchy and search rules introduced by #480 and #76.

import assert from "node:assert/strict";
import test from "node:test";

import {
  SOURCE_LABEL,
  SOURCE_ORDER,
  availableSources,
  contextLabel,
  contextRows,
  effectiveSort,
  loadedMatches,
  ownerGroups,
  results,
  revisionBadge,
  rowMeta,
  searchPlaceholder,
  sortChoices,
  sortRows,
} from "../src/library/browse.js";

const showcase = [
  { showcase_id: "s1", title: "Flocking", showcase_collection_id: "c1", showcase_collection_name: "Classics", published_at: "2026-09-01", source_revision: 4, source_key: "catalog:active-elastic" },
  { showcase_id: "s2", title: "Aggregation", showcase_collection_id: null, showcase_collection_name: null, published_at: "2026-09-10", source_revision: null },
];
const mine = [
  { experiment_id: "m1", title: "Draft B", collection_id: "k1", collection_name: "Thesis", updated_at: "2026-09-20", revision: 2 },
  { experiment_id: "m2", title: "Draft A", collection_id: null, collection_name: null, updated_at: "2026-09-22", revision: 5 },
];
const shared = [
  { experiment_id: "x1", title: "Shared one", owner_id: "aaaaaa-1", owner_display_name: "Ada", updated_at: "2026-09-01" },
  { experiment_id: "x2", title: "Shared two", owner_id: "bbbbbb-2", owner_display_name: "Ada", updated_at: "2026-09-02" },
];
const supervised = [
  { experiment_id: "v1", title: "Student run", owner_id: "stu-1", owner_display_name: "Ben", collection_id: "k9", collection_name: "Labs", updated_at: "2026-09-05" },
  { experiment_id: "v2", title: "Student loose", owner_id: "stu-1", owner_display_name: "Ben", collection_id: null, collection_name: null, updated_at: "2026-09-06" },
  { experiment_id: "v3", title: "Other student", owner_id: "stu-2", owner_display_name: " ", updated_at: "2026-09-07" },
];
const data = {
  showcase, mine, shared, supervised,
  showcaseCollections: [{ showcase_collection_id: "c1", name: "Classics" }],
  mineCollections: [{ id: "k1", name: "Thesis" }],
};

function nav(overrides = {}) {
  return {
    source: "showcase",
    showcase: { kind: "all", id: null },
    mine: { kind: "all", id: null },
    shared: { kind: "all", id: null },
    supervised: { researcherId: null, kind: "all", id: null },
    query: "",
    scope: "here",
    sort: "updated",
    ...overrides,
  };
}

const ids = (rows) => rows.map((row) => row.showcase_id ?? row.experiment_id);

test("#480 sources are fixed and role-aware: Showcase public, Mine/Shared signed-in, Supervised for Professors", () => {
  assert.deepEqual(SOURCE_ORDER, ["showcase", "mine", "shared", "supervised"]);
  assert.deepEqual(SOURCE_LABEL, { showcase: "Showcase", mine: "Mine", shared: "Shared", supervised: "Supervised" });
  assert.deepEqual(availableSources({ signedIn: false, role: "professor" }), ["showcase"]);
  assert.deepEqual(availableSources({ signedIn: true, role: "student" }), ["showcase", "mine", "shared"]);
  assert.deepEqual(availableSources({ signedIn: true, role: "professor" }), ["showcase", "mine", "shared", "supervised"]);
});

test("#480 each source has its own browse hierarchy", () => {
  assert.deepEqual(ids(contextRows(nav({ showcase: { kind: "collection", id: "c1" } }), data)), ["s1"]);
  assert.deepEqual(ids(contextRows(nav({ showcase: { kind: "uncategorized", id: null } }), data)), ["s2"]);
  assert.deepEqual(ids(contextRows(nav({ source: "mine", mine: { kind: "collection", id: "k1" } }), data)), ["m1"]);
  assert.deepEqual(ids(contextRows(nav({ source: "mine", mine: { kind: "unfiled", id: null } }), data)), ["m2"]);
  assert.deepEqual(ids(contextRows(nav({ source: "shared", shared: { kind: "owner", id: "bbbbbb-2" } }), data)), ["x2"]);
  assert.deepEqual(contextRows(nav({ source: "supervised" }), data), [], "Supervised starts by choosing a researcher");
  assert.deepEqual(ids(contextRows(nav({ source: "supervised", supervised: { researcherId: "stu-1", kind: "all", id: null } }), data)), ["v1", "v2"]);
  assert.deepEqual(ids(contextRows(nav({ source: "supervised", supervised: { researcherId: "stu-1", kind: "collection", id: "k9" } }), data)), ["v1"]);
  assert.deepEqual(ids(contextRows(nav({ source: "supervised", supervised: { researcherId: "stu-1", kind: "unfiled", id: null } }), data)), ["v2"]);
});

test("#480 the current place is named, and search says where it searches", () => {
  assert.equal(contextLabel(nav({ showcase: { kind: "collection", id: "c1" } }), data), "Classics");
  assert.equal(contextLabel(nav({ showcase: { kind: "uncategorized", id: null } }), data), "Uncategorized");
  assert.equal(contextLabel(nav({ source: "mine", mine: { kind: "unfiled", id: null } }), data), "Unfiled");
  assert.equal(contextLabel(nav({ source: "supervised", supervised: { researcherId: "stu-1", kind: "collection", id: "k9" } }), data), "Labs");
  assert.equal(searchPlaceholder(nav({ source: "mine", mine: { kind: "collection", id: "k1" } }), data), "Search Thesis");
  assert.equal(searchPlaceholder(nav({ source: "supervised" }), data), "Search researchers");
});

test("#76 owners with the same display name are told apart; blank names become Researcher", () => {
  assert.deepEqual(ownerGroups(shared).map((group) => group.label), ["Ada · aaaaaa", "Ada · bbbbbb"]);
  assert.deepEqual(ownerGroups(supervised).map((group) => [group.label, group.count]), [["Ben", 2], ["Researcher", 1]]);
});

test("#480 search stays within the current place unless 'All sources' is chosen", () => {
  const here = results({ navigation: nav({ source: "mine", mine: { kind: "collection", id: "k1" }, query: "draft" }), data, sources: ["showcase", "mine", "shared"] });
  assert.deepEqual(here.groups.map((group) => [group.label, ids(group.rows)]), [[null, ["m1"]]]);
  assert.equal(here.status, "1 experiment");

  const everywhere = results({ navigation: nav({ source: "mine", query: "  SHARED ", scope: "all" }), data, sources: ["showcase", "mine", "shared"] });
  assert.deepEqual(everywhere.groups.map((group) => [group.label, ids(group.rows)]), [["Shared", ["x2", "x1"]]]);
  assert.equal(everywhere.status, "2 experiments");

  const bySourceName = results({ navigation: nav({ query: "mine", scope: "all" }), data, sources: ["showcase", "mine"] });
  assert.deepEqual(bySourceName.groups.map((group) => group.label), ["Mine"], "the source name is searchable");

  const noQuery = results({ navigation: nav({ scope: "all" }), data, sources: ["showcase", "mine"] });
  assert.deepEqual(noQuery.groups.map((group) => [group.label, ids(group.rows)]), [[null, ["s2", "s1"]]], "without a query, 'All sources' still browses the current place");
});

test("#480 every empty place explains itself", () => {
  const empty = { ...data, mine: [], shared: [], supervised: [], showcase: [] };
  assert.equal(results({ navigation: nav(), data: empty, sources: ["showcase"] }).empty, "No Showcase experiments.");
  assert.equal(results({ navigation: nav({ source: "mine" }), data: empty, sources: [] }).empty, "No experiments here.");
  assert.equal(results({ navigation: nav({ source: "shared" }), data: empty, sources: [] }).empty, "Nothing shared with you.");
  assert.equal(results({ navigation: nav({ query: "zzz" }), data, sources: ["showcase"] }).empty, "No matches.");
  const chooser = results({ navigation: nav({ source: "supervised" }), data, sources: [] });
  assert.deepEqual([chooser.empty, chooser.status], ["Choose a researcher.", "2 researchers"]);
  const noStudents = results({ navigation: nav({ source: "supervised" }), data: empty, sources: [] });
  assert.deepEqual([noStudents.empty, noStudents.status], ["No researcher experiments.", "0 experiments"]);
});

test("#480 sorting: Showcase by title or publication, the others by update or title", () => {
  assert.deepEqual(sortChoices("showcase").map(([value]) => value), ["title", "published"]);
  assert.deepEqual(sortChoices("mine").map(([value]) => value), ["updated", "title"]);
  assert.equal(effectiveSort("showcase", "updated"), "title", "an unavailable sort falls back to the first choice");
  assert.equal(effectiveSort("mine", "title"), "title");
  assert.deepEqual(ids(sortRows("showcase", showcase, "published")), ["s2", "s1"]);
  assert.deepEqual(ids(sortRows("showcase", showcase, "title")), ["s2", "s1"]);
  assert.deepEqual(ids(sortRows("mine", mine, "updated")), ["m2", "m1"]);
  assert.deepEqual(ids(sortRows("mine", mine, "title")), ["m2", "m1"]);
});

test("#480 entries show their place, access and revision", () => {
  assert.equal(rowMeta("showcase", showcase[1]), "Uncategorized · Read-only");
  assert.equal(rowMeta("mine", mine[0]), "Thesis");
  assert.equal(rowMeta("mine", mine[1]), "Unfiled");
  assert.equal(rowMeta("shared", shared[0]), "Ada · Read-only");
  assert.equal(rowMeta("supervised", supervised[2]), "Researcher · Unfiled · Read-only");
  assert.equal(revisionBadge("showcase", showcase[0]), "R4");
  assert.equal(revisionBadge("showcase", showcase[1]), "Catalog");
  assert.equal(revisionBadge("mine", { revision: null }), "Revision —");
});

test("#480 the loaded Experiment is recognised in its own source only", () => {
  assert.equal(loadedMatches({ source: "showcase", id: "s1" }, "showcase", showcase[0]), true);
  assert.equal(loadedMatches({ source: "showcase", id: "x", catalogKey: "active-elastic" }, "showcase", showcase[0]), true);
  assert.equal(loadedMatches({ source: "mine", id: "m1" }, "mine", mine[0]), true);
  assert.equal(loadedMatches({ source: "mine", id: "m1" }, "shared", { experiment_id: "m1" }), false);
  assert.equal(loadedMatches(null, "mine", mine[0]), false);
});
