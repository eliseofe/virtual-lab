# Virtual Lab Experiment MCP

Status: production experiment-registry MCP is deployed and restricted to experiment-domain authoring. #200 extends the same boundary to fine-grained Metrics definitions and Results presentation bindings.

Endpoint:

`https://izdmmudfrmqhvlgepwes.supabase.co/functions/v1/experiment-mcp`

Supabase project: `virtual-lab` (`izdmmudfrmqhvlgepwes`).

## Current contract

After #200 the intended deployed contract is:

- MCP server: `3.0.0`
- Experiment interface: `8`
- authoring contract: `vlab.authoring/0.6`
- canonical Experiment artifacts: `vlab.experiment-artifacts/3`
- registry schema: `vlab.registry-experiment/3`
- Metrics language: `python-vlab-metrics/0.1`
- Metrics IR: `vlab.metrics-ir/0.1`
- Results presentation: `vlab.results-presentation/1`
- capability requests: `vlab.capability-request/1`

A runnable Experiment has exactly four compulsory core artifacts: Configuration, Initialization, Controller and Metrics. The ordered `artifacts` array is canonical. Legacy three-source arguments remain a bounded compatibility input and mechanically preserve/add the compulsory Metrics artifact rather than creating a second source of truth.

## Security model

The Edge Function uses the caller's authenticated Supabase session and a user-scoped Supabase client. It does not use a service-role key for ordinary MCP operations. PostgreSQL RLS remains authoritative for collections, Experiments and Results presentation state. The authenticated user ID comes from the validated bearer token; callers cannot supply an arbitrary owner ID.

OAuth `client_id`, when present, is retained only as edit provenance and is not trusted as user identity.

The MCP remains deliberately narrower than a general Supabase, repository or simulator-development connector. It provides no GitHub, shell, arbitrary filesystem, arbitrary SQL, deployment/admin or simulator-source capability.

## Transport and OAuth

The function uses Streamable HTTP through the official Model Context Protocol TypeScript SDK. It exposes:

- `/health` for contract/deployment health;
- `/.well-known/oauth-protected-resource` for protected-resource metadata;
- the function root for MCP Streamable HTTP requests.

Supabase Auth is the OAuth authorization server. Authentication and RLS are the enforcement layer; prompt text is not used as a security boundary.

## Shared tool surface

### `read_workspace`

Read/discovery entry point.

Without `experiment_id`, returns authenticated identity, owned collections and visible Experiment summaries. With `experiment_id`, returns the visible Experiment at its current scientific revision, canonical ordered artifacts, and the separate current Results presentation. `include_authoring_contract=true` returns the complete machine-readable authoring contract/capabilities. This tool never writes.

### `manage_collection`

Collection create/rename/delete for owned collections. Deleting a collection does not delete its Experiments; they become unfiled.

### `create_experiment`

Creates a new owned Experiment from the complete canonical artifact array after validation. A legacy three-source compatibility form remains accepted for older clients and is normalized to the four compulsory artifacts with an empty Metrics artifact.

### `edit_experiment`

Revision-protected whole-Experiment edit for title/description, complete canonical artifacts, collection placement and lifecycle. The caller supplies the latest `base_revision`; stale writes are rejected.

Fine-grained metric changes should use `author_metrics_results` rather than rewriting unrelated artifacts.

### `delete_experiment`

Permanently deletes an eligible owned working Experiment at its latest supplied revision. Preserved submission/curation snapshots remain independent.

### `author_metrics_results`

Fine-grained Metrics and Results authoring. Actions are:

- `read`
- `create_metric`
- `update_metric`
- `remove_metric`
- `upsert_panel`
- `remove_panel`

Metric operations mutate only the compulsory Metrics artifact, then run the complete Experiment validation contract before writing. Metric definitions use stable IDs. `update_metric` must preserve the stable metric ID; changing identity requires an explicit remove/create operation. Unsupported syntax or capabilities return validation diagnostics rather than an inferred workaround.

Results panels are presentation/workspace state, not scientific Experiment definition. A supported panel is currently a generic `time-series` panel with an ordered, non-empty list of stable metric IDs. Multiple metrics may share a panel, and the same metric may appear in multiple panels. Arbitrary plotting code is not part of the contract.

Results presentation has its own optimistic revision. Panel edits therefore do **not** increment the scientific Experiment revision. Removing a metric also prunes saved bindings to that metric and removes any panel left empty by that removal.

The browser loads a saved `vlab.results-presentation/1` layout for registry Experiments. No saved presentation means the normal Lab default layout remains in effect; a saved presentation with `panels=[]` is an explicit empty layout.

## Professor-only capability request

Professor profiles additionally receive `request_capability`. It records a durable missing-capability request while preserving the originating Experiment/draft. It does not implement simulator functionality.

Lifecycle hook vocabulary is `setup | initialize | control | measure | finalize`.

The standing boundary remains:

`research AI request → Professor review → developer design discussion → explicit owner implementation approval → trusted developer implementation/deploy → research AI resumes`

Professor approval of a request is not implementation authorization.

## Validation and concurrency

Scientific Experiment writes are validated against the currently advertised authoring contract before persistence. Unsupported simulator capabilities are surfaced explicitly. Experiment mutations use the scientific Experiment `revision`; Results presentation mutations use their independent presentation `revision`.

This separation prevents a plot-layout change from masquerading as a scientific Experiment revision.

## Explicit non-capabilities

The MCP has no tool for:

- running or controlling the simulator;
- observing live simulator state or collected run data;
- inventing or bypassing the supported scientific Metrics language;
- arbitrary plotting/executable visualization code;
- reading or changing simulator implementation;
- GitHub/repository operations;
- shell execution;
- arbitrary filesystem access;
- deployments/admin operations;
- arbitrary SQL or Supabase project secrets;
- bypassing registry RLS.

## Provider independence

No provider-specific experiment operation exists in the server. Any compatible MCP client implementing the required Streamable HTTP/OAuth flow can use the same endpoint and contract.
