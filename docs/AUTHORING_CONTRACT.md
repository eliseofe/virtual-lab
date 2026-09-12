# Experiment Authoring Contract

## Status quo

Virtual Lab uses three student-editable source artifacts:

1. **configuration** — restricted Python-like `NAME = value` assignments, compiled by `web/src/config/compiler.js` to `vlab.config/0.2`;
2. **initializer** — restricted Python-like function syntax, compiled/evaluated by `web/src/initializer/compiler.js` to deterministic initial state `vlab.initializer-state/0.2`;
3. **controller** — `python-vlab/0.1`, compiled by `web/src/controller/compiler.js` to `vlab.controller-ir/0.1` and executed by the Rust/WASM kernel.

The controller source is not general Python. It is a deliberately constrained Python-compatible authoring language. The simulator owns the observation/action boundary and rejects unavailable host capabilities.

The current controller interface exposes only the current production capabilities: local heading, neighbouring agents' relative positions, the `Motion(forward, turning)` action, and the small approved intrinsic set documented by the machine-readable contract.

## Authoritative validation path

The production browser currently uses the three compiler modules above plus runtime setup checks in `web/src/main.js` before creating/resetting the WASM simulation.

Issue #55 adds a server-side **compile-without-simulation** validation path for AI-authored registry writes. It uses byte-identical vendored copies of the three production compiler modules. CI asserts those copies remain byte-identical to production, so a compiler change cannot silently drift from MCP validation.

The validator then applies the same current runtime parameter/initializer-fit checks used by the production browser. It never constructs or advances the WASM simulation.

Invalid source writes are rejected. The MCP returns structured diagnostics and the AI repairs the source conversationally before retrying.

## Machine-readable contract

`supabase/functions/experiment-mcp/authoring.js` exports `AUTHORING_CONTRACT` (`vlab.authoring/0.1`). `read_workspace(include_authoring_contract=true)` exposes it through the existing compact five-tool MCP.

The contract includes:

- artifact/compiler versions;
- accepted source shape;
- current observation/action/intrinsic capabilities;
- forbidden controller roots/capabilities;
- diagnostic categories;
- execution/security boundary;
- the exact current built-in Active Elastic sources as a mechanically checked syntax/reference example.

The reference example is not new scientific guidance. A test extracts the current built-in sources from `web/src/main.js` and requires exact equality with the contract copy.

## Extensibility

The contract presents observations, actions, and intrinsics as typed/versioned capability descriptors rather than treating today's vocabulary as permanent.

Adding a future capability still requires simulator implementation and compiler support. Student-side AI cannot add simulator capabilities. Unsupported needs are surfaced as structured capability diagnostics and are tracked separately by issue #58 for the feature-request/triage workflow.

The controller IR remains a versioned semantic boundary independent of the browser/WASM deployment target. Future native/HPC or export backends can consume the same experiment semantics without changing the student authoring model.

## Randomness

Issue #55 does not refactor RNG ownership. Today initialization and runtime stochasticity use separate deterministic implementations/streams. The planned canonical RNG/domain-separated-stream refactor is tracked by issue #57 and is intentionally not a blocker for the authoring contract.

## Acceptance boundary

#55 proves that a normal AI client can retrieve the contract, author all three artifacts, receive authoritative compiler diagnostics, and save only source that the current production parser/compiler accepts.

#46 remains responsible for connecting the registry to the production browser and manually running the validated experiment. Scientific-fidelity questions are separate from this software-authoring contract.
