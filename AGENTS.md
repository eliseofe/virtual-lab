# Virtual Lab — Agent Instructions

## Start here

1. Read `DEVELOPMENT_WORKFLOW.md` completely.
2. Read `CURRENT_STATUS.md` completely.
3. Read the active issue for the current task.
4. Read only the technical/scientific documents in `docs/` that are relevant to that task.
5. Consult `ROADMAP.md` when strategic direction or sequencing is materially relevant.

Do **not** reconstruct current priorities from issue chronology, branch counts, the newest commit, broad GitHub Actions history, or archived documents.

## Authority map

- `DEVELOPMENT_WORKFLOW.md` — authoritative repository development procedure.
- `CURRENT_STATUS.md` — current project position, active frontier, explicit gates and known follow-ups.
- `ROADMAP.md` — longer-term product/research direction and priorities.
- `web/product-surface.json` — machine-readable active user-facing surfaces and their production smoke coverage.
- `docs/SCIENTIFIC_CONTRACT.md` — scientific invariants and owner-authorized scientific boundaries.
- `docs/ARCHITECTURE.md` and other `docs/*` — detailed technical/domain reference documentation.
- `docs/CAPABILITY_GENERALIZATION_GATE.md` — required architecture check before new paper-driven simulator capabilities.

When an older issue or document conflicts with a later accepted/current authority, repair the stale source rather than asking the owner to repeat an already-recorded decision.

User-facing issue references should pair the issue number with its meaning; do not expect humans to remember bare numbers.

Git history, closed issues and `docs/archive/` are historical evidence, not current execution authority.
