-- #287 Professor read-only supervision access.
-- Professors may discover student identities and read student-owned Experiments.
-- Existing owner-only INSERT/UPDATE/DELETE policies remain unchanged.

create schema if not exists private;

create or replace function private.current_user_is_professor()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and p.role = 'professor'
  );
$$;

revoke all on function private.current_user_is_professor()
  from public, anon, authenticated;
grant usage on schema private to authenticated;
grant execute on function private.current_user_is_professor()
  to authenticated;

drop policy if exists "profiles_select_students_for_professor"
  on public.profiles;
create policy "profiles_select_students_for_professor"
on public.profiles for select
to authenticated
using (
  role = 'student'
  and (select private.current_user_is_professor())
);

drop policy if exists "experiments_select_student_for_professor"
  on public.experiments;
create policy "experiments_select_student_for_professor"
on public.experiments for select
to authenticated
using (
  (select private.current_user_is_professor())
  and exists (
    select 1
    from public.profiles p
    where p.id = experiments.owner_id
      and p.role = 'student'
  )
);
