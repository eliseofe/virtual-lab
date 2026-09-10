# Execution Order

GitHub issues are the executable roadmap. Work in dependency order unless a later issue explicitly becomes urgent.

## Round 1 umbrella

- **#1 — ROUND 1 / PRIORITY 1** is the complete acceptance contract for the first tangible scientific laboratory.
- **#2 — Scientific validation/reproducibility suite** is cross-cutting and should be implemented incrementally while the Round 1 scientific kernel is built.

Execute the Round 1 implementation through these child issues:

1. **#11 — Round 1A: technical spike** — establish the Rust/WASM/Web Worker/static-build path and controller compilation architecture with executable evidence.
2. **#12 — Round 1B: scientific simulation kernel** — implement the generic deterministic scientific core, independent clocks, local-observation/action semantics, and correctness oracles.
3. **#13 — Round 1C: editable Python-like controller language** — implement source parsing/validation, versioned IR, and efficient compiled execution without Python in the control loop.
4. **#14 — Round 1D: Active Elastic Model** — reproduce the real 2013 scientific model through the generic kernel/controller architecture and document equations/assumptions.
5. **#15 — Round 1E: polished UI + GitHub Pages + browser loop** — integrate, deploy, exercise, repair, and satisfy every acceptance criterion in #1 and `docs/ROUND1_ACCEPTANCE.md`.

Close #1 only when #11–#15 and the relevant Round 1 subset of #2 satisfy the end-to-end acceptance contract.

## Immediately after Round 1 owner acceptance

6. **#3 — ROUND 2 / PRIORITY 2** — multiple runs, seeds, parameter sweeps, local parallelism, headless execution, independent metrics, aggregation/statistics, plots, and replay.
7. **#4 — Local data and provenance** — mature storage/export/data-volume controls alongside Round 2 before experiments produce large datasets.

## AI research loop

8. **#5 — Round 3A: AI → Lab** — experiment creation/versioning through the initial GitHub adapter over stable `ExperimentRepository` semantics.
9. **#6 — Round 3B: Lab → AI** — compact portable result/run export independent of AI vendor or server storage.

## Future scaling and science

10. **#7 — Multi-user workspaces** — independent human identities and independent AI accounts/providers.
11. **#8 — Native workstation/HPC backends** — same scientific semantics through native/Slurm execution adapters.
12. **#9 — Dynamic physics/heterogeneity** — richer physics, heterogeneous populations, observation/action models.
13. **#10 — Direct MCP/HTTP/filesystem adapters** — alternative AI transports over the same Lab domain API.

The repository documents define architectural/scientific invariants. Issue bodies define executable work and acceptance conditions. Neither depends on hidden conversation context.