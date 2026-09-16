# Virtual Lab — Project Control

Updated: **16 September 2026**

This file is the authoritative current roadmap / execution frontier for Virtual Lab. Read `AGENTS.md` first. Accepted deployed technical evidence lives in `PROJECT_STATE.md`; execution-unit rules live in `docs/EXECUTION_GRANULARITY.md`.

## Current strategic status

The active product/scientific frontier is **#195 — Experiment Metrics + live Results**.

Completed and deployed children:

- **#196 / #195.1** — four compulsory Experiment artifacts: Configuration, Initialization, Controller, Metrics.
- **#197 / #195.2** — deterministic multi-metric runtime sampling, bounded buffering and batched worker→UI transport.
- **#198 / #195.3** — co-located live Results with generic multi-series time-series panels.
- **#199 / #195.4** — local-first single-run result persistence, flat user-visible metric files, async flushes and whole-Experiment package export.
- **#200 / #195.5** — MCP/Connector fine-grained Metrics + Results binding authoring end to end.

The next substantial ticket is **#201 / #195.6 — final end-to-end acceptance using the already owner-authorized Active Elastic polarization metric**.

**#201 is not waiting for a new scientific definition.** The required scientific input was already supplied and accepted during #198. Do not ask the owner to redefine it.

A separate editor ergonomics lane is #202. A separate owner-feedback UI/UX refinement lane is #207. Neither displaces #195 by default.

## Canonical Experiment and Results model

A runnable Experiment has four required authored artifacts:

1. `configuration`
2. `initialization`
3. `controller`
4. `metrics`

An empty Metrics artifact is valid. One Metrics artifact contains a generic collection of metric definitions; there is no architecture-level maximum metric count. Metrics execute as read-only scientific observers and must not mutate simulation/world/controller state or bypass simulator-owned information/RNG boundaries.

Metric evaluation cadence, UI refresh cadence and persistence flush cadence are independent. Changing rendering or storage cadence must not change scientific sampling semantics.

Results plot panels are presentation/workspace objects. A panel can bind one or more stable metric IDs; the same metric can appear in multiple panels. Reconfiguring plots must not create a new scientific Experiment revision.

## Accepted scientific fixture for #201

The existing Active Elastic acceptance fixture is authoritative for #201:

- metric id: `polarization`;
- name: Polarization order parameter;
- definition: `psi = ||sum_i heading_i|| / N`;
- observation: read-only headings of all agents plus agent count through the Metrics snapshot contract;
- acceptance/display sampling cadence: every `0.1 s`;
- that `0.1 s` cadence is a Virtual Lab product/integration acceptance choice and is **not** claimed to reproduce the paper's analysis/output cadence.

This definition was owner-authorized during #198 and the deployed live behavior was owner-accepted on phone on 16 September 2026. The built-in Active Elastic also contains the separately owner-authorized `angular_momentum` complementary metric; it may be reused as the already-approved second series for generic panel-binding acceptance.

#201 may verify the existing definitions and path end to end. It must not invent, retune, reinterpret, or replace either metric.

## Deployed #199 storage contract

Single-run scientific results are local-first. The authoritative raw output is ordinary user-visible files under a user-selected Virtual Lab workspace root when writable-directory access is available. Browser-private storage is not the scientific archive.

Canonical organization:

```text
<VirtualLab root>/
  <Experiment>/
    runs/
      <metric-id>_000001.csv
      <other-metric-id>_000001.csv
      <metric-id>_000002.csv
      ...
    studies/
      <Study>/
        runs/
          <metric-id>_000001.csv
          ...
```

Rules:

- the selected Lab Experiment is the parent directory;
- standalone runs are flat files directly under `<Experiment>/runs/`;
- never create one directory per simulation run;
- stable metric ID + increasing run number associates files belonging to one run;
- previous runs are never overwritten;
- compact Lab-managed reproducibility/debugging bookkeeping stays out of the ordinary `runs/` directory;
- future Studies reuse the same single-run file/data contract under `<Experiment>/studies/<Study>/runs/`;
- `Download experiment package` is a secondary whole-Experiment export using the same flat hierarchy, not a replacement for automatic selected-folder persistence;
- do not expose per-run ZIPs, per-run directories or one visible JSON manifest per run.

#199 merged through PR #225 (`c39979ee15d4682497d9a96f08a0c661c9424f79`) plus package-semantics cleanup PR #227 (`7fdff0d78c2192d45cb23e8c7e076bbbf3394b1d`). The direct selected-folder path remains available for a later desktop spot-check, explicitly non-blocking.

## Deployed #200 connector contract

The deployed Virtual Lab MCP/Connector exposes the complete four-artifact Experiment model plus fine-grained Metrics and Results presentation authoring. An authorized research AI can:

- discover supported Metrics syntax/capabilities;
- create/update/remove metric definitions inside the compulsory Metrics artifact;
- specify supported sampling policies;
- create/amend Results time-series panel bindings by stable metric IDs;
- receive validation/unsupported-capability diagnostics instead of fabricating behavior;
- preserve a separate Results-presentation revision so plot/layout edits do not change the scientific Experiment revision.

Current production contract:

- MCP server `3.0.0`;
- interface `8`;
- authoring contract `vlab.authoring/0.6`;
- Experiment artifact interface `vlab.experiment-artifacts/3`;
- registry schema `vlab.registry-experiment/3`;
- Results presentation schema `vlab.results-presentation/1`;
- Supabase Edge Function version `16`.

#200 merged through PR #231 as `31239dea1174cddf0c4d2d5578034ca55e6b941d`; production Pages and MCP deployment are verified. Research AI still receives no GitHub/repository/shell/deployment/admin/simulator-development privilege.

## Current next ticket — #201 / #195.6

#201 is an **acceptance/integration ticket**, not a request to design new science.

Use the already accepted `polarization` fixture above to verify the complete path:

1. Metrics artifact definition;
2. live execution and timestamps;
3. Results binding and optional already-approved second series;
4. restart/current-run behavior;
5. #199 persistence/package path;
6. #200 MCP representation and fine-grained metric/panel authoring boundary;
7. recorded performance/non-blocking behavior.

If the existing path exposes a missing generic simulator capability, stop and route that gap through the established capability request/generalization process. Do not patch a paper-specific exception.

When #201 passes, close #201 and close #195 if all epic completion conditions remain satisfied. Stop before beginning a different substantial roadmap lane unless the owner explicitly instructs otherwise.

## Separate editor lane — #202

Approved direction applies across Configuration, Initialization, Controller, Metrics and future authored artifacts:

- syntax/semantic highlighting where supported;
- line numbers and robust editing;
- parser-derived outline/navigation;
- jump-to-definition, folding and search;
- source-linked diagnostics;
- later lightweight contract-derived completion where justified.

Children: #203 foundation/highlighting; #204 navigation/folding/search; #205 diagnostics/completion.

## Owner-feedback UI/UX refinement lane — #207

The deployed UI is functional but not final. Preserve these concrete owner observations for the later coherent redesign rather than patching them piecemeal into unrelated tickets:

- #208 — unify Experiment identity and Save/Persistence/organization into one coherent workflow;
- #209 — reconcile duplicate-looking Account and Professor entry surfaces;
- #210 — remove unnecessary microcopy, strengthen typography/hierarchy and verify deliberate desktop/mobile layouts;
- Results metric/series selection lacks sufficient affordance even though multi-series binding works;
- touching/panning a live plot leaves follow-live mode without an obvious control for returning to the live edge;
- later Results workspace polish may include deliberate side-by-side/stacked/tabbed layout, rearrangement and resizing while remaining presentation state rather than scientific definition.

The connected Product Design workflow may be used when #207 is deliberately activated, but #207 is not the current implementation frontier.

## Studies boundary

Experiment Results answer: **what happened during this run?**

Studies answer: **what happened across runs/conditions?**

Future Study work composes the #199 run identities/file contract rather than inventing an incompatible result layer. The filesystem hierarchy is Experiment-first: standalone runs and `studies/` are siblings under the selected Experiment.

## Parallel capability requests — approved for design only

Professor-approved but **not implementation-authorized**:

- `7492c39d-fdd0-4f29-9661-63dbc6461bf5` — controller stochasticity/RNG capability;
- `49368c8e-dff7-4ce0-9072-bc3f4b37ada2` — heterogeneous agent initialization/state capability.

Durable record: `docs/CAPABILITY_APPROVALS_2026-09-15.md`. No coding begins until architecture is discussed and the owner explicitly authorizes implementation.

## Scientific / architecture guardrail

Developer-side ChatGPT must not independently invent or derive new scientific models, paper-specific equations/parameters, controller logic, metric formulas, scientific sampling semantics, retuning or claims of scientific equivalence.

Already owner-authorized scientific definitions may be reused **exactly as recorded** for implementation/acceptance. Reuse is not a reason to ask the owner to repeat the definition, and it is not permission to modify it.

Software architecture/performance work may design compilers, buffering, persistence, UI transport, file formats and editor tooling while preserving scientific semantics. Preserve simulator-owned RNG, controller information boundaries, environment-owned action application, explicit metric read-only observation boundaries, scientific timing/integration semantics and rendering as an observer.

Standing observation gatekeeper: global position is not an allowed robotics controller observation capability unless the owner explicitly reverses that decision.

## Execution granularity — mandatory

Approval breadth is not execution breadth. Default to one substantial independently testable/deployable ticket at a time:

1. implement or measure;
2. test;
3. deploy when applicable;
4. verify actual production behavior;
5. update repository state/issue;
6. append a success report to #145 only at verified terminal success;
7. stop before the next substantial ticket unless the owner's current instruction explicitly requests more.

## Source precedence

When sources disagree:

1. explicit current owner instruction;
2. this `PROJECT_CONTROL.md`;
3. `PROJECT_STATE.md` accepted technical state/evidence and recorded owner acceptance;
4. relevant current design document;
5. active issue scope/status;
6. older issues, date-stamped planning documents and chats as history only.

A stale lower-authority gate must be repaired, not used to make the owner repeat an already-recorded decision.
