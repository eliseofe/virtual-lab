-- #577 (D-023): the capability now provides read-only traits set per group;
-- its display name says so. The key and identity are unchanged.
update public.canonical_capabilities
set capability_name = 'Traits by group: read-only per-robot values set by the experimenter',
    updated_at = now()
where id = '25ee37e5-ba59-4e8a-9768-a5604e2501b5'
  and capability_key = 'initialization.per_agent_private_state_assignment';

update public.canonical_capabilities
set implementation_contracts = array_replace(implementation_contracts, 'vlab.authoring/0.15', 'vlab.authoring/0.16'),
    updated_at = now()
where id in ('e7be7240-af33-4f44-9e57-17eccf4a861b', '25ee37e5-ba59-4e8a-9768-a5604e2501b5', '1fbe59fb-79f3-48f7-9500-16557297ea0a');

update public.canonical_capabilities
set implementation_version = 'vlab.authoring/0.16', updated_at = now()
where id = 'e7be7240-af33-4f44-9e57-17eccf4a861b';
