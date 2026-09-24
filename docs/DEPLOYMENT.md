# Deployment and CI

The production site is deployed to GitHub Pages by `.github/workflows/ci-pages.yml`.

## Automatic validation and deployment

- Pull requests targeting `main` run the full build/validation workflow when they change non-documentation inputs, including the pre-publish browser smoke.
- Pushes to `main` that change simulator, web, test, configuration, workflow or other non-documentation files run the full build, the pre-publish browser smoke, Pages deployment, exact-candidate propagation check, and deployed-browser smoke suite.
- Pushes to `main` whose changes are entirely limited to Markdown files (`*.md`, `**/*.md`) and/or `docs/**` do not run the Pages workflow. Workflow-file changes are validated and deployed like any other change, so they need an updated `.github/terminal-report.json`.
- A running release on `main` is never cancelled; a newer push waits for it. Pull-request runs cancel superseded runs.

## Pre-publish browser smoke

After the static artifact is built and verified, `web/scripts/pre-publish-smoke.mjs` serves the exact `web/dist` package on `127.0.0.1` under `/virtual-lab/` (`web/scripts/serve-dist.mjs`) and runs every active smoke check from `web/product-surface.json` against it with the shared browser harness. A failure stops the run before anything is published. The same checks then run again against the live site after deployment; that post-deploy result remains the completion evidence.

## Following an exact candidate

`node web/scripts/wait-for-run.mjs <sha>` follows the push run for one commit (`--pull-request` for a pull-request check) and exits with one outcome: green, red (with the failing job/step), superseded, not-a-candidate (documentation-only), no-run, or timeout. It uses `GITHUB_TOKEN`/`GH_TOKEN` when available. In environments whose outbound traffic goes through a proxy, Node's built-in fetch needs `NODE_USE_ENV_PROXY=1`. Outcome meanings are defined in `DEVELOPMENT_WORKFLOW.md`.
- `workflow_dispatch` remains available for an explicit manual run regardless of changed paths.

The production artifact builder reads `web/src` and `web/public`; repository-root Markdown and `docs/**` are documentation, not inputs to the deployed browser artifact.

If documentation later becomes a production build input, update or remove the path exclusion before relying on that documentation in the deployed application.

Development execution procedure is defined in `DEVELOPMENT_WORKFLOW.md`; this document describes the deployed CI/Pages mechanism only.
