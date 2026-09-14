# Virtual Lab — Project Control

Updated: **14 September 2026**

This file is the authoritative **current roadmap / execution frontier** for Virtual Lab. It exists so a context-free ChatGPT/Work/human session can recover the project's strategic state without reconstructing it from issue chronology.

For detailed accepted technical state and evidence, read `PROJECT_STATE.md` after this file. For the newly approved Experiment → Study → Research Document architecture, read `docs/RESEARCH_MODEL.md`. For a concrete implementation, then read the relevant active issue/design document.

## Current strategic objective

The near-term objective remains the **Professor paper-to-experiment capability-request loop**:

`paper + professor AI (for example Grok/Claude) → experiment draft → missing capability detected → durable Supabase capability request → Professor inbox → approve/decline → ChatGPT/GitHub implementation → deployed capability → request marked implemented → draft revalidates/runs`

The approved design is in `docs/PROFESSOR_CAPABILITY_REQUEST_WORKFLOW.md`.

However, on 14 September 2026 the owner approved an architectural prerequisite that should be completed **before extending professor/AI authoring**: remove the known fixed-three-artifact limitation from the Experiment data and UI architecture. Do not teach new AI workflows a representation that is already known to be temporary.

Do **not** infer project priority from the numerically latest issue, latest commit, or most recently completed technical task.

## Current owner acceptance gate

The owner accepted the normal production private-student workflow on **14 September 2026**:

- #74 — production write-back / revision and conflict safety: **accepted and closed**;
- #76 — scalable experiment browser / collections / ownership presentation: **accepted and closed**.

During that acceptance pass, the owner identified one narrow missing library-management feature: an experiment should be assignable to a collection when using `Save as new…`, and an existing owned experiment should be movable between collections. This is #115.

#115 is implemented, merged, deployed and automated-smoke green. It remains open **only for owner live acceptance**. When the owner reports acceptance, record it, close #115, and update durable state. Do not confuse this remaining acceptance step with unfinished engineering.

## Immediate approved engineering sequence

Two newly approved focused issues generalize the Experiment artifact architecture. They are justified independently of all later Study/paper features.

1. **#117 — generic Experiment artifact persistence/contract**
   - remove structural dependence on exactly `config_source`, `initializer_source`, `controller_source`;
   - mechanically preserve all current experiment content, IDs, revisions, ownership, collections, RLS and scientific semantics;
   - make artifact persistence/contract extensible without adding a new privileged column for every future artifact.

2. **#118 — artifact-driven Experiment workspace/UI**
   - depends on #117;
   - make rendering/load/save/dirty behavior follow artifact descriptors/data rather than exactly three pre-existing editor branches;
   - current users should still see the same logical three artifacts: Configuration, Initialization, Controller;
   - no Study UI or new science is introduced by this issue.

These are the next approved implementation passes. They may proceed while #115 waits for the owner's short live acceptance because they do not depend on the unresolved acceptance result, but #115 must still be closed promptly once the owner tests it.

## Next major product stage after #117/#118

Resume the Professor paper-to-experiment capability-request loop using the generalized artifact contract:

1. add authenticated `professor` / `curator` role support while preserving ordinary student behavior;
2. add durable Supabase capability-request records and role-dependent missing-capability behavior;
3. add the Professor-mode request inbox with `Approve for development` / `Decline`;
4. implement the developer handoff so an approved request can be taken by ChatGPT, linked to a GitHub engineering issue, implemented/tested/deployed, and marked `implemented` only after the active capability contract advertises it;
5. revalidate the originating experiment/draft after implementation.

Broader sharing, grading/submission, Showcase/public curation, and community workflows remain related but are not prerequisites for the first capability-request loop.

## Newly approved research architecture

The owner and assistant converged on a broader research model documented in `docs/RESEARCH_MODEL.md`.

Core semantics:

- **Experiment** = one runnable model / single-run definition with versioned, extensible artifacts;
- **Study** = a named reproducible investigation over a pinned Experiment revision, with protocol/runs/results/plots;
- **Research Note** = durable scientific memory such as hypothesis, observation, interpretation, discussion, decision or caveat, carrying explicit references to relevant Studies/results;
- **Research Document** = a paper/report/thesis-chapter scope that references any number of Studies, Notes and selected outputs, and can therefore span several Experiments.

Important approved constraints:

- Study granularity is not enforced: one conference paper may use one broad Study; a journal/thesis may use many;
- first Study implementation should expose one pinned Experiment revision per Study and never silently follow later Experiment edits;
- future multi-Experiment/reality-gap Studies are possible and the persistence design must not make them an irreversible redesign, but they are not required initially;
- Collections continue to organize Experiments; Studies do not create a second nested collection hierarchy;
- the Experiment page gains a Studies area; opening a Study should open a separate normal browser tab/workspace, leaving the Experiment laboratory open;
- raw/bulk data remains local-first; persistent definitions and compact provenance use stable IDs;
- plot specifications and generated plot/results are distinct objects;
- AI/provider integrations remain adapters, not the research model.

### Future epics

These are approved architecture, not immediate monolithic implementation tasks:

- **#3 — Study epic:** Study object/workspace, protocol, multi-run execution, metrics, aggregation, plots and replay. Decompose into focused child issues when activated.
- **#119 — Research Notes / Research Documents epic:** structured scientific memory and paper/report/thesis organization.
- **#6 — selected results/plots → AI epic:** explicit user-controlled compact result channel; bulk data remains local.
- **#120 — AI research synthesis epic:** reconstruct selected scientific context and produce report/paper seeds; future Overleaf/document output is an adapter.

Do not implement any of these epics as one pass merely because their design is documented.

## Parallel / opportunistic work rule

The owner often cannot immediately perform a phone/browser/visual acceptance step. In that situation, useful roadmap work may proceed in parallel **without changing strategic priority**.

Interpret this correctly:

- doing a needed technical task while the owner cannot test is **opportunistic progress**, not a roadmap reprioritization;
- the strategic objective remains the same unless this file is explicitly updated;
- do not promote the newest completed side task into the project's main next step merely because it is recent;
- choose opportunistic tasks that are already justified by the roadmap, do not require unresolved owner scientific/design decisions, and can be closed-loop tested without the owner;
- once the owner becomes available for a blocked acceptance gate, return to that gate unless the owner explicitly changes the priority.

Example: #111 performance attribution was valid parallel engineering work. Its recency does not make another performance optimization the main product priority.

## Parallel technical lanes / backlog

These are legitimate future or opportunistic lanes, but **not the current strategic frontier** unless explicitly promoted here:

- #56 performance epic: if activated, next performance work must first attribute N≈5,000 worker cost internally before choosing an optimization;
- #3 Study/quantitative experiment epic: multi-run/headless execution, protocols/sweeps, metrics, statistics, plots and replay;
- #6 explicit selected Study results/plots → AI channel;
- #119 Research Notes / Research Documents;
- #120 AI research synthesis / paper-report seed workflow;
- #57 deterministic RNG architecture;
- #65 first-class world/environment/setup architecture;
- #8 native/HPC backend when a measured browser ceiling justifies it;
- #102 numerical-integrator evaluation, which requires owner scientific input.

A future professor-authored paper may itself expose missing capabilities such as #65-style world primitives. The capability-request loop is intended to make such needs explicit rather than requiring the whole future simulator feature set to be built in advance.

## Roadmap maintenance protocol

This section is mandatory project process, not commentary.

### When this file must be updated

Update `PROJECT_CONTROL.md` whenever any of these changes:

- the current strategic objective;
- a dependency/gate on the strategic objective;
- an item moves between `waiting for owner`, `active`, `accepted/done`, or `backlog` in a way that affects sequencing;
- owner feedback changes which milestone should happen next;
- a new architectural decision changes the intended product loop.

Do **not** update strategic priority merely because a side task happened to be completed most recently.

### When `PROJECT_STATE.md` must be updated

Update `PROJECT_STATE.md` after substantial implementation/diagnostic work that future sessions need as technical ground truth, especially:

- deployed/merged behavior;
- owner acceptance results;
- performance evidence;
- contracts, interfaces, security boundaries or architecture decisions;
- rejected approaches that should not be retried without new evidence.

`PROJECT_STATE.md` is the detailed technical state/history. `PROJECT_CONTROL.md` is the current sequencing and priority authority.

### Issue hygiene

When implementation is complete but owner acceptance is still required, the issue must say exactly that. When owner acceptance occurs, close/update the issue and reflect the changed gate here if it affects sequencing.

Epic bodies describe approved architecture and decomposition rules; they are not permission to implement the entire epic in one pass. When an epic becomes active, inspect current state and create the smallest coherent child issue(s) that can be independently tested/deployed/accepted.

Old issue bodies may contain superseded sequencing statements. They remain useful history but must not override this file's current roadmap.

### Conflict resolution for future sessions

If sources appear to disagree:

1. explicit current owner instruction wins;
2. `PROJECT_CONTROL.md` governs current priority, gates and sequencing;
3. `PROJECT_STATE.md` governs accepted technical state/evidence;
4. current design documents govern approved architecture for their domain;
5. active issue bodies govern bounded implementation scope;
6. old issue chronology and old chats are historical evidence, not automatic priority.

If a contradiction still matters after applying that order, surface the contradiction instead of silently guessing.

## Context-free resume procedure

A new session should be able to align in one pass:

1. read `AGENTS.md`;
2. read this file completely;
3. read `PROJECT_STATE.md` for detailed current state;
4. if working on research-object architecture, read `docs/RESEARCH_MODEL.md`;
5. read only the relevant active issue/design document for the current objective or gate;
6. before proposing work, state internally the current strategic objective, current gate, and whether the proposed task is strategic or opportunistic;
7. never equate “most recent issue/commit” with “next roadmap priority.”

## Current one-line status

**Strategic priority:** obtain owner live acceptance of already-deployed #115 when convenient; immediate approved engineering is #117 → #118 to remove the fixed-three-artifact architecture; then resume the Professor paper-to-experiment capability-request loop. Study/Research-Document/results-to-AI/paper-synthesis work is documented as future epics (#3/#119/#6/#120), not yet monolithic implementation.