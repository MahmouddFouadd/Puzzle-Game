-- 0010_configurable_limits.sql
-- Configurable validation limits. The database keeps only broad type-safe positivity checks;
-- product limits are stored in platform_settings and enforced server-side.
alter table platform_settings
  add column if not exists min_piece_count smallint not null default 4,
  add column if not exists max_piece_count smallint not null default 100,
  add column if not exists min_team_count smallint not null default 2,
  add column if not exists max_team_count smallint not null default 12,
  add column if not exists min_team_members smallint not null default 1,
  add column if not exists max_team_members smallint not null default 12;
alter table platform_settings drop constraint if exists platform_settings_limits_check;
alter table platform_settings add constraint platform_settings_limits_check check (
  min_piece_count >= 1 and max_piece_count >= min_piece_count and
  min_team_count >= 1 and max_team_count >= min_team_count and
  min_team_members >= 1 and max_team_members >= min_team_members
);
alter table story_images drop constraint if exists story_images_piece_count_check;
alter table rooms drop constraint if exists rooms_max_teams_check;
alter table rooms drop constraint if exists rooms_max_team_members_check;
alter table story_images drop constraint if exists story_images_piece_count_positive;
alter table rooms drop constraint if exists rooms_max_teams_positive;
alter table rooms drop constraint if exists rooms_max_team_members_positive;
alter table story_images add constraint story_images_piece_count_positive check (piece_count > 0);
alter table rooms add constraint rooms_max_teams_positive check (max_teams > 0);
alter table rooms add constraint rooms_max_team_members_positive check (max_team_members > 0);

create or replace function save_image_pieces(p_image uuid, p_seed bigint, p_pieces jsonb, p_force boolean default false)
returns int language plpgsql security definer set search_path = public as $$
declare v_story uuid; v_status story_status; v_count int; v_maps int; d platform_settings%rowtype;
begin
  if not has_permission('story.manage') then raise exception 'forbidden' using errcode = '42501'; end if;
  select s.id, s.status into v_story, v_status from story_images i join stories s on s.id = i.story_id where i.id = p_image;
  if v_story is null then raise exception 'image_not_found'; end if;
  if v_status = 'PUBLISHED' then raise exception 'story_published'; end if;
  select * into d from platform_settings limit 1;
  v_count := jsonb_array_length(p_pieces);
  if v_count < d.min_piece_count or v_count > d.max_piece_count then raise exception 'invalid_piece_count'; end if;
  select count(*) into v_maps from question_piece_mappings m join puzzle_pieces p on p.id = m.piece_id where p.image_id = p_image;
  if v_maps > 0 and not p_force then raise exception 'mappings_exist:%', v_maps; end if;
  delete from puzzle_pieces where image_id = p_image;
  insert into puzzle_pieces (image_id, row_idx, col_idx, x, y, w, h, svg_path, mask_path)
  select p_image, (e->>'row')::smallint, (e->>'col')::smallint, (e->>'x')::int, (e->>'y')::int,
         (e->>'w')::int, (e->>'h')::int, e->>'path', e->>'mask'
  from jsonb_array_elements(p_pieces) e;
  update story_images set piece_count = v_count, puzzle_seed = p_seed where id = p_image;
  insert into audit_logs (actor_id, action, target_type, target_id, details)
  values (auth.uid(), 'puzzle.generate', 'story_image', p_image::text,
          jsonb_build_object('pieces', v_count, 'seed', p_seed, 'dropped_mappings', v_maps));
  return v_count;
end $$;
revoke all on function save_image_pieces(uuid, bigint, jsonb, boolean) from public, anon;
grant execute on function save_image_pieces(uuid, bigint, jsonb, boolean) to authenticated;

-- The existing create_room implementation is replaced below by the same immutable-snapshot
-- implementation, with team limits read from platform_settings instead of literals.
drop function if exists create_room(uuid, int, int, boolean, text, boolean, boolean, text[], jsonb);
create or replace function create_room(
  p_story uuid, p_max_teams int, p_max_members int, p_private boolean, p_pin text,
  p_admin_joining boolean, p_players_create_teams boolean, p_team_names text[] default '{}', p_overrides jsonb default '{}'
) returns jsonb language plpgsql security definer set search_path = public as $$
declare s stories%rowtype; d platform_settings%rowtype; ss story_settings%rowtype;
        v_images int; v_id uuid := gen_random_uuid(); v_code text; v_settings jsonb; v_snap jsonb; v_content jsonb; n text;
begin
  if not has_permission('room.manage') then raise exception 'forbidden' using errcode = '42501'; end if;
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
  v_code := new_room_code(s.title);
  insert into rooms (id, code, story_id, is_private, has_pin, admin_controlled_joining, players_can_create_teams, max_teams, max_team_members, settings_snapshot, created_by)
  values (v_id, v_code, p_story, p_private, p_pin is not null, p_admin_joining, p_players_create_teams, p_max_teams, p_max_members, v_snap, auth.uid());
  insert into room_story_snapshots (room_id, content) values (v_id, v_content);
  if p_pin is not null then insert into room_secrets (room_id, pin_hash) values (v_id, encode(sha256(convert_to(p_pin || v_id::text, 'utf8')), 'hex')); end if;
  foreach n in array coalesce(p_team_names, '{}') loop
    if char_length(trim(n)) not between 1 and 40 then raise exception 'invalid_name'; end if;
    insert into teams (room_id, name) values (v_id, trim(n));
  end loop;
  insert into audit_logs (actor_id, action, target_type, target_id, details) values (auth.uid(), 'room.create', 'room', v_id::text, jsonb_build_object('code', v_code, 'story', p_story, 'overrides', coalesce(p_overrides, '{}'::jsonb)));
  return jsonb_build_object('id', v_id, 'code', v_code);
end $$;
revoke all on function create_room(uuid, int, int, boolean, text, boolean, boolean, text[], jsonb) from public, anon;
grant execute on function create_room(uuid, int, int, boolean, text, boolean, boolean, text[], jsonb) to authenticated;
