-- #522: make request.status the sole current lifecycle and keep Professor decisions as audit history.
-- Accepted is a review/design-queue state only; development and implementation clear the live disposition.

create or replace function private.record_capability_request_professor_review()
returns trigger
language plpgsql
set search_path = ''
as $function$
declare
  v_revision integer;
begin
  if old.professor_disposition is not distinct from new.professor_disposition then
    return new;
  end if;

  -- Clearing the live review disposition when development starts is lifecycle movement,
  -- not a new Professor decision. Pending is likewise system state, not review history.
  if new.professor_disposition is null or new.professor_disposition = 'pending' then
    return new;
  end if;

  select coalesce(max(h.review_revision), 0) + 1
  into v_revision
  from public.capability_request_professor_reviews h
  where h.request_id = new.id;

  insert into public.capability_request_professor_reviews (
    request_id,
    review_revision,
    disposition,
    guidance,
    reviewed_by,
    reviewed_at
  )
  values (
    new.id,
    v_revision,
    new.professor_disposition,
    new.professor_guidance,
    new.professor_disposition_reviewed_by,
    new.professor_disposition_reviewed_at
  );

  return new;
end;
$function$;

alter table public.capability_requests
  alter column professor_disposition drop not null;

alter table public.candidate_capabilities
  alter column professor_disposition drop not null;

alter table public.candidate_contract_deltas
  alter column professor_disposition drop not null;

alter table public.capability_requests
  drop constraint if exists capability_requests_professor_disposition_check,
  add constraint capability_requests_professor_disposition_check
    check (
      professor_disposition is null
      or professor_disposition in ('pending', 'accepted', 'rejected', 'revise', 'deferred', 'future')
    ),
  drop constraint if exists capability_requests_status_disposition_consistency,
  add constraint capability_requests_status_disposition_consistency
    check (
      (status = 'requested' and professor_disposition in ('pending', 'revise', 'deferred', 'future'))
      or (status = 'approved' and professor_disposition = 'accepted')
      or (status = 'declined' and professor_disposition = 'rejected')
      or (status in ('in_progress', 'implemented') and professor_disposition is null)
    );

alter table public.candidate_capabilities
  drop constraint if exists candidate_capabilities_professor_disposition_check,
  add constraint candidate_capabilities_professor_disposition_check
    check (
      professor_disposition is null
      or professor_disposition in ('pending', 'accepted', 'rejected', 'revise', 'deferred', 'future')
    );

alter table public.candidate_contract_deltas
  drop constraint if exists candidate_contract_deltas_professor_disposition_check,
  add constraint candidate_contract_deltas_professor_disposition_check
    check (
      professor_disposition is null
      or professor_disposition in ('pending', 'accepted', 'rejected', 'revise', 'deferred', 'future')
    );

create or replace function private.claim_canonical_capability_for_development(
  p_capability_id uuid,
  p_github_issue_number bigint,
  p_github_issue_url text,
  p_developer_notes text default null
)
returns jsonb
language plpgsql
set search_path = ''
as $function$
declare
  v_capability public.canonical_capabilities;
  v_expected_url text;
  v_requests jsonb;
begin
  if p_github_issue_number is null or p_github_issue_number <= 0 then
    raise exception 'GitHub issue number must be positive.';
  end if;

  v_expected_url := format(
    'https://github.com/eliseofe/virtual-lab/issues/%s',
    p_github_issue_number
  );

  if btrim(coalesce(p_github_issue_url, '')) <> v_expected_url then
    raise exception 'GitHub issue URL must be canonical for issue %.', p_github_issue_number;
  end if;

  select c.* into v_capability
  from public.canonical_capabilities c
  where c.id = p_capability_id
  for update;

  if not found then
    raise exception 'Canonical capability does not exist.';
  end if;
  if v_capability.implementation_state = 'implemented' then
    raise exception 'Canonical capability % is already implemented.', v_capability.capability_key;
  end if;

  if v_capability.github_issue_number is null then
    update public.canonical_capabilities
    set github_issue_number = p_github_issue_number,
        github_issue_url = v_expected_url,
        development_started_at = now()
    where id = p_capability_id
    returning * into v_capability;
  elsif v_capability.github_issue_number <> p_github_issue_number
     or v_capability.github_issue_url <> v_expected_url then
    raise exception 'Canonical capability is already linked to different engineering work.';
  end if;

  update public.capability_requests
  set status = 'in_progress',
      professor_disposition = null,
      github_issue_number = p_github_issue_number,
      github_issue_url = v_expected_url,
      development_started_at = coalesce(development_started_at, now()),
      developer_notes = case
        when p_developer_notes is null then developer_notes
        else nullif(btrim(p_developer_notes), '')
      end
  where canonical_capability_id = p_capability_id
    and status = 'approved';

  select coalesce(jsonb_agg(to_jsonb(r) order by r.created_at), '[]'::jsonb)
  into v_requests
  from public.capability_requests r
  where r.canonical_capability_id = p_capability_id
    and r.status = 'in_progress'
    and r.github_issue_number = p_github_issue_number;

  if jsonb_array_length(v_requests) = 0 then
    raise exception 'No Professor-approved request is available to authorize development of this canonical capability.';
  end if;

  return jsonb_build_object(
    'canonical_capability', to_jsonb(v_capability),
    'requests', v_requests
  );
end;
$function$;

create or replace function private.claim_capability_request_for_development(
  p_request_id uuid,
  p_github_issue_number bigint,
  p_github_issue_url text,
  p_developer_notes text default null
)
returns public.capability_requests
language plpgsql
set search_path = ''
as $function$
declare
  current_request public.capability_requests;
  expected_issue_url text;
begin
  select * into current_request
  from public.capability_requests
  where id = p_request_id
  for update;

  if not found then
    raise exception 'Extension request % does not exist.', p_request_id;
  end if;

  if current_request.request_class = 'semantic_capability' then
    raise exception 'Semantic requests are developed through canonical capability identity.';
  end if;

  if p_github_issue_number is null or p_github_issue_number <= 0 then
    raise exception 'GitHub issue number must be positive.';
  end if;

  expected_issue_url := format(
    'https://github.com/eliseofe/virtual-lab/issues/%s',
    p_github_issue_number
  );

  if btrim(coalesce(p_github_issue_url, '')) <> expected_issue_url then
    raise exception 'GitHub issue URL must be canonical for issue %.', p_github_issue_number;
  end if;

  if current_request.status = 'approved' then
    update public.capability_requests
    set status = 'in_progress',
        professor_disposition = null,
        github_issue_number = p_github_issue_number,
        github_issue_url = expected_issue_url,
        development_started_at = now(),
        developer_notes = nullif(btrim(coalesce(p_developer_notes, '')), '')
    where id = p_request_id
    returning * into current_request;
    return current_request;
  end if;

  if current_request.status = 'in_progress'
     and current_request.github_issue_number = p_github_issue_number
     and current_request.github_issue_url = expected_issue_url then
    return current_request;
  end if;

  raise exception 'Extension request % cannot be claimed from status %.', p_request_id, current_request.status;
end;
$function$;

create or replace function private.complete_canonical_capability_development(
  p_capability_id uuid,
  p_implementation_contracts text[],
  p_implementation_version text
)
returns jsonb
language plpgsql
set search_path = ''
as $function$
declare
  v_capability public.canonical_capabilities;
  v_requests jsonb;
begin
  if coalesce(array_length(p_implementation_contracts, 1), 0) = 0 then
    raise exception 'At least one deployed implementation contract/version is required.';
  end if;
  if nullif(btrim(coalesce(p_implementation_version, '')), '') is null then
    raise exception 'implementation_version is required.';
  end if;

  select c.* into v_capability
  from public.canonical_capabilities c
  where c.id = p_capability_id
  for update;

  if not found then
    raise exception 'Canonical capability does not exist.';
  end if;
  if v_capability.github_issue_number is null then
    raise exception 'Canonical capability has no authorized development handoff.';
  end if;

  update public.canonical_capabilities
  set implementation_state = 'implemented',
      implementation_contracts = p_implementation_contracts,
      implementation_version = btrim(p_implementation_version),
      implemented_at = now(),
      updated_at = now()
  where id = p_capability_id
  returning * into v_capability;

  update public.capability_requests
  set status = 'implemented',
      professor_disposition = null,
      implemented_contract_version = array_to_string(p_implementation_contracts, ','),
      implemented_capability_version = btrim(p_implementation_version),
      implemented_at = v_capability.implemented_at
  where canonical_capability_id = p_capability_id
    and status in ('approved', 'in_progress');

  select coalesce(jsonb_agg(to_jsonb(r) order by r.created_at), '[]'::jsonb)
  into v_requests
  from public.capability_requests r
  where r.canonical_capability_id = p_capability_id
    and r.status = 'implemented';

  return jsonb_build_object(
    'canonical_capability', to_jsonb(v_capability),
    'fulfilled_requests', v_requests
  );
end;
$function$;

-- Reconcile existing advanced lifecycle rows. The acceptance itself remains in
-- capability_request_professor_reviews and the review attribution columns.
update public.capability_requests
set professor_disposition = null
where status in ('in_progress', 'implemented')
  and professor_disposition is not null;

-- Defensive mirror reconciliation in case a candidate row existed before its request trigger fired.
update public.candidate_capabilities c
set professor_disposition = r.professor_disposition,
    request_status = r.status,
    request_updated_at = r.updated_at,
    updated_at = now()
from public.capability_requests r
where r.id = c.request_id
  and c.professor_disposition is distinct from r.professor_disposition;

update public.candidate_contract_deltas d
set professor_disposition = r.professor_disposition,
    request_status = r.status,
    request_updated_at = r.updated_at,
    updated_at = now()
from public.capability_requests r
where r.id = d.request_id
  and d.professor_disposition is distinct from r.professor_disposition;
