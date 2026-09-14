# Virtual Lab — Project Control

Updated: **15 September 2026**

This file is the authoritative current roadmap / execution frontier for Virtual Lab. Read `AGENTS.md` first. For detailed technical state/evidence read `PROJECT_STATE.md`; for execution-unit rules read `docs/EXECUTION_GRANULARITY.md`.

## Current strategic objective — UI/UX redesign

The first real Professor/research-AI paper-driven capability loop is accepted as a **successful end-to-end round**. Generic static scalar Environment + `obs.environmental_scalar` are deployed and usable by paper-authored Experiments. Showcase promotion is optional Professor curation and is **not** required for a paper/capability loop to count as complete.

The active product frontier is **#147 — Full Virtual Lab UI/UX audit and interaction redesign**. #148 completed the interaction audit and established the simulation-first architecture.

The first substantial implementation child is complete and deployed:

- **#150 / PR #151 + fix PR #152 — simulation-first workspace shell**;
- final main SHA `9f75ed7f9e2530e8c5681a30f3126b2f4b2a2bdd`;
- production workflow `34891785934`: build, GitHub Pages deploy and deployed-browser smoke all **success**;
- arena + Run/Pause/Restart/seed/speed are one primary stage;
- the legacy sidebar no longer governs the page;
- Account/Professor panels are secondary utilities rather than preceding simulation controls;
- desktop/mobile use the simulation-first hierarchy;
- no Experiment content, simulator/controller science, Supabase data/schema, MCP contract, capability lifecycle or registry authorization semantics changed.

The initial #150 production smoke exposed a self-triggering `MutationObserver` in the new presentation adapter; that incomplete run was cancelled after the idempotent fix landed in PR #152. The fixed production run above is the authoritative verification.

The second substantial implementation child is complete and deployed:

- **#153 / PR #154 — workspace continuity + unified Experiment switching**;
- merge `dfb70a3882176cd28a11fb3f891952eccc28d865`;
- production workflow `34895522534`: build, GitHub Pages deploy and deployed-browser smoke all **success** after one external GitHub OIDC-token timeout was retried unchanged;
- authenticated workspace state remembers the last accessible owned Experiment and restores it after refresh;
- Built-in and owned runnable Experiments share one direct switcher and one searchable finder;
- collections are optional metadata/filters rather than a prerequisite for finding or opening an Experiment;
- dirty-edit discard protection and existing save/revision/conflict/move semantics remain intact;
- no Experiment content, scientific/controller semantics, simulator, Supabase schema/data, MCP contract, capability request/lifecycle or Showcase policy changed.

The third substantial implementation child is complete and deployed:

- **#155 / PR #156 — authoring + persistence workspace**;
- merge `694fd544563ff01fe87f061c9240c74d31873eb1`;
- PR workflow `34898283071`: full Rust/Node tests and static browser artifact **success**;
- independent performance workflow `34898283150`: first attempt hit the known browser-profile harness startup race (`Chrome did not publish DevToolsActivePort`); unchanged rerun **success**;
- production workflow `34898683292`: build, GitHub Pages deploy and deployed-browser smoke all **success**;
- Configuration / Initialization / Controller now share one single-active artifact workbench; supported additional text artifacts join the same tab surface;
- one visible **Apply changes & restart** action delegates to the existing setup/controller validation and runtime paths rather than changing execution semantics;
- existing Save / Save as new / dirty / revision-conflict controls are colocated with authoring while retaining registry ownership/write behavior;
- compiled initializer/controller IR is under **Technical details** by default;
- #150 stage hierarchy and #153 switching/restore behavior remain intact;
- no Experiment content, simulator/scientific semantics, Supabase schema/data/RLS, MCP/authoring contract, capability request/lifecycle, collection persistence or Showcase policy changed.

The fourth substantial implementation child is complete and deployed:

- **#157 / PR #158 — collections / organization redesign**;
- merge `f82eb392a3cf60d5a71ffab76c92b7da8cc4d5c2`;
- PR workflow `34899773685`: full Rust/Node tests and static browser artifact **success**;
- independent performance workflow `34899773675`: **success**;
- production workflow `34899902650`: build, GitHub Pages deploy and deployed-browser smoke all **success**;
- the primary Experiment finder no longer exposes collection filters or requires collection navigation;
- collection membership remains secondary metadata only; absence-of-collection labeling is suppressed from primary switch/search/current-experiment chrome;
- one explicit **Organize** surface now owns optional organization work;
- the existing authoritative #115 move control is relocated into that surface, preserving its dirty/revision/conflict semantics rather than duplicating Experiment write logic;
- collection creation and rename use the existing `experiment_collections` table and existing owner RLS; no schema/RLS change was made;
- Save as new still supports optional collection assignment and normal Experiment persistence behavior;
- the presentation observer is explicitly idempotent to avoid the #150 self-triggering observer failure class;
- no Experiment source content, simulator/scientific semantics, MCP/authoring contract, capability request/lifecycle, Professor handoff state or Showcase policy changed.

### Next substantial UI child

The final planned #147 implementation checkpoint from #148 is **E. Responsive / accessibility / regression hardening**:

- audit narrow-screen sheets/dialogs and scientific-flow ordering;
- audit keyboard/focus behavior and practical touch targets;
- harden loading/empty/error/auth states;
- encode the redesign invariants in structural/browser regressions so future additive modules cannot silently reintroduce sidebar-first/admin-first behavior.

Do **not** start E inside the #157 completion unit. It must be a separate substantial deployable checkpoint under `docs/EXECUTION_GRANULARITY.md`.

## Parallel experiment-authoring activity

Research-AI/Professor sessions may continue authoring/refining Experiments while UI/UX work proceeds. UI work must not infer or modify paper/controller science from incidental feedback and must avoid collisions with stored Experiment revisions, MCP/Supabase authoring state, or capability work unless explicitly scoped by the owner.

Two recent Grok capability requests for the informed-robot aggregation experiment are durable but remain **requested only** and are not an active engineering instruction:

- `controller / stochasticity.rng` — request `7492c39d-fdd0-4f29-9661-63dbc6461bf5`;
- `initialization / heterogeneous_agent_state` — request `49368c8e-dff7-4ce0-9072-bc3f4b37ada2`.

They require normal Professor review/design discussion and explicit implementation approval before developer work begins. Do not treat their existence or issue recency as authorization.

## Owner acceptance that remains deferred

- **#115** — collection choice during Save as new and clean owned-Experiment moves between collections/No collection;
- **#118** — artifact-driven Experiment workspace while retaining ordinary Configuration / Initialization / Controller behavior;
- **#149** — optional refinement of the first paper Experiment and optional Showcase decision.

These may be exercised naturally after the redesigned Lab removes the current UX friction. Showcase promotion remains independent of paper-loop success.

## Professor capability-request loop — durable boundary

Standing flow:

`paper + research AI → Experiment draft → missing capability → durable request → Professor approve/decline → developer design discussion → explicit owner implementation approval → trusted developer handoff → capability implementation/deploy → deployed-contract verification → request implemented → research AI resumes preserved draft`

Responsibility boundary:

- research AI **asks and uses**;
- Professor **decides**;
- developer-side ChatGPT **implements and certifies**.

Professor approval alone never starts engineering. Research AI never receives GitHub/repository/shell/deployment/admin/simulator-source privileges.

Current deployed capability-loop foundation includes #133, #135, #139, #141 and the first generic paper-driven capability #143 / PR #144. Detailed evidence is in `PROJECT_STATE.md` and the respective issues/PRs.

The reusable private completion/revalidation gate remains future standalone infrastructure; do not silently bundle it into another capability ticket.

## Scientific / architecture guardrail

While building the simulator, developer-side ChatGPT must not independently invent or derive the scientific model being simulated. Scientific equivalence, paper-specific equations/parameters, controller logic and model analysis belong to the Professor/research-AI discussion unless the owner explicitly authorizes scientific reasoning.

For paper-driven capabilities, apply `docs/CAPABILITY_GENERALIZATION_GATE.md`. Stop before implementation when a request would create paper-specific simulator semantics, duplicate representations/execution paths, accumulating special cases, ownership-boundary violations, or repeated pressure on a provisional abstraction.

## Execution granularity — mandatory

Approval breadth is not execution breadth. Default to one substantial independently deployable/testable ticket at a time:

1. implement;
2. test;
3. deploy when applicable;
4. verify actual behavior;
5. update repository state/issue;
6. report a clean checkpoint;
7. stop unless the owner's current message explicitly requests the whole multi-ticket sequence without intermediate stops.

If a seemingly small task grows into a **Krono/Gaia/Hercules** task, stop at the next safe durable boundary rather than silently extending execution. Full rule: `docs/EXECUTION_GRANULARITY.md`.

## Success-only durable reporting

GitHub issue #145 is the central success-report stream for ChatGPT-managed `eliseofe/*` work. Pure discussion, failures, retries and partial work do not create completion reports. After verified terminal success, append one `[SUCCESS REPORT]`; `github-actions[bot]` reposts it mentioning `@eliseofe`.

Issue #146 is separate account-level GitHub notification work and must not be mixed into simulator/UI development.

## Parallel / future epics

Performance (#56/#111 follow-up), native/HPC (#8), deterministic RNG (#57), world/environment architecture (#65), numerical-integrator evaluation (#102), Study/results work (#3/#6), Research Notes/Documents (#119), and AI synthesis (#120) remain parallel/future lanes unless explicitly promoted here.

## Source precedence

When sources disagree:

1. explicit current owner instruction;
2. `PROJECT_CONTROL.md` for priority/sequencing;
3. `PROJECT_STATE.md` for accepted technical state/evidence;
4. current design documents;
5. active issue scope;
6. older issues/chats as history only.

Surface material unresolved contradictions instead of guessing.

## Current one-line status

**#150, #153, #155 and #157 are deployed and browser-verified. #147 remains the active redesign epic. The final planned implementation child is E: responsive/accessibility/regression hardening; do not start it inside the #157 completion unit. The two recent Grok capability requests remain requested/unapproved and are not an engineering instruction.**
