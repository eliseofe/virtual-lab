-- Follow-up performance index for #310 after Supabase advisor verification.

create index if not exists closure_analyses_analyst_idx
  on public.capability_closure_analyses(analyst_id);
