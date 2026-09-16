# Execution Order

This document no longer carries an independent issue sequence. Historical Round 1/2/3 ordering is preserved in Git history and closed issues; maintaining a second live roadmap here created contradictory instructions.

## Current authority

Read in this order:

1. `AGENTS.md`
2. `PROJECT_CONTROL.md`
3. `docs/EXECUTION_GRANULARITY.md`
4. `PROJECT_STATE.md`
5. the active issue and relevant current design document

`PROJECT_CONTROL.md` is the only repository document that decides the current strategic frontier and sequencing.

## Current frontier — 16 September 2026

The active epic is #195 — Experiment Metrics + live Results.

Completed/deployed children: #196, #197, #198, #199, #200.

Current substantial ticket: **#201 / #195.6 — final end-to-end acceptance using the already owner-authorized Active Elastic polarization metric.**

The accepted fixture is already recorded in `PROJECT_CONTROL.md` and `PROJECT_STATE.md`:

- `polarization`
- `psi = ||sum_i heading_i|| / N`
- acceptance/display sampling every `0.1 s`

Do not ask the owner to supply that definition again. #201 verifies the existing path; it does not design new scientific content.

After #201 reaches verified terminal success, close #195 if all epic completion conditions remain satisfied. Do not automatically jump to #202, #207, Studies, or a capability request unless the owner gives the next instruction or `PROJECT_CONTROL.md` is explicitly updated.

## Execution unit rule

Approval breadth is not execution breadth. One substantial independently testable/deployable ticket is the default unit. Complete implementation → tests → deploy when applicable → production verification → repository/issue state → success report, then stop unless the owner's current instruction explicitly authorizes continuing through additional substantial tickets.

See `docs/EXECUTION_GRANULARITY.md` for the binding rule.

## Historical issue sequences

Old Round 1 issue numbers, old Work-vs-ChatGPT sequences, old GitHub-adapter plans, and old milestone gates are historical implementation records. They must not override the current control/state files. If an old active issue still contains a resolved gate, repair its status rather than following it blindly.
