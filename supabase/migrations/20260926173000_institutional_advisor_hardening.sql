begin;

-- Cover every new composite foreign key in child-column order.
create index if not exists partner_memberships_role_organization_idx
  on public.partner_memberships(role_id,organization_id) where role_id is not null;
create index if not exists partner_invitations_role_organization_idx
  on public.partner_invitations(role_id,organization_id) where role_id is not null;
create index if not exists institutional_actions_type_reason_idx
  on public.institutional_actions(action_type,reason_code);
create index if not exists institutional_actions_membership_tenant_actor_idx
  on public.institutional_actions(membership_id,organization_id,actor_id);
create index if not exists institutional_actions_assignment_relation_idx
  on public.institutional_actions(code_assignment_id,code_id,vehicle_id);
create index if not exists partner_invitations_revoked_by_idx
  on public.partner_invitations(revoked_by) where revoked_by is not null;

-- Function creation gives PUBLIC execute by default. Worker RPCs must only be
-- reachable by service_role even though they also validate a runtime secret.
revoke all on function public.dequeue_notification_messages(text,integer) from public,anon,authenticated;
revoke all on function public.complete_notification_message(text,uuid,text,text,text,text) from public,anon,authenticated;
grant execute on function public.dequeue_notification_messages(text,integer) to service_role;
grant execute on function public.complete_notification_message(text,uuid,text,text,text,text) to service_role;

commit;

