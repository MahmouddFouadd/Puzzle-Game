-- 0016: Bakasa – Hidden Spy party mode ("بكاسة – مين البِكس؟").
-- Server-authoritative: roles, the secret word, votes and scoring live in tables with RLS enabled and
-- NO select policies. Clients only see them through SECURITY DEFINER functions that return a player's
-- own role, aggregate vote progress, and the full reveal only after the round has ended.

create extension if not exists pgcrypto;

-- ---------- content ----------
create table if not exists bakasa_categories (
  id uuid primary key default gen_random_uuid(),
  key text not null unique check (key ~ '^[a-z0-9_]+$'),
  name_ar text not null check (char_length(trim(name_ar)) between 1 and 60),
  name_en text not null check (char_length(trim(name_en)) between 1 and 60),
  emoji text not null default '❓',
  color text not null default '#7c5cff' check (color ~ '^#[0-9a-fA-F]{6}$'),
  position int not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists bakasa_words (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references bakasa_categories(id) on delete cascade,
  word_ar text not null check (char_length(trim(word_ar)) between 1 and 60),
  word_en text not null default '' check (char_length(word_en) <= 60),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (category_id, word_ar)
);

-- ---------- rooms ----------
create table if not exists bakasa_rooms (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null check (char_length(trim(name)) between 1 and 60),
  host_id uuid not null references auth.users(id),
  status text not null default 'LOBBY' check (status in ('LOBBY','REVEAL','DISCUSSION','VOTING','GUESS','RESULT','FINISHED','CLOSED')),
  settings jsonb not null,
  round_no int not null default 0,
  current_round uuid,
  phase_ends_at timestamptz,
  turn_ends_at timestamptz,
  turn_idx int not null default 0,
  notice text,
  version bigint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists bakasa_players (
  room_id uuid not null references bakasa_rooms(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  nickname text not null check (char_length(trim(nickname)) between 1 and 30),
  avatar text not null default 'fox',
  seat int not null,
  is_ready boolean not null default false,
  status text not null default 'ACTIVE' check (status in ('ACTIVE','LEFT','KICKED')),
  score int not null default 0,
  last_seen timestamptz not null default now(),
  joined_at timestamptz not null default now(),
  primary key (room_id, user_id)
);
create index if not exists bakasa_players_user_idx on bakasa_players(user_id);

-- ---------- secret round data (no select policies) ----------
create table if not exists bakasa_rounds (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references bakasa_rooms(id) on delete cascade,
  round_no int not null,
  category_id uuid not null references bakasa_categories(id),
  word_id uuid not null references bakasa_words(id),
  turn_order uuid[] not null,
  revote int not null default 0,
  accused uuid,
  spy_caught boolean,
  guess_word_id uuid references bakasa_words(id),
  guess_correct boolean,
  winner text check (winner in ('PLAYERS','SPY','ABANDONED')),
  votes_summary jsonb,
  score_deltas jsonb,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  unique (room_id, round_no)
);

create table if not exists bakasa_roles (
  round_id uuid not null references bakasa_rounds(id) on delete cascade,
  user_id uuid not null,
  is_spy boolean not null,
  seen boolean not null default false,
  primary key (round_id, user_id)
);

create table if not exists bakasa_votes (
  round_id uuid not null references bakasa_rounds(id) on delete cascade,
  revote int not null default 0,
  voter_id uuid not null,
  suspect_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (round_id, revote, voter_id),
  check (voter_id <> suspect_id)
);

create table if not exists bakasa_messages (
  id bigint generated always as identity primary key,
  room_id uuid not null references bakasa_rooms(id) on delete cascade,
  round_id uuid not null references bakasa_rounds(id) on delete cascade,
  user_id uuid not null,
  body text not null check (char_length(trim(body)) between 1 and 200),
  created_at timestamptz not null default now()
);
create index if not exists bakasa_messages_round_idx on bakasa_messages(round_id, id);

-- ---------- RLS ----------
alter table bakasa_categories enable row level security;
alter table bakasa_words enable row level security;
alter table bakasa_rooms enable row level security;
alter table bakasa_players enable row level security;
alter table bakasa_rounds enable row level security;
alter table bakasa_roles enable row level security;
alter table bakasa_votes enable row level security;
alter table bakasa_messages enable row level security;

create or replace function bakasa_is_member(p_room uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from bakasa_players where room_id = p_room and user_id = auth.uid());
$$;

drop policy if exists bakasa_categories_read on bakasa_categories;
create policy bakasa_categories_read on bakasa_categories for select to anon, authenticated using (active or has_permission('story.manage'));
drop policy if exists bakasa_categories_admin on bakasa_categories;
create policy bakasa_categories_admin on bakasa_categories for all to authenticated using (has_permission('story.manage')) with check (has_permission('story.manage'));
drop policy if exists bakasa_words_admin on bakasa_words;
create policy bakasa_words_admin on bakasa_words for all to authenticated using (has_permission('story.manage')) with check (has_permission('story.manage'));
drop policy if exists bakasa_rooms_member on bakasa_rooms;
create policy bakasa_rooms_member on bakasa_rooms for select to authenticated using (bakasa_is_member(id));
drop policy if exists bakasa_players_member on bakasa_players;
create policy bakasa_players_member on bakasa_players for select to authenticated using (bakasa_is_member(room_id));
drop policy if exists bakasa_messages_member on bakasa_messages;
create policy bakasa_messages_member on bakasa_messages for select to authenticated using (bakasa_is_member(room_id));
-- bakasa_rounds, bakasa_roles, bakasa_votes: intentionally no policies.

-- ---------- helpers ----------
create or replace function bakasa_default_settings() returns jsonb language sql immutable as $$
  select jsonb_build_object('spies',1,'rounds',3,'reveal_seconds',15,'turn_seconds',45,'clue_laps',2,
    'discussion_seconds',300,'voting_seconds',60,'guess_seconds',30,'final_guess',true,'tie_rule','REVOTE',
    'allow_vote_change',true,'category_ids','[]'::jsonb,'min_players',3,'max_players',12);
$$;

create or replace function bakasa_clean_settings(p jsonb) returns jsonb
language plpgsql immutable as $$
declare d jsonb := bakasa_default_settings(); s jsonb := d || coalesce(p, '{}'::jsonb);
  clamp_int text[][] := array[['spies','1','3'],['rounds','1','10'],['reveal_seconds','5','60'],['turn_seconds','15','180'],
    ['clue_laps','1','4'],['discussion_seconds','60','1200'],['voting_seconds','20','300'],['guess_seconds','10','120'],
    ['min_players','3','20'],['max_players','3','20']];
  i int; v int;
begin
  for i in 1..array_length(clamp_int, 1) loop
    begin v := (s->>clamp_int[i][1])::int; exception when others then v := (d->>clamp_int[i][1])::int; end;
    v := greatest(clamp_int[i][2]::int, least(clamp_int[i][3]::int, coalesce(v, (d->>clamp_int[i][1])::int)));
    s := jsonb_set(s, array[clamp_int[i][1]], to_jsonb(v));
  end loop;
  if (s->>'max_players')::int < (s->>'min_players')::int then s := jsonb_set(s, '{max_players}', s->'min_players'); end if;
  if s->>'tie_rule' not in ('REVOTE','SPY_WINS') then s := jsonb_set(s, '{tie_rule}', '"REVOTE"'); end if;
  s := jsonb_set(s, '{final_guess}', to_jsonb(coalesce((s->>'final_guess')::boolean, true)));
  s := jsonb_set(s, '{allow_vote_change}', to_jsonb(coalesce((s->>'allow_vote_change')::boolean, true)));
  if jsonb_typeof(s->'category_ids') <> 'array' then s := jsonb_set(s, '{category_ids}', '[]'); end if;
  -- keep only known keys
  return (select jsonb_object_agg(k, s->k) from jsonb_object_keys(d) k);
end $$;

create or replace function bakasa_touch(p_room uuid, p_notice text default null) returns void
language sql security definer set search_path = public as $$
  update bakasa_rooms set version = version + 1, updated_at = now(), notice = coalesce(p_notice, notice) where id = p_room;
$$;

create or replace function bakasa_new_code() returns text language plpgsql as $$
declare alphabet text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; c text; i int;
begin
  loop
    c := 'BK-';
    for i in 1..6 loop c := c || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1); end loop;
    exit when not exists (select 1 from bakasa_rooms where code = c);
  end loop;
  return c;
end $$;

create or replace function bakasa_clean_avatar(p text) returns text language sql immutable as $$
  select case when p in ('fox','cat','owl','lion','panda','frog','bear','tiger','koala','monkey','penguin','unicorn') then p else 'fox' end;
$$;

-- ---------- lobby ----------
create or replace function bakasa_create_room(p_name text, p_nickname text, p_avatar text default 'fox', p_settings jsonb default '{}')
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_user uuid := auth.uid(); v_room uuid; v_code text;
begin
  if v_user is null then raise exception 'unauthorized'; end if;
  if char_length(trim(coalesce(p_nickname,''))) not between 1 and 30 then raise exception 'invalid_nickname'; end if;
  v_code := bakasa_new_code();
  insert into bakasa_rooms(code, name, host_id, settings)
  values (v_code, left(coalesce(nullif(trim(p_name),''), 'غرفة بكاسة'), 60), v_user, bakasa_clean_settings(p_settings))
  returning id into v_room;
  insert into bakasa_players(room_id, user_id, nickname, avatar, seat) values (v_room, v_user, trim(p_nickname), bakasa_clean_avatar(p_avatar), 1);
  return jsonb_build_object('room_id', v_room, 'code', v_code);
end $$;

create or replace function bakasa_preview_room(p_code text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare r bakasa_rooms%rowtype;
begin
  select * into r from bakasa_rooms where code = upper(trim(p_code));
  if not found or r.status = 'CLOSED' then return jsonb_build_object('found', false); end if;
  return jsonb_build_object('found', true, 'room_id', r.id, 'name', r.name, 'status', r.status,
    'host', (select nickname from bakasa_players where room_id = r.id and user_id = r.host_id),
    'players', (select count(*) from bakasa_players where room_id = r.id and status = 'ACTIVE'),
    'max_players', (r.settings->>'max_players')::int,
    'already_member', exists (select 1 from bakasa_players where room_id = r.id and user_id = auth.uid() and status <> 'KICKED'));
end $$;

create or replace function bakasa_join_room(p_code text, p_nickname text, p_avatar text default 'fox')
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_user uuid := auth.uid(); r bakasa_rooms%rowtype; p bakasa_players%rowtype; v_active int;
begin
  if v_user is null then raise exception 'unauthorized'; end if;
  if char_length(trim(coalesce(p_nickname,''))) not between 1 and 30 then raise exception 'invalid_nickname'; end if;
  select * into r from bakasa_rooms where code = upper(trim(p_code)) for update;
  if not found or r.status = 'CLOSED' then return jsonb_build_object('status','not_found'); end if;
  select * into p from bakasa_players where room_id = r.id and user_id = v_user;
  if found then
    if p.status = 'KICKED' then return jsonb_build_object('status','kicked'); end if;
    update bakasa_players set status = 'ACTIVE', nickname = trim(p_nickname), avatar = bakasa_clean_avatar(p_avatar), last_seen = now()
      where room_id = r.id and user_id = v_user;
    perform bakasa_touch(r.id);
    return jsonb_build_object('status','joined','room_id', r.id);
  end if;
  if r.status = 'FINISHED' then return jsonb_build_object('status','finished'); end if;
  select count(*) into v_active from bakasa_players where room_id = r.id and status = 'ACTIVE';
  if v_active >= (r.settings->>'max_players')::int then return jsonb_build_object('status','full'); end if;
  insert into bakasa_players(room_id, user_id, nickname, avatar, seat)
  values (r.id, v_user, trim(p_nickname), bakasa_clean_avatar(p_avatar), coalesce((select max(seat) from bakasa_players where room_id = r.id), 0) + 1);
  perform bakasa_touch(r.id, 'join:' || trim(p_nickname));
  return jsonb_build_object('status','joined','room_id', r.id);
end $$;

create or replace function bakasa_require_host(p_room uuid) returns bakasa_rooms
language plpgsql security definer set search_path = public as $$
declare r bakasa_rooms%rowtype;
begin
  select * into r from bakasa_rooms where id = p_room for update;
  if not found then raise exception 'room_not_found'; end if;
  if r.host_id <> auth.uid() then raise exception 'forbidden' using errcode = '42501'; end if;
  return r;
end $$;

create or replace function bakasa_set_ready(p_room uuid, p_ready boolean) returns void
language plpgsql security definer set search_path = public as $$
declare v_name text;
begin
  update bakasa_players set is_ready = p_ready, last_seen = now() where room_id = p_room and user_id = auth.uid() and status = 'ACTIVE'
  returning nickname into v_name;
  if v_name is null then raise exception 'not_member'; end if;
  perform bakasa_touch(p_room, case when p_ready then 'ready:' || v_name else null end);
end $$;

create or replace function bakasa_set_avatar(p_room uuid, p_avatar text) returns void
language plpgsql security definer set search_path = public as $$
begin
  update bakasa_players set avatar = bakasa_clean_avatar(p_avatar) where room_id = p_room and user_id = auth.uid();
  perform bakasa_touch(p_room);
end $$;

create or replace function bakasa_update_settings(p_room uuid, p_name text, p_settings jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare r bakasa_rooms%rowtype; s jsonb;
begin
  r := bakasa_require_host(p_room);
  if r.status not in ('LOBBY','RESULT') then raise exception 'round_in_progress'; end if;
  s := bakasa_clean_settings(p_settings);
  update bakasa_rooms set settings = s, name = left(coalesce(nullif(trim(p_name),''), name), 60) where id = p_room;
  update bakasa_players set is_ready = false where room_id = p_room and user_id <> r.host_id;
  perform bakasa_touch(p_room, 'settings');
  return s;
end $$;

create or replace function bakasa_transfer_host(p_room uuid, p_user uuid) returns void
language plpgsql security definer set search_path = public as $$
declare r bakasa_rooms%rowtype; v_name text;
begin
  r := bakasa_require_host(p_room);
  select nickname into v_name from bakasa_players where room_id = p_room and user_id = p_user and status = 'ACTIVE';
  if v_name is null then raise exception 'not_member'; end if;
  update bakasa_rooms set host_id = p_user where id = p_room;
  perform bakasa_touch(p_room, 'host:' || v_name);
end $$;

-- Ends a round without scoring when it can no longer be played fairly.
create or replace function bakasa_abandon_round(p_room uuid, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
declare r bakasa_rooms%rowtype;
begin
  select * into r from bakasa_rooms where id = p_room;
  if r.current_round is null or r.status not in ('REVEAL','DISCUSSION','VOTING','GUESS') then return; end if;
  update bakasa_rounds set winner = 'ABANDONED', ended_at = now(), score_deltas = '{}'::jsonb where id = r.current_round;
  update bakasa_rooms set status = case when round_no >= (settings->>'rounds')::int then 'FINISHED' else 'RESULT' end,
    phase_ends_at = null, turn_ends_at = null where id = p_room;
  perform bakasa_touch(p_room, 'abandoned:' || p_reason);
end $$;

-- After someone leaves mid-round: keep the round only if it is still fair.
create or replace function bakasa_check_round(p_room uuid) returns void
language plpgsql security definer set search_path = public as $$
declare r bakasa_rooms%rowtype; rd bakasa_rounds%rowtype; v_active int; v_spies int;
begin
  select * into r from bakasa_rooms where id = p_room;
  if r.current_round is null or r.status not in ('REVEAL','DISCUSSION','VOTING','GUESS') then return; end if;
  select * into rd from bakasa_rounds where id = r.current_round;
  select count(*) into v_active from bakasa_players where room_id = p_room and status = 'ACTIVE' and user_id = any(rd.turn_order);
  select count(*) into v_spies from bakasa_roles ro join bakasa_players p on p.room_id = p_room and p.user_id = ro.user_id and p.status = 'ACTIVE'
    where ro.round_id = rd.id and ro.is_spy;
  if v_active < 3 then perform bakasa_abandon_round(p_room, 'players');
  elsif v_spies = 0 then perform bakasa_abandon_round(p_room, 'spy_left'); end if;
end $$;

create or replace function bakasa_leave_room(p_room uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_user uuid := auth.uid(); r bakasa_rooms%rowtype; v_name text; v_next uuid;
begin
  select * into r from bakasa_rooms where id = p_room for update;
  if not found then return; end if;
  update bakasa_players set status = 'LEFT', is_ready = false where room_id = p_room and user_id = v_user and status = 'ACTIVE' returning nickname into v_name;
  if v_name is null then return; end if;
  if r.host_id = v_user then
    select user_id into v_next from bakasa_players where room_id = p_room and status = 'ACTIVE' order by seat limit 1;
    if v_next is null then update bakasa_rooms set status = 'CLOSED' where id = p_room;
    else update bakasa_rooms set host_id = v_next where id = p_room; end if;
  end if;
  perform bakasa_check_round(p_room);
  perform bakasa_touch(p_room, 'left:' || v_name);
end $$;

create or replace function bakasa_kick(p_room uuid, p_user uuid) returns void
language plpgsql security definer set search_path = public as $$
declare r bakasa_rooms%rowtype; v_name text;
begin
  r := bakasa_require_host(p_room);
  if p_user = r.host_id then raise exception 'cannot_kick_host'; end if;
  update bakasa_players set status = 'KICKED', is_ready = false where room_id = p_room and user_id = p_user returning nickname into v_name;
  perform bakasa_check_round(p_room);
  perform bakasa_touch(p_room, 'left:' || coalesce(v_name, ''));
end $$;

-- ---------- round lifecycle ----------
create or replace function bakasa_start_round(p_room uuid) returns void
language plpgsql security definer set search_path = public as $$
declare r bakasa_rooms%rowtype; v_players uuid[]; v_n int; v_spies int; v_cat uuid; v_word uuid; v_round uuid; v_not_ready int;
begin
  r := bakasa_require_host(p_room);
  if r.status not in ('LOBBY','RESULT') then raise exception 'round_in_progress'; end if;
  if r.round_no >= (r.settings->>'rounds')::int then raise exception 'match_finished'; end if;
  select array_agg(user_id order by random()) into v_players from bakasa_players where room_id = p_room and status = 'ACTIVE';
  v_n := coalesce(array_length(v_players, 1), 0);
  if v_n < greatest(3, (r.settings->>'min_players')::int) then raise exception 'not_enough_players'; end if;
  if r.status = 'LOBBY' then
    select count(*) into v_not_ready from bakasa_players where room_id = p_room and status = 'ACTIVE' and not is_ready and user_id <> r.host_id;
    if v_not_ready > 0 then raise exception 'players_not_ready'; end if;
  end if;
  v_spies := least((r.settings->>'spies')::int, greatest(1, (v_n - 1) / 2));
  select c.id into v_cat from bakasa_categories c
   where c.active and exists (select 1 from bakasa_words w where w.category_id = c.id and w.active)
     and (jsonb_array_length(r.settings->'category_ids') = 0 or c.id::text in (select jsonb_array_elements_text(r.settings->'category_ids')))
   order by random() limit 1;
  if v_cat is null then raise exception 'no_words_available'; end if;
  -- avoid repeating a word already used in this room when possible
  select w.id into v_word from bakasa_words w where w.category_id = v_cat and w.active
   order by (w.id in (select word_id from bakasa_rounds where room_id = p_room)), random() limit 1;
  insert into bakasa_rounds(room_id, round_no, category_id, word_id, turn_order)
  values (p_room, r.round_no + 1, v_cat, v_word, v_players) returning id into v_round;
  insert into bakasa_roles(round_id, user_id, is_spy)
  select v_round, u, i <= v_spies from (select u, row_number() over (order by random()) i from unnest(v_players) u) x;
  update bakasa_rooms set status = 'REVEAL', round_no = round_no + 1, current_round = v_round, turn_idx = 0,
    phase_ends_at = now() + make_interval(secs => (settings->>'reveal_seconds')::int), turn_ends_at = null where id = p_room;
  update bakasa_players set is_ready = false where room_id = p_room;
  perform bakasa_touch(p_room, 'round_started');
end $$;

-- Returns only the caller's own role. Marks it as seen.
create or replace function bakasa_my_role(p_room uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare r bakasa_rooms%rowtype; ro bakasa_roles%rowtype; rd bakasa_rounds%rowtype; w bakasa_words%rowtype; c bakasa_categories%rowtype;
begin
  select * into r from bakasa_rooms where id = p_room;
  if r.current_round is null then return jsonb_build_object('in_round', false); end if;
  select * into ro from bakasa_roles where round_id = r.current_round and user_id = auth.uid();
  if not found then return jsonb_build_object('in_round', false); end if;
  select * into rd from bakasa_rounds where id = r.current_round;
  select * into c from bakasa_categories where id = rd.category_id;
  if not ro.seen then
    update bakasa_roles set seen = true where round_id = ro.round_id and user_id = ro.user_id;
  end if;
  if ro.is_spy then
    return jsonb_build_object('in_round', true, 'is_spy', true, 'category_ar', c.name_ar, 'category_en', c.name_en, 'emoji', c.emoji, 'color', c.color);
  end if;
  select * into w from bakasa_words where id = rd.word_id;
  return jsonb_build_object('in_round', true, 'is_spy', false, 'word_ar', w.word_ar, 'word_en', w.word_en,
    'category_ar', c.name_ar, 'category_en', c.name_en, 'emoji', c.emoji, 'color', c.color);
end $$;

create or replace function bakasa_current_turn(p_room uuid) returns uuid
language plpgsql stable security definer set search_path = public as $$
declare r bakasa_rooms%rowtype; rd bakasa_rounds%rowtype; n int;
begin
  select * into r from bakasa_rooms where id = p_room;
  if r.status <> 'DISCUSSION' then return null; end if;
  select * into rd from bakasa_rounds where id = r.current_round;
  n := array_length(rd.turn_order, 1);
  return rd.turn_order[(r.turn_idx % n) + 1];
end $$;

create or replace function bakasa_begin_voting(p_room uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  update bakasa_rooms set status = 'VOTING', turn_ends_at = null,
    phase_ends_at = now() + make_interval(secs => (settings->>'voting_seconds')::int) where id = p_room;
  perform bakasa_touch(p_room, 'voting');
end $$;

-- Move the discussion turn forward, skipping players who left. Ends discussion after the configured laps.
create or replace function bakasa_next_turn(p_room uuid) returns void
language plpgsql security definer set search_path = public as $$
declare r bakasa_rooms%rowtype; rd bakasa_rounds%rowtype; n int; total int; idx int; guard int := 0;
begin
  select * into r from bakasa_rooms where id = p_room;
  select * into rd from bakasa_rounds where id = r.current_round;
  n := array_length(rd.turn_order, 1); total := n * (r.settings->>'clue_laps')::int;
  idx := r.turn_idx + 1;
  while idx < total and guard < n and not exists (
    select 1 from bakasa_players where room_id = p_room and user_id = rd.turn_order[(idx % n) + 1] and status = 'ACTIVE') loop
    idx := idx + 1; guard := guard + 1;
  end loop;
  if idx >= total then
    update bakasa_rooms set turn_idx = idx where id = p_room;
    perform bakasa_begin_voting(p_room);
  else
    update bakasa_rooms set turn_idx = idx, turn_ends_at = now() + make_interval(secs => (settings->>'turn_seconds')::int) where id = p_room;
    perform bakasa_touch(p_room);
  end if;
end $$;

create or replace function bakasa_post_clue(p_room uuid, p_body text) returns void
language plpgsql security definer set search_path = public as $$
declare r bakasa_rooms%rowtype;
begin
  select * into r from bakasa_rooms where id = p_room for update;
  if r.status <> 'DISCUSSION' then raise exception 'wrong_phase'; end if;
  if bakasa_current_turn(p_room) is distinct from auth.uid() then raise exception 'not_your_turn'; end if;
  if char_length(trim(coalesce(p_body,''))) not between 1 and 200 then raise exception 'invalid_message'; end if;
  insert into bakasa_messages(room_id, round_id, user_id, body) values (p_room, r.current_round, auth.uid(), trim(p_body));
  perform bakasa_next_turn(p_room);
end $$;

-- Final scoring for the round.
create or replace function bakasa_finish_round(p_room uuid) returns void
language plpgsql security definer set search_path = public as $$
declare r bakasa_rooms%rowtype; rd bakasa_rounds%rowtype; v_winner text; deltas jsonb := '{}'::jsonb; rec record; d int;
begin
  select * into r from bakasa_rooms where id = p_room;
  select * into rd from bakasa_rounds where id = r.current_round;
  if not coalesce(rd.spy_caught, false) then v_winner := 'SPY';
  elsif coalesce(rd.guess_correct, false) then v_winner := 'SPY';
  else v_winner := 'PLAYERS'; end if;
  for rec in
    select ro.user_id, ro.is_spy,
      exists (select 1 from bakasa_votes v join bakasa_roles s on s.round_id = v.round_id and s.user_id = v.suspect_id and s.is_spy
              where v.round_id = rd.id and v.revote = rd.revote and v.voter_id = ro.user_id) as voted_spy
    from bakasa_roles ro where ro.round_id = rd.id
  loop
    d := 0;
    if rec.is_spy then
      d := case when not coalesce(rd.spy_caught, false) then 3 when coalesce(rd.guess_correct, false) then 2 else 0 end;
    else
      d := (case when v_winner = 'PLAYERS' then 2 else 0 end) + (case when rec.voted_spy then 1 else 0 end);
    end if;
    deltas := deltas || jsonb_build_object(rec.user_id::text, d);
    update bakasa_players set score = score + d where room_id = p_room and user_id = rec.user_id;
  end loop;
  update bakasa_rounds set winner = v_winner, ended_at = now(), score_deltas = deltas where id = rd.id;
  update bakasa_rooms set status = case when round_no >= (settings->>'rounds')::int then 'FINISHED' else 'RESULT' end,
    phase_ends_at = null, turn_ends_at = null where id = p_room;
  perform bakasa_touch(p_room, 'result');
end $$;

create or replace function bakasa_tally(p_room uuid) returns void
language plpgsql security definer set search_path = public as $$
declare r bakasa_rooms%rowtype; rd bakasa_rounds%rowtype; v_summary jsonb; v_top int; v_tied uuid[]; v_accused uuid; v_is_spy boolean;
begin
  select * into r from bakasa_rooms where id = p_room;
  select * into rd from bakasa_rounds where id = r.current_round;
  select coalesce(jsonb_object_agg(suspect_id::text, n), '{}'::jsonb), coalesce(max(n), 0) into v_summary, v_top
    from (select suspect_id, count(*) n from bakasa_votes where round_id = rd.id and revote = rd.revote group by suspect_id) x;
  select array_agg(suspect_id) into v_tied from (select suspect_id from bakasa_votes where round_id = rd.id and revote = rd.revote
    group by suspect_id having count(*) = v_top) x;
  update bakasa_rounds set votes_summary = v_summary where id = rd.id;
  if v_top = 0 or array_length(v_tied, 1) > 1 then
    if r.settings->>'tie_rule' = 'REVOTE' and rd.revote = 0 then
      update bakasa_rounds set revote = 1 where id = rd.id;
      update bakasa_rooms set phase_ends_at = now() + make_interval(secs => (settings->>'voting_seconds')::int) where id = p_room;
      perform bakasa_touch(p_room, 'tie_revote');
      return;
    end if;
    update bakasa_rounds set accused = null, spy_caught = false where id = rd.id;
    perform bakasa_finish_round(p_room);
    return;
  end if;
  v_accused := v_tied[1];
  select is_spy into v_is_spy from bakasa_roles where round_id = rd.id and user_id = v_accused;
  update bakasa_rounds set accused = v_accused, spy_caught = coalesce(v_is_spy, false) where id = rd.id;
  if coalesce(v_is_spy, false) and (r.settings->>'final_guess')::boolean then
    update bakasa_rooms set status = 'GUESS', phase_ends_at = now() + make_interval(secs => (settings->>'guess_seconds')::int) where id = p_room;
    perform bakasa_touch(p_room, 'spy_caught');
  else
    perform bakasa_finish_round(p_room);
  end if;
end $$;

create or replace function bakasa_vote(p_room uuid, p_suspect uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_user uuid := auth.uid(); r bakasa_rooms%rowtype; rd bakasa_rounds%rowtype; v_eligible int; v_cast int;
begin
  select * into r from bakasa_rooms where id = p_room for update;
  if r.status <> 'VOTING' then raise exception 'wrong_phase'; end if;
  select * into rd from bakasa_rounds where id = r.current_round;
  if not (v_user = any(rd.turn_order)) or not exists (select 1 from bakasa_players where room_id = p_room and user_id = v_user and status = 'ACTIVE') then raise exception 'not_in_round'; end if;
  if p_suspect = v_user then raise exception 'cannot_vote_self'; end if;
  if not (p_suspect = any(rd.turn_order)) then raise exception 'invalid_suspect'; end if;
  if (r.settings->>'allow_vote_change')::boolean then
    insert into bakasa_votes(round_id, revote, voter_id, suspect_id) values (rd.id, rd.revote, v_user, p_suspect)
    on conflict (round_id, revote, voter_id) do update set suspect_id = excluded.suspect_id, created_at = now();
  else
    insert into bakasa_votes(round_id, revote, voter_id, suspect_id) values (rd.id, rd.revote, v_user, p_suspect);
  end if;
  select count(*) into v_eligible from bakasa_players where room_id = p_room and status = 'ACTIVE' and user_id = any(rd.turn_order);
  select count(*) into v_cast from bakasa_votes v join bakasa_players p on p.room_id = p_room and p.user_id = v.voter_id and p.status = 'ACTIVE'
    where v.round_id = rd.id and v.revote = rd.revote;
  if v_cast >= v_eligible then perform bakasa_tally(p_room); else perform bakasa_touch(p_room); end if;
exception when unique_violation then raise exception 'already_voted';
end $$;

create or replace function bakasa_guess_options(p_room uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare r bakasa_rooms%rowtype; rd bakasa_rounds%rowtype;
begin
  select * into r from bakasa_rooms where id = p_room;
  if r.status <> 'GUESS' then raise exception 'wrong_phase'; end if;
  select * into rd from bakasa_rounds where id = r.current_round;
  if rd.accused is distinct from auth.uid() then raise exception 'forbidden' using errcode = '42501'; end if;
  return (select jsonb_agg(jsonb_build_object('id', id, 'word_ar', word_ar, 'word_en', word_en) order by md5(id::text || rd.id::text))
    from (select id, word_ar, word_en from bakasa_words where id = rd.word_id
          union all
          (select id, word_ar, word_en from bakasa_words where category_id = rd.category_id and active and id <> rd.word_id order by random() limit 5)) x);
end $$;

create or replace function bakasa_spy_guess(p_room uuid, p_word uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare r bakasa_rooms%rowtype; rd bakasa_rounds%rowtype; v_ok boolean;
begin
  select * into r from bakasa_rooms where id = p_room for update;
  if r.status <> 'GUESS' then raise exception 'wrong_phase'; end if;
  select * into rd from bakasa_rounds where id = r.current_round;
  if rd.accused is distinct from auth.uid() then raise exception 'forbidden' using errcode = '42501'; end if;
  if not exists (select 1 from bakasa_words where id = p_word and category_id = rd.category_id) then raise exception 'invalid_guess'; end if;
  v_ok := p_word = rd.word_id;
  update bakasa_rounds set guess_word_id = p_word, guess_correct = v_ok where id = rd.id;
  perform bakasa_finish_round(p_room);
  return jsonb_build_object('correct', v_ok);
end $$;

-- Deadline-driven transitions. Any member may call it (clients do on timers); host may force the next step.
create or replace function bakasa_advance(p_room uuid, p_force boolean default false) returns void
language plpgsql security definer set search_path = public as $$
declare r bakasa_rooms%rowtype; v_is_host boolean; v_unseen int;
begin
  select * into r from bakasa_rooms where id = p_room for update;
  if not found or not bakasa_is_member(p_room) then raise exception 'forbidden' using errcode = '42501'; end if;
  v_is_host := r.host_id = auth.uid();
  if p_force and not v_is_host then raise exception 'forbidden' using errcode = '42501'; end if;
  if r.status = 'REVEAL' then
    select count(*) into v_unseen from bakasa_roles ro join bakasa_players p on p.room_id = p_room and p.user_id = ro.user_id and p.status = 'ACTIVE'
      where ro.round_id = r.current_round and not ro.seen;
    if p_force or now() >= r.phase_ends_at or v_unseen = 0 then
      update bakasa_rooms set status = 'DISCUSSION', turn_idx = -1,
        phase_ends_at = now() + make_interval(secs => (settings->>'discussion_seconds')::int) where id = p_room;
      perform bakasa_next_turn(p_room);
      perform bakasa_touch(p_room, 'discussion');
    end if;
  elsif r.status = 'DISCUSSION' then
    if (p_force and v_is_host) or now() >= r.phase_ends_at then perform bakasa_begin_voting(p_room);
    elsif r.turn_ends_at is not null and now() >= r.turn_ends_at then perform bakasa_next_turn(p_room); end if;
  elsif r.status = 'VOTING' then
    if p_force or now() >= r.phase_ends_at then perform bakasa_tally(p_room); end if;
  elsif r.status = 'GUESS' then
    if p_force or now() >= r.phase_ends_at then
      update bakasa_rounds set guess_correct = false where id = r.current_round;
      perform bakasa_finish_round(p_room);
    end if;
  end if;
end $$;

-- Host skips the current speaker (e.g. they are away).
create or replace function bakasa_skip_turn(p_room uuid) returns void
language plpgsql security definer set search_path = public as $$
declare r bakasa_rooms%rowtype;
begin
  r := bakasa_require_host(p_room);
  if r.status <> 'DISCUSSION' then raise exception 'wrong_phase'; end if;
  perform bakasa_next_turn(p_room);
end $$;

-- Public room state. Never contains roles or the word until the round has ended.
create or replace function bakasa_state(p_room uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_user uuid := auth.uid(); r bakasa_rooms%rowtype; rd bakasa_rounds%rowtype; c bakasa_categories%rowtype; w bakasa_words%rowtype;
  gw bakasa_words%rowtype; v_round jsonb := null; v_reveal jsonb := null; v_ended boolean;
begin
  if not bakasa_is_member(p_room) then raise exception 'forbidden' using errcode = '42501'; end if;
  update bakasa_players set last_seen = now() where room_id = p_room and user_id = v_user and status = 'ACTIVE';
  select * into r from bakasa_rooms where id = p_room;
  if r.current_round is not null then
    select * into rd from bakasa_rounds where id = r.current_round;
    select * into c from bakasa_categories where id = rd.category_id;
    v_ended := rd.ended_at is not null;
    if v_ended then
      select * into w from bakasa_words where id = rd.word_id;
      select * into gw from bakasa_words where id = rd.guess_word_id;
      v_reveal := jsonb_build_object('spy_ids', (select jsonb_agg(user_id) from bakasa_roles where round_id = rd.id and is_spy),
        'word_ar', w.word_ar, 'word_en', w.word_en, 'accused', rd.accused, 'spy_caught', rd.spy_caught,
        'guess_ar', gw.word_ar, 'guess_en', gw.word_en, 'guess_correct', rd.guess_correct, 'winner', rd.winner,
        'votes', coalesce(rd.votes_summary, '{}'::jsonb), 'score_deltas', coalesce(rd.score_deltas, '{}'::jsonb),
        'duration_seconds', extract(epoch from rd.ended_at - rd.started_at)::int);
    end if;
    v_round := jsonb_build_object('id', rd.id, 'round_no', rd.round_no, 'turn_order', to_jsonb(rd.turn_order), 'revote', rd.revote,
      'category_ar', c.name_ar, 'category_en', c.name_en, 'emoji', c.emoji, 'color', c.color,
      'current_turn', bakasa_current_turn(p_room),
      'in_round', v_user = any(rd.turn_order),
      'accused', case when r.status in ('GUESS') or v_ended then rd.accused end,
      'messages', coalesce((select jsonb_agg(jsonb_build_object('id', m.id, 'user_id', m.user_id, 'body', m.body, 'at', m.created_at) order by m.id)
                            from bakasa_messages m where m.round_id = rd.id), '[]'::jsonb),
      'votes_cast', (select count(*) from bakasa_votes where round_id = rd.id and revote = rd.revote),
      'voters_total', (select count(*) from bakasa_players where room_id = p_room and status = 'ACTIVE' and user_id = any(rd.turn_order)),
      'my_vote', (select suspect_id from bakasa_votes where round_id = rd.id and revote = rd.revote and voter_id = v_user),
      'reveal', v_reveal);
  end if;
  return jsonb_build_object('me', v_user, 'server_now', now(),
    'room', jsonb_build_object('id', r.id, 'code', r.code, 'name', r.name, 'host_id', r.host_id, 'status', r.status, 'settings', r.settings,
      'round_no', r.round_no, 'phase_ends_at', r.phase_ends_at, 'turn_ends_at', r.turn_ends_at, 'notice', r.notice, 'version', r.version),
    'players', (select coalesce(jsonb_agg(jsonb_build_object('user_id', p.user_id, 'nickname', p.nickname, 'avatar', p.avatar, 'seat', p.seat,
      'is_ready', p.is_ready, 'status', p.status, 'score', p.score, 'online', p.last_seen > now() - interval '25 seconds') order by p.seat), '[]'::jsonb)
      from bakasa_players p where p.room_id = p_room and p.status <> 'KICKED'),
    'round', v_round);
end $$;

-- Match history for the caller.
create or replace function bakasa_my_history() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(x order by x->>'created_at' desc), '[]'::jsonb) from (
    select jsonb_build_object('room_id', r.id, 'name', r.name, 'code', r.code, 'created_at', r.created_at, 'status', r.status,
      'rounds', (select count(*) from bakasa_rounds rd where rd.room_id = r.id and rd.ended_at is not null),
      'players', (select count(*) from bakasa_players p2 where p2.room_id = r.id and p2.status <> 'KICKED'),
      'my_score', me.score,
      'winner', (select nickname from bakasa_players p3 where p3.room_id = r.id and p3.status <> 'KICKED' order by score desc, seat limit 1),
      'top_score', (select max(score) from bakasa_players p4 where p4.room_id = r.id and p4.status <> 'KICKED'),
      'spy_wins', (select count(*) from bakasa_rounds rd where rd.room_id = r.id and rd.winner = 'SPY'),
      'player_wins', (select count(*) from bakasa_rounds rd where rd.room_id = r.id and rd.winner = 'PLAYERS')) x
    from bakasa_players me join bakasa_rooms r on r.id = me.room_id
    where me.user_id = auth.uid() and r.round_no > 0
    order by r.created_at desc limit 50) t;
$$;

-- Pass-the-phone deck: one random word plus guess options. The device holder sees everything anyway.
create or replace function bakasa_local_deck(p_category uuid default null) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare c bakasa_categories%rowtype; w bakasa_words%rowtype;
begin
  select * into c from bakasa_categories cc where cc.active and (p_category is null or cc.id = p_category)
    and exists (select 1 from bakasa_words ww where ww.category_id = cc.id and ww.active) order by random() limit 1;
  if not found then raise exception 'no_words_available'; end if;
  select * into w from bakasa_words where category_id = c.id and active order by random() limit 1;
  return jsonb_build_object('category_ar', c.name_ar, 'category_en', c.name_en, 'emoji', c.emoji, 'color', c.color,
    'word_id', w.id, 'word_ar', w.word_ar, 'word_en', w.word_en,
    'options', (select jsonb_agg(jsonb_build_object('id', id, 'word_ar', word_ar, 'word_en', word_en) order by random()) from (
      select id, word_ar, word_en from bakasa_words where id = w.id
      union all (select id, word_ar, word_en from bakasa_words where category_id = c.id and active and id <> w.id order by random() limit 5)) o));
end $$;

-- Admin overview for the categories screen.
create or replace function bakasa_admin_categories() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not has_permission('story.manage') then raise exception 'forbidden' using errcode = '42501'; end if;
  return (select coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'key', c.key, 'name_ar', c.name_ar, 'name_en', c.name_en, 'emoji', c.emoji,
    'color', c.color, 'active', c.active, 'position', c.position,
    'words', (select coalesce(jsonb_agg(jsonb_build_object('id', w.id, 'word_ar', w.word_ar, 'word_en', w.word_en, 'active', w.active) order by w.word_ar), '[]'::jsonb)
              from bakasa_words w where w.category_id = c.id)) order by c.position, c.name_ar), '[]'::jsonb) from bakasa_categories c);
end $$;

-- ---------- grants ----------
revoke all on bakasa_rounds, bakasa_roles, bakasa_votes from anon, authenticated;
revoke insert, update, delete on bakasa_rooms, bakasa_players, bakasa_messages from anon, authenticated;
do $$ declare f text; begin
  foreach f in array array['bakasa_touch(uuid,text)','bakasa_require_host(uuid)','bakasa_abandon_round(uuid,text)','bakasa_check_round(uuid)',
    'bakasa_next_turn(uuid)','bakasa_begin_voting(uuid)','bakasa_finish_round(uuid)','bakasa_tally(uuid)','bakasa_new_code()'] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
  end loop;
end $$;
grant execute on function bakasa_local_deck(uuid) to anon, authenticated;

-- ---------- realtime ----------
do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin alter publication supabase_realtime add table bakasa_rooms, bakasa_players, bakasa_messages; exception when duplicate_object then null; end;
  end if;
end $$;

-- ---------- starter content ----------
insert into bakasa_categories(key, name_ar, name_en, emoji, color, position) values
  ('food','أكلات','Food','🍲','#ff8a3d',1), ('places','أماكن','Places','🏙️','#3dc5ff',2), ('animals','حيوانات','Animals','🦁','#7bd96a',3),
  ('sports','رياضة','Sports','⚽','#ffd23d',4), ('jobs','مهن','Jobs','👩‍⚕️','#c77dff',5), ('home','حاجات البيت','Home items','🛋️','#ff6fa8',6),
  ('transport','مواصلات','Transport','🚌','#4dd6c1',7), ('fruits','فواكه وخضار','Fruits & veg','🍉','#ff5d5d',8)
on conflict (key) do nothing;

insert into bakasa_words(category_id, word_ar, word_en)
select c.id, w.ar, w.en from bakasa_categories c join (values
  ('food','كشري','Koshari'),('food','فول','Foul'),('food','طعمية','Falafel'),('food','ملوخية','Molokhia'),('food','محشي','Stuffed vegetables'),
  ('food','فتة','Fatta'),('food','بيتزا','Pizza'),('food','شاورما','Shawarma'),('food','كبدة','Liver sandwich'),('food','حواوشي','Hawawshi'),
  ('food','مكرونة بشاميل','Béchamel pasta'),('food','بسبوسة','Basbousa'),('food','كنافة','Kunafa'),('food','أرز باللبن','Rice pudding'),('food','فطير مشلتت','Feteer'),
  ('places','المدرسة','School'),('places','المستشفى','Hospital'),('places','البحر','Beach'),('places','المطار','Airport'),('places','السوبر ماركت','Supermarket'),
  ('places','المكتبة','Library'),('places','السينما','Cinema'),('places','الحديقة','Park'),('places','الأهرامات','Pyramids'),('places','محطة القطار','Train station'),
  ('places','الملعب','Stadium'),('places','المطعم','Restaurant'),('places','الجامعة','University'),('places','الصيدلية','Pharmacy'),('places','حديقة الحيوان','Zoo'),
  ('animals','أسد','Lion'),('animals','زرافة','Giraffe'),('animals','فيل','Elephant'),('animals','قطة','Cat'),('animals','كلب','Dog'),
  ('animals','جمل','Camel'),('animals','حصان','Horse'),('animals','بطريق','Penguin'),('animals','تمساح','Crocodile'),('animals','قرد','Monkey'),
  ('animals','دولفين','Dolphin'),('animals','نملة','Ant'),('animals','بومة','Owl'),('animals','أرنب','Rabbit'),('animals','سلحفاة','Turtle'),
  ('sports','كرة القدم','Football'),('sports','كرة السلة','Basketball'),('sports','السباحة','Swimming'),('sports','التنس','Tennis'),('sports','الجري','Running'),
  ('sports','ركوب الدراجة','Cycling'),('sports','الكاراتيه','Karate'),('sports','الاسكواش','Squash'),('sports','كرة اليد','Handball'),('sports','الشطرنج','Chess'),
  ('sports','الجمباز','Gymnastics'),('sports','الملاكمة','Boxing'),('sports','كرة الطائرة','Volleyball'),('sports','تنس الطاولة','Table tennis'),('sports','الغطس','Diving'),
  ('jobs','دكتور','Doctor'),('jobs','مدرس','Teacher'),('jobs','مهندس','Engineer'),('jobs','طيار','Pilot'),('jobs','شيف','Chef'),
  ('jobs','ظابط','Police officer'),('jobs','رسام','Painter'),('jobs','نجار','Carpenter'),('jobs','صحفي','Journalist'),('jobs','مذيع','Presenter'),
  ('jobs','فلاح','Farmer'),('jobs','حلاق','Barber'),('jobs','رائد فضاء','Astronaut'),('jobs','مطافئ','Firefighter'),('jobs','صيدلي','Pharmacist'),
  ('home','ثلاجة','Fridge'),('home','غسالة','Washing machine'),('home','تلفزيون','TV'),('home','كنبة','Sofa'),('home','مروحة','Fan'),
  ('home','سرير','Bed'),('home','مخدة','Pillow'),('home','مكنسة','Broom'),('home','شماعة','Hanger'),('home','مرآة','Mirror'),
  ('home','بوتاجاز','Stove'),('home','خلاط','Blender'),('home','ستارة','Curtain'),('home','سجادة','Carpet'),('home','ساعة حائط','Wall clock'),
  ('transport','أتوبيس','Bus'),('transport','مترو','Metro'),('transport','تاكسي','Taxi'),('transport','توك توك','Tuk-tuk'),('transport','قطر','Train'),
  ('transport','طيارة','Plane'),('transport','مركب','Boat'),('transport','عجلة','Bicycle'),('transport','موتوسيكل','Motorcycle'),('transport','ميكروباص','Microbus'),
  ('transport','حنطور','Horse carriage'),('transport','عربية إسعاف','Ambulance'),('transport','سفينة','Ship'),('transport','تلفريك','Cable car'),('transport','سكوتر','Scooter'),
  ('fruits','مانجو','Mango'),('fruits','بطيخ','Watermelon'),('fruits','موز','Banana'),('fruits','برتقال','Orange'),('fruits','عنب','Grapes'),
  ('fruits','فراولة','Strawberry'),('fruits','تفاح','Apple'),('fruits','جوافة','Guava'),('fruits','طماطم','Tomato'),('fruits','خيار','Cucumber'),
  ('fruits','بطاطس','Potato'),('fruits','جزر','Carrot'),('fruits','رمان','Pomegranate'),('fruits','تين','Fig'),('fruits','بلح','Dates')
) as w(cat, ar, en) on w.cat = c.key
on conflict (category_id, word_ar) do nothing;
