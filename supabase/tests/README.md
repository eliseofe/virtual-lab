# Database regression checks

`initialization-capability-provenance.sql` tests the targeted #304 publication
repair against PostgreSQL. Run it only in an **empty disposable database**: it
creates minimal relational fixtures and rolls them back after the assertions.

```sh
psql "$TEST_DATABASE_URL" -f supabase/tests/initialization-capability-provenance.sql
```

The two printed exceptions for missing and conflicting source data are expected;
the script must exit with status 0 and print `PASS`.

## Deploying the workspace-discovery repair

Apply `supabase/migrations/20260921160000_restore_initialization_capability_provenance.sql`
through the trusted Supabase database migration process. Pages CI does not apply
database migrations. The migration recovers the actual publication identifier
and title from request `2616dbb5-2134-417f-aebb-2e9e4ea0dd9c`, the scientific source
recorded in #304; it does not fabricate a bibliography or change any Experiment.
It fails explicitly if the capability needs repair but that source is unavailable
or bound to another capability.

After application, verify the canonical registry returns nonempty
`publication_provenance` for `initialization.per_agent_private_state_assignment`,
then call the authenticated MCP `read_workspace` tool with
`{"include_workspace_index": true}`. Confirm it returns the user's visible
Experiments without the consistency error. Production recovery is not verified
until those checks pass.
