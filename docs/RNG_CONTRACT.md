# Scientific RNG contract

Status: **current simulator randomness contract**.

Version: `vlab.rng/splitmix64-domain/1`.

## Purpose

Virtual Lab owns all scientific randomness. Experiment code never receives host-language or browser/global random APIs.

A run has one unsigned 32-bit root seed. Scientific consumers receive deterministic, domain-separated streams derived from that root seed. A draw in one domain cannot change the sequence observed by another domain.

Current domains:

- `initialization` — Initialization artifact `rng.uniform(...)`;
- `sensing` — simulator-owned sensing noise;
- `controller` — per-agent Controller stochasticity through the implemented `vlab.controller-stochasticity/1` distribution surface.

Additional domains may be added only by versioned simulator code. Rendering, UI behavior, transport, metrics presentation, and other non-scientific activity must not consume scientific RNG streams.

## Generator

Each stream uses SplitMix64 with unsigned 64-bit wrapping arithmetic:

1. increment state by `0x9E3779B97F4A7C15`;
2. apply the SplitMix64 finalizer;
3. for a unit variate, use the high 53 bits divided by `2^53`.

This is a portability contract, not an implementation suggestion. Browser/JavaScript, Rust/WASM, and future native/HPC runtimes must match the fixed conformance vectors exactly.

## Stream derivation

Domain labels are non-empty printable ASCII strings.

For contract v1:

- `initialization`, stream index 0, deliberately uses the root seed directly. This preserves all previously seeded Virtual Lab initial conditions bit-for-bit.
- every other domain/index derives its 64-bit starting state from the root seed, the FNV-1a-64 hash of the domain label, and the stream index multiplied by the SplitMix64 gamma, followed by the SplitMix64 finalizer.

This means the sensing stream changes at the v1 cutover because the previous implementation reused the root SplitMix64 stream independently for both initialization and sensing. The new sensing sequence is intentionally distinct. Initialization is unchanged.

The `controller` domain allocates one stream per agent. Stream index equals the stable zero-based agent index for the run. This keeps agents independent: changing the number of controller draws made by one agent cannot change any other agent's sequence.

## Conformance vectors

For root seed `2026`:

| Stream | Derived state | First three `next_u64` values |
| --- | --- | --- |
| initialization / 0 | `0x00000000000007EA` | `DB9C559891948D23`, `78BC927DED35455D`, `AAD71E75CDE2B88E` |
| sensing / 0 | `0x47FDC51ABF391476` | `ACB00A4D94376943`, `D1950AA56F146E6C`, `A1739EB99746500B` |
| controller / 0 | `0x9D24ED0D15C2C6F3` | per-agent controller stream 0 |
| controller / 1 | `0x90AA42631D02B494` | per-agent controller stream 1 |

The browser and Rust test suites enforce these values.

## Reset and replay

Resetting or reconstructing a run rebuilds every scientific stream from the same root seed/domain/index. Therefore the same Experiment, root seed, simulator/RNG contract version, and execution schedule reproduce the same stochastic sequences.

Changing the number of draws in one domain may change later draws in that same domain, but never any other domain.

## Ownership boundary

The root run seed is Experiment/runtime state. Stream states are simulator-owned internal state. Researchers may select the run seed and use only explicitly implemented stochastic authoring primitives; they cannot access, mutate, reseed, advance, or share raw streams directly.
