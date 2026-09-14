# Virtual Lab — Execution Granularity

This is a mandatory project-process rule.

## Approval breadth is not execution breadth

When the owner approves several tickets with language such as `go ahead`, `proceed`, or equivalent, treat that as permission to start the approved sequence. It does **not** require completing every approved ticket in one uninterrupted implementation pass.

## Default unit of execution

Default to **one substantial, independently deployable/testable ticket at a time**.

A ticket is substantial when it contains a non-trivial migration, contract/API change, deployment, cross-layer change, architectural change, or enough implementation/testing work that completing it cleanly is itself a meaningful checkpoint.

For a substantial ticket:

1. implement only that ticket;
2. test it;
3. deploy it when applicable;
4. verify the deployed/actual behavior;
5. update repository state and the issue;
6. report a clean checkpoint: what is done, what is live, what still needs owner testing, if anything;
7. **stop before beginning the next substantial ticket and ask the owner whether to continue**, unless the owner explicitly instructed in the current message to complete the whole multi-ticket sequence without intermediate stops.

No owner test is required merely to justify the checkpoint. A clean engineering boundary is sufficient reason to stop.

## When batching is acceptable

Adjacent tickets may be batched only when each is genuinely small/trivial, low-risk, and the combined work still forms one clear deployable/verifyable unit. If scope turns out larger than expected, split immediately at the next safe boundary.

Do not combine substantial tickets merely because they are both approved, closely related, or share code.

## Atomic compatibility exception

If two changes truly cannot be deployed safely except atomically, document why before combining them. Prefer bounded compatibility layers and staged deployment when that can preserve a clean ticket boundary. Even when an atomic technical transition is unavoidable, keep issue acceptance/status reporting separate and do not silently treat several roadmap tickets as one completion unit.

## Reporting rule

Never hand back a mixed status such as “part of A is live, part of B is coded, another layer is pending” when a cleaner ticket boundary was available. If work encounters a failure, finish or roll back to the current ticket boundary, state exactly what failed, and decide the repair within that ticket before advancing.
