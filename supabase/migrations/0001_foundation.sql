-- 0001_foundation.sql
-- Interactive Story Puzzle: Phase 1 foundation (identity, stories, questions, rooms, game state, audit, RLS)
-- Design rules:
--   * Answer keys and question->piece mappings live in staff-only tables. Players never SELECT them.
--   * All gameplay writes (draw, answer, place, discard, score) happen in SECURITY DEFINER functions (Phase 4).
--   * Players have NO direct write access to game state tables.

create extension if not exists pgcrypto;

-- ============ ENUMS ============
create type app_role as enum ('SUPER_ADMIN','ADMIN','CONTENT_EDITOR','PLAYER');
create type story_status as enum ('DRAFT','PUBLISHED','ARCHIVED');
create type question_type as enum ('MULTIPLE_CHOICE','TRUE_FALSE','SHORT_TEXT');
create type room_status as enum ('WAITING','READY','COUNTDOWN','PLAYING','PAUSED','FINISHED','CANCELLED');
create type wrong_answer_policy as enum ('MINUS','RETRY','SKIP');
create type job_status as enum ('QUEUED','RUNNING','DONE','FAILED');

-- ============ IDENTITY ============
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 60),
  preferred_language text not null default 'en' check (preferred_language in ('en','ar')),
  created_at timestamptz not null default now()
);

create table user_roles (
  user_id uuid not null references auth.users(id) on delete cascade,
  role app_role not null,
  granted_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  primary key (user_id, role)
);

create table role_permissions (
  role app_role not null,
  permission text not null,
  primary key (role, permission)
);

insert into role_permissions (role, permission) values
 ('SUPER_ADMIN','*'),
 ('ADMIN','story.manage'),('ADMIN','room.manage'),('ADMIN','report.view'),('ADMIN','user.manage'),('ADMIN','game.control'),
 ('CONTENT_EDITOR','story.manage');

create or replace function has_permission(p text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from user_roles ur
    join role_permissions rp on rp.role = ur.role
    where ur.user_id = auth.uid() and (rp.permission = p or rp.permission = '*')
  );
$$;

-- Auto-create profile + PLAYER role on signup
create or replace function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, display_name) values (new.id, coalesce(new.raw_user_meta_data->>'display_name','Player'));
  insert into user_roles (user_id, role) values (new.id, 'PLAYER');
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function handle_new_user();

-- ============ STORIES ============
create table stories (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  cover_image_path text,
  category text,
  subject text,
  difficulty smallint not null default 1 check (difficulty between 1 and 5),
  language text not null default 'en' check (language in ('en','ar')),
  status story_status not null default 'DRAFT',
  final_narrative text,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Story-specific overrides. NULL = use platform default (platform_settings).
create table platform_settings (
  id boolean primary key default true check (id),  -- single row
  points_correct_place int not null default 10,
  points_wrong_place int not null default -10,
  points_wrong_discard int not null default -10,
  points_correct_discard int not null default 0,
  points_wrong_answer int not null default -10,
  wrong_answer_policy wrong_answer_policy not null default 'MINUS',
  max_attempts smallint not null default 1,
  reveal_answer_after_fail boolean not null default true,
  card_time_limit_seconds int,
  allow_multiple_questions_per_piece boolean not null default false,
  allow_deck_recycling boolean not null default false
);
insert into platform_settings default values;

create table story_settings (
  story_id uuid primary key references stories(id) on delete cascade,
  points_correct_place int, points_wrong_place int, points_wrong_discard int,
  points_correct_discard int, points_wrong_answer int,
  wrong_answer_policy wrong_answer_policy,
  max_attempts smallint, reveal_answer_after_fail boolean,
  card_time_limit_seconds int,
  allow_multiple_questions_per_piece boolean,
  allow_deck_recycling boolean
);

create table story_images (
  id uuid primary key default gen_random_uuid(),
  story_id uuid not null references stories(id) on delete cascade,
  position smallint not null check (position >= 1),
  title text not null,
  description text,
  hint text,
  storage_path text not null,
  width int not null check (width > 0),
  height int not null check (height > 0),
  piece_count smallint not null check (piece_count between 4 and 100),
  puzzle_seed bigint not null default (floor(random()*2147483647))::bigint,
  unique (story_id, position)
);

create table story_connections (
  id uuid primary key default gen_random_uuid(),
  story_id uuid not null references stories(id) on delete cascade,
  from_image_id uuid not null references story_images(id) on delete cascade,
  to_image_id uuid not null references story_images(id) on delete cascade,
  label text,
  check (from_image_id <> to_image_id)
);

create table puzzle_generation_jobs (
  id uuid primary key default gen_random_uuid(),
  image_id uuid not null references story_images(id) on delete cascade,
  status job_status not null default 'QUEUED',
  attempts smallint not null default 0,
  error text,
  created_at timestamptz not null default now(),
  finished_at timestamptz
);

create table puzzle_pieces (
  id uuid primary key default gen_random_uuid(),
  image_id uuid not null references story_images(id) on delete cascade,
  row_idx smallint not null,
  col_idx smallint not null,
  x int not null, y int not null, w int not null, h int not null,   -- bounding box in original image pixels
  svg_path text not null,                                            -- interlocking outline in original coordinates
  mask_path text,                                                    -- storage path of rendered piece PNG
  unique (image_id, row_idx, col_idx)
);

-- ============ QUESTIONS (staff-only; players get cards via server functions) ============
create table questions (
  id uuid primary key default gen_random_uuid(),
  story_id uuid not null references stories(id) on delete cascade,
  text text not null,
  type question_type not null,
  explanation text,
  hint text,
  difficulty smallint not null default 1 check (difficulty between 1 and 5),
  language text not null default 'en' check (language in ('en','ar')),
  media_path text,
  published boolean not null default false,
  created_at timestamptz not null default now()
);

create table question_options (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references questions(id) on delete cascade,
  position smallint not null,
  text text not null,
  unique (question_id, position)
);

-- Answer key, separated from questions so no player-facing view can leak it.
create table accepted_answers (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references questions(id) on delete cascade,
  answer_text text not null,
  option_id uuid references question_options(id) on delete cascade,
  is_primary boolean not null default false
);

-- Hidden relationship: question -> piece (and therefore image)
create table question_piece_mappings (
  question_id uuid not null references questions(id) on delete cascade,
  piece_id uuid not null references puzzle_pieces(id) on delete cascade,
  suggested_by_system boolean not null default false,
  approved boolean not null default false,
  primary key (question_id, piece_id)
);
create unique index one_mapping_per_question on question_piece_mappings(question_id);

-- ============ ROOMS ============
create table rooms (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[A-Z0-9]{2,4}-[A-Z0-9]{6}$'),
  story_id uuid not null references stories(id),
  status room_status not null default 'WAITING',
  is_private boolean not null default false,
  access_pin_hash text,
  admin_controlled_joining boolean not null default false,
  players_can_create_teams boolean not null default false,
  max_teams smallint not null check (max_teams between 2 and 12),
  max_team_members smallint not null check (max_team_members between 1 and 12),
  settings_snapshot jsonb not null,   -- immutable copy of story+settings taken at room creation
  created_by uuid not null references auth.users(id),
  started_at timestamptz, finished_at timestamptz,
  created_at timestamptz not null default now()
);

create table teams (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references rooms(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 40),
  is_ready boolean not null default false,
  captain_user_id uuid references auth.users(id),
  unique (room_id, name)
);

create table team_members (
  team_id uuid not null references teams(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  room_id uuid not null references rooms(id) on delete cascade,
  is_online boolean not null default true,
  joined_at timestamptz not null default now(),
  primary key (team_id, user_id),
  unique (room_id, user_id)            -- one team per user per room
);

create table team_captain_history (
  id bigint generated always as identity primary key,
  team_id uuid not null references teams(id) on delete cascade,
  from_user_id uuid, to_user_id uuid,
  reason text not null,
  created_at timestamptz not null default now()
);

-- ============ GAME STATE (written only by server functions) ============
create table team_game_states (
  team_id uuid primary key references teams(id) on delete cascade,
  assigned_image_id uuid references story_images(id),
  score int not null default 0,
  current_card_id uuid references questions(id),
  current_attempts smallint not null default 0,
  completed_at timestamptz,
  rank smallint
);
-- Atomic server-authoritative image selection: one team per image per room.
create table team_image_assignments (
  room_id uuid not null references rooms(id) on delete cascade,
  image_id uuid not null references story_images(id),
  team_id uuid not null references teams(id) on delete cascade,
  primary key (room_id, image_id),
  unique (room_id, team_id)
);

create table card_draws (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references teams(id) on delete cascade,
  question_id uuid not null references questions(id),
  drawn_at timestamptz not null default now(),
  unique (team_id, question_id)          -- no repeat draw unless recycling is handled by a new deck round
);

create table card_answers (
  id uuid primary key default gen_random_uuid(),
  draw_id uuid not null references card_draws(id) on delete cascade,
  submitted_by uuid not null references auth.users(id),
  answer_text text not null,
  is_correct boolean not null,
  idempotency_key uuid not null unique,
  created_at timestamptz not null default now()
);

create table card_decisions (
  id uuid primary key default gen_random_uuid(),
  draw_id uuid not null unique references card_draws(id) on delete cascade,   -- one decision per draw = no double scoring
  decision text not null check (decision in ('PLACE','DISCARD')),
  belongs_to_team_image boolean not null,
  points_delta int not null,
  idempotency_key uuid not null unique,
  created_at timestamptz not null default now()
);

create table team_piece_states (
  team_id uuid not null references teams(id) on delete cascade,
  piece_id uuid not null references puzzle_pieces(id),
  revealed_at timestamptz not null default now(),
  primary key (team_id, piece_id)         -- no duplicate reveals
);

create table game_events (
  id bigint generated always as identity primary key,
  room_id uuid not null references rooms(id) on delete cascade,
  team_id uuid references teams(id) on delete cascade,
  event_type text not null,
  payload jsonb not null default '{}',     -- must never contain answer keys or hidden mappings
  created_at timestamptz not null default now()
);
create index on game_events (room_id, id);

-- ============ AUDIT / SECURITY ============
create table audit_logs (
  id bigint generated always as identity primary key,
  actor_id uuid references auth.users(id),
  action text not null,
  target_type text, target_id text,
  details jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create table security_events (
  id bigint generated always as identity primary key,
  user_id uuid, room_id uuid,
  kind text not null, details jsonb not null default '{}',
  created_at timestamptz not null default now()
);

-- ============ HELPERS ============
create or replace function is_team_member(t uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from team_members where team_id = t and user_id = auth.uid());
$$;
create or replace function is_room_member(r uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from team_members where room_id = r and user_id = auth.uid());
$$;

-- ============ ROW LEVEL SECURITY ============
do $$
declare t text;
begin
  foreach t in array array[
    'profiles','user_roles','role_permissions','platform_settings','stories','story_settings','story_images',
    'story_connections','puzzle_generation_jobs','puzzle_pieces','questions','question_options','accepted_answers',
    'question_piece_mappings','rooms','teams','team_members','team_captain_history','team_game_states',
    'team_image_assignments','card_draws','card_answers','card_decisions','team_piece_states','game_events',
    'audit_logs','security_events']
  loop execute format('alter table %I enable row level security', t); end loop;
end $$;

-- Identity
create policy profiles_self on profiles for select using (id = auth.uid() or has_permission('user.manage'));
create policy profiles_update_self on profiles for update using (id = auth.uid()) with check (id = auth.uid());
create policy roles_read_self on user_roles for select using (user_id = auth.uid() or has_permission('user.manage'));
create policy roles_manage on user_roles for all using (has_permission('*')) with check (has_permission('*'));
create policy perms_read on role_permissions for select using (auth.uid() is not null);
create policy settings_read on platform_settings for select using (auth.uid() is not null);
create policy settings_write on platform_settings for update using (has_permission('*'));

-- Staff-only content (answer keys, mappings, pieces' geometry before a game)
create policy staff_all on stories for all using (has_permission('story.manage')) with check (has_permission('story.manage'));
create policy staff_all on story_settings for all using (has_permission('story.manage')) with check (has_permission('story.manage'));
create policy staff_all on story_images for all using (has_permission('story.manage')) with check (has_permission('story.manage'));
create policy staff_all on story_connections for all using (has_permission('story.manage')) with check (has_permission('story.manage'));
create policy staff_all on puzzle_generation_jobs for all using (has_permission('story.manage')) with check (has_permission('story.manage'));
create policy staff_all on puzzle_pieces for all using (has_permission('story.manage')) with check (has_permission('story.manage'));
create policy staff_all on questions for all using (has_permission('story.manage')) with check (has_permission('story.manage'));
create policy staff_all on question_options for all using (has_permission('story.manage')) with check (has_permission('story.manage'));
create policy staff_all on accepted_answers for all using (has_permission('story.manage')) with check (has_permission('story.manage'));
create policy staff_all on question_piece_mappings for all using (has_permission('story.manage')) with check (has_permission('story.manage'));

-- Published story titles/descriptions are safe for players to browse (no images, answers, or mappings).
create policy players_read_published on stories for select using (status = 'PUBLISHED');

-- Rooms: staff manage; members read their own room; public rooms visible only via join function (Phase 3)
create policy rooms_staff on rooms for all using (has_permission('room.manage')) with check (has_permission('room.manage'));
create policy rooms_member_read on rooms for select using (is_room_member(id));
create policy teams_staff on teams for all using (has_permission('room.manage')) with check (has_permission('room.manage'));
create policy teams_room_read on teams for select using (is_room_member(room_id));
create policy members_staff on team_members for all using (has_permission('room.manage')) with check (has_permission('room.manage'));
create policy members_room_read on team_members for select using (is_room_member(room_id));
create policy captain_hist_read on team_captain_history for select using (is_team_member(team_id) or has_permission('game.control'));

-- Game state: read-only for own team (and staff). NO insert/update/delete policies for players.
create policy tgs_read on team_game_states for select using (is_team_member(team_id) or has_permission('game.control'));
create policy tia_read on team_image_assignments for select using (is_room_member(room_id) or has_permission('game.control'));
create policy draws_read on card_draws for select using (is_team_member(team_id) or has_permission('game.control'));
create policy decisions_read on card_decisions for select using (
  exists (select 1 from card_draws d where d.id = draw_id and (is_team_member(d.team_id) or has_permission('game.control'))));
create policy tps_read on team_piece_states for select using (is_team_member(team_id) or has_permission('game.control'));
create policy events_read on game_events for select using (is_room_member(room_id) or has_permission('game.control'));
-- card_answers: staff only. The server returns correctness to the team through the answer function.
create policy answers_staff on card_answers for select using (has_permission('game.control'));

-- Audit & security: staff read only; writes happen via SECURITY DEFINER functions / service role.
create policy audit_read on audit_logs for select using (has_permission('report.view'));
create policy secev_read on security_events for select using (has_permission('report.view'));

-- ============ updated_at ============
create or replace function touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;
create trigger stories_touch before update on stories for each row execute function touch_updated_at();

-- Phase 3/4 TODO (SECURITY DEFINER functions, not in this migration):
--   create_room, join_room, select_image (insert into team_image_assignments, PK enforces atomicity),
--   draw_card, submit_answer, decide_card (place/discard, scoring, reveal in one transaction), transfer_captain.
