-- #334: expose only canonical capability truth as global authenticated Lab knowledge.

create or replace function public.list_canonical_capabilities()
returns table (
  id uuid,
  capability_domain text,
  capability_name text,
  canonical_definition text,
  status text,
  publication_provenance jsonb,
  implemented_contract_version text,
  implemented_capability_version text,
  implemented_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $function$
  select
    r.id,
    r.capability_domain,
    r.capability_name,
    r.canonical_definition,
    r.status,
    r.publication_provenance,
    r.implemented_contract_version,
    r.implemented_capability_version,
    r.implemented_at
  from public.capability_requests as r
  where r.canonical_definition is not null
    and r.status in ('requested', 'approved', 'in_progress', 'implemented')
  order by
    case r.status
      when 'implemented' then 1
      when 'in_progress' then 2
      when 'approved' then 3
      when 'requested' then 4
      else 5
    end,
    r.capability_domain,
    r.capability_name,
    r.id;
$function$;

revoke all on function public.list_canonical_capabilities() from public;
revoke execute on function public.list_canonical_capabilities() from anon;
grant execute on function public.list_canonical_capabilities() to authenticated;

comment on function public.list_canonical_capabilities() is
  'Global authenticated Virtual Lab capability registry. Returns only canonical generic capability truth and minimal bibliographic provenance; historical request/discussion fields are intentionally inaccessible through this function.';
