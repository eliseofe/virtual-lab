# Virtual Lab Experiment MCP

Status: **production deployed and integrated, 19 September 2026**.

Endpoint:

`https://izdmmudfrmqhvlgepwes.supabase.co/functions/v1/experiment-mcp`

Supabase project: `virtual-lab` (`izdmmudfrmqhvlgepwes`).

## Current deployed contract

- MCP server: `3.24.0`
- interface: `17`
- authoring contract: `vlab.authoring/0.14`
- canonical Experiment artifacts: `vlab.experiment-artifacts/3`
- registry schema: `vlab.registry-experiment/3`
- Metrics language: `python-vlab-metrics/0.1`
- Metrics IR: `vlab.metrics-ir/0.1`
- Results presentation: `vlab.results-presentation/1`
- capability requests: `vlab.capability-request/11`

A runnable Experiment has exactly four compulsory core artifacts: Configuration, Initialization, Controller and Metrics. The ordered `artifacts[]` array is the only Experiment-authoring input. All four core artifacts are supplied explicitly; Metrics may be empty.

## Security model

The Edge Function uses the caller's authenticated Supabase identity/session and a user-scoped Supabase client. It does not use a service-role key for ordinary MCP operations. PostgreSQL RLS remains authoritative for collections, Experiments and Results presentation state. The authenticated user ID comes from the validated bearer token; callers cannot supply an arbitrary owner ID.

OAuth `client_id`, when present, is retained only as edit attribution and is not trusted as user identity.

The MCP remains deliberately narrower than a general Supabase, repository or simulator-development connector. It provides no GitHub, shell, arbitrary filesystem, arbitrary SQL, deployment/admin or simulator-source capability.

## Transport and OAuth

The function uses Streamable HTTP through the Model Context Protocol SDK. It exposes:

- `/health` for contract/deployment health;
- `/.well-known/oauth-protected-resource` for protected-resource metadata;
- the function root for MCP Streamable HTTP requests.

Supabase Auth is the authorization server. Authentication and RLS are the enforcement layer; prompt text is not used as a security boundary.

## Shared tool surface

The research-AI connector exposes exactly **10** shared tools to Student and Professor sessions:

`read_workspace | manage_collection | manage_showcase | create_experiment | edit_experiment | delete_experiment | author_metrics_results | request_capability | resume_capability_closure | revalidate_capability_closure`

Role differences are enforced by data visibility and authority rules, not by duplicate or provider-specific tool variants.

### `read_workspace`

Read/discovery entry point.

Without `experiment_id`, this is a **neutral Lab-knowledge read** with four separate surfaces: authenticated identity plus the stable machine-readable authoring/compiler contract; the implemented canonical capability registry enriched with concrete authoring surfaces; unavailable `candidate_capabilities`; and unavailable `candidate_contract_deltas`. Implemented support alone drives authoring acceptance. Candidate identity and structure are discoverable for request reuse/generalization but never make validation pass.

Experiment discovery is explicit. Set `include_workspace_index=true` only when the user wants to list accessible workspace objects. That returns an RLS-governed metadata index (collections plus Experiment identity/title/lifecycle metadata, without Experiment descriptions); `owned_only=true` may narrow it to owned Experiments. With `experiment_id`, the tool returns that explicitly selected visible Experiment at its current scientific revision, canonical ordered artifacts and separate Results presentation. This tool never writes.

### `manage_collection`

Collection create/rename/delete for owned collections. Deleting a collection does not delete its Experiments; they become unfiled.

### `manage_showcase`

Showcase curation, added in server `3.24.0`. `action=list` returns the current Showcase entries with their published revision and, for the caller's own Experiments, the current revision and whether the published copy is behind. `action=publish` publishes the current (or a stated, still-current) revision of an owned Experiment, replacing its previous Showcase copy. `action=remove` takes an owned Experiment off the Showcase. The tool calls the same database functions as the Lab's curation buttons, as the signed-in user, so the Professor role and Experiment ownership are enforced there; Students see the same tool and receive the refusal. The Showcase holds a frozen copy, so editing an Experiment changes what visitors see only after it is published again.

### `create_experiment`

Creates a new owned Experiment from the complete canonical artifact array after validation. Configuration, Initialization, Controller and Metrics are all required in the input; Metrics content may be empty.

### `edit_experiment`

Revision-protected whole-Experiment edit for title/description, complete canonical artifacts, collection placement and lifecycle. The caller supplies the latest `base_revision`; stale writes are rejected.

Fine-grained metric changes should use `author_metrics_results` rather than rewriting unrelated artifacts.

### `delete_experiment`

Permanently deletes an eligible owned working Experiment at its latest supplied revision. Preserved submission/curation snapshots remain independent.

### `author_metrics_results`

Fine-grained Metrics and Results authoring. Actions:

- `read`
- `create_metric`
- `update_metric`
- `remove_metric`
- `upsert_panel`
- `remove_panel`

Metric operations mutate only the compulsory Metrics artifact, then run the complete Experiment validation contract before writing. Metric definitions use stable IDs. `update_metric` must preserve the stable metric ID; changing identity requires explicit remove/create. Unsupported syntax/capabilities return validation diagnostics rather than an inferred workaround.

Results panels are presentation/workspace state, not scientific Experiment definition. The initial supported panel type is generic `time-series`, with an ordered non-empty list of stable metric IDs. Multiple metrics may share a panel, and the same metric may appear in multiple panels. Arbitrary plotting code is not part of the contract.

Results presentation has its own optimistic revision. Panel edits therefore do **not** increment the scientific Experiment revision. Removing a metric also prunes saved bindings to that metric and removes any panel left empty by that removal.

The browser loads a saved `vlab.results-presentation/1` layout for registry Experiments. No saved presentation means the normal Lab default layout remains in effect; a saved presentation with `panels=[]` is an explicit empty layout.

## Durable extension closure and request submission

Student and Professor profiles share `request_capability`, `resume_capability_closure`, and `revalidate_capability_closure` under `vlab.capability-request/11`.

The authoring continuation is deterministic:

```text
classify every paper/Experiment requirement first
    -> supported: cite implemented capability IDs and/or stable contract paths; create no request
    -> unsupported: compare with unavailable candidates; reuse or create the minimal request
    -> ambiguous: preserve the scientific question; create no request

any unsupported or ambiguous requirement
    -> preserve one durable blocked Experiment + whole-Experiment analysis
    -> report the scientific task as blocked on that durable state

whole-Experiment revalidation
    -> becomes unblocked only when every recorded requirement is supported and no ambiguity remains
```

`capability_closure_requirements` stores the normalized requirement classification for each append-only analysis. `capability_closure_requirement_support` stores machine-readable support evidence for requirements classified as supported. The historical `capability_closure_analyses.identified_requirements` field remains a compatibility projection of unsupported/ambiguous requirements only.

Resume readback treats the caller-visible closure evidence as authoritative membership. If RLS correctly hides another requester's private request row, an evidence-linked shared candidate is reconstructed from the same sanitized candidate fields exposed by neutral workspace discovery; requester identity, private draft/context, notes, and publication provenance are not synthesized or exposed. Evidence without any readable request/candidate metadata still remains visible as an unresolved linked ID rather than disappearing. Candidate presence remains unavailable to authoring/validation.

A Student can resume/revalidate their own blocked Experiment. A Professor has the same scientific blocking semantics and may additionally resume/revalidate visible blocked Experiments for supervision. Professor alone owns queue-wide scientific/design disposition. The current decisions are Accept, Reject, Revise, Defer, Future and Already Supported; Pending means not yet reviewed. These decisions do not change what counts as implemented science and do not authorize implementation.

Each clear request is classified as exactly one of:
- `semantic_capability`;
- `authoring_language`;
- `runtime_configuration`;
- `artifact_workflow`;
- `implementation_optimization`;
- `security_boundary`.

All six classes may reach Professor triage; none is automatically rejected. Minimal publication identity is stored separately from research reasoning. Semantic requests are born as complete candidate capabilities, including the concrete authoring surfaces needed to express them. The other five classes are born as candidate contract deltas against precise stable-contract paths. A covering candidate collects new evidence without another request row; a related but too-narrow candidate collects `generalization_needed` evidence for Professor action; only a genuinely absent need creates one new candidate/request. Reviewed candidates remain discoverable unavailable identities unless and until implementation supersedes them, so Reject, Defer, Future and Revise never cause duplicate rediscovery.

Professor disposition semantics are:
- `pending`: unreviewed; reuse the candidate if it covers the need and never duplicate it;
- `accepted`: accepted into design/implementation consideration but still unavailable until implemented;
- `rejected`: not support, and not permission to recreate an exact duplicate;
- `revise`: the current formulation is not acceptable; Professor guidance is exposed on the sanitized candidate surface;
- `deferred`: preserve the candidate but reconsider only with a genuinely new/useful use case;
- `future`: preserve it as an acknowledged long-horizon direction, not current roadmap authorization;
- `already_supported`: exceptional correction for a request whose requirement is already satisfied by deployed support; use the attached machine-readable `support_resolution`, do not re-request it.

When later evidence shows a candidate is related but too narrow, the Professor can generalize that same unavailable candidate in the Lab inbox. The stable request/candidate identity and all linked papers/blocked Experiments stay attached. The revision is audit-recorded, and evidence originally marked `generalization_needed` remains historically marked while recording the Professor revision that resolved it. Professor-controlled generalization does not change canonical implemented capability truth, compiler acceptance, or implementation authorization.

When the Professor disposition is `revise`, the original requester may instead answer that guidance through the existing `request_capability` or whole-closure revalidation input using `revised_candidate_capability` or `revised_candidate_contract_delta`. This updates the same request/candidate identity, increments candidate revision history, preserves all evidence, and returns Professor disposition to `pending` for another review. A caller who does not own that request may reuse/link it but cannot rewrite it.

Accept maps to approved; Reject maps to declined; Already Supported maps to terminal resolved. Revise, Defer and Future remain technically requested/unavailable while no longer counting as pending Professor review. None of the five decisions implements the capability or creates canonical implemented semantic truth.

Current request state is authoritative in `status`. `professor_disposition` is a review-phase field only: `accepted` is present while the request is `approved`, then is cleared when development advances to `in_progress` or `implemented`. The accepted decision remains permanently available in `capability_request_professor_reviews`, so provenance is preserved without presenting completed work as still accepted.

Lifecycle-hook vocabulary remains:

`setup | initialize | control | measure | finalize`

## Validation and concurrency

Scientific Experiment writes are validated before persistence against the stable language/compiler rules plus the static implemented-capability binding surface. The contract itself does not carry the current capability inventory. Browser and edge validation use byte-identical capability bindings, and neutral MCP discovery joins those surfaces onto the canonical capability entries.

Diagnostics keep their low-level compiler category and add a separate `diagnostic_class`. Genuine semantic capability gaps, authoring-language gaps, runtime/configuration gaps and forbidden/security-boundary changes carry a typed `request_class` suitable for the six-class extension workflow; ordinary type/validation errors carry no request class. Unsupported language syntax is therefore no longer relabeled as a simulator capability gap.

Experiment mutations use the scientific Experiment `revision`; Results presentation mutations use their independent presentation `revision`.

This separation prevents a plot-layout change from masquerading as a scientific Experiment revision.

## Explicit non-capabilities

The MCP has no tool for:

- running or controlling the simulator;
- unrestricted live simulator-state/raw-result access;
- inventing or bypassing supported scientific Metrics semantics;
- arbitrary plotting/executable visualization code;
- reading or changing simulator implementation;
- GitHub/repository operations;
- shell execution;
- arbitrary filesystem access;
- deployments/admin operations;
- arbitrary SQL or Supabase project secrets;
- bypassing registry RLS.

## Provider independence

No provider-specific Experiment operation exists in the server. Any compatible MCP client implementing the required Streamable HTTP/OAuth flow can use the same endpoint and contract.

## Deployment

The deployed Supabase function `experiment-mcp` is a stub of two files. `index.ts` imports `supabase/functions/experiment-mcp/index.ts` from GitHub at one pinned commit (`https://raw.githubusercontent.com/eliseofe/virtual-lab/<commit>/…`), and `deno.json` holds the compiler options. Supabase bundles that commit's code at deploy time, so a deployment is identified by exactly one commit. `/health` reports it as `source_commit` (#575).

Deployment is **manual** (the owner chose not to add an automatic GitHub Action, 25 September 2026):

1. After merging any change under `supabase/functions/experiment-mcp/**`, including the vendored compilers that `web/scripts/sync-edge-vendor.mjs` keeps byte-identical to the Lab's, generate the stub for the merge commit: `node web/scripts/mcp-deploy.mjs stub <commit> <dir>`.
2. Deploy the two files through the Supabase connector's `deploy_edge_function` (project `izdmmudfrmqhvlgepwes`, function `experiment-mcp`, entrypoint `index.ts`, import map `deno.json`, `verify_jwt: false`, because the function authenticates callers itself).
3. Verify one of two ways:
   - `node web/scripts/mcp-deploy.mjs verify <commit>` (or `status`) from a machine that can reach `supabase.co`;
   - `get_edge_function` through the connector, checking the pinned commit, then comparing the live `read_workspace` contract with the repository's `MCP_AUTHORING_CONTRACT`.

`node web/scripts/mcp-deploy.mjs status` reports the live commit and whether the repository's MCP code has changed since.

## Deployment evidence

#200 established the MCP authoring/Results contract. #298 established RLS-visible Experiment discovery; #334 introduced neutral capability discovery during the transition. #346 established typed extension requests and #347 bound authoring surfaces to canonical capability identity. #348 cut production over to the independent registry. #354 established origin-neutral canonical capability/binding consistency; #361 established pre-triage request reuse and scientific-language request identity. #360 established shared durable closure semantics; #367 established the exact nine-tool connector; #375 separated the stable authoring skeleton from implemented capability surfaces. #374 added structured unavailable candidate capabilities and contract deltas. #373 established Professor-controlled candidate generalization metadata at server `3.13.0`. The capability-request integrity repairs then made clear-requirement evidence lossless, preserved exact blocked-Experiment revision snapshots, and patched shared-candidate resume readback at server `3.13.1`. Professor multi-way disposition and same-candidate revision began at server `3.14.0`; Already Supported resolution is versioned at server `3.17.0` / request interface `vlab.capability-request/11`, while interface `17`, `vlab.authoring/0.9`, and the exact nine-tool surface remain unchanged. #577 (server `3.19.0`) introduced `vlab.authoring/0.10`: one code grammar, with `//`, `%` and `and`/`or`/`not` in every code artifact; server `3.20.0` / `vlab.authoring/0.11` added `for NAME in range(...)` over run constants to the Controller and Metrics; server `3.21.0` / `vlab.authoring/0.12` made Initialization type-checked before it runs, on the shared statement parser; server `3.22.0` / `vlab.authoring/0.13` replaced `set_agent_state` with experimenter-declared roles and hid `N`, `ARENA_SIZE` and `EXPERIMENT_DURATION` from the Controller (D-022); server `3.23.0` / `vlab.authoring/0.14` generalized roles into groups (D-023): `group(...)` declares who differs, and `set_state(...)` and `equip(...)` attach starting memory and reference sensors to groups, replacing `role(...)` and `set_agent_reference_sensor(...)`; server `3.24.0` added `manage_showcase`, so Professors can publish their own Experiments to the Showcase through the MCP (tool surface 10, authoring contract unchanged).
