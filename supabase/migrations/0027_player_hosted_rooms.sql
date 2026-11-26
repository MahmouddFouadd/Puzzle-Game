-- Player-hosted Puzzle Game rooms with title-only story selection.
--
-- Any signed-in player may create a room and pick one of the stories the administrator has published AND
-- enabled for player rooms. The creator ("host") gets exactly: create the room, choose/change the story
-- before the game starts, start the game, and cancel their own room before it starts. Nothing else:
-- no story content, no rules, no player management, no admin functions.
--
-- Security notes
--  * The story list RPC returns id, title and an approved cover only. Full story content still lives only in
--    room_story_snapshots / story tables, which players cannot read.
--  * The old players_read_published policy let any signed-in user read whole published story rows
--    (description, final narrative...) straight from the API. No player screen uses it, so it is removed.
--  * Availability is a separate table because published stories are immutable (guard_story_change).

-- ---------- availability controlled by the administrator ----------
create table if not exists story_player_availability (
  story_id uuid primary key references stories(id) on delete cascade,
  enabled boolean not null default false,
  updated_by uuid references auth.users(id),
  updated_at timestamptz not null default now()
);
alter table story_player_availability enable row level security;
create policy story_availability_staff on story_player_availability for all using (has_permission('story.manage')) with check (has_permission('story.manage'));

-- Stories that can host a room today start enabled; the administrator can switch any of them off.
insert into story_player_availability (story_id, enabled)
select s.id, true from stories s
 where s.status = 'PUBLISHED' and (select count(*) from story_images i where i.story_id = s.id) >= 2
on conflict (story_id) do nothing;

create or replace function set_story_player_selectable(p_story uuid, p_enabled boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not has_permission('story.manage') then raise exception 'forbidden' using errcode = '42501'; end if;
  if not exists (select 1 from stories where id = p_story) then raise exception 'story_not_found'; end if;
  insert into story_player_availability (story_id, enabled, updated_by, updated_at) values (p_story, p_enabled, auth.uid(), now())
  on conflict (story_id) do update set enabled = excluded.enabled, updated_by = excluded.updated_by, updated_at = now();
  insert into audit_logs (actor_id, action, target_type, target_id, details)
  values (auth.uid(), 'story.player_selectable', 'story', p_story::text, jsonb_build_object('enabled', p_enabled));
end $$;

drop policy if exists players_read_published on stories;

alter table rooms add column if not exists player_hosted boolean not null default false;

-- ---------- shared room construction (unchanged behaviour, extracted from create_room) ----------
create or replace function _room_story_payload(p_story uuid, p_overrides jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare s stories%rowtype; d platform_settings%rowtype; ss story_settings%rowtype; v_settings jsonb; v_snap jsonb; v_content jsonb;
begin
  select * into s from stories where id = p_story;
  select * into d from platform_settings limit 1;
  select * into ss from story_settings where story_id = p_story;
  v_settings := jsonb_build_object(
    'points_correct_place', coalesce(ss.points_correct_place, d.points_correct_place), 'points_wrong_place', coalesce(ss.points_wrong_place, d.points_wrong_place),
    'points_correct_discard', coalesce(ss.points_correct_discard, d.points_correct_discard), 'points_wrong_discard', coalesce(ss.points_wrong_discard, d.points_wrong_discard),
    'points_wrong_answer', coalesce(ss.points_wrong_answer, d.points_wrong_answer), 'wrong_answer_policy', coalesce(ss.wrong_answer_policy, d.wrong_answer_policy),
    'max_attempts', coalesce(ss.max_attempts, d.max_attempts), 'reveal_answer_after_fail', coalesce(ss.reveal_answer_after_fail, d.reveal_answer_after_fail),
    'card_time_limit_seconds', case when ss.card_time_limit_seconds = 0 then null else coalesce(ss.card_time_limit_seconds, d.card_time_limit_seconds) end,
    'allow_multiple_questions_per_piece', coalesce(ss.allow_multiple_questions_per_piece, d.allow_multiple_questions_per_piece), 'allow_deck_recycling', coalesce(ss.allow_deck_recycling, d.allow_deck_recycling),
    'max_recycle_cycles', coalesce(ss.max_recycle_cycles, d.max_recycle_cycles), 'rescue_enabled', coalesce(ss.rescue_enabled, d.rescue_enabled),
    'max_rescue_draws', coalesce(ss.max_rescue_draws, d.max_rescue_draws), 'rescue_cost_points', coalesce(ss.rescue_cost_points, d.rescue_cost_points),
    'rescue_cards_repeatable', coalesce(ss.rescue_cards_repeatable, d.rescue_cards_repeatable), 'captain_grace_seconds', coalesce(ss.captain_grace_seconds, d.captain_grace_seconds));
  v_settings := v_settings || coalesce(p_overrides, '{}'::jsonb);
  if v_settings->>'card_time_limit_seconds' = '0' then v_settings := jsonb_set(v_settings, '{card_time_limit_seconds}', 'null'::jsonb); end if;
  v_snap := jsonb_build_object('story', jsonb_build_object('id', s.id, 'title', s.title, 'language', s.language), 'settings', v_settings,
    'images', (select jsonb_agg(jsonb_build_object('id', id, 'position', position, 'hint', hint, 'piece_count', piece_count) order by position) from story_images where story_id = p_story));
  select jsonb_build_object(
    'story', jsonb_build_object('id', s.id, 'title', s.title, 'description', s.description, 'language', s.language, 'final_narrative', s.final_narrative),
    'images', (select coalesce(jsonb_agg(jsonb_build_object('id', i.id, 'position', i.position, 'title', i.title, 'description', i.description, 'hint', i.hint, 'storage_path', i.storage_path, 'width', i.width, 'height', i.height, 'piece_count', i.piece_count, 'seed', i.puzzle_seed) order by i.position), '[]'::jsonb) from story_images i where i.story_id = s.id),
    'pieces', (select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'image_id', p.image_id, 'row', p.row_idx, 'col', p.col_idx, 'x', p.x, 'y', p.y, 'w', p.w, 'h', p.h, 'path', p.svg_path, 'mask', p.mask_path)), '[]'::jsonb) from puzzle_pieces p join story_images i on i.id = p.image_id where i.story_id = s.id),
    'questions', (select coalesce(jsonb_agg(jsonb_build_object('id', q.id, 'text', q.text, 'type', q.type, 'explanation', q.explanation, 'hint', q.hint, 'piece_id', m.piece_id, 'options', (select coalesce(jsonb_agg(jsonb_build_object('id', o.id, 'position', o.position, 'text', o.text) order by o.position), '[]'::jsonb) from question_options o where o.question_id = q.id), 'answers', (select coalesce(jsonb_agg(jsonb_build_object('text', a.answer_text, 'option_id', a.option_id, 'primary', a.is_primary) order by a.is_primary desc), '[]'::jsonb) from accepted_answers a where a.question_id = q.id))), '[]'::jsonb) from questions q join question_piece_mappings m on m.question_id = q.id and m.approved where q.story_id = s.id and q.published),
    'connections', (select coalesce(jsonb_agg(jsonb_build_object('from', c.from_image_id, 'to', c.to_image_id, 'label', c.label)), '[]'::jsonb) from story_connections c where c.story_id = s.id)) into v_content;
  return jsonb_build_object('snapshot', v_snap, 'content', v_content);
end $$;

create or replace function _create_room_core(
  p_story uuid, p_max_teams int, p_max_members int, p_private boolean, p_pin text,
  p_admin_joining boolean, p_players_create_teams boolean, p_team_names text[], p_overrides jsonb
) returns jsonb language plpgsql security definer set search_path = public as $$
declare s stories%rowtype; d platform_settings%rowtype; v_images int; v_id uuid := gen_random_uuid(); v_code text; v_payload jsonb; n text;
begin
  select * into s from stories where id = p_story;
  if not found or s.status <> 'PUBLISHED' then raise exception 'story_not_published'; end if;
  select * into d from platform_settings limit 1;
  select count(*) into v_images from story_images where story_id = p_story;
  if v_images < 2 then raise exception 'story_needs_two_images'; end if;
  if p_max_teams < d.min_team_count or p_max_teams > least(d.max_team_count, v_images) then raise exception 'invalid_team_count'; end if;
  if p_max_members < d.min_team_members or p_max_members > d.max_team_members then raise exception 'invalid_member_limit'; end if;
  if p_pin is not null and p_pin !~ '^[0-9]{4,8}$' then raise exception 'invalid_pin'; end if;
  if p_private and p_pin is null then raise exception 'pin_required'; end if;
  perform validate_settings_json(coalesce(p_overrides, '{}'::jsonb));
  if coalesce(array_length(p_team_names, 1), 0) > p_max_teams then raise exception 'too_many_teams'; end if;
  v_payload := _room_story_payload(p_story, p_overrides);
  v_code := new_room_code(s.title);
  insert into rooms (id, code, story_id, is_private, has_pin, admin_controlled_joining, players_can_create_teams, max_teams, max_team_members, settings_snapshot, created_by)
  values (v_id, v_code, p_story, p_private, p_pin is not null, p_admin_joining, p_players_create_teams, p_max_teams, p_max_members, v_payload->'snapshot', auth.uid());
  insert into room_story_snapshots (room_id, content) values (v_id, v_payload->'content');
  if p_pin is not null then insert into room_secrets (room_id, pin_hash) values (v_id, encode(sha256(convert_to(p_pin || v_id::text, 'utf8')), 'hex')); end if;
  foreach n in array coalesce(p_team_names, '{}') loop
    if char_length(trim(n)) not between 1 and 40 then raise exception 'invalid_name'; end if;
    insert into teams (room_id, name) values (v_id, trim(n));
  end loop;
  insert into audit_logs (actor_id, action, target_type, target_id, details) values (auth.uid(), 'room.create', 'room', v_id::text, jsonb_build_object('code', v_code, 'story', p_story, 'overrides', coalesce(p_overrides, '{}'::jsonb)));
  return jsonb_build_object('id', v_id, 'code', v_code);
end $$;

-- Administrators: same signature and behaviour as before.
create or replace function create_room(
  p_story uuid, p_max_teams int, p_max_members int, p_private boolean, p_pin text,
  p_admin_joining boolean, p_players_create_teams boolean, p_team_names text[] default '{}', p_overrides jsonb default '{}'
) returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if not has_permission('room.manage') then raise exception 'forbidden' using errcode = '42501'; end if;
  return _create_room_core(p_story, p_max_teams, p_max_members, p_private, p_pin, p_admin_joining, p_players_create_teams, p_team_names, p_overrides);
end $$;

-- ---------- host helpers ----------
create or replace function is_room_host(r uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select auth.uid() is not null and exists (select 1 from rooms where id = r and player_hosted and created_by = auth.uid());
$$;

create or replace function _story_selectable(p_story uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from stories s join story_player_availability a on a.story_id = s.id and a.enabled
     where s.id = p_story and s.status = 'PUBLISHED' and (select count(*) from story_images i where i.story_id = s.id) >= 2);
$$;

-- Only what a story card may show: id, title and an approved cover (a public URL or bundled asset), never content.
create or replace function list_selectable_stories() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('id', s.id, 'title', s.title, 'language', s.language,
             'cover_url', case when s.cover_image_path ~* '^https?://' or s.cover_image_path like 'demo/%' then s.cover_image_path end)
           order by s.title)
      from stories s where _story_selectable(s.id)), '[]'::jsonb);
end $$;

-- ---------- player actions ----------
create or replace function player_create_room(p_story uuid, p_name text, p_team_count int default 2) returns jsonb
language plpgsql security definer set search_path = public as $$
declare d platform_settings%rowtype; v_images int; v_teams int; v_members int; v_res jsonb; v_join jsonb;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  if char_length(trim(coalesce(p_name, ''))) not between 1 and 40 then raise exception 'invalid_name'; end if;
  if not _story_selectable(p_story) then raise exception 'story_not_available'; end if;
  if (select count(*) from rooms where created_by = auth.uid() and player_hosted and status in ('WAITING', 'READY', 'COUNTDOWN', 'PLAYING', 'PAUSED')) >= 3
    then raise exception 'too_many_open_rooms'; end if;
  select * into d from platform_settings limit 1;
  select count(*) into v_images from story_images where story_id = p_story;
  v_teams := coalesce(p_team_count, 2);
  if v_teams < d.min_team_count or v_teams > least(d.max_team_count, v_images) then raise exception 'invalid_team_count'; end if;
  v_members := d.max_team_members;
  -- Fixed, safe defaults: public room, open joining, players form teams, story rules unchanged (no overrides).
  v_res := _create_room_core(p_story, v_teams, v_members, false, null, false, true, '{}', '{}'::jsonb);
  update rooms set player_hosted = true where id = (v_res->>'id')::uuid;
  v_join := join_room(v_res->>'code', null, p_name);
  return v_res;
end $$;

create or replace function player_set_room_story(p_room uuid, p_story uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare r rooms%rowtype; v_images int; v_teams int; v_payload jsonb; v_title text;
begin
  if not is_room_host(p_room) then raise exception 'forbidden' using errcode = '42501'; end if;
  select * into r from rooms where id = p_room for update;
  if r.status not in ('WAITING', 'READY') then raise exception 'room_locked'; end if;
  if not _story_selectable(p_story) then raise exception 'story_not_available'; end if;
  if p_story = r.story_id then return jsonb_build_object('title', r.settings_snapshot->'story'->>'title'); end if;
  select count(*) into v_images from story_images where story_id = p_story;
  select count(*) into v_teams from teams where room_id = p_room;
  if v_teams > v_images then raise exception 'story_too_small'; end if;
  v_payload := _room_story_payload(p_story, '{}'::jsonb);
  -- Image choices belong to the old story: clear them and unready every team.
  delete from team_image_assignments where room_id = p_room;
  delete from team_game_states where team_id in (select id from teams where room_id = p_room);
  update teams set is_ready = false where room_id = p_room;
  update rooms set story_id = p_story, settings_snapshot = v_payload->'snapshot', max_teams = least(max_teams, v_images) where id = p_room;
  update room_story_snapshots set content = v_payload->'content' where room_id = p_room;
  perform refresh_room_status(p_room);
  v_title := v_payload->'snapshot'->'story'->>'title';
  insert into audit_logs (actor_id, action, target_type, target_id, details) values (auth.uid(), 'room.story_selected', 'room', p_room::text, jsonb_build_object('story', p_story));
  perform room_event(p_room, null, 'story_selected', jsonb_build_object('title', v_title));
  return jsonb_build_object('title', v_title);
end $$;

-- ---------- start / cancel: the host may start and cancel their own room, nothing more ----------
create or replace function start_game(p_room uuid, p_override boolean default false) returns void
language plpgsql security definer set search_path = public as $$
declare r rooms%rowtype;
begin
  if not (has_permission('game.control') or is_room_host(p_room)) then raise exception 'forbidden' using errcode = '42501'; end if;
  select * into r from rooms where id = p_room for update;
  if not found then raise exception 'room_not_found'; end if;
  if r.status not in ('WAITING', 'READY') then raise exception 'room_locked'; end if;
  if (select count(*) from teams where room_id = p_room) < 2 then raise exception 'not_enough_teams'; end if;
  if exists (select 1 from teams t where t.room_id = p_room and not exists (
       select 1 from team_game_states g where g.team_id = t.id and g.assigned_image_id is not null)) then raise exception 'teams_without_image'; end if;
  if exists (select 1 from teams t where t.room_id = p_room and not exists (select 1 from team_members m where m.team_id = t.id)) then raise exception 'empty_team'; end if;
  -- A host cannot force-start past unready teams; only staff may override.
  if r.status <> 'READY' and not (p_override and has_permission('game.control')) then raise exception 'teams_not_ready'; end if;
  update rooms set status = 'COUNTDOWN', countdown_ends_at = now() + interval '3 seconds' where id = p_room;
  insert into audit_logs (actor_id, action, target_type, target_id, details)
  values (auth.uid(), 'room.start', 'room', p_room::text, jsonb_build_object('override', p_override));
  perform room_event(p_room, null, 'countdown_started', '{}');
end $$;

create or replace function set_room_status(p_room uuid, p_action text) returns void
language plpgsql security definer set search_path = public as $$
declare r rooms%rowtype;
begin
  select * into r from rooms where id = p_room for update;
  if not has_permission('game.control') then
    if not (is_room_host(p_room) and p_action = 'cancel' and r.status in ('WAITING', 'READY')) then raise exception 'forbidden' using errcode = '42501'; end if;
  end if;
  if not found then raise exception 'room_not_found'; end if;
  if p_action = 'pause' and r.status = 'PLAYING' then update rooms set status = 'PAUSED' where id = p_room;
  elsif p_action = 'resume' and r.status = 'PAUSED' then update rooms set status = 'PLAYING' where id = p_room;
  elsif p_action = 'end' and r.status in ('PLAYING', 'PAUSED') then update rooms set status = 'FINISHED', finished_at = clock_timestamp() where id = p_room;
  elsif p_action = 'cancel' and r.status in ('WAITING', 'READY', 'COUNTDOWN', 'PLAYING', 'PAUSED') then
    update rooms set status = 'CANCELLED', finished_at = clock_timestamp() where id = p_room;
  else raise exception 'invalid_action'; end if;
  insert into audit_logs (actor_id, action, target_type, target_id, details) values (auth.uid(), 'room.' || p_action, 'room', p_room::text, '{}');
  perform room_event(p_room, null, 'room_' || p_action, '{}');
end $$;

-- ---------- grants ----------
revoke all on function _room_story_payload(uuid, jsonb) from public, anon, authenticated;
revoke all on function _create_room_core(uuid, int, int, boolean, text, boolean, boolean, text[], jsonb) from public, anon, authenticated;
revoke all on function _story_selectable(uuid) from public, anon, authenticated;
revoke all on function create_room(uuid, int, int, boolean, text, boolean, boolean, text[], jsonb) from public, anon;
grant execute on function create_room(uuid, int, int, boolean, text, boolean, boolean, text[], jsonb) to authenticated;
do $$
declare f text;
begin
  foreach f in array array['is_room_host(uuid)', 'list_selectable_stories()', 'player_create_room(uuid,text,int)', 'player_set_room_story(uuid,uuid)',
    'set_story_player_selectable(uuid,boolean)', 'start_game(uuid,boolean)', 'set_room_status(uuid,text)']
  loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;
grant select, insert, update, delete on story_player_availability to authenticated;
