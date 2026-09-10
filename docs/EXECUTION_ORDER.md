# Execution Order

GitHub issues are the executable roadmap. Work on them in dependency order unless a later issue explicitly becomes urgent.

## Immediate

1. **Round 1 / Priority 1** — build the first scientifically meaningful standalone lab and close the browser verification loop.
2. **Scientific validation suite** — cross-cutting; establish relevant tests during Round 1 and deepen them as the kernel evolves.

## Immediately after Round 1 acceptance

3. **Round 2 / Priority 2** — multiple runs, parameter sweeps, local parallelism, metrics, statistics, plots, replay.
4. **Local data and provenance** — mature storage/export controls before large sweeps produce significant data.

## AI loop

5. **Round 3A** — AI→Lab experiment creation using the GitHub adapter over stable ExperimentRepository semantics.
6. **Round 3B** — Lab→AI compact portable result export.

## Future scaling

7. Multi-user workspaces and independent AI clients.
8. Native workstation/HPC execution backends.
9. Dynamic physics, heterogeneous swarms, richer observation/action models.
10. Direct MCP/HTTP/filesystem AI adapters.

The architecture documents are authoritative when issue wording is abbreviated. The highest-priority implementation issue should itself remain self-contained enough for a zero-context implementation agent.