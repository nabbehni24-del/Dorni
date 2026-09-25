begin;

-- Cover administrative relationship lookups and keep parent-row updates from
-- scanning partner workflow tables as production data grows.
create index if not exists partner_organizations_reviewed_by_idx
  on public.partner_organizations(reviewed_by)
  where reviewed_by is not null;
create index if not exists partner_batch_requests_reviewed_by_idx
  on public.partner_batch_requests(reviewed_by)
  where reviewed_by is not null;
create index if not exists partner_invitations_organization_id_idx
  on public.partner_invitations(organization_id);
create index if not exists partner_invitations_created_by_idx
  on public.partner_invitations(created_by);
create index if not exists partner_invitations_claimed_by_idx
  on public.partner_invitations(claimed_by)
  where claimed_by is not null;

commit;

