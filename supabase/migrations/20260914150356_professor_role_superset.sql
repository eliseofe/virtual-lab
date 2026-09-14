-- Virtual Lab professor role foundation for #133 / #58.1.
-- Professor is a strict permission superset of Student. This migration adds only
-- the server-controlled role boundary; it does not add professor-only actions.

alter table public.profiles
  add column if not exists role text;

update public.profiles
set role = 'student'
where role is null;

alter table public.profiles
  alter column role set default 'student';

alter table public.profiles
  alter column role set not null;

alter table public.profiles
  drop constraint if exists profiles_role_check;

alter table public.profiles
  add constraint profiles_role_check
  check (role in ('student', 'professor'));

-- Existing profiles_update_self RLS still limits updates to the caller's own row.
-- Column privileges additionally prevent self-promotion: authenticated users may
-- edit their display name, but role assignment stays server/admin controlled.
revoke update on table public.profiles from authenticated;
grant update (display_name) on table public.profiles to authenticated;
