-- #480 — Cover the Showcase collection creator foreign key used by curation audits.
create index if not exists showcase_collections_created_by_idx
  on public.showcase_collections(created_by);
