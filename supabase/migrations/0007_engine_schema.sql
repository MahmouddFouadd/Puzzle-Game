-- 0007_engine_schema.sql  (Milestone 4, part 1: schema for the game engine)
-- Adds: recovery/rescue + failover settings, immutable room story snapshot, card lifecycle, score ledger,
--       idempotency keys, team states, presence, event visibility, revealed-piece storage access.
-- Decision: game history stores plain ids (no foreign keys into story tables). The room snapshot is the authority,
--           so later story edits can never break or alter a finished or running game.

-- ---------- new rule settings (platform default + story override) ----------
alter table platform_settings
  add column max_recycle_cycles smallint not null default 1 check (max_recycle_cycles between 0 and 5),
  add column rescue_enabled boolean not null default false,
  add column max_rescue_draws smallint not null default 2 check (max_rescue_draws between 0 and 10),
  add column rescue_cost_points int not null default 0 check (rescue_cost_points between 0 and 1000),  -- points DEDUCTED per rescue draw
  add column rescue_cards_repeatable boolean not null default false,
  add column captain_grace_seconds smallint not null default 20 check (captain_grace_seconds between 5 and 300);

alter table story_settings
  add column max_recycle_cycles smallint check (max_recycle_cycles is null or max_recycle_cycles between 0 and 5),
  add column rescue_enabled boolean,
  add column max_rescue_draws smallint check (max_rescue_draws is null or max_rescue_draws between 0 and 10),
  add column rescue_cost_points int check (rescue_cost_points is null or rescue_cost_points between 0 and 1000),
  add column rescue_cards_repeatable boolean,
  add column captain_grace_seconds smallint check (captain_grace_seconds is null or captain_grace_seconds between 5 and 300);

-- ---------- enums and columns ----------
create type team_state as enum ('ACTIVE', 'COMPLETED', 'ABANDONED', 'DISQUALIFIED');
create type card_state as enum ('DRAWN', 'ANSWER_CORRECT', 'ANSWER_INCORRECT', 'PLACED_CORRECTLY', 'PLACED_INCORRECTLY', 'DISCARDED_CORRECTLY', 'DISCARDED_INCORRECTLY');
alter table teams add column state team_state not null default 'ACTIVE';
alter table team_members add column last_seen_at timestamptz not null default now();

-- history keeps ids, not foreign keys into editable story tables
alter table team_game_states drop constraint if exists team_game_states_assigned_image_id_fkey;
alter table team_game_states drop constraint if exists team_game_states_current_card_id_fkey;
alter table team_image_assignments drop constraint if exists team_image_assignments_image_id_fkey;
alter table card_draws drop constraint if exists card_draws_question_id_fkey;
alter table card_draws drop constraint if exists card_draws_team_id_question_id_key;
alter table team_piece_states drop constraint if exists team_piece_states_piece_id_fkey;

alter table team_game_states add column deck_cycle int not null default 1;

alter table card_draws
  add column room_id uuid not null references rooms(id) on delete cascade,
  add column state card_state not null default 'DRAWN',
  add column kind text not null default 'NORMAL' check (kind in ('NORMAL', 'RECYCLED', 'RESCUE')),
  add column cycle int not null default 1,
  add column attempts smallint not null default 0,
  add column closed_at timestamptz,
  add column recycled_at timestamptz;
create unique index card_draws_unique_per_cycle on card_draws (team_id, question_id, cycle) where kind <> 'RESCUE';
create unique index card_draws_one_open on card_draws (team_id) where state in ('DRAWN', 'ANSWER_CORRECT');
create index card_draws_team_idx on card_draws (team_id, drawn_at);

alter table card_answers add column attempt_no smallint not null default 1;
alter table card_decisions add column decided_by uuid references auth.users(id), add column result_state card_state;

alter table team_piece_states
  add column room_id uuid not null references rooms(id) on delete cascade,
  add column image_id uuid not null, add column row_idx smallint not null, add column col_idx smallint not null,
  add column x int not null, add column y int not null, add column w int not null, add column h int not null,
  add column svg_path text not null, add column mask_path text not null, add column draw_id uuid;

alter table game_events add column visibility text not null default 'ROOM' check (visibility in ('ROOM', 'TEAM'));
drop policy events_read on game_events;
create policy events_read on game_events for select using (
  has_permission('game.control')
  or (visibility = 'ROOM' and is_room_member(room_id))
  or (visibility = 'TEAM' and team_id is not null and is_team_member(team_id)));

-- ---------- new tables ----------
create table room_story_snapshots (
  room_id uuid primary key references rooms(id) on delete cascade,
  content jsonb not null,               -- full story: images, pieces, questions, answer keys, mappings (NEVER readable by players)
  created_at timestamptz not null default now()
);
alter table room_story_snapshots enable row level security;
create policy snapshots_staff_read on room_story_snapshots for select using (has_permission('game.control'));

create table idempotency_keys (
  user_id uuid not null, key uuid not null, fn text not null, result jsonb not null, created_at timestamptz not null default now(),
  primary key (user_id, key)
);
alter table idempotency_keys enable row level security;

create table team_recovery_states (
  team_id uuid primary key references teams(id) on delete cascade,
  status text not null default 'NONE' check (status in ('NONE', 'DETECTED', 'RESCUE_AVAILABLE', 'SOFTLOCKED')),
  cycles_used smallint not null default 0, rescue_used smallint not null default 0,
  detected_at timestamptz, updated_at timestamptz not null default now()
);
alter table team_recovery_states enable row level security;
create policy recovery_staff_read on team_recovery_states for select using (has_permission('game.control'));

create table score_ledger (
  id bigint generated always as identity primary key,
  room_id uuid not null references rooms(id) on delete cascade,
  team_id uuid not null references teams(id) on delete cascade,
  event_type text not null,
  draw_id uuid, decision_id uuid,
  points int not null, previous_score int not null, new_score int not null,
  actor uuid, reason text,
  created_at timestamptz not null default clock_timestamp()
);
create index score_ledger_team_idx on score_ledger (team_id, id);
alter table score_ledger enable row level security;
create policy ledger_read on score_ledger for select using (is_team_member(team_id) or has_permission('game.control'));

-- ledger and audit history are append-only (cascade deletes from a parent room are allowed)
create or replace function forbid_mutation() returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' and pg_trigger_depth() > 1 then return old; end if;
  raise exception 'immutable_history';
end $$;
create trigger ledger_immutable before update or delete on score_ledger for each row execute function forbid_mutation();
create trigger audit_immutable before update or delete on audit_logs for each row execute function forbid_mutation();

-- ---------- players may read only the piece images their team has revealed ----------
create policy team_revealed_pieces_read on storage.objects for select to authenticated using (
  bucket_id = 'story-pieces' and exists (
    select 1 from team_piece_states s join team_members m on m.team_id = s.team_id
    where m.user_id = auth.uid() and s.mask_path = storage.objects.name));

-- ---------- settings validation (room-level overrides) ----------
create or replace function check_int(v jsonb, lo int, hi int) returns void language plpgsql immutable as $$
begin
  if jsonb_typeof(v) <> 'number' then raise exception 'invalid_settings'; end if;
  if (v #>> '{}')::numeric <> trunc((v #>> '{}')::numeric) or (v #>> '{}')::numeric < lo or (v #>> '{}')::numeric > hi then raise exception 'invalid_settings'; end if;
end $$;

create or replace function validate_settings_json(p jsonb) returns void language plpgsql immutable as $$
declare k text; v jsonb;
begin
  for k, v in select * from jsonb_each(p) loop
    if k in ('points_correct_place', 'points_wrong_place', 'points_correct_discard', 'points_wrong_discard', 'points_wrong_answer') then perform check_int(v, -1000, 1000);
    elsif k = 'wrong_answer_policy' then
      if jsonb_typeof(v) <> 'string' or (v #>> '{}') not in ('MINUS', 'RETRY', 'SKIP') then raise exception 'invalid_settings'; end if;
    elsif k = 'max_attempts' then perform check_int(v, 1, 10);
    elsif k = 'card_time_limit_seconds' then
      if jsonb_typeof(v) <> 'null' then perform check_int(v, 0, 3600); if (v #>> '{}')::int between 1 and 4 then raise exception 'invalid_settings'; end if; end if;
    elsif k = 'max_recycle_cycles' then perform check_int(v, 0, 5);
    elsif k = 'max_rescue_draws' then perform check_int(v, 0, 10);
    elsif k = 'rescue_cost_points' then perform check_int(v, 0, 1000);
    elsif k = 'captain_grace_seconds' then perform check_int(v, 5, 300);
    elsif k in ('reveal_answer_after_fail', 'allow_multiple_questions_per_piece', 'allow_deck_recycling', 'rescue_enabled', 'rescue_cards_repeatable') then
      if jsonb_typeof(v) <> 'boolean' then raise exception 'invalid_settings'; end if;
    else raise exception 'invalid_settings'; end if;
  end loop;
end $$;

-- ---------- create_room v2: three-level settings + full immutable snapshot ----------
drop function create_room(uuid, int, int, boolean, text, boolean, boolean, text[]);
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
  select count(*) into v_images from story_images where story_id = p_story;
  if v_images < 2 then raise exception 'story_needs_two_images'; end if;
  if p_max_teams < 2 or p_max_teams > v_images then raise exception 'invalid_team_count'; end if;
  if p_max_members not between 1 and 12 then raise exception 'invalid_member_limit'; end if;
  if p_pin is not null and p_pin !~ '^[0-9]{4,8}$' then raise exception 'invalid_pin'; end if;
  if p_private and p_pin is null then raise exception 'pin_required'; end if;
  if coalesce(array_length(p_team_names, 1), 0) > p_max_teams then raise exception 'too_many_teams'; end if;
  perform validate_settings_json(coalesce(p_overrides, '{}'::jsonb));

  select * into d from platform_settings limit 1;
  select * into ss from story_settings where story_id = p_story;
  -- level 1 platform default, level 2 story override, level 3 room override
  v_settings := jsonb_build_object(
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
    'allow_deck_recycling', coalesce(ss.allow_deck_recycling, d.allow_deck_recycling),
    'max_recycle_cycles', coalesce(ss.max_recycle_cycles, d.max_recycle_cycles),
    'rescue_enabled', coalesce(ss.rescue_enabled, d.rescue_enabled),
    'max_rescue_draws', coalesce(ss.max_rescue_draws, d.max_rescue_draws),
    'rescue_cost_points', coalesce(ss.rescue_cost_points, d.rescue_cost_points),
    'rescue_cards_repeatable', coalesce(ss.rescue_cards_repeatable, d.rescue_cards_repeatable),
    'captain_grace_seconds', coalesce(ss.captain_grace_seconds, d.captain_grace_seconds));
  v_settings := v_settings || coalesce(p_overrides, '{}'::jsonb);
  if v_settings->>'card_time_limit_seconds' = '0' then v_settings := jsonb_set(v_settings, '{card_time_limit_seconds}', 'null'::jsonb); end if;

  -- player-safe summary (readable by room members)
  v_snap := jsonb_build_object(
    'story', jsonb_build_object('id', s.id, 'title', s.title, 'language', s.language),
    'settings', v_settings,
    'images', (select jsonb_agg(jsonb_build_object('id', id, 'position', position, 'hint', hint, 'piece_count', piece_count) order by position)
               from story_images where story_id = p_story));

  -- full snapshot (answers, mappings, geometry): staff/definer only
  select jsonb_build_object(
    'story', jsonb_build_object('id', s.id, 'title', s.title, 'description', s.description, 'language', s.language, 'final_narrative', s.final_narrative),
    'images', (select coalesce(jsonb_agg(jsonb_build_object('id', i.id, 'position', i.position, 'title', i.title, 'description', i.description, 'hint', i.hint,
                 'storage_path', i.storage_path, 'width', i.width, 'height', i.height, 'piece_count', i.piece_count, 'seed', i.puzzle_seed) order by i.position), '[]'::jsonb)
               from story_images i where i.story_id = s.id),
    'pieces', (select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'image_id', p.image_id, 'row', p.row_idx, 'col', p.col_idx,
                 'x', p.x, 'y', p.y, 'w', p.w, 'h', p.h, 'path', p.svg_path, 'mask', p.mask_path)), '[]'::jsonb)
               from puzzle_pieces p join story_images i on i.id = p.image_id where i.story_id = s.id),
    'questions', (select coalesce(jsonb_agg(jsonb_build_object('id', q.id, 'text', q.text, 'type', q.type, 'explanation', q.explanation, 'hint', q.hint, 'piece_id', m.piece_id,
                    'options', (select coalesce(jsonb_agg(jsonb_build_object('id', o.id, 'position', o.position, 'text', o.text) order by o.position), '[]'::jsonb) from question_options o where o.question_id = q.id),
                    'answers', (select coalesce(jsonb_agg(jsonb_build_object('text', a.answer_text, 'option_id', a.option_id, 'primary', a.is_primary) order by a.is_primary desc), '[]'::jsonb) from accepted_answers a where a.question_id = q.id))), '[]'::jsonb)
                  from questions q join question_piece_mappings m on m.question_id = q.id and m.approved where q.story_id = s.id and q.published),
    'connections', (select coalesce(jsonb_agg(jsonb_build_object('from', c.from_image_id, 'to', c.to_image_id, 'label', c.label)), '[]'::jsonb) from story_connections c where c.story_id = s.id))
  into v_content;

  v_code := new_room_code(s.title);
  insert into rooms (id, code, story_id, is_private, has_pin, admin_controlled_joining, players_can_create_teams,
                     max_teams, max_team_members, settings_snapshot, created_by)
  values (v_id, v_code, p_story, p_private, p_pin is not null, p_admin_joining, p_players_create_teams, p_max_teams, p_max_members, v_snap, auth.uid());
  insert into room_story_snapshots (room_id, content) values (v_id, v_content);
  if p_pin is not null then
    insert into room_secrets (room_id, pin_hash) values (v_id, encode(sha256(convert_to(p_pin || v_id::text, 'utf8')), 'hex'));
  end if;
  foreach n in array coalesce(p_team_names, '{}') loop
    if char_length(trim(n)) not between 1 and 40 then raise exception 'invalid_name'; end if;
    insert into teams (room_id, name) values (v_id, trim(n));
  end loop;
  insert into audit_logs (actor_id, action, target_type, target_id, details)
  values (auth.uid(), 'room.create', 'room', v_id::text, jsonb_build_object('code', v_code, 'story', p_story, 'overrides', coalesce(p_overrides, '{}'::jsonb)));
  return jsonb_build_object('id', v_id, 'code', v_code);
end $$;
revoke all on function create_room(uuid, int, int, boolean, text, boolean, boolean, text[], jsonb) from public, anon;
grant execute on function create_room(uuid, int, int, boolean, text, boolean, boolean, text[], jsonb) to authenticated;
revoke all on function validate_settings_json(jsonb), check_int(jsonb, int, int) from public, anon, authenticated;
