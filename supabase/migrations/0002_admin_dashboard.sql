-- 0002_admin_dashboard.sql
create or replace function admin_dashboard_stats() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not has_permission('report.view') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'total_stories',     (select count(*) from stories),
    'published_stories', (select count(*) from stories where status = 'PUBLISHED'),
    'draft_stories',     (select count(*) from stories where status = 'DRAFT'),
    'active_rooms',      (select count(*) from rooms where status in ('WAITING','READY','COUNTDOWN','PLAYING','PAUSED')),
    'total_users',       (select count(*) from profiles),
    'total_teams',       (select count(*) from teams),
    'completed_games',   (select count(*) from rooms where status = 'FINISHED'),
    'recent_activity',   coalesce((select jsonb_agg(x) from (
                            select id, action, created_at from audit_logs order by id desc limit 10) x), '[]'::jsonb)
  );
end $$;
revoke all on function admin_dashboard_stats() from public, anon;
grant execute on function admin_dashboard_stats() to authenticated;

-- Audited role grant (SUPER_ADMIN only). Use after the first admin is bootstrapped.
create or replace function grant_role(target uuid, new_role app_role) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not has_permission('*') then raise exception 'forbidden' using errcode = '42501'; end if;
  insert into user_roles (user_id, role, granted_by) values (target, new_role, auth.uid()) on conflict do nothing;
  insert into audit_logs (actor_id, action, target_type, target_id, details)
    values (auth.uid(), 'role.grant', 'user', target::text, jsonb_build_object('role', new_role));
end $$;
revoke all on function grant_role(uuid, app_role) from public, anon;
grant execute on function grant_role(uuid, app_role) to authenticated;
