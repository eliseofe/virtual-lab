-- #196 — Metrics becomes the fourth compulsory Experiment artifact.
-- Existing scientific source and revision identity are preserved: legacy/current
-- experiments receive one empty Metrics artifact mechanically.

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
    jsonb_build_object('id','configuration','type','configuration','label','Configuration','format','python-vlab','order',10,'content',coalesce(p_config_source,'')),
    jsonb_build_object('id','initialization','type','initialization','label','Initialization','format','python-vlab','order',20,'content',coalesce(p_initializer_source,'')),
    jsonb_build_object('id','controller','type','controller','label','Controller','format','python-vlab','order',30,'content',coalesce(p_controller_source,'')),
    jsonb_build_object('id','metrics','type','metrics','label','Metrics','format','python-vlab-metrics/0.1','order',40,'content','')
  );
$$;

revoke execute on function private.default_experiment_artifacts(text, text, text)
from public, anon, authenticated;

create or replace function private.ensure_metrics_artifact(p_artifacts jsonb)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select case
    when exists (
      select 1 from jsonb_array_elements(coalesce(p_artifacts, '[]'::jsonb)) as artifact
      where artifact ->> 'id' = 'metrics'
    ) then coalesce(p_artifacts, '[]'::jsonb)
    else coalesce(p_artifacts, '[]'::jsonb) || jsonb_build_array(
      jsonb_build_object(
        'id','metrics','type','metrics','label','Metrics',
        'format','python-vlab-metrics/0.1','order',40,'content',''
      )
    )
  end;
$$;

revoke execute on function private.ensure_metrics_artifact(jsonb)
from public, anon, authenticated;

alter table public.experiments
  drop constraint if exists experiments_schema_version_check,
  drop constraint if exists experiments_interface_version_check;

alter table public.experiments disable trigger bump_experiment_revision;
update public.experiments
set artifacts = private.ensure_metrics_artifact(artifacts),
    schema_version = 'vlab.registry-experiment/3',
    interface_version = 'vlab.experiment-artifacts/3';
alter table public.experiments enable trigger bump_experiment_revision;

alter table public.experiments
  alter column schema_version set default 'vlab.registry-experiment/3',
  alter column interface_version set default 'vlab.experiment-artifacts/3',
  add constraint experiments_schema_version_check
    check (schema_version = 'vlab.registry-experiment/3'),
  add constraint experiments_interface_version_check
    check (interface_version = 'vlab.experiment-artifacts/3');

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
      new.artifacts := private.ensure_metrics_artifact(new.artifacts);
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

    if artifacts_changed then
      new.artifacts := private.ensure_metrics_artifact(new.artifacts);
    end if;

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
      new.artifacts := private.ensure_metrics_artifact(old.artifacts);
      if new.config_source is distinct from old.config_source then
        new.artifacts := private.replace_experiment_artifact_content(new.artifacts, 'configuration', new.config_source);
      end if;
      if new.initializer_source is distinct from old.initializer_source then
        new.artifacts := private.replace_experiment_artifact_content(new.artifacts, 'initialization', new.initializer_source);
      end if;
      if new.controller_source is distinct from old.controller_source then
        new.artifacts := private.replace_experiment_artifact_content(new.artifacts, 'controller', new.controller_source);
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
    where artifact ->> 'id' in ('configuration','initialization','controller','metrics')
  ) <> 4
  or not exists (select 1 from jsonb_array_elements(new.artifacts) as artifact where artifact ->> 'id'='configuration' and artifact ->> 'type'='configuration')
  or not exists (select 1 from jsonb_array_elements(new.artifacts) as artifact where artifact ->> 'id'='initialization' and artifact ->> 'type'='initialization')
  or not exists (select 1 from jsonb_array_elements(new.artifacts) as artifact where artifact ->> 'id'='controller' and artifact ->> 'type'='controller')
  or not exists (select 1 from jsonb_array_elements(new.artifacts) as artifact where artifact ->> 'id'='metrics' and artifact ->> 'type'='metrics')
  then
    raise exception 'experiment artifacts must contain exactly one configuration, initialization, controller, and metrics core artifact'
      using errcode = '23514';
  end if;

  new.config_source := private.experiment_artifact_content(new.artifacts, 'configuration');
  new.initializer_source := private.experiment_artifact_content(new.artifacts, 'initialization');
  new.controller_source := private.experiment_artifact_content(new.artifacts, 'controller');
  new.schema_version := 'vlab.registry-experiment/3';
  new.interface_version := 'vlab.experiment-artifacts/3';
  return new;
end;
$$;

revoke execute on function private.sync_experiment_artifacts()
from public, anon, authenticated;

comment on column public.experiments.artifacts is
  'Canonical ordered typed Experiment artifacts. Required core: Configuration, Initialization, Controller, Metrics. Legacy source columns mirror only the first three during compatibility migration.';
