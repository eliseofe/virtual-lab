# Context-Free Handoff for Work

You are implementing the standalone **Virtual Lab** project: a zero-cost, browser-first scientific laboratory for reproducible experiments on self-organized multi-agent systems.

Assume you know nothing about the project owner, prior conversations, or any other repository. This repository is the complete source of context and requirements.

## Read first

Read in this order:

1. `README.md`
2. `PROJECT_STATE.md`
3. `docs/SCIENTIFIC_CONTRACT.md`
4. `docs/ARCHITECTURE.md`
5. `docs/CONTROLLER_LANGUAGE.md`
6. `docs/ZERO_COST.md`
7. `docs/DATA_AND_PROVENANCE.md`
8. `docs/AI_LAB_PROTOCOL.md`
9. `docs/ROADMAP.md`
10. the current highest-priority open GitHub issue

Treat repository documentation and issue acceptance criteria as the project contract.

## Project separation

All Virtual Lab implementation artifacts belong in `eliseofe/virtual-lab`. The existing academic website is a separate system. Use `https://eliseoferrante.com` only as an optional visual-language reference for typography, spacing, restraint, and polished responsive presentation. Virtual Lab has its own codebase, build, CI, GitHub Pages deployment, runtime, data model, and future domain.

## Current execution model

The implementation agent is responsible for closing its own development loop rather than presenting an unobserved first build.

For every user-visible implementation milestone, use the available browser/computer environment as part of engineering:

1. implement;
2. build and run automated tests;
3. deploy the current application;
4. open the deployed application in a browser;
5. inspect the actual rendered UI;
6. exercise the required interactions;
7. inspect console/network/runtime behavior;
8. compare behavior with scientific/acceptance requirements;
9. repair defects;
10. repeat until acceptance criteria are met.

Compilation or CI success alone is not completion.

## Scientific review boundary

Use the cited papers and `docs/SCIENTIFIC_CONTRACT.md` as the implementation oracle for equations, invariants, information boundaries, data flow, stochastic ownership, and reproducibility. Human owner review should focus on scientific fidelity and design judgment rather than elementary software breakage.

## Zero-cost requirement

Required operation uses static hosting, user-local compute, and local-first storage. Any proposed dependency with plausible monetary charge, required paid plan, metered API, storage charge, compute charge, or quota likely to force an upgrade must be surfaced before adoption together with the zero-cost baseline alternative.

## Round 1 emphasis

The first visible experiment is the Active Elastic Model from the cited 2013 PRL/NJP work. The implementation must expose the real editable scientific controller, not a hard-coded flocking visualization.

The controller is author-facing Python-like source compiled before execution. The runtime must not depend on a Python interpreter call for each agent/control update.

Physics/integration, control evaluation, visualization, and metrics are separate subsystems/clocks. Randomness belongs to the simulator. Agent private state belongs to the agent/controller. Action application belongs to the simulator.

## Completion reports

For a completed implementation issue, report:

- deployed URL where applicable;
- exact issue/commit/PR completed;
- architecture actually used;
- scientific assumptions/equations/parameters implemented;
- tests and browser verification performed;
- observed behavior from the deployed application;
- known limitations relevant to the next issue;
- any cost/quota implication discovered.

## Escalation rule

When a requirement is scientifically ambiguous, preserve the stable contracts, document the ambiguity, and isolate the decision so it can be reviewed without throwing away unrelated implementation work.