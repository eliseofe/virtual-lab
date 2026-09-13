# Performance profiling

This repository includes a reproducible software-performance harness for issue #56. It is measurement infrastructure, not a scientific experiment and not a correctness gate.

## What it measures

The native Rust profile (`crates/kernel/examples/perf_profile.rs`) uses deterministic synthetic layouts and a science-neutral controller IR fixture to measure:

- neighbour-index rebuild time;
- all-agent neighbour-query time and observed neighbour count;
- all-agent observation construction;
- all-agent controller-runtime execution;
- one kinematic physics sweep;
- snapshot/state cloning;
- end-to-end simulator throughput.

It profiles 100, 1,000 and 10,000 agents at fixed synthetic density, plus a radius sweep at 1,000 agents. These workloads exist only to reveal software scaling; they do not encode or evaluate a scientific model.

The browser profile (`web/scripts/performance-profile.mjs`) runs the real generated WASM kernel through the real worker transport in headless Chrome. It measures worker round-trip time for zero-tick snapshots and several advance batch sizes, then reproduces the current 50 ms request policy at several requested speed factors to measure achieved model-time/wall-time throughput and saturation behavior.

## Run locally

Native profile:

```bash
cargo run --release -p vlab-kernel --example perf_profile
```

Browser/WASM profile requires the normal WASM/static build and Chrome:

```bash
cd crates/kernel
wasm-pack build --release --target web --out-dir ../../web/public/wasm --out-name vlab_kernel
cd ../..
node web/scripts/build.mjs
python3 -m http.server 4173 --directory web/dist
node web/scripts/performance-profile.mjs http://127.0.0.1:4173/
```

## CI evidence

`.github/workflows/performance-profile.yml` runs independently from ordinary correctness CI and uploads the runner environment plus native and browser profile outputs as a retained artifact. No timing threshold can fail correctness CI; measurements are used to identify the next optimization target.
