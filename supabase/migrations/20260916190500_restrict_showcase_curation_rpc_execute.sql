-- #149 terminal security closeout.
-- Supabase default function grants can leave explicit EXECUTE privileges on anon even
-- after revoking PUBLIC. The RPC bodies already enforce authentication + Professor role,
-- but the privilege surface should match that contract as well.

revoke execute on function public.promote_experiment_to_showcase(uuid, bigint) from anon;
revoke execute on function public.remove_experiment_from_showcase(uuid) from anon;
revoke execute on function public.promote_experiment_to_showcase(uuid, bigint) from public;
revoke execute on function public.remove_experiment_from_showcase(uuid) from public;
