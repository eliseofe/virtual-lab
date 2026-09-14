-- #117 — Generic Experiment artifact persistence.
--
-- Keep the existing experiments row as the revision / ownership / RLS boundary.
-- `artifacts` is canonical. The three legacy source columns remain temporarily as
-- synchronized compatibility mirrors so already-deployed clients cannot corrupt or
-- lose data while the browser and MCP migrate to the generic representation.

create or replace function private.default_experiment_artifacts(
  p_config_source text,
  p_initializer_source text,
  p_controller_source text
)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select jsonb_build_array(
    jsonb_build_object(
      'id', 'configuration',
      'type', 'configuration',
      'label', 'Configuration',
      'format', 'python-vlab',
      'order', 10,
      'content', coalesce(p_config_source, '')
    ),
    jsonb_build_object(
      'id', 'initialization',
      'type', 'initialization',
      'label', 'Initialization',
      'format', 'python-vlab',
      'order', 20,
      'content', coalesce(p_initializer_source, '')
    ),
    jsonb_build_object(
      'id', 'controller',
      'type', 'controller',
      'label', 'Controller',
      'format', 'python-vlab',
      'order', 30,
      'content', coalesce(p_controller_source, '')
    )
  );
$$;

revoke execute on function private.default_experiment_artifacts(text, text, text)
from public, anon, authenticated;

create or replace function private.experiment_artifact_content(
  p_artifacts jsonb,
  p_id text
)
returns text
language sql
immutable
set search_path = ''
as $$
  select artifact ->> 'content'
  from jsonb_array_elements(coalesce(p_artifacts, '[]'::jsonb)) as artifact
  where artifact ->> 'id' = p_id
  limit 1;
$$;

revoke execute on function private.experiment_artifact_content(jsonb, text)
from public, anon, authenticated;

create or replace function private.replace_experiment_artifact_content(
  p_artifacts jsonb,
  p_id text,
  p_content text
)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select coalesce(
    jsonb_agg(
      case
        when artifact ->> 'id' = p_id
          then jsonb_set(artifact, '{content}', to_jsonb(coalesce(p_content, '')), true)
        else artifact
      end
      order by ordinal
    ),
    '[]'::jsonb
  )
  from jsonb_array_elements(coalesce(p_artifacts, '[]'::jsonb))
       with ordinality as items(artifact, ordinal);
$$;

revoke execute on function private.replace_experiment_artifact_content(jsonb, text, text)
from public, anon, authenticated;

alter table public.experiments
  add column if not exists artifacts jsonb;

-- Remove v1 version checks before assigning the v2 representation. The backfill
-- itself is mechanical, so preserve scientific revision numbers.
alter table public.experiments
  drop constraint if exists experiments_schema_version_check,
  drop constraint if exists experiments_interface_version_check;

alter table public.experiments disable trigger bump_experiment_revision;

update public.experiments
set artifacts = private.default_experiment_artifacts(
      config_source,
      initializer_source,
      controller_source
    ),
    schema_version = 'vlab.registry-experiment/2',
    interface_version = 'vlab.experiment-artifacts/2';

alter table public.experiments enable trigger bump_experiment_revision;

alter table public.experiments
  alter column schema_version set default 'vlab.registry-experiment/2',
  alter column interface_version set default 'vlab.experiment-artifacts/2',
  alter column artifacts set not null,
  add constraint experiments_schema_version_check
    check (schema_version = 'vlab.registry-experiment/2'),
  add constraint experiments_interface_version_check
    check (interface_version = 'vlab.experiment-artifacts/2'),
  add constraint experiments_artifacts_array_check
    check (jsonb_typeof(artifacts) = 'array');

create or replace function private.sync_experiment_artifacts()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  artifact_count integer;
  distinct_id_count integer;
  core_config text;
  core_initializer text;
  core_controller text;
  artifacts_changed boolean := false;
  legacy_changed boolean := false;
begin
  if tg_op = 'INSERT' then
    if new.artifacts is null then
      new.artifacts := private.default_experiment_artifacts(
        new.config_source,
        new.initializer_source,
        new.controller_source
      );
    else
      new.config_source := coalesce(private.experiment_artifact_content(new.artifacts, 'configuration'), '');
      new.initializer_source := coalesce(private.experiment_artifact_content(new.artifacts, 'initialization'), '');
      new.controller_source := coalesce(private.experiment_artifact_content(new.artifacts, 'controller'), '');
    end if;
  else
    artifacts_changed := new.artifacts is distinct from old.artifacts;
    legacy_changed :=
      new.config_source is distinct from old.config_source
      or new.initializer_source is distinct from old.initializer_source
      or new.controller_source is distinct from old.controller_source;

    if artifacts_changed and legacy_changed then
      core_config := private.experiment_artifact_content(new.artifacts, 'configuration');
      core_initializer := private.experiment_artifact_content(new.artifacts, 'initialization');
      core_controller := private.experiment_artifact_content(new.artifacts, 'controller');

      if core_config is distinct from new.config_source
         or core_initializer is distinct from new.initializer_source
         or core_controller is distinct from new.controller_source then
        raise exception 'generic artifacts and legacy source mirrors disagree'
          using errcode = '23514';
      end if;
    elsif artifacts_changed then
      new.config_source := coalesce(private.experiment_artifact_content(new.artifacts, 'configuration'), '');
      new.initializer_source := coalesce(private.experiment_artifact_content(new.artifacts, 'initialization'), '');
      new.controller_source := coalesce(private.experiment_artifact_content(new.artifacts, 'controller'), '');
    elsif legacy_changed then
      new.artifacts := old.artifacts;
      if new.config_source is distinct from old.config_source then
        new.artifacts := private.replace_experiment_artifact_content(
          new.artifacts, 'configuration', new.config_source
        );
      end if;
      if new.initializer_source is distinct from old.initializer_source then
        new.artifacts := private.replace_experiment_artifact_content(
          new.artifacts, 'initialization', new.initializer_source
        );
      end if;
      if new.controller_source is distinct from old.controller_source then
        new.artifacts := private.replace_experiment_artifact_content(
          new.artifacts, 'controller', new.controller_source
        );
      end if;
    end if;
  end if;

  if new.artifacts is null or jsonb_typeof(new.artifacts) <> 'array' then
    raise exception 'experiment artifacts must be a JSON array' using errcode = '23514';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(new.artifacts) as artifact
    where jsonb_typeof(artifact) <> 'object'
       or jsonb_typeof(artifact -> 'id') <> 'string'
       or length(btrim(artifact ->> 'id')) = 0
       or jsonb_typeof(artifact -> 'type') <> 'string'
       or length(btrim(artifact ->> 'type')) = 0
       or jsonb_typeof(artifact -> 'label') <> 'string'
       or length(btrim(artifact ->> 'label')) = 0
       or jsonb_typeof(artifact -> 'format') <> 'string'
       or length(btrim(artifact ->> 'format')) = 0
       or jsonb_typeof(artifact -> 'order') <> 'number'
       or jsonb_typeof(artifact -> 'content') <> 'string'
  ) then
    raise exception 'each experiment artifact requires non-empty id/type/label/format, numeric order, and string content'
      using errcode = '23514';
  end if;

  select count(*), count(distinct artifact ->> 'id')
  into artifact_count, distinct_id_count
  from jsonb_array_elements(new.artifacts) as artifact;

  if artifact_count <> distinct_id_count then
    raise exception 'experiment artifact ids must be unique' using errcode = '23514';
  end if;

  if (
    select count(*)
    from jsonb_array_elements(new.artifacts) as artifact
    where artifact ->> 'id' in ('configuration', 'initialization', 'controller')
  ) <> 3
  or not exists (
    select 1 from jsonb_array_elements(new.artifacts) as artifact
    where artifact ->> 'id' = 'configuration' and artifact ->> 'type' = 'configuration'
  )
  or not exists (
    select 1 from jsonb_array_elements(new.artifacts) as artifact
    where artifact ->> 'id' = 'initialization' and artifact ->> 'type' = 'initialization'
  )
  or not exists (
    select 1 from jsonb_array_elements(new.artifacts) as artifact
    where artifact ->> 'id' = 'controller' and artifact ->> 'type' = 'controller'
  ) then
    raise exception 'experiment artifacts must contain exactly one configuration, initialization, and controller core artifact'
      using errcode = '23514';
  end if;

  -- The generic representation is canonical; keep legacy fields as exact mirrors.
  new.config_source := private.experiment_artifact_content(new.artifacts, 'configuration');
  new.initializer_source := private.experiment_artifact_content(new.artifacts, 'initialization');
  new.controller_source := private.experiment_artifact_content(new.artifacts, 'controller');
  new.schema_version := 'vlab.registry-experiment/2';
  new.interface_version := 'vlab.experiment-artifacts/2';

  return new;
end;
$$;

revoke execute on function private.sync_experiment_artifacts()
from public, anon, authenticated;

drop trigger if exists artifact_sync_experiment_artifacts on public.experiments;
create trigger artifact_sync_experiment_artifacts
before insert or update of artifacts, config_source, initializer_source, controller_source
on public.experiments
for each row execute function private.sync_experiment_artifacts();

comment on column public.experiments.artifacts is
  'Canonical ordered typed Experiment artifacts. Legacy source columns are synchronized compatibility mirrors during the v1→v2 client migration.';
