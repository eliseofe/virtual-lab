# Virtual Lab — Project Control

Updated: **16 September 2026**

This file is the authoritative current roadmap / execution frontier for Virtual Lab. Read `AGENTS.md` first. Accepted deployed technical evidence lives in `PROJECT_STATE.md`; execution-unit rules live in `docs/EXECUTION_GRANULARITY.md`.

## Current strategic status

The active product/scientific frontier is **#195 — Experiment Metrics + live Results**.

Completed and deployed children:

- **#196 / #195.1** — four compulsory Experiment artifacts: Configuration, Initialization, Controller, Metrics.
- **#197 / #195.2** — deterministic multi-metric runtime sampling, bounded buffering and batched worker→UI transport.
- **#198 / #195.3** — co-located live Results with generic multi-series time-series panels.
- **#199 / #195.4** — local-first single-run result persistence, flat user-visible metric files, async flushes and optional whole-Experiment package export.

The next substantial implementation ticket is **#200 / #195.5 — MCP/Connector fine-grained Metrics + Results binding authoring end to end**.

After #200, **#201 / #195.6** is the owner-defined scientific end-to-end acceptance fixture. Do not start #201 before #200 is independently complete unless the owner explicitly reprioritizes.

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

## Deployed #199 storage contract

Single-run scientific results are local-first. The authoritative raw output is ordinary user-visible files under a user-selected Virtual Lab workspace root when the browser supports writable directory access. Browser-private storage is not the scientific archive.

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
- future Studies must reuse the same single-run file/data contract under `<Experiment>/studies/<Study>/runs/`;
- where direct writable-directory access is unavailable, the optional `Download experiment package` action packages all completed standalone runs currently retained for the selected Experiment using the same `<Experiment>/runs/` flat-file organization plus compact `<Experiment>/.vlab/` bookkeeping;
- the package action is secondary and is not a substitute for automatic selected-folder persistence where that capability exists;
- do not expose per-run ZIPs, per-run directories or one visible JSON manifest per run.

#199 initially merged through PR #225 as `c39979ee15d4682497d9a96f08a0c661c9424f79`. Owner phone review then clarified the package semantics; PR #227 replaced ambiguous `Download last run` behavior with whole-Experiment packaging and removed fallback terminology, merging as `7fdff0d78c2192d45cb23e8c7e076bbbf3394b1d`.

Production run `35033123628` passed build, Pages deploy, ordinary browser smoke, built-in real-metric smoke, live Results smoke, the dedicated local-result-persistence smoke, and responsive/focus smoke. The direct selected-folder path remains available for a later desktop spot-check by the owner, but that acceptance check is explicitly non-blocking; #199 is complete and the project moves on.

## Current next ticket — #200 / #195.5

#200 completes the machine-readable authoring side of #195. The Virtual Lab MCP/Connector must expose the complete four-artifact Experiment model plus fine-grained Metrics and Results presentation authoring so an authorized research AI can:

- discover supported Metrics syntax/capabilities;
- create/update/remove metric definitions inside the compulsory Metrics artifact;
- specify supported sampling policies;
- create/amend Results plot-panel bindings by stable metric IDs;
- receive validation/unsupported-capability diagnostics instead of fabricating behavior;
- author a paper-driven Experiment with sensible initial Results presentation.

Research AI still receives no GitHub/repository/shell/deployment/admin/simulator-development privilege. Unsupported simulator capability requests continue through the Professor approval → developer design discussion → explicit owner implementation approval flow.

Stop after #200 is independently implemented, tested, deployed and verified. Do not roll #201 into it.

## #201 scientific acceptance

#201 is the final end-to-end scientific acceptance child for #195. Developer-side ChatGPT must not invent the mathematical definition, paper-specific sampling cadence or scientific interpretation of the acceptance metric. Those scientific choices require explicit owner/research-AI input.

The Active Elastic showcase already contains owner-authorized polarization and rotation/milling metrics for product acceptance; that does not waive the general scientific guardrail.

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
- Results metric/series selection currently lacks clear affordance even though multi-series binding works;
- touching/panning a live plot leaves follow-live mode without an obvious state/control for returning to the live edge;
- later Results workspace polish may include deliberate side-by-side/stacked/tabbed layout, rearrangement and resizing, while remaining presentation state rather than scientific definition.

The connected Product Design workflow may be used when #207 is deliberately activated, but #207 is not the current implementation frontier.

## Neighbour-search / performance state

Production native/WASM `Simulation` uses `adaptive-periodic-bvh/v1`, preserving exact receiver-radius membership, arbitrary simultaneous radii, periodic minimum-image geometry and deterministic sorted neighbour indices.

Retained alternatives: `PeriodicGridNeighbourIndex` as exact reference/fallback and `BruteForceNeighbourIndex` as hidden correctness oracle. #56 remains the living performance umbrella. #179 remains deferred until Studies exist.

## Studies boundary

Experiment Results answer: **what happened during this run?**

Studies answer: **what happened across runs/conditions?**

Future Study work must compose the #199 run identities/file contract rather than inventing an incompatible result layer. Relevant future work includes #3 Study foundation, #4 Study storage, #127 resume/checkpoint semantics, #6/#166 selected Study-result → AI, and #179 persistent neighbour benchmark Study.

## Parallel capability requests — approved for design only

Professor-approved but **not implementation-authorized**:

- `7492c39d-fdd0-4f29-9661-63dbc6461bf5` — controller stochasticity/RNG capability;
- `49368c8e-dff7-4ce0-9072-bc3f4b37ada2` — heterogeneous agent initialization/state capability.

Durable record: `docs/CAPABILITY_APPROVALS_2026-09-15.md`. No coding begins until architecture is discussed and the owner explicitly authorizes implementation.

## Scientific / architecture guardrail

Developer-side ChatGPT must not independently invent or derive scientific models, paper-specific equations/parameters, controller logic, metric formulas, scientific sampling semantics, retuning or claims of scientific equivalence.

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
3. focused current architecture/design docs;
4. `PROJECT_STATE.md` technical evidence;
5. current issue;
6. older chats/issues/history.
