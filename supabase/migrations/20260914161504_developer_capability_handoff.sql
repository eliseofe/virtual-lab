-- Virtual Lab developer capability-request handoff for #141 / #58.4.
-- The Professor browser stops at approved. This migration adds a trusted
-- developer-side claim operation for linking one public GitHub engineering
-- issue and moving approved -> in_progress.

alter table public.capability_requests
  add column if not exists github_issue_number bigint;

alter table public.capability_requests
  add column if not exists development_started_at timestamptz;

alter table public.capability_requests
  add constraint capability_requests_github_issue_number_positive
  check (github_issue_number is null or github_issue_number > 0);

alter table public.capability_requests
  add constraint capability_requests_github_issue_pair
  check ((github_issue_number is null) = (github_issue_url is null));

create unique index if not exists capability_requests_github_issue_number_unique
  on public.capability_requests(github_issue_number)
  where github_issue_number is not null;

create unique index if not exists capability_requests_github_issue_url_unique
  on public.capability_requests(github_issue_url)
  where github_issue_url is not null;

create or replace function private.claim_capability_request_for_development(
  p_request_id uuid,
  p_github_issue_number bigint,
  p_github_issue_url text,
  p_developer_notes text default null
)
returns public.capability_requests
language plpgsql
security invoker
set search_path = ''
as $$
declare
  current_request public.capability_requests;
  expected_issue_url text;
begin
  if p_request_id is null then
    raise exception 'Capability request ID is required.';
  end if;

  if p_github_issue_number is null or p_github_issue_number <= 0 then
    raise exception 'GitHub issue number must be positive.';
  end if;

  expected_issue_url := format(
    'https://github.com/eliseofe/virtual-lab/issues/%s',
    p_github_issue_number
  );

  if btrim(coalesce(p_github_issue_url, '')) <> expected_issue_url then
    raise exception
      'GitHub issue URL must be the canonical virtual-lab issue URL for issue %.',
      p_github_issue_number;
  end if;

  select *
    into current_request
    from public.capability_requests
   where id = p_request_id
   for update;

  if not found then
    raise exception 'Capability request % does not exist.', p_request_id;
  end if;

  if current_request.status = 'approved' then
    if current_request.github_issue_number is not null
       or current_request.github_issue_url is not null then
      raise exception
        'Approved capability request % already has GitHub linkage.',
        p_request_id;
    end if;

    update public.capability_requests
       set status = 'in_progress',
           github_issue_number = p_github_issue_number,
           github_issue_url = expected_issue_url,
           development_started_at = now(),
           developer_notes = case
             when p_developer_notes is null then developer_notes
             else nullif(btrim(p_developer_notes), '')
           end
     where id = p_request_id
     returning * into current_request;

    return current_request;
  end if;

  -- Retry-safe only for the exact already-linked issue. This lets a developer
  -- chat recover after a transport/tool interruption without producing a
  -- second implementation issue or advancing lifecycle again.
  if current_request.status = 'in_progress'
     and current_request.github_issue_number = p_github_issue_number
     and current_request.github_issue_url = expected_issue_url then
    return current_request;
  end if;

  raise exception
    'Capability request % cannot be claimed from status %.',
    p_request_id,
    current_request.status;
end;
$$;

-- This function is deliberately NOT a Data API/research-domain operation.
-- It is invoked only through the trusted developer-side database connection.
revoke execute on function private.claim_capability_request_for_development(
  uuid, bigint, text, text
) from public, anon, authenticated, service_role;
