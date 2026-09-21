-- #467 regression fixture.
-- Run only in an empty disposable PostgreSQL database. All fixture changes roll back.
\set ON_ERROR_STOP on
begin;

create table public.canonical_capabilities (
  id uuid primary key,
  capability_key text unique not null
);

create table public.capability_requests (
  id uuid primary key,
  canonical_capability_id uuid references public.canonical_capabilities(id),
  publication_identifier text,
  publication_title text,
  status text not null
);

create table public.capability_publication_provenance (
  capability_id uuid references public.canonical_capabilities(id),
  publication_identifier text not null,
  publication_title text not null,
  primary key (capability_id, publication_identifier)
);

-- A deployment without the dynamically implemented capability remains valid.
\ir ../migrations/20260921160000_restore_initialization_capability_provenance.sql

insert into public.canonical_capabilities values
  ('25ee37e5-ba59-4e8a-9768-a5604e2501b5', 'initialization.per_agent_private_state_assignment'),
  ('11111111-1111-4111-8111-111111111111', 'unrelated.capability');

-- Missing implemented source must fail.
savepoint missing_source;
\set ON_ERROR_STOP off
\ir ../migrations/20260921160000_restore_initialization_capability_provenance.sql
\if :ERROR
  rollback to missing_source;
\else
  \echo 'FAIL: missing implemented source must reject the repair'
  \quit 1
\endif
\set ON_ERROR_STOP on

insert into public.capability_requests values (
  '2616dbb5-2134-417f-aebb-2e9e4ea0dd9c',
  '25ee37e5-ba59-4e8a-9768-a5604e2501b5',
  'doi:test-source',
  'Original scientific source (test fixture)',
  'requested'
);

-- A non-implemented request cannot establish implementation provenance.
savepoint not_implemented;
\set ON_ERROR_STOP off
\ir ../migrations/20260921160000_restore_initialization_capability_provenance.sql
\if :ERROR
  rollback to not_implemented;
\else
  \echo 'FAIL: non-implemented source request must reject the repair'
  \quit 1
\endif
\set ON_ERROR_STOP on

-- Ambiguous source history must fail instead of guessing.
update public.capability_requests set status = 'implemented';
insert into public.capability_requests values (
  '22222222-2222-4222-8222-222222222222',
  '25ee37e5-ba59-4e8a-9768-a5604e2501b5',
  'doi:second-source',
  'Second implemented source (test fixture)',
  'implemented'
);
savepoint ambiguous_source;
\set ON_ERROR_STOP off
\ir ../migrations/20260921160000_restore_initialization_capability_provenance.sql
\if :ERROR
  rollback to ambiguous_source;
\else
  \echo 'FAIL: multiple implemented sources must reject the repair'
  \quit 1
\endif
\set ON_ERROR_STOP on
delete from public.capability_requests
where id = '22222222-2222-4222-8222-222222222222';

-- One uniquely bound implemented source restores one bibliography row and is idempotent.
\ir ../migrations/20260921160000_restore_initialization_capability_provenance.sql
\ir ../migrations/20260921160000_restore_initialization_capability_provenance.sql

do $$
begin
  if (select count(*) from public.capability_publication_provenance) <> 1
     or not exists (
       select 1
       from public.capability_publication_provenance
       where capability_id = '25ee37e5-ba59-4e8a-9768-a5604e2501b5'
         and publication_identifier = 'doi:test-source'
         and publication_title = 'Original scientific source (test fixture)'
     ) then
    raise exception 'Repair must copy the unique implemented-source bibliography exactly once.';
  end if;
end;
$$;

-- Existing provenance is authoritative and is never overwritten on a later rerun.
update public.capability_requests
set publication_title = 'Changed source title after implementation';
\ir ../migrations/20260921160000_restore_initialization_capability_provenance.sql

do $$
begin
  if (select publication_title from public.capability_publication_provenance)
     <> 'Original scientific source (test fixture)' then
    raise exception 'Existing publication provenance must remain unchanged.';
  end if;
end;
$$;

rollback;
\echo 'PASS: #467 initialization capability provenance repair'
