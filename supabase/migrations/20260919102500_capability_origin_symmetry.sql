-- #354: eliminate implemented-capability origin asymmetry.
-- Existing pre-registry capabilities receive the exact #348 production-verification baseline,
-- then the canonical registry requires the same implementation metadata for every implemented row.

do $$
begin
  if (select count(*) from public.canonical_capabilities) <> 11
     or (select count(*) from public.canonical_capabilities where implementation_state = 'implemented') <> 11 then
    raise exception '#354 baseline refused: expected the #348 clean baseline of exactly 11 implemented canonical capabilities.';
  end if;

  if exists (
    select 1
    from public.canonical_capabilities c
    where not exists (
      select 1
      from public.capability_publication_provenance p
      where p.capability_id = c.id
    )
  ) then
    raise exception '#354 baseline refused: every canonical capability must have publication provenance.';
  end if;
end;
$$;

update public.canonical_capabilities
set implementation_version = 'git:10bdfe63a9af0c3eedc4896682fda7bfddf71d89',
    implemented_at = '2026-09-19T05:58:01Z'::timestamptz,
    updated_at = now()
where implementation_state = 'implemented'
  and (implementation_version is null or implemented_at is null);

alter table public.canonical_capabilities
  drop constraint if exists canonical_capabilities_implemented_metadata_complete,
  add constraint canonical_capabilities_implemented_metadata_complete
    check (
      implementation_state <> 'implemented'
      or (
        coalesce(array_length(implementation_contracts, 1), 0) > 0
        and implementation_version is not null
        and length(btrim(implementation_version)) > 0
        and implemented_at is not null
      )
    );

comment on column public.canonical_capabilities.implementation_version is
  'Exact deployed candidate/version at which the current canonical implementation was production-verified. Pre-registry capabilities use the #348 canonical cutover candidate as their verification baseline rather than inventing historical introduction data.';

comment on column public.canonical_capabilities.implemented_at is
  'Time the current implementation state/version was production-verified in the canonical registry. For pre-registry capabilities this is the #348 clean-baseline verification time, not the original feature-introduction date.';

comment on column public.canonical_capabilities.github_issue_number is
  'Optional trusted-development workflow history. Not canonical capability meaning and not exposed through neutral capability discovery.';

comment on column public.canonical_capabilities.github_issue_url is
  'Optional trusted-development workflow history. Not canonical capability meaning and not exposed through neutral capability discovery.';

comment on column public.canonical_capabilities.development_started_at is
  'Optional trusted-development workflow history. Not canonical capability meaning and not exposed through neutral capability discovery.';

drop function if exists public.list_canonical_capability_registry();

create function public.list_canonical_capability_registry()
returns table (
  id uuid,
  capability_key text,
  capability_domain text,
  capability_name text,
  canonical_definition text,
  implementation_state text,
  implementation_contracts text[],
  implementation_version text,
  implemented_at timestamptz,
  publication_provenance jsonb
)
language sql
stable
security invoker
set search_path = ''
as $function$
  select
    c.id,
    c.capability_key,
    c.capability_domain,
    c.capability_name,
    c.canonical_definition,
    c.implementation_state,
    c.implementation_contracts,
    c.implementation_version,
    c.implemented_at,
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'identifier', p.publication_identifier,
          'title', p.publication_title
        )
        order by p.publication_identifier
      ) filter (where p.capability_id is not null),
      '[]'::jsonb
    ) as publication_provenance
  from public.canonical_capabilities c
  left join public.capability_publication_provenance p
    on p.capability_id = c.id
  group by c.id
  order by c.capability_domain, c.capability_key;
$function$;

revoke all on function public.list_canonical_capability_registry() from public;
revoke execute on function public.list_canonical_capability_registry() from anon;
grant execute on function public.list_canonical_capability_registry() to authenticated;

comment on function public.list_canonical_capability_registry() is
  'Authoritative global authenticated Virtual Lab semantic capability registry. Returns origin-neutral identity, generic meaning, implementation state/contracts/version/verification time and minimal publication provenance independently of request workflow/history.';
