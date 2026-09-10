# Execution Order

GitHub issues are the executable roadmap. The active execution roles are:

- **ChatGPT** — primary implementation, scientific/software tests, repository writes, CI/build/deployment configuration, defect repair, and redeployment.
- **Work** — narrow cloud-browser verification only, through issues explicitly titled `[WORK]`.

GitHub's native assignee field is not used for these product agents; the issue title/body carries the execution owner.

## Round 1 umbrella

- **#1 — [CHATGPT] ROUND 1 / PRIORITY 1** is the complete acceptance contract for the first tangible scientific laboratory.
- **#2 — [CHATGPT] Scientific validation/reproducibility suite** is cross-cutting and should be implemented incrementally while the Round 1 scientific kernel is built.

### ChatGPT implementation sequence

1. **#11 — [CHATGPT] Round 1A: technical spike** — establish the Rust/WASM/Web Worker/static-build path and controller compilation architecture with executable evidence.
2. **#12 — [CHATGPT] Round 1B: scientific simulation kernel** — implement the generic deterministic scientific core, independent clocks, local-observation/action semantics, and correctness oracles.
3. **#13 — [CHATGPT] Round 1C: editable Python-like controller language** — implement source parsing/validation, versioned IR, and efficient compiled execution without Python in the control loop.
4. **#14 — [CHATGPT] Round 1D: Active Elastic Model** — reproduce the real 2013 scientific model through the generic kernel/controller architecture and document equations/assumptions.
5. **#15 — [CHATGPT] Round 1E: polished UI + GitHub Pages** — integrate, build, test, and deploy the complete Round 1 application.

### Work verification sequence

After #15 has a deployed URL, execute these microscopic browser checks one at a time:

6. **#16 — [WORK] Round 1E-V1** — verify deployed desktop simulation controls.
7. **#17 — [WORK] Round 1E-V2** — verify meaningful controller edit, compile error, restoration, and recovery.
8. **#18 — [WORK] Round 1E-V3** — verify responsive UI, reload/hard-refresh stability, console/runtime errors, and relevant failed network requests.

If #16, #17, or #18 fails, ChatGPT repairs/redeploys and the same Work issue is rerun. Close #1 only when #11–#18 and the relevant Round 1 subset of #2 satisfy the end-to-end acceptance contract.

## Immediately after Round 1 owner acceptance

9. **#3 — ROUND 2 / PRIORITY 2** — multiple runs, seeds, parameter sweeps, local parallelism, headless execution, independent metrics, aggregation/statistics, plots, and replay.
10. **#4 — Local data and provenance** — mature storage/export/data-volume controls alongside Round 2 before experiments produce large datasets.

## AI research loop

11. **#5 — Round 3A: AI → Lab** — experiment creation/versioning through the initial GitHub adapter over stable `ExperimentRepository` semantics.
12. **#6 — Round 3B: Lab → AI** — compact portable result/run export independent of AI vendor or server storage.

## Future scaling and science

13. **#7 — Multi-user workspaces** — independent human identities and independent AI accounts/providers.
14. **#8 — Native workstation/HPC backends** — same scientific semantics through native/Slurm execution adapters.
15. **#9 — Dynamic physics/heterogeneity** — richer physics, heterogeneous populations, observation/action models.
16. **#10 — Direct MCP/HTTP/filesystem adapters** — alternative AI transports over the same Lab domain API.

Ownership of later-round issues can be assigned when those rounds become active. The repository documents define architectural/scientific invariants; issue bodies define executable work and acceptance conditions.