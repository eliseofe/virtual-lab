# Contributing to Virtual Lab

Virtual Lab is scientific software. Contributions are evaluated against both software quality and scientific invariants.

## Before implementation

Read `PROJECT_STATE.md`, `docs/SCIENTIFIC_CONTRACT.md`, `docs/ARCHITECTURE.md`, and the relevant GitHub issue.

## Change categories

### Experiment-level work

Controllers, metrics, parameters, experiment definitions, references, and result-analysis logic should use stable public scientific interfaces.

### Core/developer work

Changes to simulator semantics, controller compiler/IR, physics, observation construction, scheduling, reproducibility, or portable schemas require stronger validation because they can change scientific results.

## Scientific validation expectations

A change that affects execution semantics should include tests for relevant invariants such as deterministic same-seed execution, neighbourhood equivalence, controller information boundaries, visualization/headless equivalence, clock separation, and source→IR execution semantics.

## Closed-loop UI validation

For user-visible changes, test the actual application in a browser after build/deployment. Exercise the changed workflow and inspect runtime/console behavior before considering the work complete.

## Cost discipline

Preserve the zero-cost baseline. Document any new dependency that introduces monetary cost, paid-tier requirements, metered APIs, or meaningful quota pressure before adoption.

## Provenance

Scientific outputs must reference immutable experiment revisions. Once an experiment revision has generated a run, subsequent scientific edits create another revision.