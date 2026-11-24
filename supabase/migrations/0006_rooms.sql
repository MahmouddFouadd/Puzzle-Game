-- 0006_rooms.sql  (Phase 3: rooms, joining, teams, captains, image selection, start)
-- Design notes
--  * Players are Supabase anonymous (or normal) users. They never write tables directly: every action is a function below.
--  * rooms.settings_snapshot holds ONLY player-safe data (effective rules, image positions + hints). No answers, no mappings, no image titles.
--  * A story used by an active room is frozen (cannot be unpublished/edited), which is what keeps ongoing games consistent.
--  * PIN hashes live in room_secrets (no policies => unreadable through the API).

-- ---------- schema changes ----------
alter table rooms drop column access_pin_hash;
alter table rooms add column has_pin boolean not null default false;
alter table rooms add column countdown_ends_at timestamptz;

create table room_secrets (room_id uuid primary key references rooms(id) on delete cascade, pin_hash text not null);
alter table room_secrets enable row level security;

create table room_members (
  room_id uuid not null references rooms(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 40),
  status text not null check (status in ('PENDING', 'ACTIVE', 'REJECTED')),
  joined_at timestamptz not null default now(),
  primary key (room_id, user_id)
);
alter table room_members enable row level security;

create or replace function is_room_member(r uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from room_members where room_id = r and user_id = auth.uid() and status = 'ACTIVE')
      or exists (select 1 from team_members where room_id = r and user_id = auth.uid());
$$;

create policy room_members_read on room_members for select
  using (user_id = auth.uid() or is_room_member(room_id) or has_permission('room.manage'));

-- ---------- frozen stories while rooms are active ----------
create or replace function guard_story_change() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'DELETE' then
    if old.status = 'PUBLISHED' then raise exception 'story_published'; end if;
    return old;
  end if;
  if new.status = 'PUBLISHED' and old.status <> 'PUBLISHED' and coalesce(current_setting('app.publishing', true), '') <> 'on' then
    raise exception 'use_publish_story';
  end if;
  if old.status = 'PUBLISHED' and new.status <> 'PUBLISHED'
     and exists (select 1 from rooms where story_id = old.id and status in ('WAITING','READY','COUNTDOWN','PLAYING','PAUSED')) then
    raise exception 'story_in_use';
  end if;
  if old.status = 'PUBLISHED' and new.status = 'PUBLISHED'
     and (to_jsonb(new) - 'updated_at') <> (to_jsonb(old) - 'updated_at') then
    raise exception 'story_published';
  end if;
  return new;
end $$;

create or replace function guard_story_content() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_story uuid;
begin
  if tg_table_name = 'story_images' then v_story := coalesce(new.story_id, old.story_id);
  else select i.story_id into v_story from story_images i where i.id = coalesce(new.image_id, old.image_id); end if;
  if (select status from stories where id = v_story) = 'PUBLISHED' then raise exception 'story_published'; end if;
  return coalesce(new, old);
end $$;
create trigger guard_images before insert or update or delete on story_images for each row execute function guard_story_content();
create trigger guard_pieces before insert or update or delete on puzzle_pieces for each row execute function guard_story_content();

-- ---------- helpers ----------
create or replace function new_room_code(p_title text) returns text
language plpgsql volatile security definer set search_path = public as $$
declare alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; pre text; v_code text; bytes bytea; i int; suffix text;
begin
  pre := left(coalesce(nullif(regexp_replace(upper(p_title), '[^A-Z]', '', 'g'), ''), 'RM') || 'XX', 2);
  loop
    bytes := decode(replace(gen_random_uuid()::text, '-', ''), 'hex');
    suffix := '';
    for i in 0 .. 5 loop suffix := suffix || substr(alphabet, 1 + (get_byte(bytes, i) % 32), 1); end loop;
    v_code := pre || '-' || suffix;
    exit when not exists (select 1 from rooms where rooms.code = v_code);
  end loop;
  return v_code;
end $$;

create or replace function room_event(p_room uuid, p_team uuid, p_type text, p_payload jsonb default '{}') returns void
language sql security definer set search_path = public as $$
  insert into game_events (room_id, team_id, event_type, payload) values (p_room, p_team, p_type, p_payload);
$$;

create or replace function reassign_captain(p_team uuid, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
declare v_old uuid; v_new uuid;
begin
  select captain_user_id into v_old from teams where id = p_team;
  select user_id into v_new from team_members where team_id = p_team and user_id is distinct from v_old order by joined_at, user_id limit 1;
  if v_old is not distinct from v_new then return; end if;
  update teams set captain_user_id = v_new where id = p_team;
  insert into team_captain_history (team_id, from_user_id, to_user_id, reason) values (p_team, v_old, v_new, p_reason);
end $$;

create or replace function refresh_room_status(p_room uuid) returns void
language plpgsql security definer set search_path = public as $$
declare n int; ready int;
begin
  select count(*), count(*) filter (where is_ready) into n, ready from teams where room_id = p_room;
  update rooms set status = case when n >= 2 and n = ready then 'READY'::room_status else 'WAITING'::room_status end
  where id = p_room and status in ('WAITING', 'READY');
end $$;

-- ---------- admin: create room ----------
create or replace function create_room(
  p_story uuid, p_max_teams int, p_max_members int, p_private boolean, p_pin text,
  p_admin_joining boolean, p_players_create_teams boolean, p_team_names text[] default '{}'
) returns jsonb language plpgsql security definer set search_path = public as $$
declare s stories%rowtype; d platform_settings%rowtype; ss story_settings%rowtype;
        v_images int; v_id uuid := gen_random_uuid(); v_code text; v_snap jsonb; n text;
begin
  if not has_permission('room.manage') then raise exception 'forbidden' using errcode = '42501'; end if;
  select * into s from stories where id = p_story;
  if not found or s.status <> 'PUBLISHED' then raise exception 'story_not_published'; end if;
  select count(*) into v_images from story_images where story_id = p_story;
  if v_images < 2 then raise exception 'story_needs_two_images'; end if;
  if p_max_teams < 2 or p_max_teams > v_images then raise exception 'invalid_team_count'; end if;
  if p_max_members not between 1 and 12 then raise exception 'invalid_member_limit'; end if;
  if p_pin is not null and p_pin !~ '^[0-9]{4,8}$' then raise exception 'invalid_pin'; end if;
  if p_private and p_pin is null then raise exception 'pin_required'; end if;
  if coalesce(array_length(p_team_names, 1), 0) > p_max_teams then raise exception 'too_many_teams'; end if;

  select * into d from platform_settings limit 1;
  select * into ss from story_settings where story_id = p_story;
  v_snap := jsonb_build_object(
    'story', jsonb_build_object('id', s.id, 'title', s.title, 'language', s.language),
    'settings', jsonb_build_object(
      'points_correct_place', coalesce(ss.points_correct_place, d.points_correct_place),
      'points_wrong_place', coalesce(ss.points_wrong_place, d.points_wrong_place),
      'points_correct_discard', coalesce(ss.points_correct_discard, d.points_correct_discard),
      'points_wrong_discard', coalesce(ss.points_wrong_discard, d.points_wrong_discard),
      'points_wrong_answer', coalesce(ss.points_wrong_answer, d.points_wrong_answer),
      'wrong_answer_policy', coalesce(ss.wrong_answer_policy, d.wrong_answer_policy),
      'max_attempts', coalesce(ss.max_attempts, d.max_attempts),
      'reveal_answer_after_fail', coalesce(ss.reveal_answer_after_fail, d.reveal_answer_after_fail),
      'card_time_limit_seconds', case when ss.card_time_limit_seconds = 0 then null else coalesce(ss.card_time_limit_seconds, d.card_time_limit_seconds) end,
      'allow_multiple_questions_per_piece', coalesce(ss.allow_multiple_questions_per_piece, d.allow_multiple_questions_per_piece),
      'allow_deck_recycling', coalesce(ss.allow_deck_recycling, d.allow_deck_recycling)),
    'images', (select jsonb_agg(jsonb_build_object('id', id, 'position', position, 'hint', hint, 'piece_count', piece_count) order by position)
               from story_images where story_id = p_story));

  v_code := new_room_code(s.title);
  insert into rooms (id, code, story_id, is_private, has_pin, admin_controlled_joining, players_can_create_teams,
                     max_teams, max_team_members, settings_snapshot, created_by)
  values (v_id, v_code, p_story, p_private, p_pin is not null, p_admin_joining, p_players_create_teams,
          p_max_teams, p_max_members, v_snap, auth.uid());
  if p_pin is not null then
    insert into room_secrets (room_id, pin_hash) values (v_id, encode(sha256(convert_to(p_pin || v_id::text, 'utf8')), 'hex'));
  end if;
  foreach n in array coalesce(p_team_names, '{}') loop
    if char_length(trim(n)) not between 1 and 40 then raise exception 'invalid_name'; end if;
    insert into teams (room_id, name) values (v_id, trim(n));
  end loop;
  insert into audit_logs (actor_id, action, target_type, target_id, details)
  values (auth.uid(), 'room.create', 'room', v_id::text, jsonb_build_object('code', v_code, 'story', p_story));
  return jsonb_build_object('id', v_id, 'code', v_code);
end $$;

-- ---------- player: preview + join ----------
create or replace function room_preview(p_code text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare r rooms%rowtype;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  select * into r from rooms where code = upper(trim(p_code));
  if not found then return jsonb_build_object('found', false); end if;
  return jsonb_build_object('found', true, 'status', r.status, 'needs_pin', r.has_pin,
    'language', r.settings_snapshot->'story'->>'language',
    'title', case when r.has_pin then null else r.settings_snapshot->'story'->>'title' end);
end $$;

create or replace function join_room(p_code text, p_pin text, p_name text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare r rooms%rowtype; m room_members%rowtype; v_fail int; v_hash text;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  select * into r from rooms where code = upper(trim(p_code));
  if not found then return jsonb_build_object('status', 'not_found'); end if;

  select * into m from room_members where room_id = r.id and user_id = auth.uid();
  if found then
    return jsonb_build_object('status', case m.status when 'ACTIVE' then 'joined' when 'PENDING' then 'pending' else 'rejected' end, 'room_id', r.id);
  end if;
  if r.status not in ('WAITING', 'READY') then return jsonb_build_object('status', 'closed'); end if;
  if char_length(trim(coalesce(p_name, ''))) not between 1 and 40 then raise exception 'invalid_name'; end if;

  if r.has_pin then
    select count(*) into v_fail from security_events
      where user_id = auth.uid() and room_id = r.id and kind = 'pin_fail' and created_at > now() - interval '10 minutes';
    if v_fail >= 5 then return jsonb_build_object('status', 'too_many_attempts'); end if;
    select pin_hash into v_hash from room_secrets where room_id = r.id;
    if p_pin is null or encode(sha256(convert_to(p_pin || r.id::text, 'utf8')), 'hex') <> v_hash then
      insert into security_events (user_id, room_id, kind) values (auth.uid(), r.id, 'pin_fail');
      return jsonb_build_object('status', 'bad_pin');  -- returned, not raised, so the failure is recorded
    end if;
  end if;

  insert into room_members (room_id, user_id, display_name, status)
  values (r.id, auth.uid(), trim(p_name), case when r.admin_controlled_joining then 'PENDING' else 'ACTIVE' end);
  perform room_event(r.id, null, 'player_joined', jsonb_build_object('name', trim(p_name)));
  return jsonb_build_object('status', case when r.admin_controlled_joining then 'pending' else 'joined' end, 'room_id', r.id);
end $$;

create or replace function resolve_member(p_room uuid, p_user uuid, p_approve boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not has_permission('room.manage') then raise exception 'forbidden' using errcode = '42501'; end if;
  update room_members set status = case when p_approve then 'ACTIVE' else 'REJECTED' end
  where room_id = p_room and user_id = p_user and status = 'PENDING';
  insert into audit_logs (actor_id, action, target_type, target_id, details)
  values (auth.uid(), 'room.member.resolve', 'room', p_room::text, jsonb_build_object('user', p_user, 'approved', p_approve));
end $$;

-- ---------- teams ----------
create or replace function create_team(p_room uuid, p_name text) returns uuid
language plpgsql security definer set search_path = public as $$
declare r rooms%rowtype; v_team uuid; v_staff boolean := has_permission('room.manage');
begin
  select * into r from rooms where id = p_room for update;
  if not found then raise exception 'room_not_found'; end if;
  if r.status not in ('WAITING', 'READY') then raise exception 'room_locked'; end if;
  if char_length(trim(coalesce(p_name, ''))) not between 1 and 40 then raise exception 'invalid_name'; end if;
  if not v_staff then
    if not r.players_can_create_teams then raise exception 'teams_disabled'; end if;
    if not exists (select 1 from room_members where room_id = p_room and user_id = auth.uid() and status = 'ACTIVE') then raise exception 'not_in_room'; end if;
    if exists (select 1 from team_members where room_id = p_room and user_id = auth.uid()) then raise exception 'already_in_team'; end if;
  end if;
  if (select count(*) from teams where room_id = p_room) >= r.max_teams then raise exception 'team_limit'; end if;
  if exists (select 1 from teams where room_id = p_room and lower(name) = lower(trim(p_name))) then raise exception 'name_taken'; end if;
  insert into teams (room_id, name) values (p_room, trim(p_name)) returning id into v_team;
  if not v_staff then
    insert into team_members (team_id, user_id, room_id) values (v_team, auth.uid(), p_room);
    update teams set captain_user_id = auth.uid() where id = v_team;
    insert into team_captain_history (team_id, from_user_id, to_user_id, reason) values (v_team, null, auth.uid(), 'team_created');
  end if;
  perform refresh_room_status(p_room);
  perform room_event(p_room, v_team, 'team_created', jsonb_build_object('name', trim(p_name)));
  return v_team;
end $$;

create or replace function join_team(p_team uuid) returns void
language plpgsql security definer set search_path = public as $$
declare t teams%rowtype; r rooms%rowtype;
begin
  select * into t from teams where id = p_team for update;
  if not found then raise exception 'team_not_found'; end if;
  select * into r from rooms where id = t.room_id;
  if r.status not in ('WAITING', 'READY') then raise exception 'room_locked'; end if;
  if not exists (select 1 from room_members where room_id = t.room_id and user_id = auth.uid() and status = 'ACTIVE') then raise exception 'not_in_room'; end if;
  if exists (select 1 from team_members where room_id = t.room_id and user_id = auth.uid()) then raise exception 'already_in_team'; end if;
  if (select count(*) from team_members where team_id = p_team) >= r.max_team_members then raise exception 'team_full'; end if;
  insert into team_members (team_id, user_id, room_id) values (p_team, auth.uid(), t.room_id);
  if t.captain_user_id is null then
    update teams set captain_user_id = auth.uid() where id = p_team;
    insert into team_captain_history (team_id, from_user_id, to_user_id, reason) values (p_team, null, auth.uid(), 'first_member');
  end if;
  update teams set is_ready = false where id = p_team;  -- roster changed: the team must confirm again
  perform refresh_room_status(t.room_id);
  perform room_event(t.room_id, p_team, 'player_joined_team', '{}');
end $$;

create or replace function leave_team(p_team uuid) returns void
language plpgsql security definer set search_path = public as $$
declare t teams%rowtype; r rooms%rowtype;
begin
  select * into t from teams where id = p_team for update;
  if not found then raise exception 'team_not_found'; end if;
  select * into r from rooms where id = t.room_id;
  if r.status not in ('WAITING', 'READY') then raise exception 'room_locked'; end if;
  delete from team_members where team_id = p_team and user_id = auth.uid();
  if not found then raise exception 'not_in_team'; end if;
  if t.captain_user_id = auth.uid() then perform reassign_captain(p_team, 'captain_left'); end if;
  update teams set is_ready = false where id = p_team;
  perform refresh_room_status(t.room_id);
  perform room_event(t.room_id, p_team, 'player_left_team', '{}');
end $$;

create or replace function set_team_captain(p_team uuid, p_user uuid) returns void
language plpgsql security definer set search_path = public as $$
declare t teams%rowtype;
begin
  select * into t from teams where id = p_team for update;
  if not found then raise exception 'team_not_found'; end if;
  if not (has_permission('game.control') or t.captain_user_id = auth.uid()) then raise exception 'forbidden' using errcode = '42501'; end if;
  if not exists (select 1 from team_members where team_id = p_team and user_id = p_user) then raise exception 'not_in_team'; end if;
  update teams set captain_user_id = p_user where id = p_team;
  insert into team_captain_history (team_id, from_user_id, to_user_id, reason)
  values (p_team, t.captain_user_id, p_user, case when has_permission('game.control') then 'admin' else 'handover' end);
  perform room_event(t.room_id, p_team, 'captain_changed', '{}');
end $$;

-- ---------- image selection and readiness (captain only) ----------
create or replace function select_image(p_team uuid, p_image uuid) returns void
language plpgsql security definer set search_path = public as $$
declare t teams%rowtype; r rooms%rowtype;
begin
  select * into t from teams where id = p_team for update;
  if not found then raise exception 'team_not_found'; end if;
  select * into r from rooms where id = t.room_id;
  if r.status not in ('WAITING', 'READY') then raise exception 'room_locked'; end if;
  if t.captain_user_id is distinct from auth.uid() then raise exception 'captain_only'; end if;
  if not exists (select 1 from story_images where id = p_image and story_id = r.story_id) then raise exception 'image_not_in_story'; end if;
  delete from team_image_assignments where team_id = p_team;
  begin
    insert into team_image_assignments (room_id, image_id, team_id) values (t.room_id, p_image, p_team);
  exception when unique_violation then
    raise exception 'image_taken';   -- the whole function rolls back, including the delete above
  end;
  insert into team_game_states (team_id, assigned_image_id) values (p_team, p_image)
  on conflict (team_id) do update set assigned_image_id = excluded.assigned_image_id;
  update teams set is_ready = false where id = p_team;
  perform refresh_room_status(t.room_id);
  perform room_event(t.room_id, p_team, 'image_selected', jsonb_build_object('image', p_image));
end $$;

create or replace function set_team_ready(p_team uuid, p_ready boolean) returns void
language plpgsql security definer set search_path = public as $$
declare t teams%rowtype; r rooms%rowtype;
begin
  select * into t from teams where id = p_team for update;
  if not found then raise exception 'team_not_found'; end if;
  select * into r from rooms where id = t.room_id;
  if r.status not in ('WAITING', 'READY') then raise exception 'room_locked'; end if;
  if t.captain_user_id is distinct from auth.uid() then raise exception 'captain_only'; end if;
  if p_ready and not exists (select 1 from team_game_states where team_id = p_team and assigned_image_id is not null) then raise exception 'select_image_first'; end if;
  update teams set is_ready = p_ready where id = p_team;
  perform refresh_room_status(t.room_id);
  perform room_event(t.room_id, p_team, 'team_ready', jsonb_build_object('ready', p_ready));
end $$;

-- ---------- admin: start and control ----------
create or replace function start_game(p_room uuid, p_override boolean default false) returns void
language plpgsql security definer set search_path = public as $$
declare r rooms%rowtype;
begin
  if not has_permission('game.control') then raise exception 'forbidden' using errcode = '42501'; end if;
  select * into r from rooms where id = p_room for update;
  if not found then raise exception 'room_not_found'; end if;
  if r.status not in ('WAITING', 'READY') then raise exception 'room_locked'; end if;
  if (select count(*) from teams where room_id = p_room) < 2 then raise exception 'not_enough_teams'; end if;
  if exists (select 1 from teams t where t.room_id = p_room and not exists (
       select 1 from team_game_states g where g.team_id = t.id and g.assigned_image_id is not null)) then raise exception 'teams_without_image'; end if;
  if exists (select 1 from teams t where t.room_id = p_room and not exists (select 1 from team_members m where m.team_id = t.id)) then raise exception 'empty_team'; end if;
  if r.status <> 'READY' and not p_override then raise exception 'teams_not_ready'; end if;
  update rooms set status = 'COUNTDOWN', countdown_ends_at = now() + interval '3 seconds' where id = p_room;
  insert into audit_logs (actor_id, action, target_type, target_id, details)
  values (auth.uid(), 'room.start', 'room', p_room::text, jsonb_build_object('override', p_override));
  perform room_event(p_room, null, 'countdown_started', '{}');
end $$;

-- Anyone in the room may call this; it only acts once the server-side countdown has elapsed.
create or replace function advance_room(p_room uuid) returns room_status
language plpgsql security definer set search_path = public as $$
declare r rooms%rowtype;
begin
  if not (is_room_member(p_room) or has_permission('game.control')) then raise exception 'forbidden' using errcode = '42501'; end if;
  select * into r from rooms where id = p_room for update;
  if r.status = 'COUNTDOWN' and now() >= r.countdown_ends_at then
    update rooms set status = 'PLAYING', started_at = now() where id = p_room;
    perform room_event(p_room, null, 'game_started', '{}');
    return 'PLAYING';
  end if;
  return r.status;
end $$;

create or replace function set_room_status(p_room uuid, p_action text) returns void
language plpgsql security definer set search_path = public as $$
declare r rooms%rowtype;
begin
  if not has_permission('game.control') then raise exception 'forbidden' using errcode = '42501'; end if;
  select * into r from rooms where id = p_room for update;
  if not found then raise exception 'room_not_found'; end if;
  if p_action = 'pause' and r.status = 'PLAYING' then update rooms set status = 'PAUSED' where id = p_room;
  elsif p_action = 'resume' and r.status = 'PAUSED' then update rooms set status = 'PLAYING' where id = p_room;
  elsif p_action = 'cancel' and r.status in ('WAITING', 'READY', 'COUNTDOWN', 'PLAYING', 'PAUSED') then
    update rooms set status = 'CANCELLED', finished_at = now() where id = p_room;
  else raise exception 'invalid_action'; end if;
  insert into audit_logs (actor_id, action, target_type, target_id, details)
  values (auth.uid(), 'room.' || p_action, 'room', p_room::text, '{}');
  perform room_event(p_room, null, 'room_' || p_action, '{}');
end $$;

create or replace function remove_player(p_room uuid, p_user uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_team uuid;
begin
  if not has_permission('game.control') then raise exception 'forbidden' using errcode = '42501'; end if;
  select team_id into v_team from team_members where room_id = p_room and user_id = p_user;
  delete from team_members where room_id = p_room and user_id = p_user;
  if v_team is not null and (select captain_user_id from teams where id = v_team) = p_user then perform reassign_captain(v_team, 'removed_by_admin'); end if;
  update room_members set status = 'REJECTED' where room_id = p_room and user_id = p_user;
  if v_team is not null then update teams set is_ready = false where id = v_team; end if;
  perform refresh_room_status(p_room);
  insert into audit_logs (actor_id, action, target_type, target_id, details)
  values (auth.uid(), 'room.remove_player', 'room', p_room::text, jsonb_build_object('user', p_user));
end $$;


-- ---------- grants ----------
do $$
declare f text;
begin
  foreach f in array array[
    'create_room(uuid,int,int,boolean,text,boolean,boolean,text[])', 'room_preview(text)', 'join_room(text,text,text)',
    'resolve_member(uuid,uuid,boolean)', 'create_team(uuid,text)', 'join_team(uuid)', 'leave_team(uuid)', 'set_team_captain(uuid,uuid)',
    'select_image(uuid,uuid)', 'set_team_ready(uuid,boolean)', 'start_game(uuid,boolean)', 'advance_room(uuid)',
    'set_room_status(uuid,text)', 'remove_player(uuid,uuid)']
  loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
  -- internal helpers are not callable through the API
  foreach f in array array['new_room_code(text)', 'room_event(uuid,uuid,text,jsonb)', 'reassign_captain(uuid,text)', 'refresh_room_status(uuid)']
  loop execute format('revoke all on function %s from public, anon, authenticated', f); end loop;

  -- realtime (Supabase only)
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table rooms, teams, team_members, room_members, team_image_assignments, game_events;
  end if;
end $$;
