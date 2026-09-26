begin;

-- Cover every enterprise foreign key in its declared column order so tenant
-- deletes, scope joins and operational queues stay predictable at scale.
create index if not exists institutional_actions_site_org_fk_idx on public.institutional_actions(site_id,organization_id) where site_id is not null;
create index if not exists institutional_actions_unit_org_fk_idx on public.institutional_actions(unit_id,organization_id) where unit_id is not null;
create index if not exists institutional_actions_assignee_org_fk_idx on public.institutional_actions(assigned_membership_id,organization_id) where assigned_membership_id is not null;

create index if not exists organization_sites_created_by_fk_idx on public.organization_sites(created_by);
create index if not exists organization_units_site_org_fk_idx on public.organization_units(site_id,organization_id) where site_id is not null;
create index if not exists organization_units_parent_org_fk_idx on public.organization_units(parent_unit_id,organization_id) where parent_unit_id is not null;
create index if not exists organization_units_created_by_fk_idx on public.organization_units(created_by);

create index if not exists organization_member_scopes_membership_org_fk_idx on public.organization_member_scopes(membership_id,organization_id);
create index if not exists organization_member_scopes_site_org_fk_idx on public.organization_member_scopes(site_id,organization_id) where site_id is not null;
create index if not exists organization_member_scopes_unit_org_fk_idx on public.organization_member_scopes(unit_id,organization_id) where unit_id is not null;
create index if not exists organization_member_scopes_assigned_by_fk_idx on public.organization_member_scopes(assigned_by);
create index if not exists organization_sla_policies_updated_by_fk_idx on public.organization_sla_policies(updated_by) where updated_by is not null;

create index if not exists organization_inventory_batch_org_fk_idx on public.organization_inventory_allocations(batch_id,organization_id);
create index if not exists organization_inventory_site_org_fk_idx on public.organization_inventory_allocations(site_id,organization_id) where site_id is not null;
create index if not exists organization_inventory_unit_org_fk_idx on public.organization_inventory_allocations(unit_id,organization_id) where unit_id is not null;
create index if not exists organization_inventory_custodian_org_fk_idx on public.organization_inventory_allocations(custodian_membership_id,organization_id) where custodian_membership_id is not null;
create index if not exists organization_inventory_allocated_by_fk_idx on public.organization_inventory_allocations(allocated_by);

commit;

