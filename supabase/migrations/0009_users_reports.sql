-- 0009_users_reports.sql
-- Admin user management and reporting APIs. All sensitive reads/writes stay behind SECURITY DEFINER functions.

create or replace function admin_list_users(p_search text default null, p_role app_role default null)
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare result jsonb;
begin
  if not has_permission('user.manage') then raise exception 'forbidden' using errcode = '42501'; end if;
  select coalesce(jsonb_agg(row_to_json(x) order by x.created_at desc), '[]'::jsonb) into result
  from (
    select p.id, p.display_name, p.preferred_language, p.created_at,
           u.email, u.email_confirmed_at, u.last_sign_in_at, u.banned_until,
           coalesce((select jsonb_agg(ur.role order by ur.role) from user_roles ur where ur.user_id = p.id), '[]'::jsonb) as roles,
           (select count(*) from team_members tm where tm.user_id = p.id)::int as games_joined
    from profiles p
    join auth.users u on u.id = p.id
    where (nullif(trim(p_search), '') is null
       or p.display_name ilike '%' || trim(p_search) || '%'
       or coalesce(u.email, '') ilike '%' || trim(p_search) || '%')
      and (p_role is null or exists (select 1 from user_roles ur where ur.user_id = p.id and ur.role = p_role))
  ) x;
  return result;
end $$;
revoke all on function admin_list_users(text, app_role) from public, anon;
grant execute on function admin_list_users(text, app_role) to authenticated;

create or replace function admin_set_user_role(p_user uuid, p_role app_role, p_enabled boolean default true)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if not has_permission('user.manage') then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_role = 'SUPER_ADMIN' and not has_permission('*') then raise exception 'super_admin_only' using errcode = '42501'; end if;
  if p_user = auth.uid() and p_role = 'SUPER_ADMIN' and not p_enabled then raise exception 'cannot_remove_self'; end if;
  if not exists (select 1 from auth.users where id = p_user) then raise exception 'user_not_found'; end if;
  if p_enabled then
    insert into user_roles(user_id, role, granted_by) values (p_user, p_role, auth.uid()) on conflict do nothing;
  else
    delete from user_roles where user_id = p_user and role = p_role;
    if p_role <> 'PLAYER' and not exists (select 1 from user_roles where user_id = p_user) then
      insert into user_roles(user_id, role, granted_by) values (p_user, 'PLAYER', auth.uid());
    end if;
  end if;
  insert into audit_logs(actor_id, action, target_type, target_id, details)
    values (auth.uid(), case when p_enabled then 'role.grant' else 'role.revoke' end, 'user', p_user::text,
            jsonb_build_object('role', p_role, 'enabled', p_enabled));
end $$;
revoke all on function admin_set_user_role(uuid, app_role, boolean) from public, anon;
grant execute on function admin_set_user_role(uuid, app_role, boolean) to authenticated;

create or replace function admin_reports(p_room uuid default null, p_limit int default 50)
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare result jsonb;
begin
  if not has_permission('report.view') then raise exception 'forbidden' using errcode = '42501'; end if;
  with room_rows as (
    select r.id, r.code, r.status, r.created_at, r.started_at, r.finished_at, s.title as story_title,
      (select count(*) from team_members tm join teams t on t.id = tm.team_id where t.room_id = r.id)::int as players,
      (select count(*) from teams t where t.room_id = r.id)::int as teams,
      (select count(*) from card_draws d join teams t on t.id = d.team_id where t.room_id = r.id)::int as total_cards,
      (select count(*) from card_answers a join card_draws d on d.id = a.draw_id join teams t on t.id = d.team_id where t.room_id = r.id and a.is_correct)::int as correct_answers,
      (select count(*) from card_answers a join card_draws d on d.id = a.draw_id join teams t on t.id = d.team_id where t.room_id = r.id and not a.is_correct)::int as incorrect_answers,
      (select count(*) from card_decisions cd join card_draws d on d.id = cd.draw_id join teams t on t.id = d.team_id where t.room_id = r.id and cd.decision = 'PLACE' and cd.belongs_to_team_image)::int as correct_placements,
      (select count(*) from card_decisions cd join card_draws d on d.id = cd.draw_id join teams t on t.id = d.team_id where t.room_id = r.id and cd.decision = 'PLACE' and not cd.belongs_to_team_image)::int as incorrect_placements,
      (select count(*) from card_decisions cd join card_draws d on d.id = cd.draw_id join teams t on t.id = d.team_id where t.room_id = r.id and cd.decision = 'DISCARD' and not cd.belongs_to_team_image)::int as correct_discards,
      (select count(*) from card_decisions cd join card_draws d on d.id = cd.draw_id join teams t on t.id = d.team_id where t.room_id = r.id and cd.decision = 'DISCARD' and cd.belongs_to_team_image)::int as incorrect_discards,
      extract(epoch from (coalesce(r.finished_at, case when r.started_at is not null then now() end) - r.started_at))::int as duration_seconds
    from rooms r join stories s on s.id = r.story_id
    where p_room is null or r.id = p_room
    order by r.created_at desc limit greatest(1, least(coalesce(p_limit, 50), 200))
  )
  select jsonb_build_object(
    'summary', jsonb_build_object(
      'total_rooms', (select count(*) from rooms),
      'completed_rooms', (select count(*) from rooms where status = 'FINISHED'),
      'active_rooms', (select count(*) from rooms where status in ('WAITING','READY','COUNTDOWN','PLAYING','PAUSED')),
      'total_players', (select count(*) from profiles),
      'total_cards', (select count(*) from card_draws),
      'correct_answers', (select count(*) from card_answers where is_correct),
      'completion_rate', coalesce(round(100.0 * (select count(*) from rooms where status = 'FINISHED') / nullif((select count(*) from rooms), 0), 1), 0)
    ),
    'rooms', coalesce((select jsonb_agg(row_to_json(rr) order by rr.created_at desc) from room_rows rr), '[]'::jsonb),
    'activity', coalesce((select jsonb_agg(row_to_json(a) order by a.id desc) from (select id, action, target_type, target_id, details, created_at from audit_logs order by id desc limit 30) a), '[]'::jsonb)
  ) into result;
  return result;
end $$;
revoke all on function admin_reports(uuid, int) from public, anon;
grant execute on function admin_reports(uuid, int) to authenticated;
