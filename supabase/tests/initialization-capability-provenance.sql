-- Run with psql in an EMPTY disposable database. All fixtures are rolled back.
\set ON_ERROR_STOP on
begin;

-- Minimal relational fixture for the columns used by this data-only migration.
create table public.canonical_capabilities (id uuid primary key, capability_key text unique not null);
create table public.capability_requests (
  id uuid primary key,
  canonical_capability_id uuid references public.canonical_capabilities(id),
  publication_identifier text,
  publication_title text
);
create table public.capability_publication_provenance (
  capability_id uuid references public.canonical_capabilities(id),
  publication_identifier text not null,
  publication_title text not null,
  primary key (capability_id, publication_identifier)
);

-- Fresh databases without the dynamically created capability remain valid.
\ir ../migrations/20260921160000_restore_initialization_capability_provenance.sql

insert into public.canonical_capabilities values
  ('25ee37e5-ba59-4e8a-9768-a5604e2501b5', 'initialization.per_agent_private_state_assignment'),
  ('11111111-1111-4111-8111-111111111111', 'unrelated.capability');

-- Never silently accept a repair without the actual source publication.
savepoint missing_source;
\set ON_ERROR_STOP off
\ir ../migrations/20260921160000_restore_initialization_capability_provenance.sql
\if :ERROR
  rollback to missing_source;
\else
  \echo 'FAIL: missing source must reject the migration'
  \quit 1
\endif
\set ON_ERROR_STOP on

insert into public.capability_requests values (
  '2616dbb5-2134-417f-aebb-2e9e4ea0dd9c', null,
  'doi:test-source', 'Original scientific source (test fixture)'
);

-- A conflicting explicit link must not attach the wrong bibliography.
update public.capability_requests
set canonical_capability_id = '11111111-1111-4111-8111-111111111111';
savepoint conflicting_source;
\set ON_ERROR_STOP off
\ir ../migrations/20260921160000_restore_initialization_capability_provenance.sql
\if :ERROR
  rollback to conflicting_source;
\else
  \echo 'FAIL: conflicting source must reject the migration'
  \quit 1
\endif
\set ON_ERROR_STOP on
update public.capability_requests set canonical_capability_id = null;

-- Restore the missing link and prove a rerun is harmless.
\ir ../migrations/20260921160000_restore_initialization_capability_provenance.sql
\ir ../migrations/20260921160000_restore_initialization_capability_provenance.sql
do $$
begin
  if (select count(*) from public.capability_publication_provenance) <> 1
     or not exists (
       select 1 from public.capability_publication_provenance
       where capability_id = '25ee37e5-ba59-4e8a-9768-a5604e2501b5'
         and publication_identifier = 'doi:test-source'
         and publication_title = 'Original scientific source (test fixture)'
     ) then
    raise exception 'Repair must copy the exact source once and leave unrelated capabilities untouched.';
  end if;
end;
$$;

-- Existing provenance takes precedence even if the request changes later.
update public.capability_requests set publication_title = 'Changed request title';
\ir ../migrations/20260921160000_restore_initialization_capability_provenance.sql
do $$
begin
  if (select publication_title from public.capability_publication_provenance)
     <> 'Original scientific source (test fixture)' then
    raise exception 'Existing publication provenance must not be overwritten.';
  end if;
end;
$$;

rollback;
\echo 'PASS: initialization capability provenance migration'
