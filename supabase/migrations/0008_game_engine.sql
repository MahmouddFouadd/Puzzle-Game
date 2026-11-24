-- 0008_game_engine.sql  (Milestone 4, part 2: server-authoritative game engine)
-- Every gameplay action: idempotent (client key), captain-only, serialized per team, atomic, recorded as events.
-- Players never read questions/answers/mappings: cards are served from the room snapshot without answer data.

-- ---------- helpers (internal; not callable through the API) ----------
create or replace function emit_event(p_room uuid, p_team uuid, p_type text, p_payload jsonb, p_vis text default 'ROOM') returns void
language sql security definer set search_path = public as $$
  insert into game_events (room_id, team_id, event_type, payload, visibility) values (p_room, p_team, p_type, coalesce(p_payload, '{}'::jsonb), p_vis);
$$;

create or replace function snap_question(p_room uuid, p_question uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select e from room_story_snapshots s, jsonb_array_elements(s.content->'questions') e
  where s.room_id = p_room and (e->>'id')::uuid = p_question limit 1;
$$;
create or replace function snap_piece(p_room uuid, p_piece uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select e from room_story_snapshots s, jsonb_array_elements(s.content->'pieces') e
  where s.room_id = p_room and (e->>'id')::uuid = p_piece limit 1;
$$;
create or replace function snap_image(p_room uuid, p_image uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select e from room_story_snapshots s, jsonb_array_elements(s.content->'images') e
  where s.room_id = p_room and (e->>'id')::uuid = p_image limit 1;
$$;
create or replace function setting_int(p_room uuid, k text) returns int
language sql stable security definer set search_path = public as $$ select (settings_snapshot->'settings'->>k)::int from rooms where id = p_room; $$;
create or replace function setting_text(p_room uuid, k text) returns text
language sql stable security definer set search_path = public as $$ select settings_snapshot->'settings'->>k from rooms where id = p_room; $$;
create or replace function setting_bool(p_room uuid, k text) returns boolean
language sql stable security definer set search_path = public as $$ select coalesce((settings_snapshot->'settings'->>k)::boolean, false) from rooms where id = p_room; $$;

-- Answer normalisation: case, Arabic diacritics/tatweel, alef/ya variants, punctuation, extra spaces.
create or replace function normalize_answer(t text) returns text language sql immutable as $$
  select trim(regexp_replace(regexp_replace(regexp_replace(translate(lower(coalesce(t, '')), 'أإآى', 'اااي'),
         '[\u064B-\u065F\u0670\u0640]', '', 'g'), '[[:punct:]]', '', 'g'), '\s+', ' ', 'g'));
$$;

-- Idempotency: the same (user, key) returns the stored result instead of acting twice. Advisory lock covers concurrent duplicates.
create or replace function idem_start(p_key uuid, p_fn text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v jsonb; f text;
begin
  if p_key is null then raise exception 'key_required'; end if;
  perform pg_advisory_xact_lock(hashtext(auth.uid()::text || p_key::text));
  select result, fn into v, f from idempotency_keys where user_id = auth.uid() and key = p_key;
  if found then
    if f <> p_fn then raise exception 'idempotency_conflict'; end if;
    return v;
  end if;
  return null;
end $$;
create or replace function idem_done(p_key uuid, p_fn text, p_result jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  insert into idempotency_keys (user_id, key, fn, result) values (auth.uid(), p_key, p_fn, p_result);
  return p_result;
end $$;

-- Common guard for captain actions: captain only, room PLAYING, team ACTIVE; locks the team state row.
create or replace function lock_team_for_action(p_team uuid) returns team_game_states
language plpgsql security definer set search_path = public as $$
declare t teams%rowtype; r rooms%rowtype; g team_game_states%rowtype;
begin
  select * into t from teams where id = p_team;
  if not found then raise exception 'team_not_found'; end if;
  if t.captain_user_id is distinct from auth.uid() then raise exception 'captain_only'; end if;
  select * into r from rooms where id = t.room_id;
  if r.status <> 'PLAYING' then raise exception 'room_not_playing'; end if;
  if t.state <> 'ACTIVE' then raise exception 'team_inactive'; end if;
  select * into g from team_game_states where team_id = p_team for update;
  if not found or g.assigned_image_id is null then raise exception 'no_image'; end if;
  if not exists (select 1 from room_story_snapshots where room_id = r.id) then raise exception 'snapshot_missing'; end if;
  return g;
end $$;

-- Only place scores change. Locks the team row, writes an append-only ledger line, then updates the total.
create or replace function apply_score(p_team uuid, p_event text, p_points int, p_draw uuid, p_decision uuid, p_reason text default null) returns int
language plpgsql security definer set search_path = public as $$
declare g team_game_states%rowtype; v_room uuid;
begin
  select * into g from team_game_states where team_id = p_team for update;
  select room_id into v_room from teams where id = p_team;
  insert into score_ledger (room_id, team_id, event_type, draw_id, decision_id, points, previous_score, new_score, actor, reason)
  values (v_room, p_team, p_event, p_draw, p_decision, p_points, g.score, g.score + p_points, auth.uid(), p_reason);
  update team_game_states set score = g.score + p_points where team_id = p_team;
  perform emit_event(v_room, p_team, 'score_changed', jsonb_build_object('score', g.score + p_points), 'ROOM');
  return g.score + p_points;
end $$;

-- Card as the team sees it: question text/options only. No answers, no piece or image association.
create or replace function card_view(p_draw uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare d card_draws%rowtype; q jsonb;
begin
  select * into d from card_draws where id = p_draw;
  q := snap_question(d.room_id, d.question_id);
  return jsonb_build_object('draw_id', d.id, 'state', d.state, 'kind', d.kind, 'cycle', d.cycle, 'attempts', d.attempts, 'drawn_at', d.drawn_at,
    'time_limit_seconds', setting_int(d.room_id, 'card_time_limit_seconds'),
    'question', jsonb_build_object('id', d.question_id, 'text', q->>'text', 'type', q->>'type', 'hint', q->>'hint',
      'options', (select coalesce(jsonb_agg(jsonb_build_object('id', o->>'id', 'text', o->>'text') order by (o->>'position')::int), '[]'::jsonb)
                  from jsonb_array_elements(q->'options') o)));
end $$;

create or replace function maybe_finish_room(p_room uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from rooms where id = p_room and status = 'PLAYING')
     and not exists (select 1 from teams where room_id = p_room and state = 'ACTIVE')
     and exists (select 1 from teams where room_id = p_room and state = 'COMPLETED') then
    update rooms set status = 'FINISHED', finished_at = clock_timestamp() where id = p_room;
    perform emit_event(p_room, null, 'game_finished', '{}'::jsonb, 'ROOM');
  end if;
end $$;

-- Softlock detector: pieces of the team's image are still hidden but no undrawn question (this cycle) can reveal any of them.
create or replace function check_softlock(p_team uuid) returns void
language plpgsql security definer set search_path = public as $$
declare g team_game_states%rowtype; t teams%rowtype; v_undisc int; v_reach int; v_status text;
begin
  select * into g from team_game_states where team_id = p_team;
  select * into t from teams where id = p_team;
  if g.assigned_image_id is null or t.state <> 'ACTIVE' then return; end if;
  select count(*) into v_undisc from room_story_snapshots s, jsonb_array_elements(s.content->'pieces') p
   where s.room_id = t.room_id and (p->>'image_id')::uuid = g.assigned_image_id
     and not exists (select 1 from team_piece_states x where x.team_id = p_team and x.piece_id = (p->>'id')::uuid);
  if v_undisc = 0 then return; end if;
  select count(*) into v_reach from room_story_snapshots s, jsonb_array_elements(s.content->'questions') q
   where s.room_id = t.room_id
     and exists (select 1 from jsonb_array_elements(s.content->'pieces') p
                  where (p->>'id')::uuid = (q->>'piece_id')::uuid and (p->>'image_id')::uuid = g.assigned_image_id
                    and not exists (select 1 from team_piece_states x where x.team_id = p_team and x.piece_id = (p->>'id')::uuid))
     and not exists (select 1 from card_draws d where d.team_id = p_team and d.question_id = (q->>'id')::uuid and d.cycle = g.deck_cycle and d.kind <> 'RESCUE');
  insert into team_recovery_states (team_id) values (p_team) on conflict do nothing;
  select status into v_status from team_recovery_states where team_id = p_team for update;
  if v_reach = 0 then
    if v_status = 'NONE' then
      update team_recovery_states set status = 'DETECTED', detected_at = now(), updated_at = now() where team_id = p_team;
      perform emit_event(t.room_id, p_team, 'softlock_detected', '{}'::jsonb, 'TEAM');  -- generic: no hint about which cards matter
    end if;
  elsif v_status = 'DETECTED' then
    update team_recovery_states set status = 'NONE', updated_at = now() where team_id = p_team;
  end if;
end $$;

-- ---------- gameplay ----------
create or replace function draw_card(p_team uuid, p_key uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_prev jsonb; g team_game_states%rowtype; t teams%rowtype; v_pick jsonb; v_cycle int; v_draw uuid; rec team_recovery_states%rowtype; v_round int := 0;
begin
  v_prev := idem_start(p_key, 'draw_card');
  if v_prev is not null then return v_prev; end if;
  g := lock_team_for_action(p_team);
  select * into t from teams where id = p_team;
  if exists (select 1 from card_draws where team_id = p_team and state in ('DRAWN', 'ANSWER_CORRECT')) then raise exception 'card_open'; end if;
  v_cycle := g.deck_cycle;

  loop
    v_round := v_round + 1;
    select e into v_pick from room_story_snapshots s, jsonb_array_elements(s.content->'questions') e
     where s.room_id = t.room_id
       and not exists (select 1 from card_draws d where d.team_id = p_team and d.question_id = (e->>'id')::uuid
                        and (d.state = 'PLACED_CORRECTLY' or (d.cycle = v_cycle and d.kind <> 'RESCUE')))
     order by random() limit 1;
    exit when v_pick is not null;

    -- deck exhausted: configured recovery. Recycled decks contain ALL non-placed cards, so the association stays hidden.
    insert into team_recovery_states (team_id) values (p_team) on conflict do nothing;
    select * into rec from team_recovery_states where team_id = p_team for update;
    if v_round = 1 and setting_bool(t.room_id, 'allow_deck_recycling') and rec.cycles_used < coalesce(setting_int(t.room_id, 'max_recycle_cycles'), 0) then
      update card_draws set recycled_at = clock_timestamp() where team_id = p_team and cycle = v_cycle and recycled_at is null and state <> 'PLACED_CORRECTLY';
      v_cycle := v_cycle + 1;
      update team_game_states set deck_cycle = v_cycle where team_id = p_team;
      update team_recovery_states set cycles_used = cycles_used + 1, status = 'NONE', updated_at = now() where team_id = p_team;
      perform emit_event(t.room_id, p_team, 'deck_recycled', jsonb_build_object('cycle', v_cycle), 'TEAM');
      continue;
    elsif setting_bool(t.room_id, 'rescue_enabled') and rec.rescue_used < coalesce(setting_int(t.room_id, 'max_rescue_draws'), 0) then
      update team_recovery_states set status = 'RESCUE_AVAILABLE', updated_at = now() where team_id = p_team;
      perform emit_event(t.room_id, p_team, 'rescue_available', '{}'::jsonb, 'TEAM');
      return idem_done(p_key, 'draw_card', jsonb_build_object('status', 'deck_empty', 'recovery', 'rescue'));
    else
      update team_recovery_states set status = 'SOFTLOCKED', updated_at = now() where team_id = p_team;
      perform emit_event(t.room_id, p_team, 'recovery_exhausted', '{}'::jsonb, 'TEAM');
      return idem_done(p_key, 'draw_card', jsonb_build_object('status', 'deck_empty', 'recovery', 'none'));
    end if;
  end loop;

  insert into card_draws (room_id, team_id, question_id, kind, cycle)
  values (t.room_id, p_team, (v_pick->>'id')::uuid, case when v_cycle > 1 then 'RECYCLED' else 'NORMAL' end, v_cycle) returning id into v_draw;
  update team_game_states set current_card_id = (v_pick->>'id')::uuid where team_id = p_team;
  perform emit_event(t.room_id, p_team, 'card_drawn', jsonb_build_object('draw', v_draw), 'TEAM');
  return idem_done(p_key, 'draw_card', jsonb_build_object('status', 'drawn', 'card', card_view(v_draw)));
end $$;

create or replace function draw_rescue_card(p_team uuid, p_key uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_prev jsonb; g team_game_states%rowtype; t teams%rowtype; rec team_recovery_states%rowtype; v_pick jsonb; v_draw uuid; v_cost int; v_avail int;
begin
  v_prev := idem_start(p_key, 'draw_rescue_card');
  if v_prev is not null then return v_prev; end if;
  g := lock_team_for_action(p_team);
  select * into t from teams where id = p_team;
  if exists (select 1 from card_draws where team_id = p_team and state in ('DRAWN', 'ANSWER_CORRECT')) then raise exception 'card_open'; end if;
  if not setting_bool(t.room_id, 'rescue_enabled') then raise exception 'rescue_disabled'; end if;
  insert into team_recovery_states (team_id) values (p_team) on conflict do nothing;
  select * into rec from team_recovery_states where team_id = p_team for update;
  if rec.rescue_used >= coalesce(setting_int(t.room_id, 'max_rescue_draws'), 0) then raise exception 'rescue_exhausted'; end if;
  select count(*) into v_avail from room_story_snapshots s, jsonb_array_elements(s.content->'questions') e
   where s.room_id = t.room_id and not exists (select 1 from card_draws d where d.team_id = p_team and d.question_id = (e->>'id')::uuid
                                                and (d.state = 'PLACED_CORRECTLY' or (d.cycle = g.deck_cycle and d.kind <> 'RESCUE')));
  if v_avail > 0 then raise exception 'deck_not_empty'; end if;   -- no rescue while normal cards remain

  -- pool = every card this team has already seen and not placed (decoys included, so nothing is revealed)
  select e into v_pick from room_story_snapshots s, jsonb_array_elements(s.content->'questions') e
   where s.room_id = t.room_id
     and not exists (select 1 from card_draws d where d.team_id = p_team and d.question_id = (e->>'id')::uuid and d.state = 'PLACED_CORRECTLY')
     and (setting_bool(t.room_id, 'rescue_cards_repeatable')
          or not exists (select 1 from card_draws d where d.team_id = p_team and d.question_id = (e->>'id')::uuid and d.kind = 'RESCUE'))
   order by random() limit 1;
  if v_pick is null then raise exception 'rescue_pool_empty'; end if;

  insert into card_draws (room_id, team_id, question_id, kind, cycle)
  values (t.room_id, p_team, (v_pick->>'id')::uuid, 'RESCUE', g.deck_cycle) returning id into v_draw;
  update team_game_states set current_card_id = (v_pick->>'id')::uuid where team_id = p_team;
  update team_recovery_states set rescue_used = rescue_used + 1, updated_at = now() where team_id = p_team;
  v_cost := coalesce(setting_int(t.room_id, 'rescue_cost_points'), 0);
  if v_cost > 0 then perform apply_score(p_team, 'RESCUE_COST', -v_cost, v_draw, null, null); end if;
  perform emit_event(t.room_id, p_team, 'rescue_drawn', jsonb_build_object('draw', v_draw), 'TEAM');
  return idem_done(p_key, 'draw_rescue_card', jsonb_build_object('status', 'drawn', 'card', card_view(v_draw)));
end $$;

create or replace function submit_answer(p_draw uuid, p_answer text, p_option uuid, p_key uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_prev jsonb; d card_draws%rowtype; g team_game_states%rowtype; q jsonb; v_correct boolean := false; v_expired boolean := false;
        v_policy text; v_max int; v_lim int; v_attempts int; v_penalty int := 0; v_result jsonb; v_text text; v_score int;
begin
  v_prev := idem_start(p_key, 'submit_answer');
  if v_prev is not null then return v_prev; end if;
  if char_length(coalesce(p_answer, '')) > 500 then raise exception 'invalid_answer'; end if;
  select * into d from card_draws where id = p_draw;
  if not found then raise exception 'draw_not_found'; end if;
  g := lock_team_for_action(d.team_id);
  select * into d from card_draws where id = p_draw for update;
  if d.state <> 'DRAWN' then raise exception 'invalid_card_state'; end if;

  q := snap_question(d.room_id, d.question_id);
  v_lim := setting_int(d.room_id, 'card_time_limit_seconds');
  v_expired := v_lim is not null and clock_timestamp() > d.drawn_at + make_interval(secs => v_lim);
  if not v_expired then
    if q->>'type' = 'MULTIPLE_CHOICE' then
      v_correct := p_option is not null and exists (select 1 from jsonb_array_elements(q->'answers') a where (a->>'option_id')::uuid = p_option);
    else
      v_correct := p_answer is not null and exists (select 1 from jsonb_array_elements(q->'answers') a where normalize_answer(a->>'text') = normalize_answer(p_answer));
    end if;
  end if;

  v_attempts := d.attempts + 1;
  v_text := coalesce(p_answer, (select o->>'text' from jsonb_array_elements(q->'options') o where (o->>'id')::uuid = p_option), '');
  insert into card_answers (draw_id, submitted_by, answer_text, is_correct, idempotency_key, attempt_no)
  values (d.id, auth.uid(), v_text, v_correct, p_key, v_attempts);

  if v_correct then
    update card_draws set state = 'ANSWER_CORRECT', attempts = v_attempts where id = d.id;
    v_result := jsonb_build_object('correct', true, 'final', false, 'explanation', q->>'explanation');
  else
    v_policy := setting_text(d.room_id, 'wrong_answer_policy');
    v_max := coalesce(setting_int(d.room_id, 'max_attempts'), 1);
    if not v_expired and v_policy = 'RETRY' and v_attempts < v_max then
      update card_draws set attempts = v_attempts where id = d.id;
      v_result := jsonb_build_object('correct', false, 'final', false, 'retry', true, 'attempts_left', v_max - v_attempts);
    else
      if v_policy <> 'SKIP' then v_penalty := setting_int(d.room_id, 'points_wrong_answer'); end if;  -- RETRY with attempts used up also pays the penalty
      update card_draws set state = 'ANSWER_INCORRECT', attempts = v_attempts, closed_at = clock_timestamp() where id = d.id;
      update team_game_states set current_card_id = null where team_id = d.team_id;
      if v_penalty <> 0 then perform apply_score(d.team_id, 'WRONG_ANSWER', v_penalty, d.id, null, null); end if;
      v_result := jsonb_build_object('correct', false, 'final', true, 'timeout', v_expired, 'points', v_penalty, 'explanation', q->>'explanation');
      if setting_bool(d.room_id, 'reveal_answer_after_fail') then
        v_result := v_result || jsonb_build_object('correct_answer', (select a->>'text' from jsonb_array_elements(q->'answers') a limit 1));
      end if;
      perform check_softlock(d.team_id);
    end if;
  end if;
  select score into v_score from team_game_states where team_id = d.team_id;
  v_result := v_result || jsonb_build_object('score', v_score);
  perform emit_event(d.room_id, d.team_id, 'answer_evaluated', jsonb_build_object('draw', d.id, 'correct', v_correct), 'TEAM');
  return idem_done(p_key, 'submit_answer', v_result);
end $$;

create or replace function decide_card(p_draw uuid, p_decision text, p_key uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_prev jsonb; d card_draws%rowtype; g team_game_states%rowtype; q jsonb; v_piece jsonb; v_belongs boolean; v_event text; v_pts int;
        v_state card_state; v_dec uuid; v_score int; v_total int; v_rev int; v_rank int; v_completed boolean := false; v_revealed jsonb := null;
begin
  v_prev := idem_start(p_key, 'decide_card');
  if v_prev is not null then return v_prev; end if;
  if p_decision not in ('PLACE', 'DISCARD') then raise exception 'invalid_decision'; end if;
  select * into d from card_draws where id = p_draw;
  if not found then raise exception 'draw_not_found'; end if;
  g := lock_team_for_action(d.team_id);
  select * into d from card_draws where id = p_draw for update;
  if d.state <> 'ANSWER_CORRECT' then raise exception 'invalid_card_state'; end if;

  q := snap_question(d.room_id, d.question_id);
  v_piece := snap_piece(d.room_id, (q->>'piece_id')::uuid);
  v_belongs := (v_piece->>'image_id')::uuid = g.assigned_image_id;

  if p_decision = 'PLACE' and v_belongs then v_event := 'PLACE_CORRECT'; v_pts := setting_int(d.room_id, 'points_correct_place'); v_state := 'PLACED_CORRECTLY';
  elsif p_decision = 'PLACE' then v_event := 'PLACE_WRONG'; v_pts := setting_int(d.room_id, 'points_wrong_place'); v_state := 'PLACED_INCORRECTLY';
  elsif not v_belongs then v_event := 'DISCARD_CORRECT'; v_pts := setting_int(d.room_id, 'points_correct_discard'); v_state := 'DISCARDED_CORRECTLY';
  else v_event := 'DISCARD_WRONG'; v_pts := setting_int(d.room_id, 'points_wrong_discard'); v_state := 'DISCARDED_INCORRECTLY'; end if;

  insert into card_decisions (draw_id, decision, belongs_to_team_image, points_delta, idempotency_key, decided_by, result_state)
  values (d.id, p_decision, v_belongs, v_pts, p_key, auth.uid(), v_state) returning id into v_dec;
  update card_draws set state = v_state, closed_at = clock_timestamp() where id = d.id;
  update team_game_states set current_card_id = null where team_id = d.team_id;
  if v_pts <> 0 then perform apply_score(d.team_id, v_event, v_pts, d.id, v_dec, null); end if;

  if v_state = 'PLACED_CORRECTLY' then
    insert into team_piece_states (team_id, piece_id, room_id, image_id, row_idx, col_idx, x, y, w, h, svg_path, mask_path, draw_id)
    values (d.team_id, (v_piece->>'id')::uuid, d.room_id, (v_piece->>'image_id')::uuid, (v_piece->>'row')::smallint, (v_piece->>'col')::smallint,
            (v_piece->>'x')::int, (v_piece->>'y')::int, (v_piece->>'w')::int, (v_piece->>'h')::int, v_piece->>'path', v_piece->>'mask', d.id);
    v_revealed := jsonb_build_object('id', v_piece->>'id', 'row', v_piece->'row', 'col', v_piece->'col', 'x', v_piece->'x', 'y', v_piece->'y', 'w', v_piece->'w', 'h', v_piece->'h', 'mask', v_piece->>'mask');
    perform emit_event(d.room_id, d.team_id, 'piece_revealed', jsonb_build_object('piece', v_revealed), 'TEAM');

    select count(*) into v_total from room_story_snapshots s, jsonb_array_elements(s.content->'pieces') p where s.room_id = d.room_id and (p->>'image_id')::uuid = g.assigned_image_id;
    select count(*) into v_rev from team_piece_states where team_id = d.team_id;
    perform emit_event(d.room_id, null, 'progress_changed', jsonb_build_object('team', d.team_id, 'revealed', v_rev, 'total', v_total), 'ROOM');
    if v_rev >= v_total then
      perform 1 from rooms where id = d.room_id for update;      -- serialises rank assignment inside the room
      select count(*) + 1 into v_rank from team_game_states x join teams tt on tt.id = x.team_id where tt.room_id = d.room_id and x.completed_at is not null;
      update team_game_states set completed_at = clock_timestamp(), rank = v_rank where team_id = d.team_id;
      update teams set state = 'COMPLETED' where id = d.team_id;
      update team_recovery_states set status = 'NONE', updated_at = now() where team_id = d.team_id;
      perform emit_event(d.room_id, null, 'image_completed', jsonb_build_object('team', d.team_id, 'rank', v_rank), 'ROOM');
      perform maybe_finish_room(d.room_id);
      v_completed := true;
    end if;
  end if;
  if not v_completed then perform check_softlock(d.team_id); end if;

  select score into v_score from team_game_states where team_id = d.team_id;
  perform emit_event(d.room_id, d.team_id, 'card_decided', jsonb_build_object('draw', d.id, 'result', v_state), 'TEAM');
  return idem_done(p_key, 'decide_card', jsonb_build_object('result', v_state, 'points', v_pts, 'score', v_score, 'piece', v_revealed, 'completed', v_completed, 'rank', v_rank));
end $$;

-- ---------- state for the screen (resync after refresh/reconnect) ----------
create or replace function get_team_state(p_team uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare t teams%rowtype; r rooms%rowtype; g team_game_states%rowtype; v_open uuid; v_img jsonb; v_total int; v_rec text; v_left int;
begin
  select * into t from teams where id = p_team;
  if not found then raise exception 'team_not_found'; end if;
  if not (is_team_member(p_team) or has_permission('game.control')) then raise exception 'forbidden' using errcode = '42501'; end if;
  select * into r from rooms where id = t.room_id;
  select * into g from team_game_states where team_id = p_team;
  v_img := case when g.assigned_image_id is null then null else snap_image(t.room_id, g.assigned_image_id) end;
  select id into v_open from card_draws where team_id = p_team and state in ('DRAWN', 'ANSWER_CORRECT');
  select status into v_rec from team_recovery_states where team_id = p_team;
  select count(*) into v_total from room_story_snapshots s, jsonb_array_elements(s.content->'pieces') p where s.room_id = t.room_id and (p->>'image_id')::uuid = g.assigned_image_id;
  select count(*) into v_left from room_story_snapshots s, jsonb_array_elements(s.content->'questions') e
   where s.room_id = t.room_id and not exists (select 1 from card_draws d where d.team_id = p_team and d.question_id = (e->>'id')::uuid and (d.state = 'PLACED_CORRECTLY' or (d.cycle = g.deck_cycle and d.kind <> 'RESCUE')));
  return jsonb_build_object(
    'team', jsonb_build_object('id', t.id, 'name', t.name, 'state', t.state, 'captain', t.captain_user_id, 'score', coalesce(g.score, 0), 'rank', g.rank, 'completed_at', g.completed_at),
    'room', jsonb_build_object('id', r.id, 'status', r.status),
    'image', case when v_img is null then null else jsonb_build_object('id', v_img->'id', 'position', v_img->'position', 'width', v_img->'width', 'height', v_img->'height') end,
    'progress', jsonb_build_object('revealed', (select count(*) from team_piece_states where team_id = p_team), 'total', v_total),
    'pieces', (select coalesce(jsonb_agg(jsonb_build_object('id', piece_id, 'row', row_idx, 'col', col_idx, 'x', x, 'y', y, 'w', w, 'h', h, 'mask', mask_path) order by revealed_at), '[]'::jsonb) from team_piece_states where team_id = p_team),
    'card', case when v_open is null then null else card_view(v_open) end,
    'cards_left', v_left,
    'recovery', case coalesce(v_rec, 'NONE') when 'RESCUE_AVAILABLE' then 'RESCUE_AVAILABLE' when 'SOFTLOCKED' then 'STUCK' else 'NONE' end);
end $$;

create or replace function get_leaderboard(p_room uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not (is_room_member(p_room) or has_permission('game.control')) then raise exception 'forbidden' using errcode = '42501'; end if;
  return coalesce((select jsonb_agg(row order by (row->>'rank') nulls last, (row->>'score')::int desc, row->>'name') from (
    select jsonb_build_object('team', t.id, 'name', t.name, 'state', t.state, 'score', coalesce(g.score, 0), 'rank', g.rank, 'completed_at', g.completed_at,
      'revealed', (select count(*) from team_piece_states x where x.team_id = t.id),
      'total', (select count(*) from room_story_snapshots s, jsonb_array_elements(s.content->'pieces') p where s.room_id = t.room_id and (p->>'image_id')::uuid = g.assigned_image_id)) as row
    from teams t left join team_game_states g on g.team_id = t.id where t.room_id = p_room) z), '[]'::jsonb);
end $$;

-- ---------- presence and captain failover ----------
create or replace function heartbeat(p_room uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare m team_members%rowtype; t teams%rowtype; v_grace int; v_new uuid; r rooms%rowtype;
begin
  select * into m from team_members where room_id = p_room and user_id = auth.uid() for update;
  if not found then return jsonb_build_object('team', null); end if;
  select * into r from rooms where id = p_room;
  update team_members set last_seen_at = now(), is_online = true where room_id = p_room and user_id = auth.uid();
  if not m.is_online then perform emit_event(p_room, m.team_id, 'player_reconnected', '{}'::jsonb, 'ROOM'); end if;
  with gone as (update team_members set is_online = false where room_id = p_room and is_online and last_seen_at < now() - interval '30 seconds' returning team_id)
  insert into game_events (room_id, team_id, event_type, payload, visibility) select p_room, team_id, 'player_disconnected', '{}', 'ROOM' from gone;

  if r.status in ('WAITING', 'READY', 'PLAYING', 'PAUSED') then
    select * into t from teams where id = m.team_id for update;
    v_grace := coalesce(setting_int(p_room, 'captain_grace_seconds'), 20);
    if t.captain_user_id is not null and t.captain_user_id <> auth.uid()
       and (select last_seen_at from team_members where team_id = t.id and user_id = t.captain_user_id) < now() - make_interval(secs => v_grace) then
      select user_id into v_new from team_members
       where team_id = t.id and user_id <> t.captain_user_id and last_seen_at >= now() - make_interval(secs => v_grace)
       order by last_seen_at desc, joined_at limit 1;
      if v_new is not null then
        update teams set captain_user_id = v_new where id = t.id;
        insert into team_captain_history (team_id, from_user_id, to_user_id, reason) values (t.id, t.captain_user_id, v_new, 'failover');
        perform emit_event(p_room, t.id, 'captain_changed', jsonb_build_object('reason', 'failover'), 'ROOM');
      end if;
    end if;
  end if;
  return jsonb_build_object('team', m.team_id, 'captain', (select captain_user_id from teams where id = m.team_id));
end $$;

-- ---------- admin controls ----------
create or replace function set_team_state(p_team uuid, p_state team_state, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
declare t teams%rowtype;
begin
  if not has_permission('game.control') then raise exception 'forbidden' using errcode = '42501'; end if;
  if char_length(trim(coalesce(p_reason, ''))) = 0 then raise exception 'reason_required'; end if;
  if p_state = 'COMPLETED' then raise exception 'invalid_state'; end if;   -- completion only happens through play
  select * into t from teams where id = p_team for update;
  if not found then raise exception 'team_not_found'; end if;
  update teams set state = p_state where id = p_team;          -- progress is kept, never deleted
  insert into audit_logs (actor_id, action, target_type, target_id, details)
  values (auth.uid(), 'team.state', 'team', p_team::text, jsonb_build_object('from', t.state, 'to', p_state, 'reason', p_reason));
  perform emit_event(t.room_id, p_team, 'team_state_changed', jsonb_build_object('state', p_state), 'ROOM');
  perform maybe_finish_room(t.room_id);
end $$;

create or replace function adjust_score(p_team uuid, p_delta int, p_reason text) returns int
language plpgsql security definer set search_path = public as $$
declare v_new int; v_old int;
begin
  if not has_permission('game.control') then raise exception 'forbidden' using errcode = '42501'; end if;
  if char_length(trim(coalesce(p_reason, ''))) = 0 then raise exception 'reason_required'; end if;
  if p_delta = 0 or p_delta not between -1000 and 1000 then raise exception 'invalid_delta'; end if;
  select score into v_old from team_game_states where team_id = p_team;
  if not found then raise exception 'team_not_found'; end if;
  v_new := apply_score(p_team, 'ADMIN_ADJUSTMENT', p_delta, null, null, trim(p_reason));
  insert into audit_logs (actor_id, action, target_type, target_id, details)
  values (auth.uid(), 'score.adjust', 'team', p_team::text, jsonb_build_object('original', v_old, 'delta', p_delta, 'new', v_new, 'reason', p_reason));
  return v_new;
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
  elsif p_action = 'end' and r.status in ('PLAYING', 'PAUSED') then update rooms set status = 'FINISHED', finished_at = clock_timestamp() where id = p_room;
  elsif p_action = 'cancel' and r.status in ('WAITING', 'READY', 'COUNTDOWN', 'PLAYING', 'PAUSED') then
    update rooms set status = 'CANCELLED', finished_at = clock_timestamp() where id = p_room;
  else raise exception 'invalid_action'; end if;
  insert into audit_logs (actor_id, action, target_type, target_id, details) values (auth.uid(), 'room.' || p_action, 'room', p_room::text, '{}');
  perform room_event(p_room, null, 'room_' || p_action, '{}');
end $$;

-- ---------- grants ----------
do $$
declare f text;
begin
  foreach f in array array['draw_card(uuid,uuid)', 'draw_rescue_card(uuid,uuid)', 'submit_answer(uuid,text,uuid,uuid)', 'decide_card(uuid,text,uuid)',
    'get_team_state(uuid)', 'get_leaderboard(uuid)', 'heartbeat(uuid)', 'set_team_state(uuid,team_state,text)', 'adjust_score(uuid,int,text)', 'set_room_status(uuid,text)']
  loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
  foreach f in array array['emit_event(uuid,uuid,text,jsonb,text)', 'snap_question(uuid,uuid)', 'snap_piece(uuid,uuid)', 'snap_image(uuid,uuid)', 'setting_int(uuid,text)',
    'setting_text(uuid,text)', 'setting_bool(uuid,text)', 'normalize_answer(text)', 'idem_start(uuid,text)', 'idem_done(uuid,text,jsonb)', 'lock_team_for_action(uuid)',
    'apply_score(uuid,text,int,uuid,uuid,text)', 'card_view(uuid)', 'maybe_finish_room(uuid)', 'check_softlock(uuid)']
  loop execute format('revoke all on function %s from public, anon, authenticated', f); end loop;
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table team_game_states, team_piece_states, score_ledger;
  end if;
end $$;
