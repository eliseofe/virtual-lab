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

## Behaviour reference

Refactors must leave behaviour unchanged, and the repository records what "unchanged" means:

- `web/tests/fixtures/reference-experiments.mjs` lists reference Experiments (the catalog Active Elastic Experiment plus small software-coverage examples);
- `node web/scripts/reference-runs.mjs` checks that browser and MCP compilers still produce the recorded compiled artifacts and simulator input;
- `cargo test -p vlab-kernel --test reference_runs` (native) and `node web/scripts/reference-runs-wasm.mjs` (the production WebAssembly kernel, run in CI) replay those inputs and require bit-identical trajectories and metric samples;
- `node web/scripts/sync-edge-vendor.mjs --check` checks that the MCP edge function's compiler copies match the browser sources (run it without `--check` to copy them).

Re-record a reference (`--update` / `VLAB_UPDATE_REFERENCE=1`) only for an intended scientific or compiler change, or after a toolchain/platform upgrade that changes only floating-point last digits, and say which in the commit message. Native and WebAssembly results are recorded separately because their math libraries differ in the last digits.

## User-visible validation

For user-visible changes, follow `DEVELOPMENT_WORKFLOW.md`: test the actual application and verify the affected deployed behavior before reporting completion.

## Cost discipline

Preserve the zero-cost baseline. Document any new dependency that introduces monetary cost, paid-tier requirements, metered APIs, or meaningful quota pressure before adoption.

## Provenance

Scientific outputs must reference immutable Experiment revisions. Once an Experiment revision has generated a run, subsequent scientific edits create another revision.
