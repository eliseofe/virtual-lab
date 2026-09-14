# Virtual Lab — Project Control

Updated: **14 September 2026**

This file is the authoritative current roadmap / execution frontier for Virtual Lab. Read `AGENTS.md` first. For detailed technical state/evidence read `PROJECT_STATE.md`; for execution-unit rules read `docs/EXECUTION_GRANULARITY.md`.

## Current strategic objective

The near-term product objective remains the **Professor paper-to-experiment capability-request loop** documented in `docs/PROFESSOR_CAPABILITY_REQUEST_WORKFLOW.md`:

`paper + professor AI → experiment draft → missing capability → Supabase capability request → Professor inbox → approve/decline → ChatGPT/GitHub implementation → deployed capability → request implemented → draft revalidates/runs`

Before extending that workflow, finish the approved Experiment-artifact architectural prerequisite without teaching new AI workflows a representation already known to be temporary.

## Current gates and sequencing

### #115 owner acceptance

#115 collection assignment/moves is implemented, merged, deployed and automated-smoke green. It remains open only for owner live acceptance. This acceptance may occur when convenient and does not imply unfinished engineering.

### #117 — completed

#117 generic Experiment artifact persistence/contract is complete:

- isolated PR #122 merged as `6b31bd5626b5af31804ff7fbaa19ec01c719177f`;
- production database migrated to canonical ordered typed artifacts with bounded legacy mirrors;
- MCP v5 deployed as Supabase Edge Function version 9;
- existing experiment IDs/revisions/ownership/collections/RLS and scientific semantics preserved;
- synthetic fourth-artifact tests pass;
- main workflow `34832435383` passed build, Pages deploy and deployed-browser smoke.

A minimal real-client Grok read-only sanity check is useful before the next checkpoint: read `Simple Random Walk` and report artifact IDs; expected `configuration`, `initialization`, `controller`.

### #118 — waiting for explicit continuation

#118 artifact-driven Experiment workspace/UI is approved but **must not start merely because it was pre-approved**.

Per the owner's execution-granularity rule, #117 was a substantial checkpoint and is now complete. Stop here and ask whether to continue with #118. If the owner says yes, implement/test/deploy/verify #118 as its own substantial delivery unit.

The superseded combined PR #121 is closed unmerged. Its branch is implementation history only and must not be merged wholesale.

## Execution granularity — mandatory

Approval breadth is not execution breadth.

When the owner says `go ahead`, `proceed`, or equivalent across several tickets, treat that as permission for the sequence, not an obligation to batch all approved work.

Default to one substantial independently deployable/testable ticket at a time:

1. implement;
2. test;
3. deploy when applicable;
4. verify actual behavior;
5. update repository state/issue;
6. report a clean checkpoint;
7. stop and ask whether to continue to the next substantial ticket unless the owner's current message explicitly says to complete the entire sequence without intermediate stops.

Small/trivial adjacent tickets may be batched. If scope turns out larger than expected, split at the next safe boundary. Full rule: `docs/EXECUTION_GRANULARITY.md`.

## After #118

Resume the Professor capability-request loop:

1. authenticated `professor` / `curator` role support while preserving student behavior;
2. durable Supabase capability-request records and role-dependent missing-capability behavior;
3. Professor request inbox with Approve / Decline;
4. developer handoff: approved request → ChatGPT → linked GitHub implementation issue → test/deploy → mark implemented only when active capability contract advertises it;
5. revalidate originating experiment/draft.

Broader sharing/Showcase, Study execution, Research Notes/Documents, results-to-AI and paper synthesis remain related future epics/backlog rather than prerequisites for the first capability-request loop.

## Parallel / opportunistic work

Useful work may proceed while an owner-only acceptance step is unavailable, but that is opportunistic progress, not implicit roadmap reprioritization. Do not infer priority from the latest issue, commit or technical thread.

Performance (#56/#111 follow-up), native/HPC (#8), deterministic RNG (#57), world/environment architecture (#65), numerical-integrator evaluation (#102), Study/results work (#3/#6), and Research Notes/Documents/synthesis (#119/#120) remain parallel/future lanes unless explicitly promoted here.

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

**#117 is complete. #115 awaits only owner live acceptance. The next substantial engineering checkpoint is #118, but it must not begin until the owner explicitly says to continue; after #118, resume the Professor paper-to-experiment capability-request loop.**
