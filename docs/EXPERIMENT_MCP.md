# Virtual Lab Experiment MCP

Status: **production deployed and integrated, 16 September 2026**.

Endpoint:

`https://izdmmudfrmqhvlgepwes.supabase.co/functions/v1/experiment-mcp`

Supabase project: `virtual-lab` (`izdmmudfrmqhvlgepwes`).

## Current deployed contract

- Edge Function version: `16`
- MCP server: `3.0.0`
- interface: `8`
- authoring contract: `vlab.authoring/0.6`
- canonical Experiment artifacts: `vlab.experiment-artifacts/3`
- registry schema: `vlab.registry-experiment/3`
- Metrics language: `python-vlab-metrics/0.1`
- Metrics IR: `vlab.metrics-ir/0.1`
- Results presentation: `vlab.results-presentation/1`
- capability requests: `vlab.capability-request/1`

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

Without `experiment_id`, returns authenticated identity, owned collections and visible Experiment summaries. With `experiment_id`, returns the visible Experiment at its current scientific revision, canonical ordered artifacts and separate current Results presentation. `include_authoring_contract=true` exposes the complete machine-readable authoring contract/capabilities. This tool never writes.

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

## Professor-only capability request

Professor profiles additionally receive `request_capability`. It records a durable missing-capability request while preserving the originating Experiment/draft. It does not implement simulator functionality.

Lifecycle-hook vocabulary:

`setup | initialize | control | measure | finalize`

Standing boundary:

`research AI request → Professor review → developer design discussion → explicit owner implementation approval → trusted developer implementation/deploy → research AI resumes`

Professor approval of a request is not implementation authorization.

## Validation and concurrency

Scientific Experiment writes are validated against the advertised authoring contract before persistence. Unsupported simulator capabilities are surfaced explicitly. Experiment mutations use the scientific Experiment `revision`; Results presentation mutations use their independent presentation `revision`.

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

#200 merged through PR #231 as `31239dea1174cddf0c4d2d5578034ca55e6b941d`. Production Pages run `35083140486` passed deployed browser smoke; the production Results-presentation migration is applied; Edge Function version `16` is pinned to that merged commit.
