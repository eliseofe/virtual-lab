# Virtual Lab — Project Control

Updated: **16 September 2026**

This file is the authoritative current roadmap / execution frontier for Virtual Lab. Read `AGENTS.md` first. Accepted deployed technical evidence lives in `PROJECT_STATE.md`; execution-unit rules live in `docs/EXECUTION_GRANULARITY.md`.

## Current strategic status

**#195 — Experiment Metrics + live Results is complete.** The complete four-artifact Experiment → live Results → local persistence → research-AI authoring loop is deployed and accepted.

**#149 — Professor promotion of an accepted Experiment revision to Showcase is complete.** The deployed model is:

`owned saved Experiment revision → immutable curated snapshot → reversible Showcase publication state`

Showcase is public curation/publication, not an ordinary private `experiment_collections` collection. Promotion freezes the exact saved scientific revision; later source edits do not mutate the curated item; removal only removes active publication state; a later exact revision may be promoted again. Public discovery is read-only. Signed-in users may save a private copy rather than mutate the Showcase item. Promotion/removal remain Professor-gated and do not expand research-AI privileges.

Implementation evidence is PR **#234 — Add reversible Professor promotion to Showcase** plus PR **#235 — Place Showcase curation in Professor mode**. Production Pages run `35122267503` passed after the final UI-placement repair. The production Supabase schema contains `showcase_entries` plus the promote/remove/list RPCs. A terminal privilege hardening pass explicitly revoked anonymous `EXECUTE` on the promote/remove RPCs; the public listing RPC remains intentionally callable by anonymous visitors.

There is currently **no automatically activated next implementation ticket**. The next intended product checkpoint is a short owner/design discussion for **#207 — UI/UX refinement round 2**. Do not begin #207 implementation until that discussion activates the lane.

Other existing candidate lanes remain **#202 — code authoring ergonomics** and **#3 — Studies / reproducible multi-run investigations**.

## Canonical Experiment and Results model

A runnable Experiment has four required authored artifacts:

1. `configuration`
2. `initialization`
3. `controller`
4. `metrics`

An empty Metrics artifact is valid. One Metrics artifact contains a generic collection of metric definitions; there is no architecture-level maximum metric count. Metrics execute as read-only scientific observers and must not mutate simulation/world/controller state or bypass simulator-owned information/RNG boundaries.

Metric evaluation cadence, UI refresh cadence and persistence flush cadence are independent. Changing rendering or storage cadence must not change scientific sampling semantics.

Results plot panels are presentation/workspace objects. A panel can bind one or more stable metric IDs; the same metric can appear in multiple panels. Reconfiguring plots must not create a new scientific Experiment revision.

## Accepted scientific fixture

The Active Elastic acceptance fixture used to close #195 is authoritative:

- metric id: `polarization`;
- name: Polarization order parameter;
- definition: `psi = ||sum_i heading_i|| / N`;
- observation: read-only headings of all agents plus agent count through the Metrics snapshot contract;
- acceptance/display sampling cadence: every `0.1 s`;
- the `0.1 s` cadence is a Virtual Lab product/integration acceptance choice and is **not** claimed to reproduce the paper's analysis/output cadence.

This definition was owner-authorized during #198 and the deployed live behavior was owner-accepted on 16 September 2026. The built-in Active Elastic also contains the separately owner-authorized `angular_momentum` complementary metric, used only as the already-approved second series for generic Results acceptance.

Do not invent, retune, reinterpret or replace either metric without explicit owner authorization.

## Deployed local-result storage contract

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
        <metric-id>_000001.csv
        <other-metric-id>_000001.csv
        ...
```

Rules:

- standalone runs are flat files directly under `<Experiment>/runs/`;
- never create one directory per simulation run;
- stable metric ID + increasing run number associates files belonging to one run;
- previous runs are never overwritten;
- compact Lab-managed reproducibility/debugging bookkeeping stays out of the ordinary `runs/` directory;
- future Studies reuse the same flat metric-file convention directly under `<Experiment>/studies/<Study>/` with no additional `runs/` layer;
- `Download experiment package` is a secondary whole-Experiment export using the same hierarchy, not a replacement for automatic selected-folder persistence;
- do not expose per-run ZIPs, per-run directories or one visible JSON manifest per run.

## Deployed research-AI / MCP contract

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

Research AI still receives no GitHub/repository/shell/deployment/admin/simulator-development privilege and receives no Showcase curator privilege.

## Showcase publication contract — #149 complete

The production Showcase contract is intentionally separate from mutable Experiment visibility and private organization:

- exact source Experiment identity + revision are preserved;
- title, description and the complete generic authored artifact representation are frozen into an immutable `curated` snapshot;
- `showcase_entries` stores reversible publication state and curator/time metadata;
- active publication may be removed without deleting the snapshot or source Experiment;
- promoting a newer exact revision supersedes the previous active publication while preserving history;
- anonymous/public discovery uses the read-only `list_showcase_experiments()` RPC;
- only authenticated Professor users may successfully invoke promote/remove, and the privilege surface now also explicitly denies anonymous execute on those curation RPCs;
- ordinary users copy from Showcase into private work rather than overwriting the canonical item.

The accepted AI-authored paper Experiment is now eligible for normal Professor promotion. Actual curation remains an explicit Professor action; successful implementation of #149 does not mean every eligible Experiment is automatically published.

## Separate editor lane — #202 — code authoring ergonomics

Approved direction applies across Configuration, Initialization, Controller, Metrics and future authored artifacts:

- syntax/semantic highlighting where supported;
- line numbers and robust editing;
- parser-derived outline/navigation;
- jump-to-definition, folding and search;
- source-linked diagnostics;
- later lightweight contract-derived completion where justified.

Children: **#203 — editor foundation/highlighting**, **#204 — navigation/folding/search**, **#205 — diagnostics/completion**.

## Owner-feedback UI/UX refinement lane — #207 — UI/UX refinement round 2

**Not yet implementation-activated. Discuss design with the owner first.**

Preserve these concrete observations for the coherent refinement round rather than patching them piecemeal into unrelated tickets:

- **#208 — unify Experiment identity and Save/Persistence/organization into one coherent workflow**;
- **#209 — reconcile duplicate-looking Account and Professor entry surfaces**;
- **#210 — remove unnecessary microcopy, strengthen typography/hierarchy and verify deliberate desktop/mobile layouts**;
- Results metric/series selection lacks sufficient affordance even though multi-series binding works;
- touching/panning a live plot leaves follow-live mode without an obvious control for returning to the live edge;
- later Results workspace polish may include deliberate side-by-side/stacked/tabbed layout, rearrangement and resizing while remaining presentation state rather than scientific definition.

This refinement round must produce an extensible UI architecture, not a frozen screenshot. New future capabilities should attach to stable workspace regions and interaction patterns without forcing another redesign of unrelated existing sections.

## Studies boundary — #3 — reproducible multi-run investigations

Experiment Results answer: **what happened during this run?**

Studies answer: **what happened across runs/conditions?**

Future Study work composes the deployed run identities/file contract rather than inventing an incompatible result layer. The filesystem hierarchy remains Experiment-first.

## Parallel capability requests — approved for design only

Professor-approved but **not implementation-authorized**:

- `7492c39d-fdd0-4f29-9661-63dbc6461bf5` — simulator-owned deterministic/reproducible controller RNG capability;
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
6. older issues, date-stamped documents and chats as history only.

A stale lower-authority gate must be repaired, not used to make the owner repeat an already-recorded decision.
