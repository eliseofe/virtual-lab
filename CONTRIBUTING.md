# Contributing to Virtual Lab

Virtual Lab is scientific software. Contributions are evaluated against both software quality and scientific invariants.

## Before implementation

Read `DEVELOPMENT_WORKFLOW.md`, `CURRENT_STATUS.md`, `docs/SCIENTIFIC_CONTRACT.md`, `docs/ARCHITECTURE.md`, and the relevant GitHub issue.

## Change categories

### Experiment-level work

Controllers, metrics, parameters, experiment definitions, references, and result-analysis logic should use stable public scientific interfaces.

### Core/developer work

Changes to simulator semantics, controller compiler/IR, physics, observation construction, scheduling, reproducibility, or portable schemas require stronger validation because they can change scientific results.

## Scientific validation expectations

A change that affects execution semantics should include tests for relevant invariants such as deterministic same-seed execution, neighbourhood equivalence, controller information boundaries, visualization/headless equivalence, clock separation, and source→IR execution semantics.

## User-visible validation

For user-visible changes, follow `DEVELOPMENT_WORKFLOW.md`: test the actual application and verify the affected deployed behavior before reporting completion.

## Cost discipline

Preserve the zero-cost baseline. Document any new dependency that introduces monetary cost, paid-tier requirements, metered APIs, or meaningful quota pressure before adoption.

## Provenance

Scientific outputs must reference immutable Experiment revisions. Once an Experiment revision has generated a run, subsequent scientific edits create another revision.
