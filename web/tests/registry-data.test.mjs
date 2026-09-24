// Behaviour tests for the Experiment workspace's database reads and writes
// (#554), against a fake client that records each query. Covers #74, #287,
// #288, #289, #290, #397, #398 and #409.

import assert from "node:assert/strict";
import test from "node:test";

import * as data from "../src/registry/data.js";

// A chainable fake Supabase client. Every awaited chain is recorded as
// "table|rpc: method(args).method(args)…" and answered by `respond(steps)`.
function fakeClient(respond = () => ({ data: null, error: null })) {
  const calls = [];
  const chain = (steps) => new Proxy(function () {}, {
    get(_, prop) {
      if (prop === "then") {
        calls.push(steps.map(([method, args]) => `${method}(${args.map((arg) => JSON.stringify(arg)).join(", ")})`).join("."));
        const result = respond(steps);
        return (ok, bad) => Promise.resolve(result).then(ok, bad);
      }
      return (...args) => chain([...steps, [prop, args]]);
    },
  });
  const client = new Proxy({}, { get: (_, prop) => (...args) => chain([[prop, args]]) });
  return { client, calls };
}

const failing = () => ({ data: null, error: { message: "db down" } });

test("#397 the Working copy is upserted per Experiment and read back whole", async () => {
  const { client, calls } = fakeClient(() => ({ data: { base_revision: 3 }, error: null }));
  const row = { experiment_id: "e1", owner_id: "u1", base_revision: 3 };
  assert.deepEqual(await data.upsertWorkingCopy(client, row), { base_revision: 3 });
  assert.deepEqual(calls, [`from("experiment_working_copies").upsert(${JSON.stringify(row)}, {"onConflict":"experiment_id"}).select("*").single()`]);
  await data.readWorkingCopy(client, "e1", "u1");
  assert.equal(calls[1], 'from("experiment_working_copies").select("*").eq("experiment_id", "e1").eq("owner_id", "u1").maybeSingle()');
});

test("#398/#409 Working copies are deleted only for the owner; an explicit discard must remove exactly one", async () => {
  const { client, calls } = fakeClient(() => ({ error: null, count: 1 }));
  await data.deleteWorkingCopy(client, "e1", "u1");
  await data.discardWorkingCopy(client, "e1", "u1");
  assert.deepEqual(calls, [
    'from("experiment_working_copies").delete().eq("experiment_id", "e1").eq("owner_id", "u1")',
    'from("experiment_working_copies").delete({"count":"exact"}).eq("experiment_id", "e1").eq("owner_id", "u1")',
  ]);
  const none = fakeClient(() => ({ error: null, count: 0 }));
  await assert.rejects(data.discardWorkingCopy(none.client, "e1", "u1"), { message: "The Working copy was not found or could not be discarded." });
});

test("#397/#398 revisions are listed newest first with their provenance", async () => {
  const { client, calls } = fakeClient(() => ({ data: null, error: null }));
  assert.deepEqual(await data.listRevisions(client, "e1"), [], "no rows is an empty history");
  assert.equal(calls[0], `from("experiment_revisions").select("${data.REVISION_COLUMNS}").eq("experiment_id", "e1").order("revision", {"ascending":false})`);
  for (const column of ["base_revision", "created_by_actor", "created_by_user", "created_by_ai_client"]) {
    assert.ok(data.REVISION_COLUMNS.split(",").includes(column), column);
  }
});

test("#397 saving turns the Working copy into the next numbered revision on the server", async () => {
  const { client, calls } = fakeClient(() => ({ data: { revision: 4 }, error: null }));
  assert.deepEqual(await data.crystallizeWorkingCopy(client, "e1"), { revision: 4 });
  assert.deepEqual(calls, ['rpc("crystallize_experiment_working_copy", {"p_experiment_id":"e1"}).single()']);
});

test("#74 only active own Experiments are listed, most recently updated first", async () => {
  const { client, calls } = fakeClient(() => ({ data: [{ id: "e1" }], error: null }));
  assert.deepEqual(await data.listOwnExperiments(client, "u1"), [{ id: "e1" }]);
  assert.equal(calls[0], `from("experiments").select("${data.EXPERIMENT_LIST_COLUMNS}").eq("owner_id", "u1").eq("lifecycle", "active").order("updated_at", {"ascending":false})`);
});

test("#289 shared Experiments come in the order they were shared, skipping ones no longer available", async () => {
  const { client, calls } = fakeClient((steps) => {
    const table = steps[0][1][0];
    if (table === "experiment_shares") return { data: [{ experiment_id: "b" }, { experiment_id: "gone" }, { experiment_id: "a" }], error: null };
    return { data: [{ id: "a" }, { id: "b" }], error: null };
  });
  assert.deepEqual(await data.listSharedExperiments(client, "u1"), [{ id: "b" }, { id: "a" }]);
  assert.deepEqual(calls, [
    'from("experiment_shares").select("experiment_id,created_at").eq("recipient_id", "u1").order("created_at", {"ascending":false})',
    `from("experiments").select("${data.EXPERIMENT_LIST_COLUMNS}").in("id", ["b","gone","a"]).eq("lifecycle", "active")`,
  ]);
  const nothingShared = fakeClient(() => ({ data: [], error: null }));
  assert.deepEqual(await data.listSharedExperiments(nothingShared.client, "u1"), []);
  assert.equal(nothingShared.calls.length, 1, "no second query when nothing is shared");
});

test("#287/#299 supervision lists students, then their active Experiments", async () => {
  const { client, calls } = fakeClient((steps) => (steps[0][1][0] === "profiles"
    ? { data: [{ id: "s1" }], error: null }
    : { data: [{ id: "v1" }], error: null }));
  assert.deepEqual(await data.listStudents(client), [{ id: "s1" }]);
  assert.deepEqual(await data.listExperimentsOwnedBy(client, ["s1"]), [{ id: "v1" }]);
  assert.deepEqual(calls, [
    'from("profiles").select("id,display_name,role").eq("role", "student").order("display_name", {"ascending":true})',
    `from("experiments").select("${data.EXPERIMENT_LIST_COLUMNS}").in("owner_id", ["s1"]).eq("lifecycle", "active").order("updated_at", {"ascending":false})`,
  ]);
});

test("#287 reading an Experiment is by id only; access is enforced by the database, not an owner filter", async () => {
  const { client, calls } = fakeClient(() => ({ data: null, error: null }));
  assert.equal(await data.readExperiment(client, "e1"), null);
  assert.equal(calls[0], `from("experiments").select("${data.EXPERIMENT_COLUMNS}").eq("id", "e1").maybeSingle()`);
});

test("#288 copying a readable Experiment asks the server for that exact revision", async () => {
  const { client, calls } = fakeClient(() => ({ data: "copy-1", error: null }));
  assert.equal(await data.copyExperimentToWorkspace(client, { sourceId: "e2", revision: 5, title: "Mine", collectionId: null }), "copy-1");
  assert.deepEqual(calls, ['rpc("copy_experiment_to_workspace", {"p_source_experiment_id":"e2","p_expected_revision":5,"p_title":"Mine","p_collection_id":null})']);
  const missing = fakeClient(() => ({ data: "", error: null }));
  await assert.rejects(data.copyExperimentToWorkspace(missing.client, { sourceId: "e2", revision: 5, title: "Mine", collectionId: null }), { message: "The copied Experiment identifier is missing." });
});

test("#157 moving an Experiment is limited to its owner", async () => {
  const { client, calls } = fakeClient(() => ({ data: { id: "e1", collection_id: "k1" }, error: null }));
  assert.deepEqual(await data.moveExperiment(client, { experimentId: "e1", ownerId: "u1", collectionId: "k1" }), { id: "e1", collection_id: "k1" });
  assert.equal(calls[0], `from("experiments").update({"collection_id":"k1"}).eq("id", "e1").eq("owner_id", "u1").select("${data.EXPERIMENT_COLUMNS}").maybeSingle()`);
  const notOwned = fakeClient(() => ({ data: null, error: null }));
  await assert.rejects(data.moveExperiment(notOwned.client, { experimentId: "e1", ownerId: "u1", collectionId: null }), { message: "The Experiment is missing or is no longer owned by this account." });
});

test("#289/#290 sharing records who shared it; duplicates and missing shares are explained", async () => {
  const { client, calls } = fakeClient(() => ({ error: null, count: 1 }));
  await data.shareExperiment(client, { experimentId: "e1", recipientId: "r1", sharedBy: "u1" });
  await data.revokeShare(client, { experimentId: "e1", recipientId: "r1" });
  assert.deepEqual(calls, [
    'from("experiment_shares").insert({"experiment_id":"e1","recipient_id":"r1","shared_by":"u1"})',
    'from("experiment_shares").delete({"count":"exact"}).eq("experiment_id", "e1").eq("recipient_id", "r1")',
  ]);
  const duplicate = fakeClient(() => ({ error: { code: "23505" } }));
  await assert.rejects(data.shareExperiment(duplicate.client, { experimentId: "e1", recipientId: "r1", sharedBy: "u1" }), { message: "This Experiment is already shared with that researcher." });
  const gone = fakeClient(() => ({ error: null, count: 0 }));
  await assert.rejects(data.revokeShare(gone.client, { experimentId: "e1", recipientId: "r1" }), { message: "The share was not found or could not be revoked." });
});

test("#290 share recipients come only from the eligible-recipient server function", async () => {
  const { client, calls } = fakeClient(() => ({ data: null, error: null }));
  assert.deepEqual(await data.listShareRecipients(client), []);
  await data.listOutgoingShares(client, "u1");
  assert.deepEqual(calls, [
    'rpc("list_experiment_share_recipients")',
    'from("experiment_shares").select("experiment_id,recipient_id,created_at").eq("shared_by", "u1").order("created_at", {"ascending":false})',
  ]);
});

test("database errors are passed on unchanged", async () => {
  const { client } = fakeClient(failing);
  for (const call of [
    () => data.upsertWorkingCopy(client, {}),
    () => data.listRevisions(client, "e1"),
    () => data.readProfile(client, "u1"),
    () => data.listCollections(client),
    () => data.listSharedExperiments(client, "u1"),
    () => data.listStudents(client),
    () => data.insertExperiment(client, {}),
    () => data.shareExperiment(client, { experimentId: "e1", recipientId: "r1", sharedBy: "u1" }),
    () => data.listShowcaseEntries(client),
  ]) {
    await assert.rejects(call(), { message: "db down" });
  }
});
