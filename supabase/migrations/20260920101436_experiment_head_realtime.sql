-- #398 — Signal visible Experiment-head changes to signed-in clients.
-- Realtime delivery remains subject to the existing experiments SELECT RLS policies.
alter publication supabase_realtime add table public.experiments;
