# Virtual Lab — Agent Instructions

Before doing project work, recover the current state from the repository rather than from issue chronology or chat memory alone.

## Required read order

1. Read `PROJECT_CONTROL.md` completely. It is the authority for **current strategic priority, sequencing, gates, and opportunistic-work rules**.
2. Read `docs/EXECUTION_GRANULARITY.md`. It is the mandatory rule for how broad owner approval is converted into bounded implementation passes.
3. Read `PROJECT_STATE.md` for accepted technical state, evidence, architecture and recent implementation history.
4. Read the active issue(s) and relevant design document(s) for the specific task.

Do not infer the roadmap from the newest issue number, newest commit, most recently closed ticket, or whichever technical thread was discussed last.

## Execution granularity

Approval breadth is not execution breadth. When the owner approves several tickets with language such as `go ahead` or `proceed`, that authorizes the sequence but does not require completing all substantial tickets in one pass.

Default to **one substantial, independently deployable/testable ticket at a time**. Complete its implementation, tests, deployment when applicable, verification, issue/state updates and clean report; then stop and ask whether to continue to the next substantial ticket, unless the owner explicitly instructs in the current message to complete the whole multi-ticket sequence without intermediate stops.

Small/trivial adjacent tickets may be batched when the combined work remains one clear low-risk unit. If scope turns out larger than expected, split at the next safe boundary. Do not combine substantial tickets merely because they are related or already approved. See `docs/EXECUTION_GRANULARITY.md` for the full rule.

## Strategic vs opportunistic work

The owner sometimes cannot immediately perform phone/browser/visual acceptance. Work done during that waiting period may still be useful and necessary, but it is **opportunistic parallel work**, not an implicit change of roadmap priority.

Unless `PROJECT_CONTROL.md` or an explicit current owner instruction changes the roadmap:

- preserve the existing strategic objective;
- return to an owner-blocked acceptance gate when the owner becomes available;
- do not make a recent side task the new project priority merely because it was completed last.

## Keep the repository memory alive

After meaningful work, leave the repository in a state that another context-free session can understand without reconstructing old chats.

- Update `PROJECT_CONTROL.md` whenever strategic priority, sequencing, dependency/gate, owner-waiting state, or major product direction changes.
- Update `PROJECT_STATE.md` whenever merged/deployed technical state, owner acceptance, performance evidence, architecture/contracts, security boundaries, or important rejected approaches change.
- Keep active issues accurate about whether work is unimplemented, implemented but awaiting owner acceptance, accepted/complete, or blocked.
- If an old issue contains stale sequencing, do not silently follow it over `PROJECT_CONTROL.md`; preserve history but use the current control file for priority.

## Source precedence

When project sources disagree, use this order:

1. explicit current owner instruction;
2. `PROJECT_CONTROL.md` for priority/sequencing;
3. `PROJECT_STATE.md` for accepted technical state/evidence;
4. relevant current design document;
5. active issue scope;
6. older issues/chats as history only.

Surface any material unresolved contradiction rather than guessing.

## Completion discipline

Do not report implementation complete merely because code was written. Close the loop as appropriate: implement → test → deploy when applicable → verify the actual artifact/browser behavior → update GitHub state/documentation → report whether owner testing is still required.

Preserve the scientific guardrail in `PROJECT_STATE.md`: software reasoning is allowed; new scientific/model reasoning or retuning requires explicit owner involvement.
