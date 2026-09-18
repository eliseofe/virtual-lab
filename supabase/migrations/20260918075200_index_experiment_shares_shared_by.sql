-- #289 performance hygiene — cover the experiment_shares.shared_by foreign key.
create index if not exists experiment_shares_shared_by_idx
  on public.experiment_shares(shared_by);
