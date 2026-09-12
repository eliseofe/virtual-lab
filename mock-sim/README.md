# mock-sim

`mock-sim` is a deliberately minimal browser client used by issue #44 to validate the Virtual Lab experiment-registry architecture before production simulator integration.

It contains no simulator, Rust/WASM kernel, controller compiler, renderer, worker, metric engine, or scientific execution.

## What it validates

- Supabase Auth identity and visible user name;
- OAuth login/consent surface for the experiment MCP client;
- per-user experiment namespaces enforced by #42 RLS;
- user → optional collection/project → experiment organization;
- create-from-zero experiments;
- exact configuration, initializer, and controller source round-trip;
- optimistic concurrency through experiment revisions;
- archive/restore/permanent-delete lifecycle;
- lightweight remote-update detection while the page is open.

## Backend

Supabase project: `virtual-lab` (`izdmmudfrmqhvlgepwes`).

The browser uses the project's public publishable key. User access is controlled by Supabase Auth and RLS; no service/secret key belongs in this client.

The AI-facing MCP endpoint is:

`https://izdmmudfrmqhvlgepwes.supabase.co/functions/v1/experiment-mcp`

## Static hosting requirement

This directory is intentionally build-free. A static host only needs to serve `index.html`, `app.js`, and `styles.css` over HTTPS with normal HTML/JavaScript content types.

Do not use Supabase Edge Functions or Supabase Storage as the HTML host: current Supabase platform behavior intentionally returns HTML from those products as plain text for security.

The mock-sim deployment must be independent of the production Virtual Lab runtime/deployment until #46.

Once a static HTTPS origin exists, configure the Supabase OAuth 2.1 server's authorization path to this page. Supabase appends `authorization_id` and mock-sim then uses the Supabase JS OAuth authorization APIs to display and approve/deny the request.

## Owner acceptance

The application is diagnostic rather than polished. Issue #44 remains open until the owner completes the real AI-client + two-user end-to-end acceptance workflow described in the issue.
