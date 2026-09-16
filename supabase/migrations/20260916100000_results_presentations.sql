-- #200 — Results presentation is persisted separately from the scientific Experiment revision.
-- Plot-panel bindings are workspace/presentation state: editing them must not bump
-- public.experiments.revision.

create table if not exists public.experiment_results_presentations (
  experiment_id uuid primary key references public.experiments(id) on delete cascade,
  schema_version text not null default 'vlab.results-presentation/1'
    check (schema_version = 'vlab.results-presentation/1'),
  revision bigint not null default 1 check (revision >= 1),
  panels jsonb not null default '[]'::jsonb
    check (jsonb_typeof(panels) = 'array'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by_actor text not null default 'human'
    check (created_by_actor in ('human', 'ai')),
  created_by_ai_client text,
  updated_by_actor text not null default 'human'
    check (updated_by_actor in ('human', 'ai')),
  updated_by_ai_client text
);

create or replace function private.bump_results_presentation_revision()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if row(new.*) is distinct from row(old.*) then
    new.revision := old.revision + 1;
    new.updated_at := now();
  end if;
  return new;
end;
$$;

revoke execute on function private.bump_results_presentation_revision()
from public, anon, authenticated;

drop trigger if exists bump_results_presentation_revision on public.experiment_results_presentations;
create trigger bump_results_presentation_revision
before update on public.experiment_results_presentations
for each row execute function private.bump_results_presentation_revision();

alter table public.experiment_results_presentations enable row level security;
revoke all on table public.experiment_results_presentations from anon, authenticated;
grant select, insert, update, delete on table public.experiment_results_presentations to authenticated;

create policy "results_presentations_select_visible"
on public.experiment_results_presentations for select
to authenticated
using (
  exists (
    select 1 from public.experiments e
    where e.id = experiment_id
      and ((select auth.uid()) = e.owner_id or e.visibility = 'public')
  )
);

create policy "results_presentations_insert_own"
on public.experiment_results_presentations for insert
to authenticated
with check (
  exists (
    select 1 from public.experiments e
    where e.id = experiment_id
      and (select auth.uid()) = e.owner_id
  )
);

create policy "results_presentations_update_own"
on public.experiment_results_presentations for update
to authenticated
using (
  exists (
    select 1 from public.experiments e
    where e.id = experiment_id
      and (select auth.uid()) = e.owner_id
  )
)
with check (
  exists (
    select 1 from public.experiments e
    where e.id = experiment_id
      and (select auth.uid()) = e.owner_id
  )
);

create policy "results_presentations_delete_own"
on public.experiment_results_presentations for delete
to authenticated
using (
  exists (
    select 1 from public.experiments e
    where e.id = experiment_id
      and (select auth.uid()) = e.owner_id
  )
);

comment on table public.experiment_results_presentations is
  'Non-scientific Results presentation state. Time-series panels bind stable metric IDs without changing Experiment revision.';
