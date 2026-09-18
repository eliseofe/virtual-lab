-- #290 — Sharing revocation and final collaboration boundaries.
--
-- Final policy:
-- - owners can inspect and revoke outgoing ordinary shares;
-- - students may explicitly share with other students, not Professors;
-- - Professors may explicitly share with eligible researchers;
-- - Professor supervision remains a separate automatic read-only path.

create or replace function private.current_user_owns_experiment(p_experiment_id uuid)
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
  );
$$;

revoke all on function private.current_user_owns_experiment(uuid)
  from public, anon, authenticated;
grant execute on function private.current_user_owns_experiment(uuid)
  to authenticated;

create or replace function private.current_user_can_share_with(p_recipient_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  caller_role text;
  recipient_role text;
begin
  if caller is null or p_recipient_id is null or p_recipient_id = caller then
    return false;
  end if;

  select p.role into caller_role
  from public.profiles p
  where p.id = caller;

  select p.role into recipient_role
  from public.profiles p
  where p.id = p_recipient_id;

  if caller_role = 'student' then
    return recipient_role = 'student';
  end if;

  if caller_role = 'professor' then
    return recipient_role in ('student', 'professor');
  end if;

  return false;
end;
$$;

revoke all on function private.current_user_can_share_with(uuid)
  from public, anon, authenticated;
grant execute on function private.current_user_can_share_with(uuid)
  to authenticated;

create or replace function private.list_experiment_share_recipients()
returns table (
  id uuid,
  display_name text,
  role text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  caller_role text;
begin
  if caller is null then
    return;
  end if;

  select p.role into caller_role
  from public.profiles p
  where p.id = caller;

  if caller_role = 'student' then
    return query
      select p.id, p.display_name, p.role
      from public.profiles p
      where p.id <> caller
        and p.role = 'student'
      order by p.display_name nulls last, p.id;
    return;
  end if;

  if caller_role = 'professor' then
    return query
      select p.id, p.display_name, p.role
      from public.profiles p
      where p.id <> caller
        and p.role in ('student', 'professor')
      order by p.display_name nulls last, p.id;
  end if;
end;
$$;

revoke all on function private.list_experiment_share_recipients()
  from public, anon, authenticated;
grant execute on function private.list_experiment_share_recipients()
  to authenticated;

create or replace function public.list_experiment_share_recipients()
returns table (
  id uuid,
  display_name text,
  role text
)
language sql
stable
security invoker
set search_path = ''
as $$
  select * from private.list_experiment_share_recipients();
$$;

revoke all on function public.list_experiment_share_recipients()
  from public, anon, authenticated;
grant execute on function public.list_experiment_share_recipients()
  to authenticated;

revoke update on table public.experiment_shares from authenticated;
grant select, insert, delete on table public.experiment_shares to authenticated;

drop policy if exists "experiment_shares_select_received"
  on public.experiment_shares;
drop policy if exists "experiment_shares_select_accessible"
  on public.experiment_shares;
create policy "experiment_shares_select_accessible"
on public.experiment_shares for select
to authenticated
using (
  recipient_id = (select auth.uid())
  or (select private.current_user_owns_experiment(experiment_shares.experiment_id))
);

drop policy if exists "experiment_shares_insert_owned"
  on public.experiment_shares;
create policy "experiment_shares_insert_owned"
on public.experiment_shares for insert
to authenticated
with check (
  shared_by = (select auth.uid())
  and (select private.current_user_owns_active_experiment(experiment_shares.experiment_id))
  and (select private.current_user_can_share_with(experiment_shares.recipient_id))
);

drop policy if exists "experiment_shares_delete_owned"
  on public.experiment_shares;
create policy "experiment_shares_delete_owned"
on public.experiment_shares for delete
to authenticated
using (
  (select private.current_user_owns_experiment(experiment_shares.experiment_id))
);
