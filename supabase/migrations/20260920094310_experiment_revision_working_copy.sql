-- #397 — Immutable Experiment revisions and one owner Working copy.
--
-- Numbered revisions are retained immutable snapshots. Human editing is persisted
-- separately in one unnumbered Working copy until explicit crystallization.

create table public.experiment_revisions (
  experiment_id uuid not null references public.experiments(id) on delete cascade,
  revision bigint not null check (revision >= 1),
  base_revision bigint check (base_revision is null or (base_revision >= 1 and base_revision < revision)),
  owner_id uuid not null references auth.users(id) on delete cascade,
  schema_version text not null,
  interface_version text not null,
  title text not null,
  description text not null default '',
  artifacts jsonb not null check (jsonb_typeof(artifacts) = 'array'),
  config_source text not null,
  initializer_source text not null,
  controller_source text not null,
  created_at timestamptz not null,
  created_by_actor text not null check (created_by_actor in ('human','ai')),
  created_by_user uuid references auth.users(id) on delete set null,
  created_by_ai_client text,
  primary key (experiment_id, revision)
);

create index experiment_revisions_owner_idx
  on public.experiment_revisions(owner_id, experiment_id, revision desc);

create table public.experiment_working_copies (
  experiment_id uuid primary key references public.experiments(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  base_revision bigint not null check (base_revision >= 1),
  schema_version text not null default 'vlab.registry-experiment/3',
  interface_version text not null default 'vlab.experiment-artifacts/3',
  title text not null check (length(btrim(title)) > 0),
  description text not null default '',
  artifacts jsonb not null check (jsonb_typeof(artifacts) = 'array'),
  config_source text not null default '',
  initializer_source text not null default '',
  controller_source text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (experiment_id, base_revision)
    references public.experiment_revisions(experiment_id, revision)
    on delete restrict
);

create index experiment_working_copies_owner_idx
  on public.experiment_working_copies(owner_id);

-- Historical contents overwritten before #397 cannot be reconstructed. Preserve
-- exactly the current stored state as the first retained snapshot for each Experiment.
insert into public.experiment_revisions(
  experiment_id, revision, base_revision, owner_id,
  schema_version, interface_version, title, description, artifacts,
  config_source, initializer_source, controller_source,
  created_at, created_by_actor, created_by_user, created_by_ai_client
)
select
  e.id, e.revision, null, e.owner_id,
  e.schema_version, e.interface_version, e.title, e.description, e.artifacts,
  e.config_source, e.initializer_source, e.controller_source,
  e.updated_at, e.updated_by_actor,
  case when e.updated_by_actor = 'human' then e.owner_id else null end,
  e.updated_by_ai_client
from public.experiments e;

-- Only scientific/content changes create numbered revisions. Organization-only
-- metadata changes retain the current numbered revision and its provenance.
create or replace function private.bump_experiment_revision()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  revision_content_changed boolean;
  force_revision boolean := coalesce(current_setting('vlab.force_revision', true), '') = 'true';
begin
  revision_content_changed :=
    new.title is distinct from old.title
    or new.description is distinct from old.description
    or new.artifacts is distinct from old.artifacts;

  if revision_content_changed or force_revision then
    new.revision := old.revision + 1;
    new.updated_at := now();
  else
    new.revision := old.revision;
    new.updated_at := old.updated_at;
    new.updated_by_actor := old.updated_by_actor;
    new.updated_by_ai_client := old.updated_by_ai_client;
  end if;
  return new;
end;
$$;

revoke execute on function private.bump_experiment_revision()
from public, anon, authenticated;

create or replace function private.record_experiment_revision()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  base_text text;
  base_revision_value bigint;
begin
  if tg_op = 'INSERT' then
    if new.revision <> 1 then
      raise exception 'new experiments must start at revision 1' using errcode = '23514';
    end if;

    insert into public.experiment_revisions(
      experiment_id, revision, base_revision, owner_id,
      schema_version, interface_version, title, description, artifacts,
      config_source, initializer_source, controller_source,
      created_at, created_by_actor, created_by_user, created_by_ai_client
    )
    values (
      new.id, new.revision, null, new.owner_id,
      new.schema_version, new.interface_version, new.title, new.description, new.artifacts,
      new.config_source, new.initializer_source, new.controller_source,
      new.created_at, new.created_by_actor,
      case when new.created_by_actor = 'human' then new.owner_id else null end,
      new.created_by_ai_client
    );
    return new;
  end if;

  if new.revision = old.revision then
    return new;
  end if;

  base_text := nullif(current_setting('vlab.revision_base', true), '');
  if base_text is not null and base_text ~ '^[0-9]+$' then
    base_revision_value := base_text::bigint;
  else
    base_revision_value := old.revision;
  end if;

  if base_revision_value >= new.revision or not exists (
    select 1
    from public.experiment_revisions r
    where r.experiment_id = new.id
      and r.revision = base_revision_value
  ) then
    raise exception 'revision base % is not a retained revision for experiment %',
      base_revision_value, new.id using errcode = '23514';
  end if;

  insert into public.experiment_revisions(
    experiment_id, revision, base_revision, owner_id,
    schema_version, interface_version, title, description, artifacts,
    config_source, initializer_source, controller_source,
    created_at, created_by_actor, created_by_user, created_by_ai_client
  )
  values (
    new.id, new.revision, base_revision_value, new.owner_id,
    new.schema_version, new.interface_version, new.title, new.description, new.artifacts,
    new.config_source, new.initializer_source, new.controller_source,
    new.updated_at, new.updated_by_actor,
    case when new.updated_by_actor = 'human' then new.owner_id else null end,
    new.updated_by_ai_client
  );

  return new;
end;
$$;

revoke execute on function private.record_experiment_revision()
from public, anon, authenticated;

drop trigger if exists record_experiment_revision on public.experiments;
create trigger record_experiment_revision
after insert or update on public.experiments
for each row execute function private.record_experiment_revision();

create or replace function private.touch_experiment_working_copy()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then
    new.updated_at := now();
  end if;
  return new;
end;
$$;

revoke execute on function private.touch_experiment_working_copy()
from public, anon, authenticated;

create trigger artifact_sync_experiment_working_copy
before insert or update of artifacts, config_source, initializer_source, controller_source
on public.experiment_working_copies
for each row execute function private.sync_experiment_artifacts();

create trigger touch_experiment_working_copy
before update on public.experiment_working_copies
for each row execute function private.touch_experiment_working_copy();

alter table public.experiment_revisions enable row level security;
alter table public.experiment_working_copies enable row level security;

revoke all on table public.experiment_revisions from anon, authenticated;
revoke all on table public.experiment_working_copies from anon, authenticated;

grant select on table public.experiment_revisions to authenticated;
grant select, insert, update, delete on table public.experiment_working_copies to authenticated;

-- Revision visibility follows the existing Experiment RLS boundary, including
-- owner, explicit read-only shares, public visibility, and Professor supervision.
create policy "experiment_revisions_select_visible"
on public.experiment_revisions for select
to authenticated
using (
  exists (
    select 1
    from public.experiments e
    where e.id = experiment_revisions.experiment_id
  )
);

create policy "experiment_working_copies_select_own"
on public.experiment_working_copies for select
to authenticated
using (
  owner_id = (select auth.uid())
  and exists (
    select 1
    from public.experiments e
    where e.id = experiment_working_copies.experiment_id
      and e.owner_id = (select auth.uid())
  )
);

create policy "experiment_working_copies_insert_own"
on public.experiment_working_copies for insert
to authenticated
with check (
  owner_id = (select auth.uid())
  and exists (
    select 1
    from public.experiments e
    where e.id = experiment_working_copies.experiment_id
      and e.owner_id = (select auth.uid())
  )
);

create policy "experiment_working_copies_update_own"
on public.experiment_working_copies for update
to authenticated
using (
  owner_id = (select auth.uid())
  and exists (
    select 1
    from public.experiments e
    where e.id = experiment_working_copies.experiment_id
      and e.owner_id = (select auth.uid())
  )
)
with check (
  owner_id = (select auth.uid())
  and exists (
    select 1
    from public.experiments e
    where e.id = experiment_working_copies.experiment_id
      and e.owner_id = (select auth.uid())
  )
);

create policy "experiment_working_copies_delete_own"
on public.experiment_working_copies for delete
to authenticated
using (
  owner_id = (select auth.uid())
  and exists (
    select 1
    from public.experiments e
    where e.id = experiment_working_copies.experiment_id
      and e.owner_id = (select auth.uid())
  )
);

-- Explicit human Save Revision. The Working copy may be based on an older
-- retained revision even if one or more newer AI revisions have since arrived.
create or replace function public.crystallize_experiment_working_copy(p_experiment_id uuid)
returns setof public.experiments
language plpgsql
security invoker
set search_path = ''
as $$
declare
  working public.experiment_working_copies%rowtype;
  result_row public.experiments%rowtype;
begin
  select *
  into working
  from public.experiment_working_copies
  where experiment_id = p_experiment_id
    and owner_id = (select auth.uid());

  if not found then
    raise exception 'no Working copy exists for this owned experiment' using errcode = 'P0002';
  end if;

  perform set_config('vlab.revision_base', working.base_revision::text, true);
  perform set_config('vlab.force_revision', 'true', true);

  update public.experiments e
  set
    title = working.title,
    description = working.description,
    artifacts = working.artifacts,
    updated_by_actor = 'human',
    updated_by_ai_client = null
  where e.id = p_experiment_id
    and e.owner_id = (select auth.uid())
  returning e.* into result_row;

  perform set_config('vlab.revision_base', '', true);
  perform set_config('vlab.force_revision', '', true);

  if not found then
    raise exception 'experiment is missing or not owned by this user' using errcode = 'P0002';
  end if;

  delete from public.experiment_working_copies
  where experiment_id = p_experiment_id
    and owner_id = (select auth.uid());

  return next result_row;
  return;
end;
$$;

revoke execute on function public.crystallize_experiment_working_copy(uuid)
from public, anon;
grant execute on function public.crystallize_experiment_working_copy(uuid)
to authenticated;
