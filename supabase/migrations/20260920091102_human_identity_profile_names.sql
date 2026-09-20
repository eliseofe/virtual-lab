-- #394 — Structured human identity for registration and provenance.
--
-- Names are display/identity data only. Authorization continues to use the
-- existing profile role and user id; first/last/display names are never
-- authorization claims.

alter table public.profiles
  add column if not exists first_name text,
  add column if not exists last_name text;

alter table public.profiles
  drop constraint if exists profiles_first_name_nonblank,
  add constraint profiles_first_name_nonblank
    check (first_name is null or length(btrim(first_name)) > 0),
  drop constraint if exists profiles_last_name_nonblank,
  add constraint profiles_last_name_nonblank
    check (last_name is null or length(btrim(last_name)) > 0);

create or replace function private.handle_new_registry_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_first_name text := nullif(btrim(new.raw_user_meta_data ->> 'first_name'), '');
  v_last_name text := nullif(btrim(new.raw_user_meta_data ->> 'last_name'), '');
  v_display_name text;
begin
  v_display_name := nullif(btrim(concat_ws(' ', v_first_name, v_last_name)), '');
  if v_display_name is null then
    v_display_name := nullif(btrim(new.raw_user_meta_data ->> 'display_name'), '');
  end if;
  if v_display_name is null then
    v_display_name := 'User ' || left(new.id::text, 8);
  end if;

  insert into public.profiles(id, first_name, last_name, display_name)
  values (new.id, v_first_name, v_last_name, v_display_name)
  on conflict (id) do nothing;

  return new;
end;
$$;

revoke execute on function private.handle_new_registry_user() from public, anon, authenticated;
