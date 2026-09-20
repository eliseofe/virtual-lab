-- #397 — Cover the new revision-history foreign keys used by RLS/history reads.

create index experiment_revisions_created_by_user_idx
  on public.experiment_revisions(created_by_user)
  where created_by_user is not null;

create index experiment_working_copies_base_revision_idx
  on public.experiment_working_copies(experiment_id, base_revision);
