create or replace function public.admin_set_partner_status(p_organization_id uuid,p_status text,p_trusted_generation boolean default false,p_generation_limit integer default 100,p_note text default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid(); org public.partner_organizations%rowtype;
begin
 if not private.support_allowed('view') or not exists(select 1 from public.internal_memberships where user_id=u and active and role_code='SUPER_ADMIN') then raise exception 'FORBIDDEN' using errcode='42501';end if;
 if p_status is null or p_status not in ('ACTIVE','SUSPENDED','REJECTED') then raise exception 'INVALID_STATUS' using errcode='22023';end if;
 if p_generation_limit is null or p_generation_limit<1 or p_generation_limit>100000 then raise exception 'INVALID_LIMIT' using errcode='22023';end if;
 if p_trusted_generation is null or char_length(p_note)>1000 then raise exception 'INVALID_INPUT' using errcode='22023';end if;
 update public.partner_organizations set status=p_status,trusted_generation=case when p_status='ACTIVE' then p_trusted_generation else false end,generation_limit_per_day=p_generation_limit,reviewed_at=now(),reviewed_by=u,review_note=nullif(trim(coalesce(p_note,'')),''),updated_at=now() where id=p_organization_id returning * into org;
 if org.id is null then raise exception 'PARTNER_NOT_FOUND' using errcode='P0002';end if;
 insert into public.audit_logs(actor_id,actor_kind,action,entity_type,entity_id,safe_metadata) values(u,'ADMIN','PARTNER_STATUS_CHANGED','partner_organization',org.id,jsonb_build_object('status',p_status,'trustedGeneration',org.trusted_generation,'generationLimitPerDay',org.generation_limit_per_day));
 return to_jsonb(org);
end $$;
revoke all on function public.admin_set_partner_status(uuid,text,boolean,integer,text) from public,anon;
grant execute on function public.admin_set_partner_status(uuid,text,boolean,integer,text) to authenticated;
