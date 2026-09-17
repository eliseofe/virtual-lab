# Deployment and CI

The production site is deployed to GitHub Pages by `.github/workflows/ci-pages.yml`.

## Automatic validation and deployment

- Pull requests targeting `main` run the full build/validation workflow when they change non-documentation inputs.
- Pushes to `main` that change simulator, web, test, configuration, or other non-documentation files run the full build, Pages deployment, exact-candidate propagation check, and deployed-browser smoke suite.
- Pushes to `main` whose changes are entirely limited to repository-root Markdown files (`*.md`) and/or `docs/**` do not run the Pages workflow.
- `workflow_dispatch` remains available for an explicit manual run regardless of changed paths.

The production artifact builder reads `web/src` and `web/public`; repository-root Markdown and `docs/**` are documentation, not inputs to the deployed browser artifact.

If documentation later becomes a production build input, update or remove the path exclusion before relying on that documentation in the deployed application.

Development execution procedure is defined in `DEVELOPMENT_WORKFLOW.md`; this document describes the deployed CI/Pages mechanism only.
