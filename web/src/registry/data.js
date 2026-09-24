// The Experiment workspace's database reads and writes (#554), one named
// function per operation. Each takes the Supabase client explicitly, so
// web/tests/registry-data.test.mjs can check the exact queries against a fake
// client. Errors from the database are rethrown unchanged; the messages here
// are the ones the workspace always showed.

export const EXPERIMENT_LIST_COLUMNS = "id,owner_id,collection_id,title,revision,updated_at,updated_by_actor,updated_by_ai_client,artifacts,config_source,initializer_source,controller_source";
export const EXPERIMENT_COLUMNS = "id,owner_id,collection_id,title,description,lifecycle,visibility,revision,artifacts,config_source,initializer_source,controller_source,created_at,updated_at,created_by_actor,created_by_ai_client,updated_by_actor,updated_by_ai_client";
export const REVISION_COLUMNS = "experiment_id,revision,base_revision,owner_id,title,description,artifacts,config_source,initializer_source,controller_source,created_at,created_by_actor,created_by_user,created_by_ai_client";

// --- Working copies and revisions -------------------------------------------

export async function upsertWorkingCopy(client, row) {
  const { data, error } = await client
    .from("experiment_working_copies")
    .upsert(row, { onConflict: "experiment_id" })
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

export async function readWorkingCopy(client, experimentId, ownerId) {
  const { data, error } = await client
    .from("experiment_working_copies")
    .select("*")
    .eq("experiment_id", experimentId)
    .eq("owner_id", ownerId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

// Replacing a Working copy from a chosen revision (#398).
export async function deleteWorkingCopy(client, experimentId, ownerId) {
  const { error } = await client
    .from("experiment_working_copies")
    .delete()
    .eq("experiment_id", experimentId)
    .eq("owner_id", ownerId);
  if (error) throw error;
}

// Discarding the Working copy explicitly (#409): exactly one row must go.
export async function discardWorkingCopy(client, experimentId, ownerId) {
  const { error, count } = await client
    .from("experiment_working_copies")
    .delete({ count: "exact" })
    .eq("experiment_id", experimentId)
    .eq("owner_id", ownerId);
  if (error) throw error;
  if (count !== 1) throw new Error("The Working copy was not found or could not be discarded.");
}

export async function listRevisions(client, experimentId) {
  const { data, error } = await client
    .from("experiment_revisions")
    .select(REVISION_COLUMNS)
    .eq("experiment_id", experimentId)
    .order("revision", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

// Turning the Working copy into the next numbered revision (#397).
export async function crystallizeWorkingCopy(client, experimentId) {
  const { data, error } = await client
    .rpc("crystallize_experiment_working_copy", { p_experiment_id: experimentId })
    .single();
  if (error) throw error;
  return data;
}

// --- Account, collections and lists ------------------------------------------

export async function readProfile(client, userId) {
  const { data, error } = await client.from("profiles").select("id, first_name, last_name, display_name, role").eq("id", userId).maybeSingle();
  if (error) throw error;
  return data;
}

export async function listCollections(client) {
  const { data, error } = await client
    .from("experiment_collections")
    .select("id,name,updated_at")
    .order("name", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function listOwnExperiments(client, userId) {
  const { data, error } = await client
    .from("experiments")
    .select(EXPERIMENT_LIST_COLUMNS)
    .eq("owner_id", userId)
    .eq("lifecycle", "active")
    .order("updated_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

// Experiments shared with the user, most recently shared first (#289).
export async function listSharedExperiments(client, userId) {
  const { data: shares, error: sharesError } = await client
    .from("experiment_shares")
    .select("experiment_id,created_at")
    .eq("recipient_id", userId)
    .order("created_at", { ascending: false });
  if (sharesError) throw sharesError;

  const ids = (shares ?? []).map((share) => share.experiment_id);
  if (!ids.length) return [];

  const { data, error } = await client
    .from("experiments")
    .select(EXPERIMENT_LIST_COLUMNS)
    .in("id", ids)
    .eq("lifecycle", "active");
  if (error) throw error;

  const byId = new Map((data ?? []).map((experiment) => [experiment.id, experiment]));
  return ids.map((id) => byId.get(id)).filter(Boolean);
}

// Students, for Professor supervision (#287, #299).
export async function listStudents(client) {
  const { data, error } = await client
    .from("profiles")
    .select("id,display_name,role")
    .eq("role", "student")
    .order("display_name", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

// Active Experiments owned by the given students, most recently updated first.
export async function listExperimentsOwnedBy(client, ownerIds) {
  const { data, error } = await client
    .from("experiments")
    .select(EXPERIMENT_LIST_COLUMNS)
    .in("owner_id", ownerIds)
    .eq("lifecycle", "active")
    .order("updated_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function readExperiment(client, id) {
  const { data, error } = await client
    .from("experiments")
    .select(EXPERIMENT_COLUMNS)
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function listShowcaseEntries(client) {
  const { data, error } = await client.rpc("list_showcase_experiments");
  if (error) throw error;
  return data ?? [];
}

// --- Creating, copying and moving --------------------------------------------

export async function insertExperiment(client, row) {
  const { data, error } = await client
    .from("experiments")
    .insert(row)
    .select(EXPERIMENT_COLUMNS)
    .single();
  if (error) throw error;
  return data;
}

// Copying a readable Experiment's exact revision into the user's workspace (#288).
export async function copyExperimentToWorkspace(client, { sourceId, revision, title, collectionId }) {
  const { data: copyId, error } = await client.rpc("copy_experiment_to_workspace", {
    p_source_experiment_id: sourceId,
    p_expected_revision: revision,
    p_title: title,
    p_collection_id: collectionId,
  });
  if (error) throw error;
  if (typeof copyId !== "string" || !copyId) throw new Error("The copied Experiment identifier is missing.");
  return copyId;
}

export async function moveExperiment(client, { experimentId, ownerId, collectionId }) {
  const { data, error } = await client
    .from("experiments")
    .update({ collection_id: collectionId })
    .eq("id", experimentId)
    .eq("owner_id", ownerId)
    .select(EXPERIMENT_COLUMNS)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("The Experiment is missing or is no longer owned by this account.");
  return data;
}

// --- Sharing (#289, #290) -----------------------------------------------------

export async function listShareRecipients(client) {
  const { data, error } = await client.rpc("list_experiment_share_recipients");
  if (error) throw error;
  return data ?? [];
}

export async function listOutgoingShares(client, userId) {
  const { data, error } = await client
    .from("experiment_shares")
    .select("experiment_id,recipient_id,created_at")
    .eq("shared_by", userId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function shareExperiment(client, { experimentId, recipientId, sharedBy }) {
  const { error } = await client
    .from("experiment_shares")
    .insert({
      experiment_id: experimentId,
      recipient_id: recipientId,
      shared_by: sharedBy,
    });
  if (error?.code === "23505") throw new Error("This Experiment is already shared with that researcher.");
  if (error) throw error;
}

export async function revokeShare(client, { experimentId, recipientId }) {
  const { error, count } = await client
    .from("experiment_shares")
    .delete({ count: "exact" })
    .eq("experiment_id", experimentId)
    .eq("recipient_id", recipientId);
  if (error) throw error;
  if (count !== 1) throw new Error("The share was not found or could not be revoked.");
}
