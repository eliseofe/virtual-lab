# Capability request integrity regressions

Run from the repository root with Node and Docker available:

```sh
node supabase/tests/run-request-integrity.mjs
node --test web/tests/capability-closure-readback.test.mjs
```

The SQL runner creates and removes its own disposable `postgres:15-alpine`
container. It publishes no ports, disables container networking, and uses no
Supabase credentials. Docker may download the image if it is not cached.

It installs a minimal relational fixture, the actual predecessor closure
functions and structured-candidate migration, then applies the forward integrity
migration. Each SQL suite rolls its data back. The fixture tests the production
PL/pgSQL behavior and transaction rollback, not the complete Supabase migration
history or production RLS policies. The readback unit tests separately exercise
responses where RLS has omitted private request rows.

- `coverage.test.sql`: partial coverage rollback, multi-requirement links,
  unchanged historical links, new/changed requirement rejection and ambiguity-only drafts.
- `reuse.test.sql`: duplicate UUID rejection on submit/revalidate, atomicity,
  and a combined link preserving every requirement and its generalization note.
- `revisions.test.sql`: same-revision reuse, new-revision snapshot creation,
  explicit stale-draft rejection, and blocked-ID-only origin preservation.

Release requires applying
`20260921170000_capability_request_integrity.sql` and deploying
`experiment-mcp` server `3.13.1`. Pages CI does neither. These changes prevent
new invalid writes; they do not reconstruct evidence already lost by earlier
submissions or implement the requested simulator capabilities. The separate
initialization-provenance repair in PR #461 is not included here.
