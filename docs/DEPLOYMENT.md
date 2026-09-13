# Deployment and CI

The production site is deployed to GitHub Pages by `.github/workflows/round1a-pages.yml`.

## Automatic validation and deployment

- Pull requests targeting `main` run the full build/validation workflow.
- Pushes to `main` that change simulator, web, test, workflow, configuration, or other non-documentation files run the full build, Pages deployment, and deployed-browser smoke test.
- Pushes to `main` whose changes are entirely limited to repository-root Markdown files (`*.md`) and/or `docs/**` do not run the Pages workflow.
- `workflow_dispatch` remains available for an explicit manual run regardless of changed paths.

This exclusion is intentionally conservative. The production artifact builder reads `web/src` and `web/public`; repository-root Markdown and `docs/**` are documentation, not inputs to the deployed browser artifact.

If documentation later becomes a production build input, update or remove the path exclusion before relying on that documentation in the deployed application.
