-- #289 repair — avoid RLS recursion when an owner creates a share.
--
-- The experiment_shares INSERT policy must verify source ownership without selecting
-- public.experiments through its RLS policies, because experiments SELECT itself
-- recognizes experiment_shares. Keep the privileged ownership lookup in the private
-- schema and expose only a boolean authorization result to the policy.

create or replace function private.current_user_owns_active_experiment(p_experiment_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.experiments e
    where e.id = p_experiment_id
      and e.owner_id = (select auth.uid())
      and e.lifecycle = 'active'
  );
$$;

revoke all on function private.current_user_owns_active_experiment(uuid)
  from public, anon, authenticated;
grant execute on function private.current_user_owns_active_experiment(uuid)
  to authenticated;

drop policy if exists "experiment_shares_insert_owned"
  on public.experiment_shares;
create policy "experiment_shares_insert_owned"
on public.experiment_shares for insert
to authenticated
with check (
  shared_by = (select auth.uid())
  and recipient_id <> (select auth.uid())
  and (select private.current_user_owns_active_experiment(experiment_shares.experiment_id))
  and exists (
    select 1
    from public.profiles p
    where p.id = experiment_shares.recipient_id
  )
);
