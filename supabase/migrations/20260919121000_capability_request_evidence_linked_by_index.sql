-- #361 production advisor repair: cover the linked_by foreign key used by evidence visibility checks.
create index if not exists capability_request_evidence_linked_by_idx
  on public.capability_request_evidence(linked_by);
