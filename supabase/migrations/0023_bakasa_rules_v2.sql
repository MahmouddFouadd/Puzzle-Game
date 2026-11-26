-- 0023: Bakasa rules v2 (as played in the Egyptian party game)
--  * Questions in pairs: "Ahmed, ask Fathi". One lap = every player asks once. Afterwards the host chooses
--    another lap of questions or voting. No global discussion deadline; per-pair timer only.
--  * Individual secret votes; every player who votes for a spy scores.
--  * After voting EVERY spy gets to guess the word from 12 options (not only when caught).
--  * Scoring: correct vote +2; spy +1 per player who did not vote for a spy; spy +3 for guessing the word.
--  * Ties no longer trigger revotes (votes are scored individually).

alter table bakasa_rooms add column if not exists q_lap int not null default 1;
alter table bakasa_rooms add column if not exists questions_done boolean not null default false;
alter table bakasa_rounds add column if not exists guesses jsonb not null default '{}'::jsonb;
alter table bakasa_messages add column if not exists kind text not null default 'CLUE' check (kind in ('CLUE','QUESTION','ANSWER'));
alter table bakasa_messages add column if not exists target uuid;
alter table bakasa_messages add column if not exists turn_key text;

-- Current asker/target pair. Lap L: asker i asks player i+offset (offset cycles 1..n-1, never themselves).
create or replace function bakasa_current_pair(p_room uuid) returns uuid[]
language plpgsql stable security definer set search_path = public as $$
declare r bakasa_rooms%rowtype; rd bakasa_rounds%rowtype; n int; off int;
begin
  select * into r from bakasa_rooms where id = p_room;
  if r.status <> 'DISCUSSION' or r.questions_done or r.current_round is null then return null; end if;
  select * into rd from bakasa_rounds where id = r.current_round;
  n := array_length(rd.turn_order, 1);
  if n < 2 or r.turn_idx < 0 or r.turn_idx >= n then return null; end if;
  off := ((r.q_lap - 1) % (n - 1)) + 1;
  return array[rd.turn_order[r.turn_idx + 1], rd.turn_order[((r.turn_idx + off) % n) + 1]];
end $$;

create or replace function bakasa_current_turn(p_room uuid) returns uuid
language sql stable security definer set search_path = public as $$ select (bakasa_current_pair(p_room))[1]; $$;

create or replace function bakasa_next_turn(p_room uuid) returns void
language plpgsql security definer set search_path = public as $$
declare r bakasa_rooms%rowtype; rd bakasa_rounds%rowtype; n int; idx int; off int; a uuid; t uuid;
begin
  select * into r from bakasa_rooms where id = p_room;
  select * into rd from bakasa_rounds where id = r.current_round;
  n := array_length(rd.turn_order, 1); off := ((r.q_lap - 1) % greatest(1, n - 1)) + 1;
  idx := r.turn_idx + 1;
  while idx < n loop
    a := rd.turn_order[idx + 1]; t := rd.turn_order[((idx + off) % n) + 1];
    exit when exists (select 1 from bakasa_players where room_id = p_room and user_id = a and status = 'ACTIVE')
          and exists (select 1 from bakasa_players where room_id = p_room and user_id = t and status = 'ACTIVE');
    idx := idx + 1;
  end loop;
  if idx >= n then
    update bakasa_rooms set turn_idx = n, questions_done = true, turn_ends_at = null where id = p_room;
    perform bakasa_touch(p_room, 'questions_done');
  else
    update bakasa_rooms set turn_idx = idx, turn_ends_at = now() + make_interval(secs => (settings->>'turn_seconds')::int) where id = p_room;
    perform bakasa_touch(p_room);
  end if;
end $$;

-- Asker writes the question, target writes the answer (online play). Spoken play uses bakasa_pair_done.
create or replace function bakasa_post_clue(p_room uuid, p_body text) returns void
language plpgsql security definer set search_path = public as $$
declare r bakasa_rooms%rowtype; pair uuid[]; v_key text; v_has_q boolean;
begin
  select * into r from bakasa_rooms where id = p_room for update;
  if r.status <> 'DISCUSSION' then raise exception 'wrong_phase'; end if;
  pair := bakasa_current_pair(p_room);
  if pair is null then raise exception 'wrong_phase'; end if;
  if char_length(trim(coalesce(p_body, ''))) not between 1 and 200 then raise exception 'invalid_message'; end if;
  v_key := r.q_lap || ':' || r.turn_idx;
  v_has_q := exists (select 1 from bakasa_messages where round_id = r.current_round and turn_key = v_key and kind = 'QUESTION');
  if auth.uid() = pair[1] and not v_has_q then
    insert into bakasa_messages(room_id, round_id, user_id, body, kind, target, turn_key) values (p_room, r.current_round, auth.uid(), trim(p_body), 'QUESTION', pair[2], v_key);
    update bakasa_rooms set turn_ends_at = now() + make_interval(secs => (settings->>'turn_seconds')::int) where id = p_room;
    perform bakasa_touch(p_room);
  elsif auth.uid() = pair[2] and v_has_q then
    insert into bakasa_messages(room_id, round_id, user_id, body, kind, target, turn_key) values (p_room, r.current_round, auth.uid(), trim(p_body), 'ANSWER', pair[1], v_key);
    perform bakasa_next_turn(p_room);
  else
    raise exception 'not_your_turn';
  end if;
end $$;

create or replace function bakasa_pair_done(p_room uuid) returns void
language plpgsql security definer set search_path = public as $$
declare r bakasa_rooms%rowtype; pair uuid[];
begin
  select * into r from bakasa_rooms where id = p_room for update;
  pair := bakasa_current_pair(p_room);
  if pair is null then raise exception 'wrong_phase'; end if;
  if not (auth.uid() = any(pair) or auth.uid() = r.host_id) then raise exception 'not_your_turn'; end if;
  perform bakasa_next_turn(p_room);
end $$;

create or replace function bakasa_more_questions(p_room uuid) returns void
language plpgsql security definer set search_path = public as $$
declare r bakasa_rooms%rowtype;
begin
  r := bakasa_require_host(p_room);
  if r.status <> 'DISCUSSION' or not r.questions_done then raise exception 'wrong_phase'; end if;
  update bakasa_rooms set q_lap = q_lap + 1, questions_done = false, turn_idx = -1 where id = p_room;
  perform bakasa_next_turn(p_room);
  perform bakasa_touch(p_room, 'more_questions');
end $$;

create or replace function bakasa_skip_turn(p_room uuid) returns void
language plpgsql security definer set search_path = public as $$
declare r bakasa_rooms%rowtype;
begin
  r := bakasa_require_host(p_room);
  if r.status <> 'DISCUSSION' or r.questions_done then raise exception 'wrong_phase'; end if;
  perform bakasa_next_turn(p_room);
end $$;

-- Scoring v2.
create or replace function bakasa_finish_round(p_room uuid) returns void
language plpgsql security definer set search_path = public as $$
declare r bakasa_rooms%rowtype; rd bakasa_rounds%rowtype; v_winner text; deltas jsonb := '{}'::jsonb; rec record; d int; v_fooled int; v_any_guess boolean;
begin
  select * into r from bakasa_rooms where id = p_room;
  select * into rd from bakasa_rounds where id = r.current_round;
  -- players (non-spies, still active) who did NOT vote for a spy
  select count(*) into v_fooled from bakasa_roles ro join bakasa_players p on p.room_id = p_room and p.user_id = ro.user_id and p.status = 'ACTIVE'
   where ro.round_id = rd.id and not ro.is_spy and not exists (select 1 from bakasa_votes v join bakasa_roles s on s.round_id = v.round_id and s.user_id = v.suspect_id and s.is_spy
     where v.round_id = rd.id and v.voter_id = ro.user_id);
  v_any_guess := exists (select 1 from jsonb_each(rd.guesses) g where (g.value->>'correct')::boolean);
  for rec in
    select ro.user_id, ro.is_spy,
      exists (select 1 from bakasa_votes v join bakasa_roles s on s.round_id = v.round_id and s.user_id = v.suspect_id and s.is_spy
              where v.round_id = rd.id and v.voter_id = ro.user_id) as voted_spy,
      coalesce((rd.guesses->(ro.user_id::text)->>'correct')::boolean, false) as guessed
    from bakasa_roles ro where ro.round_id = rd.id
  loop
    if rec.is_spy then d := v_fooled + case when rec.guessed then 3 else 0 end;
    else d := case when rec.voted_spy then 2 else 0 end; end if;
    deltas := deltas || jsonb_build_object(rec.user_id::text, d);
    if d <> 0 then update bakasa_players set score = score + d where room_id = p_room and user_id = rec.user_id; end if;
  end loop;
  v_winner := case when coalesce(rd.spy_caught, false) and not v_any_guess then 'PLAYERS' else 'SPY' end;
  update bakasa_rounds set winner = v_winner, ended_at = now(), score_deltas = deltas, guess_correct = v_any_guess,
    guess_word_id = coalesce(guess_word_id, (select (g.value->>'word_id')::uuid from jsonb_each(rd.guesses) g limit 1)) where id = rd.id;
  update bakasa_rooms set status = case when round_no >= (settings->>'rounds')::int then 'FINISHED' else 'RESULT' end,
    phase_ends_at = null, turn_ends_at = null where id = p_room;
  perform bakasa_touch(p_room, 'result');
end $$;

create or replace function bakasa_tally(p_room uuid) returns void
language plpgsql security definer set search_path = public as $$
declare r bakasa_rooms%rowtype; rd bakasa_rounds%rowtype; v_summary jsonb; v_top int; v_tied uuid[]; v_accused uuid;
begin
  select * into r from bakasa_rooms where id = p_room;
  select * into rd from bakasa_rounds where id = r.current_round;
  select coalesce(jsonb_object_agg(suspect_id::text, n), '{}'::jsonb), coalesce(max(n), 0) into v_summary, v_top
    from (select suspect_id, count(*) n from bakasa_votes where round_id = rd.id group by suspect_id) x;
  select array_agg(suspect_id) into v_tied from (select suspect_id from bakasa_votes where round_id = rd.id group by suspect_id having count(*) = v_top) x;
  v_accused := case when v_top > 0 and array_length(v_tied, 1) = 1 then v_tied[1] end;
  update bakasa_rounds set votes_summary = v_summary, accused = v_accused,
    spy_caught = coalesce((select is_spy from bakasa_roles where round_id = rd.id and user_id = v_accused), false) where id = rd.id;
  if (r.settings->>'final_guess')::boolean and exists (select 1 from bakasa_roles ro join bakasa_players p on p.room_id = p_room and p.user_id = ro.user_id and p.status = 'ACTIVE' where ro.round_id = rd.id and ro.is_spy) then
    update bakasa_rooms set status = 'GUESS', phase_ends_at = now() + make_interval(secs => (settings->>'guess_seconds')::int) where id = p_room;
    perform bakasa_touch(p_room, 'spy_guess');
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
    insert into bakasa_votes(round_id, revote, voter_id, suspect_id) values (rd.id, 0, v_user, p_suspect)
    on conflict (round_id, revote, voter_id) do update set suspect_id = excluded.suspect_id, created_at = now();
  else
    insert into bakasa_votes(round_id, revote, voter_id, suspect_id) values (rd.id, 0, v_user, p_suspect);
  end if;
  select count(*) into v_eligible from bakasa_players where room_id = p_room and status = 'ACTIVE' and user_id = any(rd.turn_order);
  select count(*) into v_cast from bakasa_votes v join bakasa_players p on p.room_id = p_room and p.user_id = v.voter_id and p.status = 'ACTIVE' where v.round_id = rd.id;
  if v_cast >= v_eligible then perform bakasa_tally(p_room); else perform bakasa_touch(p_room); end if;
exception when unique_violation then raise exception 'already_voted';
end $$;

-- 12 options from the same category for every spy in the round.
create or replace function bakasa_guess_options(p_room uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare r bakasa_rooms%rowtype; rd bakasa_rounds%rowtype;
begin
  select * into r from bakasa_rooms where id = p_room;
  if r.status <> 'GUESS' then raise exception 'wrong_phase'; end if;
  select * into rd from bakasa_rounds where id = r.current_round;
  if not exists (select 1 from bakasa_roles where round_id = rd.id and user_id = auth.uid() and is_spy) then raise exception 'forbidden' using errcode = '42501'; end if;
  return (select jsonb_agg(jsonb_build_object('id', id, 'word_ar', word_ar, 'word_en', word_en) order by md5(id::text || rd.id::text))
    from (select id, word_ar, word_en from bakasa_words where id = rd.word_id
          union all
          (select id, word_ar, word_en from bakasa_words where category_id = rd.category_id and active and id <> rd.word_id order by md5(id::text || rd.id::text) limit 11)) x);
end $$;

create or replace function bakasa_spy_guess(p_room uuid, p_word uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare r bakasa_rooms%rowtype; rd bakasa_rounds%rowtype; v_ok boolean; v_left int;
begin
  select * into r from bakasa_rooms where id = p_room for update;
  if r.status <> 'GUESS' then raise exception 'wrong_phase'; end if;
  select * into rd from bakasa_rounds where id = r.current_round;
  if not exists (select 1 from bakasa_roles where round_id = rd.id and user_id = auth.uid() and is_spy) then raise exception 'forbidden' using errcode = '42501'; end if;
  if rd.guesses ? auth.uid()::text then raise exception 'already_guessed'; end if;
  if not exists (select 1 from bakasa_words where id = p_word and category_id = rd.category_id) then raise exception 'invalid_guess'; end if;
  v_ok := p_word = rd.word_id;
  update bakasa_rounds set guesses = guesses || jsonb_build_object(auth.uid()::text, jsonb_build_object('word_id', p_word, 'correct', v_ok)) where id = rd.id;
  select count(*) into v_left from bakasa_roles ro join bakasa_players p on p.room_id = p_room and p.user_id = ro.user_id and p.status = 'ACTIVE'
   where ro.round_id = rd.id and ro.is_spy and not ((select guesses from bakasa_rounds where id = rd.id) ? ro.user_id::text);
  if v_left = 0 then perform bakasa_finish_round(p_room); else perform bakasa_touch(p_room); end if;
  return jsonb_build_object('correct', v_ok);
end $$;

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
      update bakasa_rooms set status = 'DISCUSSION', turn_idx = -1, q_lap = 1, questions_done = false, phase_ends_at = null where id = p_room;
      perform bakasa_next_turn(p_room);
      perform bakasa_touch(p_room, 'discussion');
    end if;
  elsif r.status = 'DISCUSSION' then
    if p_force and v_is_host then perform bakasa_begin_voting(p_room);
    elsif not r.questions_done and r.turn_ends_at is not null and now() >= r.turn_ends_at then perform bakasa_next_turn(p_room); end if;
  elsif r.status = 'VOTING' then
    if p_force or now() >= r.phase_ends_at then perform bakasa_tally(p_room); end if;
  elsif r.status = 'GUESS' then
    if p_force or now() >= r.phase_ends_at then perform bakasa_finish_round(p_room); end if;
  end if;
end $$;

-- Public state v2 (adds pair, questions_done, message kinds, guess progress; reveal adds per-spy guesses).
create or replace function bakasa_state(p_room uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_user uuid := auth.uid(); r bakasa_rooms%rowtype; rd bakasa_rounds%rowtype; c bakasa_categories%rowtype; w bakasa_words%rowtype;
  v_round jsonb := null; v_reveal jsonb := null; v_ended boolean; pair uuid[];
begin
  if not bakasa_is_member(p_room) then raise exception 'forbidden' using errcode = '42501'; end if;
  update bakasa_players set last_seen = now() where room_id = p_room and user_id = v_user and status = 'ACTIVE';
  select * into r from bakasa_rooms where id = p_room;
  if r.current_round is not null then
    select * into rd from bakasa_rounds where id = r.current_round;
    select * into c from bakasa_categories where id = rd.category_id;
    v_ended := rd.ended_at is not null;
    pair := bakasa_current_pair(p_room);
    if v_ended then
      select * into w from bakasa_words where id = rd.word_id;
      v_reveal := jsonb_build_object('spy_ids', (select jsonb_agg(user_id) from bakasa_roles where round_id = rd.id and is_spy),
        'word_ar', w.word_ar, 'word_en', w.word_en, 'accused', rd.accused, 'spy_caught', rd.spy_caught,
        'guess_ar', (select word_ar from bakasa_words where id = rd.guess_word_id), 'guess_en', (select word_en from bakasa_words where id = rd.guess_word_id),
        'guess_correct', rd.guess_correct, 'winner', rd.winner,
        'guesses', coalesce((select jsonb_object_agg(g.key, jsonb_build_object('correct', (g.value->>'correct')::boolean,
            'word_ar', (select word_ar from bakasa_words where id = (g.value->>'word_id')::uuid), 'word_en', (select word_en from bakasa_words where id = (g.value->>'word_id')::uuid)))
          from jsonb_each(rd.guesses) g), '{}'::jsonb),
        'votes', coalesce(rd.votes_summary, '{}'::jsonb), 'score_deltas', coalesce(rd.score_deltas, '{}'::jsonb),
        'ballots', coalesce((select jsonb_object_agg(voter_id::text, suspect_id) from bakasa_votes where round_id = rd.id), '{}'::jsonb),
        'duration_seconds', extract(epoch from rd.ended_at - rd.started_at)::int);
    end if;
    v_round := jsonb_build_object('id', rd.id, 'round_no', rd.round_no, 'turn_order', to_jsonb(rd.turn_order), 'revote', 0,
      'category_ar', c.name_ar, 'category_en', c.name_en, 'emoji', c.emoji, 'color', c.color,
      'current_turn', pair[1], 'current_target', pair[2], 'questions_done', r.questions_done, 'q_lap', r.q_lap,
      'pair_has_question', exists (select 1 from bakasa_messages where round_id = rd.id and turn_key = r.q_lap || ':' || r.turn_idx and kind = 'QUESTION'),
      'in_round', v_user = any(rd.turn_order),
      'accused', case when r.status = 'GUESS' or v_ended then rd.accused end,
      'messages', coalesce((select jsonb_agg(jsonb_build_object('id', m.id, 'user_id', m.user_id, 'body', m.body, 'at', m.created_at, 'kind', m.kind, 'target', m.target) order by m.id)
                            from bakasa_messages m where m.round_id = rd.id), '[]'::jsonb),
      'votes_cast', (select count(*) from bakasa_votes where round_id = rd.id),
      'voters_total', (select count(*) from bakasa_players where room_id = p_room and status = 'ACTIVE' and user_id = any(rd.turn_order)),
      'my_vote', (select suspect_id from bakasa_votes where round_id = rd.id and voter_id = v_user),
      'guessed_count', (select count(*) from jsonb_object_keys(rd.guesses)),
      'spies_total', (select count(*) from bakasa_roles where round_id = rd.id and is_spy),
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
      union all (select id, word_ar, word_en from bakasa_words where category_id = c.id and active and id <> w.id order by random() limit 11)) o));
end $$;

do $$ declare f text; begin
  foreach f in array array['bakasa_current_pair(uuid)','bakasa_next_turn(uuid)','bakasa_finish_round(uuid)','bakasa_tally(uuid)'] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
  end loop;
  foreach f in array array['bakasa_pair_done(uuid)','bakasa_more_questions(uuid)'] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;
