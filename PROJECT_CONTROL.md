# Virtual Lab — Project Control

Updated: **14 September 2026**

This file is the authoritative **current roadmap / execution frontier** for Virtual Lab. It exists so a context-free ChatGPT/Work/human session can recover the project's strategic state without reconstructing it from issue chronology.

For detailed accepted technical state and evidence, read `PROJECT_STATE.md` after this file. For a concrete implementation, then read the relevant active issue and linked design document.

## Current strategic objective

Build the **Professor paper-to-experiment capability-request loop**:

`paper + professor AI (for example Grok/Claude) → experiment draft → missing capability detected → durable Supabase capability request → Professor inbox → approve/decline → ChatGPT/GitHub implementation → deployed capability → request marked implemented → draft revalidates/runs`

The approved design is in `docs/PROFESSOR_CAPABILITY_REQUEST_WORKFLOW.md`.

This is the current major product frontier. Do **not** infer project priority from the numerically latest issue, latest commit, or most recently completed technical task.

## Current gate before starting the professor loop

The private-student production path is already implemented far enough that the remaining gate is **owner acceptance**, not a new architecture phase:

- #74 — production write-back / revision and conflict safety: implemented, still open for live owner acceptance;
- #76 — scalable experiment browser / collections / ownership presentation: implemented, still open for owner visual acceptance.

When the owner is available to test, close this acceptance gate first. Once the private-student round trip is accepted, proceed to the professor loop.

This gate exists because the professor workflow should extend a trusted student experiment lifecycle, not replace or bypass it.

## Next major product stage

After the #74/#76 acceptance gate:

1. add authenticated `professor` / `curator` role support while preserving ordinary student behavior;
2. add durable Supabase capability-request records and role-dependent missing-capability behavior;
3. add the Professor-mode request inbox with `Approve for development` / `Decline`;
4. implement the developer handoff so an approved request can be taken by ChatGPT, linked to a GitHub engineering issue, implemented/tested/deployed, and marked `implemented` only after the active capability contract advertises it;
5. revalidate the originating experiment/draft after implementation.

Broader sharing, grading/submission, Showcase/public curation, and community workflows remain related but are not prerequisites for the first capability-request loop.

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
- #3 quantitative experiment infrastructure: multi-run/headless execution, sweeps, metrics, statistics, plots, replay;
- #6 explicit Lab→AI results/plots channel;
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
4. read only the relevant active issue/design document for the current objective or gate;
5. before proposing work, state internally the current strategic objective, current gate, and whether the proposed task is strategic or opportunistic;
6. never equate “most recent issue/commit” with “next roadmap priority.”

## Current one-line status

**Strategic priority:** finish owner acceptance of the already-implemented private-student path (#74/#76), then implement the Professor paper-to-experiment capability-request loop. While owner acceptance is unavailable, parallel roadmap work may proceed, but it does not change this priority.