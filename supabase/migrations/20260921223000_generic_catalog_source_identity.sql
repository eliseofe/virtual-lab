-- #481 — normalize the historical catalog source key for Active Elastic.
-- This is a content-identity migration only; Showcase source behavior remains generic.

update public.showcase_entries
set source_key = 'catalog:active-elastic'
where source_key = 'catalog:kernel-probe'
  and removed_at is null
  and not exists (
    select 1
    from public.showcase_entries existing
    where existing.source_key = 'catalog:active-elastic'
      and existing.removed_at is null
  );

update public.showcase_entries
set source_key = 'catalog:active-elastic'
where source_key = 'catalog:kernel-probe'
  and removed_at is not null;
