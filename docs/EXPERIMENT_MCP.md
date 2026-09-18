# Virtual Lab Experiment MCP

Status: **production deployed and integrated, 18 September 2026**.

Endpoint:

`https://izdmmudfrmqhvlgepwes.supabase.co/functions/v1/experiment-mcp`

Supabase project: `virtual-lab` (`izdmmudfrmqhvlgepwes`).

## Current deployed contract

- MCP server: `3.5.0`
- interface: `13`
- authoring contract: `vlab.authoring/0.7`
- canonical Experiment artifacts: `vlab.experiment-artifacts/3`
- registry schema: `vlab.registry-experiment/3`
- Metrics language: `python-vlab-metrics/0.1`
- Metrics IR: `vlab.metrics-ir/0.1`
- Results presentation: `vlab.results-presentation/1`
- capability requests: `vlab.capability-request/4`

A runnable Experiment has exactly four compulsory core artifacts: Configuration, Initialization, Controller and Metrics. The ordered `artifacts[]` array is canonical. Legacy three-source arguments remain a bounded compatibility input and mechanically preserve/add the compulsory Metrics artifact rather than creating a second source of truth.

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

### `read_workspace`

Read/discovery entry point.

Without `experiment_id`, this is a **neutral Lab-knowledge read**: it returns authenticated identity, the complete machine-readable authoring/runtime contract, and the global canonical capability registry. The registry exposes only stable capability identity/domain/name, owner-approved generic definition, lifecycle/implementation state and minimal publication provenance. It does not expose historical request context, drafts, Professor/developer notes, requirement keys, origin Experiments or prior scientific discourse.

Experiment discovery is explicit. Set `include_workspace_index=true` only when the user wants to list accessible workspace objects. That returns an RLS-governed metadata index (collections plus Experiment identity/title/lifecycle metadata, without Experiment descriptions); `owned_only=true` may narrow it to owned Experiments. With `experiment_id`, the tool returns that explicitly selected visible Experiment at its current scientific revision, canonical ordered artifacts and separate Results presentation. This tool never writes.

### `manage_collection`

Collection create/rename/delete for owned collections. Deleting a collection does not delete its Experiments; they become unfiled.

### `create_experiment`

Creates a new owned Experiment from the complete canonical artifact array after validation. A legacy three-source compatibility form remains accepted for older clients and normalizes to the four compulsory artifacts with an empty Metrics artifact.

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

## Classified extension-request submission

Student and Professor profiles both receive `request_capability` under `vlab.capability-request/4`. The action now represents the broader unsupported-requirement workflow while retaining its established tool name.

Each clear request is classified as exactly one of:
- `semantic_capability`;
- `authoring_language`;
- `runtime_configuration`;
- `artifact_workflow`;
- `implementation_optimization`;
- `security_boundary`.

All six classes may reach Professor triage; none is automatically rejected. A minimal publication title + persistent identifier is stored separately from research reasoning.

Semantic requests resolve against canonical capability identity first. If a matching non-implemented canonical capability exists, the request references its UUID. Otherwise the request contains a proposed generic target which is not canonical truth until Professor approval. Professor approval may explicitly bind an existing canonical capability or create the reviewed canonical identity. Classes 2–6 remain typed extension requests and never enter the canonical semantic-capability registry merely because they are approved.

Repeated request reconciliation uses explicit stable request identity (`existing_request_id`) or canonical capability identity, never free-text domain/name matching. Multiple request records and publications may converge on the same canonical semantic capability.

Student submission remains allowed. Professor alone approves/declines. Approval still means accepted into design/queue, not implementation authorization.

Lifecycle-hook vocabulary remains:

`setup | initialize | control | measure | finalize`

## Validation and concurrency

Scientific Experiment writes are validated against the advertised authoring contract before persistence. The contract now references the canonical capability registry through static implemented-capability bindings rather than maintaining an independent semantic capability catalog.

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

## Deployment evidence

#200 established the MCP authoring/Results contract. #298 established RLS-visible Experiment discovery; #334 preserves that capability as an explicit workspace-index read instead of injecting it into neutral Lab discovery. #346 established typed extension requests. #347 uses MCP server `3.5.0`, interface `13`, authoring contract `vlab.authoring/0.7`, and the unchanged capability-request interface `vlab.capability-request/4`; the authoring contract now carries canonical capability UUID/key bindings rather than a parallel semantic capability model. Canonical capability knowledge remains global authenticated Lab truth; Experiment/workspace reads remain governed by existing RLS.
