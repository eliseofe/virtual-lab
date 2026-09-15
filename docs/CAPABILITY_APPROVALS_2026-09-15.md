# Capability approvals — 15 September 2026

Status: **approved by Professor; developer design pending; implementation not yet authorized**

This checkpoint records the two capability requests approved for the aggregation-paper workflow so their intent is not lost while the neighbour-search investigation continues.

## Controller stochasticity / RNG

Capability request: `7492c39d-fdd0-4f29-9661-63dbc6461bf5`

- domain: controller
- capability: `stochasticity.rng`
- lifecycle hook: `control`
- status in registry: `approved`
- Professor note: the generic capability must support **different probability distributions**, rather than introducing a paper-specific one-off random primitive.

The design discussion must preserve the standing simulator rule that RNG is simulator-owned and deterministic/reproducible. Approval moves this request into developer design; it does not yet authorize implementation.

## Heterogeneous swarm initialization

Capability request: `49368c8e-dff7-4ce0-9072-bc3f4b37ada2`

- domain: initialization
- capability: `heterogeneous_agent_state`
- lifecycle hook: `initialize`
- status in registry: `approved`
- Professor note: this must be a **generic heterogeneous swarm initialization capability**, not merely an `informed` boolean or paper-specific role marker. The abstraction must be broad enough to cover heterogeneous information/private state and potentially heterogeneous sensors/capabilities.

The design discussion must therefore identify a generic per-agent initialization representation and information boundary before any implementation. Approval moves this request into developer design; it does not yet authorize implementation.

## Standing workflow boundary

`approved request → developer design discussion → explicit owner implementation approval → trusted developer handoff → implementation/deploy/verification`

No code is authorized solely by this record.
