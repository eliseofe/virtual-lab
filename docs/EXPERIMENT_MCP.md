# Virtual Lab Experiment MCP

Status: issue #43 server/transport implementation. The production simulator is not connected by this work.

## Purpose

`experiment-mcp` is the AI-facing adapter over the canonical experiment registry defined by #41 and deployed in #42. It exposes experiment-domain operations only. It is not a general Supabase development MCP server and it is not a simulator-development interface.

Deployed endpoint:

`https://izdmmudfrmqhvlgepwes.supabase.co/functions/v1/experiment-mcp`

Supabase project: `virtual-lab` (`izdmmudfrmqhvlgepwes`).

## Security model

The Edge Function uses only the project's publishable key plus the caller's Supabase Auth access token.

It deliberately does not use a service-role or secret key. The caller's bearer token is validated with Supabase Auth and then forwarded to the user-scoped Supabase client. PostgreSQL row-level security from #42 therefore remains authoritative for every experiment and collection operation.

The authenticated user ID is derived from the validated token. Callers cannot supply an arbitrary owner ID when creating an experiment or collection.

OAuth `client_id`, when present in a validated token, is recorded only as edit provenance. It is not trusted as user identity.

## MCP transport

The function uses Streamable HTTP through the official Model Context Protocol TypeScript SDK.

It exposes:

- `/health` for transport health only;
- `/.well-known/oauth-protected-resource` for protected-resource metadata;
- the function root for MCP Streamable HTTP requests.

An unauthenticated MCP request returns HTTP 401 with `WWW-Authenticate` pointing to the protected-resource metadata document.

The protected-resource metadata identifies Supabase Auth as the authorization server:

`https://izdmmudfrmqhvlgepwes.supabase.co/auth/v1`

## Exposed tools

The adapter exposes only these experiment-registry operations:

- `whoami`
- `list_collections`
- `create_collection`
- `rename_collection`
- `delete_collection`
- `list_experiments`
- `get_experiment`
- `create_experiment`
- `update_experiment`
- `move_experiment`
- `archive_experiment`
- `restore_experiment`
- `delete_experiment`

The three arbitrary student-editable source strings are preserved unchanged: configuration, initializer, and controller source.

All working-experiment mutation operations that can race with another editor use the base revision read by the client. A stale revision produces a conflict instead of silently overwriting a newer record.

## Explicit non-capabilities

There is no MCP tool for:

- running or controlling the simulator;
- observing simulator state, metrics, screenshots, plots, or results;
- reading or changing simulator implementation;
- accessing GitHub;
- executing shell commands;
- accessing arbitrary filesystem paths;
- changing deployments;
- executing arbitrary SQL;
- retrieving Supabase project/admin secrets;
- bypassing registry RLS.

These are absent from the interface rather than forbidden by prompt text.

## OAuth and the #44 boundary

Supabase Auth's OAuth 2.1 server is the intended authentication mechanism for real AI clients. On 2026-09-12 the project OAuth server was still disabled; its discovery endpoint correctly returned `feature_disabled`.

Enabling the OAuth server is an account-level Supabase Dashboard setting and is not exposed by the connected Supabase management tool used for this implementation.

Supabase OAuth also requires a normal browser authorization/login/consent page. Supabase Edge Functions cannot host that page because hosted Edge Functions intentionally rewrite HTML responses to `text/plain` and apply a sandbox CSP. This was verified against the deployed project and agrees with current Supabase Routing documentation.

Therefore the browser authorization surface belongs to the normal static `mock-sim` frontend in #44. This is not simulator integration: mock-sim is explicitly a transport/identity diagnostic client with no scientific execution.

The first step of #44 is consequently:

1. deploy the static mock-sim authorization/login surface;
2. enable Supabase OAuth 2.1 and set its authorization path to that surface;
3. connect a real MCP-capable AI client;
4. complete the OAuth flow and invoke `whoami` plus experiment tools under a non-admin user token;
5. then continue the two-user bidirectional mock-sim acceptance matrix.

This ordering avoids a throwaway authorization frontend and keeps the real production Virtual Lab untouched until #46.

## Deployment verification completed

Using a temporary database-side HTTP probe only, then removing the probing extension:

- `GET /health` returned 200 with `simulator_access: false`;
- protected-resource metadata returned 200 and the expected authorization server;
- an unauthenticated MCP initialize request returned 401;
- the 401 contained a `WWW-Authenticate` protected-resource discovery pointer;
- the Supabase OAuth discovery endpoint returned `feature_disabled`, confirming the remaining account setting precisely.

The registry's user isolation, create/update/archive/delete semantics, stale-revision rejection, and preserved-snapshot behavior were already independently validated in #42.

## Provider independence

No ChatGPT-specific operation exists in this server. Any MCP client that implements the current Streamable HTTP and OAuth flow can use the same endpoint. ChatGPT/NYU is the preferred first educational client, not part of the domain contract.
