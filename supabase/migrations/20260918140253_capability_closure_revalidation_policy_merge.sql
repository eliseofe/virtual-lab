-- Consolidate #312 INSERT policies after advisor verification.
-- Student keeps own blocked-Experiment submission; Professor additionally may append
-- analyses/requests while revalidating any visible blocked Experiment.

drop policy if exists "capability_closure_analyses_insert_own"
  on public.capability_closure_analyses;
drop policy if exists "capability_closure_analyses_insert_professor_revalidation"
  on public.capability_closure_analyses;
drop policy if exists "capability_closure_analyses_insert_researcher_or_professor_revalidation"
  on public.capability_closure_analyses;

create policy "capability_closure_analyses_insert_researcher_or_professor_revalidation"
on public.capability_closure_analyses for insert
to authenticated
with check (
  analyst_id = (select auth.uid())
  and exists (
    select 1
    from public.blocked_experiment_drafts d
    where d.id = blocked_experiment_id
      and (
        d.requester_id = (select auth.uid())
        or exists (
          select 1 from public.profiles p
          where p.id = (select auth.uid())
            and p.role = 'professor'
        )
      )
  )
);

drop policy if exists "capability_requests_insert_own_researcher"
  on public.capability_requests;
drop policy if exists "capability_requests_insert_professor_revalidation"
  on public.capability_requests;
drop policy if exists "capability_requests_insert_researcher_or_professor_revalidation"
  on public.capability_requests;

create policy "capability_requests_insert_researcher_or_professor_revalidation"
on public.capability_requests for insert
to authenticated
with check (
  requester_id = (select auth.uid())
  and requester_role = (
    select p.role
    from public.profiles p
    where p.id = (select auth.uid())
  )
  and status = 'requested'
  and closure_analysis_id is not null
  and professor_notes is null
  and developer_notes is null
  and github_issue_url is null
  and github_pr_url is null
  and implemented_contract_version is null
  and implemented_capability_version is null
  and implemented_at is null
  and exists (
    select 1
    from public.capability_closure_analyses a
    join public.blocked_experiment_drafts d
      on d.id = a.blocked_experiment_id
    where a.id = closure_analysis_id
      and a.analyst_id = (select auth.uid())
      and (
        d.requester_id = (select auth.uid())
        or exists (
          select 1 from public.profiles p
          where p.id = (select auth.uid())
            and p.role = 'professor'
        )
      )
  )
  and (
    origin_experiment_id is null
    or exists (
      select 1
      from public.experiments e
      where e.id = origin_experiment_id
    )
  )
);
