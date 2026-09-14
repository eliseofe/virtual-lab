# Virtual Lab — Project Control

Updated: **14 September 2026**

This file is the authoritative current roadmap / execution frontier for Virtual Lab. Read `AGENTS.md` first. For detailed technical state/evidence read `PROJECT_STATE.md`; for execution-unit rules read `docs/EXECUTION_GRANULARITY.md`.

## Current strategic objective — UI/UX redesign

The first real Professor/research-AI paper-driven capability loop is accepted as a **successful end-to-end round**. Generic static scalar Environment + `obs.environmental_scalar` are deployed and usable by paper-authored Experiments. Showcase promotion is optional Professor curation and is **not** required for a paper/capability loop to count as complete.

The active product frontier is **#147 — Full Virtual Lab UI/UX audit and interaction redesign**. #148 completed the interaction audit and established the simulation-first architecture.

The first substantial implementation child is now complete and deployed:

- **#150 / PR #151 + fix PR #152 — simulation-first workspace shell**;
- final main SHA `9f75ed7f9e2530e8c5681a30f3126b2f4b2a2bdd`;
- production workflow `34891785934`: build, GitHub Pages deploy and deployed-browser smoke all **success**;
- arena + Run/Pause/Restart/seed/speed are one primary stage;
- the legacy sidebar no longer governs the page;
- Account/Professor panels are secondary utilities rather than preceding simulation controls;
- desktop/mobile use the simulation-first hierarchy;
- no Experiment content, simulator/controller science, Supabase data/schema, MCP contract, capability lifecycle or registry authorization semantics changed.

The initial #150 production smoke exposed a self-triggering `MutationObserver` in the new presentation adapter; that incomplete run was cancelled after the idempotent fix landed in PR #152. The fixed production run above is the authoritative verification.

### Next substantial UI child

The next #147 implementation checkpoint is **workspace continuity + unified experiment switching** from #148:

- signed-in refresh/reopen should restore the last accessible working Experiment instead of falling back to Showcase/built-in;
- one searchable switcher should cover Recent / My experiments / Showcase without requiring source or collection preselection;
- collections remain secondary organization, not a prerequisite for finding/running an Experiment.

Do **not** start this next child inside the #150 completion unit. Create/execute it as a separate substantial ticket under `docs/EXECUTION_GRANULARITY.md`.

## Parallel experiment-authoring activity

Research-AI/Professor sessions may continue authoring/refining Experiments while UI/UX work proceeds. UI work must not infer or modify paper/controller science from incidental feedback and must avoid collisions with stored Experiment revisions, MCP/Supabase authoring state, or capability work unless explicitly scoped by the owner.

The user's current Claude/Grok controller observations are context only and do not authorize simulator/controller changes.

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

**#150 is deployed and browser-verified: the Lab now has the first simulation-first workspace shell. #147 remains the active redesign epic. The next substantial child is workspace continuity + one unified Experiment switcher; do not start it in the #150 completion unit. Experiment-authoring sessions may proceed independently and must not be modified by UI work.**
