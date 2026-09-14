# Virtual Lab — Project Control

Updated: **15 September 2026**

This file is the authoritative current roadmap / execution frontier for Virtual Lab. Read `AGENTS.md` first. For detailed technical state/evidence read `PROJECT_STATE.md`; for the completed UI/UX sequence read `docs/UI_UX_REDESIGN_CLOSEOUT_2026-09-15.md`; for execution-unit rules read `docs/EXECUTION_GRANULARITY.md`.

## Current strategic status — #147 UI/UX redesign complete

The full #147 interaction redesign is **complete, deployed and browser-verified**. #148 established the simulation-first architecture; implementation then completed as five substantial independent checkpoints:

- **A — #150 / PR #151 + fix #152:** simulation-first workspace shell;
- **B — #153 / PR #154:** workspace continuity + unified Experiment switching;
- **C — #155 / PR #156:** authoring + persistence workspace;
- **D — #157 / PR #158:** collections / organization redesign;
- **E — #159 / PR #160 + harness-fix PR #161:** responsive / accessibility / regression hardening.

The accepted Lab workflow is now:

`find/resume Experiment → run/observe → edit one artifact → apply/restart → save → organize only when explicitly needed`

The simulation is the primary object. Run/Pause/Restart/seed/speed are adjacent to the arena; Account/Professor/organization are secondary surfaces; Experiment search is global rather than collection-driven; Configuration/Initialization/Controller share one workbench; implementation IR is progressive disclosure.

### Final #159 verification

Primary UI implementation merged in PR #160 as `4edf78c619ce408e9d32ff16bc97094f05a34546`.

- PR workflow `34901241471`: full Rust/Node tests + static artifact **success**;
- independent performance workflow `34901241394`: first attempt hit the known Chrome startup race (`Chrome did not publish DevToolsActivePort`); unchanged rerun **success**.

The first production closeout exposed only a smoke-harness defect: the new responsive test called nonexistent CDP `Emulation.enable` before reaching any UI assertion. #159 was explicitly reopened rather than treated as done. PR #161 removed that invalid harness call without weakening the assertions and merged as `c1a99469d720850143513cab2704b7b6073ae709`.

Authoritative final production workflow: **`34901925055`**.

- build: **success**;
- GitHub Pages deployment: **success**;
- existing functional deployed-browser/simulator smoke: **success**;
- deployed **390×844** responsive hierarchy/focus smoke: **success**.

The live mobile gate verifies no horizontal page overflow, simulation-first document hierarchy, no admin surface inside the scientific workspace, one active authoring pane, Technical details collapsed by default, no collection filters in primary navigation, arena inside viewport, 44px primary touch targets, Experiment-finder focus return, Account-dialog focus entry/return, and authoring keyboard tab behavior.

Detailed closeout/evidence: `docs/UI_UX_REDESIGN_CLOSEOUT_2026-09-15.md`.

## Execution frontier after #147

There is **no implicit next engineering ticket** after the redesign. Do not infer a new task from issue recency or from the existence of pending capability requests.

Previously deferred owner acceptance may now be exercised naturally in the redesigned Lab when useful:

- **#115** — collection choice during Save as new and clean owned-Experiment moves;
- **#118** — artifact-driven Experiment workspace;
- **#149** — optional refinement of the first paper Experiment / optional Showcase decision.

The owner has explicitly delegated the #147/#159 acceptance to automated/deployed-browser verification and does not need to perform a manual pass for this closeout.

## Parallel research-AI capability requests — not engineering work

Two Grok requests for the informed-robot aggregation experiment are durable but remain **requested only**:

- `7492c39d-fdd0-4f29-9661-63dbc6461bf5` — `controller / stochasticity.rng`, lifecycle hook `control`;
- `49368c8e-dff7-4ce0-9072-bc3f4b37ada2` — `initialization / heterogeneous_agent_state`, lifecycle hook `initialize`.

Neither has Professor approval, developer handoff, GitHub implementation issue, or implementation authorization. Completion of #147 does not authorize either capability.

## Professor capability-request loop — durable boundary

Standing flow:

`paper + research AI → Experiment draft → missing capability → durable request → Professor approve/decline → developer design discussion → explicit owner implementation approval → trusted developer handoff → capability implementation/deploy → deployed-contract verification → request implemented → research AI resumes preserved draft`

Responsibility boundary:

- research AI **asks and uses**;
- Professor **decides**;
- developer-side ChatGPT **implements and certifies**.

Professor approval alone never starts engineering. Research AI never receives GitHub/repository/shell/deployment/admin/simulator-source privileges.

Current deployed capability-loop foundation includes #133, #135, #139, #141 and the first generic paper-driven capability #143 / PR #144. The first real Professor/Grok capability loop is accepted as a successful end-to-end round. Generic static scalar Environment + `obs.environmental_scalar` are deployed and usable. Showcase promotion remains optional Professor curation, not a paper-loop completion condition.

The reusable private completion/revalidation gate remains future standalone infrastructure; do not silently bundle it into unrelated work.

## Scientific / architecture guardrail

While building the simulator, developer-side ChatGPT must not independently invent or derive the scientific model being simulated. Scientific equivalence, paper-specific equations/parameters, controller logic, retuning and model analysis belong to the Professor/research-AI discussion unless the owner explicitly authorizes scientific reasoning.

For paper-driven capabilities, apply `docs/CAPABILITY_GENERALIZATION_GATE.md`. Stop before implementation when a request would create paper-specific simulator semantics, duplicate representations/execution paths, accumulating special cases, ownership-boundary violations, or repeated pressure on a provisional abstraction.

Preserve simulator-owned RNG, controller information boundaries, environment-owned action application, scientific timing/integration semantics, and rendering as an observer unless explicitly approved otherwise.

## Execution granularity — mandatory

Approval breadth is not execution breadth. Default to one substantial independently deployable/testable ticket at a time:

1. implement;
2. test;
3. deploy when applicable;
4. verify actual behavior;
5. update repository state/issue;
6. report a clean checkpoint;
7. stop unless the owner's current message explicitly requests a broader sequence.

If a seemingly small task grows into a **Krono/Gaia/Hercules** task, stop at the next safe durable boundary rather than silently extending execution. Full rule: `docs/EXECUTION_GRANULARITY.md`.

## Success-only durable reporting

GitHub issue #145 is the central success-report stream for ChatGPT-managed `eliseofe/*` work.

- pure discussion: no report;
- failed/retrying/partial work: no success report;
- verified terminal success: append one `[SUCCESS REPORT]` comment; the notifier reposts it mentioning `@eliseofe`.

Issue #146 is complete account-level notification work and remains separate from simulator/UI development.

## Parallel / future lanes

Performance (#56/#111 follow-up), native/HPC (#8), deterministic RNG (#57), world/environment architecture (#65), numerical-integrator evaluation (#102), Study/results work (#3/#6), Research Notes/Documents (#119), and AI synthesis (#120) remain parallel/future lanes unless explicitly promoted by the owner or by a later `PROJECT_CONTROL.md` update.

## Source precedence

When sources disagree:

1. explicit current owner instruction;
2. `PROJECT_CONTROL.md` for priority/sequencing;
3. `docs/UI_UX_REDESIGN_CLOSEOUT_2026-09-15.md` for #147/#159 closeout evidence;
4. `PROJECT_STATE.md` for accepted technical state/evidence outside any superseded UI-frontier wording;
5. current design documents;
6. active issue scope;
7. older issues/chats as history only.

Surface material unresolved contradictions instead of guessing.

## Current one-line status

**#147 A–E is complete, deployed and browser-verified; final production workflow `34901925055` passed build, Pages deploy, functional simulator smoke and real 390×844 responsive/focus smoke. No next engineering task is implicitly authorized. The two recent Grok capability requests remain requested/unapproved.**
