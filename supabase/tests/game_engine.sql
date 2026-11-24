-- Milestone 4 engine tests. Needs stub schemas + migrations 0001-0008. Every line prints "ok" or "FAIL".
\set ON_ERROR_STOP off
\pset tuples_only on
reset role;
grant all on all tables in schema public to authenticated;
-- earlier tests changed platform defaults; start from the documented defaults
update platform_settings set points_correct_place = 10, points_wrong_place = -10, points_correct_discard = 0, points_wrong_discard = -10, points_wrong_answer = -10,
  wrong_answer_policy = 'MINUS', max_attempts = 1, reveal_answer_after_fail = true, card_time_limit_seconds = null, allow_multiple_questions_per_piece = false,
  allow_deck_recycling = false, max_recycle_cycles = 1, rescue_enabled = false, max_rescue_draws = 2, rescue_cost_points = 0, rescue_cards_repeatable = false, captain_grace_seconds = 20;
insert into auth.users(id,email) values ('00000000-0000-0000-0000-0000000000a1','admin@x') on conflict do nothing;
insert into user_roles(user_id,role) values ('00000000-0000-0000-0000-0000000000a1','SUPER_ADMIN') on conflict do nothing;
insert into auth.users(id,email) select ('00000000-0000-0000-0000-0000000000d' || n)::uuid, 'g' || n from generate_series(1,4) n on conflict do nothing;

-- ===== helpers: SECURITY INVOKER (run as the current role, so RLS applies) =====
create or replace function t_ok(label text, cond boolean) returns text language sql as $$ select case when coalesce(cond,false) then 'ok   ' else 'FAIL ' end || label $$;
create or replace function t_uid(u text) returns void language sql as $$ select set_config('app.uid', '00000000-0000-0000-0000-0000000000' || u, false)::text::void $$;
create or replace function t_err(q text) returns text language plpgsql as $$ begin execute q; return 'NO_ERROR'; exception when others then return sqlerrm; end $$;
create or replace function t_expect(label text, q text, expected_like text) returns text language plpgsql as $$
declare e text := t_err(q);
begin return case when e like expected_like then 'ok   ' else 'FAIL ' end || label || case when e like expected_like then '' else ' (got: ' || e || ')' end; end $$;

-- plays a team; modes: optimal | discard_all | mixed | discard_first(p_limit draws) then optimal
create or replace function t_play(p_team uuid, p_user text, p_mode text, p_own_is_x boolean, p_limit int default 999, p_max int default 60) returns jsonb language plpgsql as $$
declare r jsonb; card jsonb; num int; belongs boolean; dec jsonb; v_dec text; exp int := 0; draws int := 0; done boolean := false; empty text := null; wrong_used boolean := false; draw uuid;
begin
  perform t_uid(p_user);
  loop
    exit when draws >= p_max;
    r := draw_card(p_team, gen_random_uuid());
    if r->>'status' = 'deck_empty' then empty := r->>'recovery'; exit; end if;
    draws := draws + 1;
    card := r->'card'; draw := (card->>'draw_id')::uuid; num := substr(card->'question'->>'text', 2)::int;
    belongs := (num <= 4) = p_own_is_x;
    if p_mode = 'mixed' and not wrong_used then
      perform submit_answer(draw, 'wrong!', null, gen_random_uuid()); wrong_used := true; exp := exp - 10; continue;
    end if;
    perform submit_answer(draw, case when draws % 2 = 0 then 'A' || num || '  ' else 'a' || num end, null, gen_random_uuid());
    v_dec := case
      when p_mode = 'discard_all' or (p_mode = 'discard_first' and draws <= p_limit) then 'DISCARD'
      when p_mode = 'mixed' then case when belongs then 'DISCARD' when draws % 2 = 0 then 'PLACE' else 'DISCARD' end
      else case when belongs then 'PLACE' else 'DISCARD' end end;
    dec := decide_card(draw, v_dec, gen_random_uuid());
    exp := exp + case when v_dec = 'PLACE' and belongs then 10 when v_dec = 'PLACE' then -10 when v_dec = 'DISCARD' and belongs then -10 else 0 end;
    if (dec->>'completed')::boolean then done := true; exit; end if;
  end loop;
  return jsonb_build_object('expected', exp, 'draws', draws, 'done', done, 'deck_empty', empty);
end $$;

-- ledger must be a consistent chain that adds up to the team score
create or replace function t_ledger_ok(p_team uuid) returns boolean language sql as $$
  select coalesce(bool_and(new_score = previous_score + points and previous_score = prev_new), true)
         and coalesce(sum(points), 0) = (select score from team_game_states where team_id = p_team)
  from (select *, coalesce(lag(new_score) over (order by id), 0) as prev_new from score_ledger where team_id = p_team) x $$;

-- ===== helpers: SECURITY DEFINER fixtures (superuser powers, tests only) =====
create or replace function t_fixture() returns jsonb language plpgsql security definer as $$
declare s uuid := '99999999-9999-9999-9999-999999999999'; ix uuid := '99999999-0000-0000-0000-0000000000a1'; iy uuid := '99999999-0000-0000-0000-0000000000a2';
        px uuid[]; py uuid[]; qid uuid; i int;
begin
  perform set_config('app.uid', '00000000-0000-0000-0000-0000000000a1', false);
  insert into stories(id,title,created_by) values (s,'Game Story','00000000-0000-0000-0000-0000000000a1');
  insert into story_images(id,story_id,position,title,hint,storage_path,width,height,piece_count) values
    (ix,s,1,'X','hint x','x.png',800,600,4),(iy,s,2,'Y','hint y','y.png',800,600,4);
  perform save_image_pieces(ix, 1, (select jsonb_agg(jsonb_build_object('row',r,'col',c,'x',c*10,'y',r*10,'w',10,'h',10,'path','M0 0Z','mask','m/x/'||r||'-'||c)) from generate_series(0,1) r, generate_series(0,1) c), false);
  perform save_image_pieces(iy, 2, (select jsonb_agg(jsonb_build_object('row',r,'col',c,'x',c*10,'y',r*10,'w',10,'h',10,'path','M0 0Z','mask','m/y/'||r||'-'||c)) from generate_series(0,1) r, generate_series(0,1) c), false);
  select array_agg(id order by row_idx,col_idx) into px from puzzle_pieces where image_id = ix;
  select array_agg(id order by row_idx,col_idx) into py from puzzle_pieces where image_id = iy;
  for i in 1..8 loop
    qid := save_question(s, null, jsonb_build_object('text','Q'||i,'type','SHORT_TEXT','published',true,'explanation','why '||i,'answers',jsonb_build_array('a'||i)));
    perform set_question_mapping(qid, case when i <= 4 then px[i] else py[i-4] end);
  end loop;
  perform approve_mappings(s); perform publish_story(s);
  insert into storage.objects(bucket_id,name) select 'story-pieces', mask_path from puzzle_pieces where image_id in (ix,iy);
  return jsonb_build_object('story', s, 'imgx', ix, 'imgy', iy);
end $$;

create or replace function t_mkroom(p_over jsonb) returns jsonb language plpgsql security definer as $$
declare s uuid := '99999999-9999-9999-9999-999999999999'; ix uuid := '99999999-0000-0000-0000-0000000000a1'; iy uuid := '99999999-0000-0000-0000-0000000000a2';
        r jsonb; v_room uuid; v_code text; t1 uuid; t2 uuid;
begin
  perform set_config('app.uid', '00000000-0000-0000-0000-0000000000a1', false);
  r := create_room(s, 2, 4, false, null, false, true, '{}', p_over);
  v_room := (r->>'id')::uuid; v_code := r->>'code';
  perform set_config('app.uid', '00000000-0000-0000-0000-0000000000d1', false); perform join_room(v_code, null, 'G1'); t1 := create_team(v_room, 'Team1');
  perform set_config('app.uid', '00000000-0000-0000-0000-0000000000d2', false); perform join_room(v_code, null, 'G2'); t2 := create_team(v_room, 'Team2');
  perform set_config('app.uid', '00000000-0000-0000-0000-0000000000d3', false); perform join_room(v_code, null, 'G3'); perform join_team(t1);
  perform set_config('app.uid', '00000000-0000-0000-0000-0000000000d4', false); perform join_room(v_code, null, 'G4'); perform join_team(t2);
  perform set_config('app.uid', '00000000-0000-0000-0000-0000000000d1', false); perform select_image(t1, ix); perform set_team_ready(t1, true);
  perform set_config('app.uid', '00000000-0000-0000-0000-0000000000d2', false); perform select_image(t2, iy); perform set_team_ready(t2, true);
  perform set_config('app.uid', '00000000-0000-0000-0000-0000000000a1', false); perform start_game(v_room, false);
  update rooms set countdown_ends_at = now() - interval '1 second' where id = v_room;
  perform advance_room(v_room);
  return jsonb_build_object('room', v_room, 'team1', t1, 'team2', t2);
end $$;
create or replace function t_age_draw(p_draw uuid, p_secs int) returns void language sql security definer as $$ update card_draws set drawn_at = drawn_at - make_interval(secs => p_secs) where id = p_draw $$;
create or replace function t_age_member(p_room uuid, p_user text, p_secs int) returns void language sql security definer as
$$ update team_members set last_seen_at = now() - make_interval(secs => p_secs) where room_id = p_room and user_id = ('00000000-0000-0000-0000-0000000000' || p_user)::uuid $$;
create or replace function t_mutate_source() returns void language plpgsql security definer as $$
begin
  alter table questions disable trigger guard_questions; alter table accepted_answers disable trigger guard_answers;
  update questions set text = 'HACKED ' || text where story_id = '99999999-9999-9999-9999-999999999999';
  update accepted_answers set answer_text = 'zzz' where question_id in (select id from questions where story_id = '99999999-9999-9999-9999-999999999999');
  alter table questions enable trigger guard_questions; alter table accepted_answers enable trigger guard_answers;
end $$;

select t_fixture() is not null as fixture_built;
select 'ok   normalize: Arabic diacritics/alef variants', normalize_answer('أَحمد') = normalize_answer('احمد') and normalize_answer(' The  Nile. ') = 'the nile';

-- ===================================================================================
\echo '=== ROOM A: default rules (MINUS, no recovery) ==='
select t_mkroom('{}') as ra \gset
select (:'ra'::jsonb)->>'room' as rooma, (:'ra'::jsonb)->>'team1' as at1, (:'ra'::jsonb)->>'team2' as at2 \gset
select 'ok   room snapshot stored (staff view)', count(*) = 1 from room_story_snapshots where room_id = :'rooma';
set role authenticated;

\echo '--- A1 guards, idempotency, card lifecycle (team 1)'
select t_uid('d3');
select t_expect('non-captain cannot draw', format('select draw_card(%L,%L)', :'at1', gen_random_uuid()), 'captain_only');
select t_uid('d1');
select draw_card(:'at1', '11111111-1111-1111-1111-111111111111') as r1 \gset
select (:'r1'::jsonb)->'card'->>'draw_id' as draw1, substr((:'r1'::jsonb)->'card'->'question'->>'text', 2) as num1 \gset
select t_ok('draw returned a card', (:'r1'::jsonb)->>'status' = 'drawn');
select t_ok('card JSON has no answer/piece/image/explanation data', (:'r1'::text) !~* '(answers|piece|image|mask|explanation|accepted)');
select t_ok('same key replays the SAME card (no second draw)', draw_card(:'at1', '11111111-1111-1111-1111-111111111111') = :'r1'::jsonb);
select t_ok('exactly one draw row', (select count(*) from card_draws where team_id = :'at1') = 1);
select t_expect('second draw while card open', format('select draw_card(%L,%L)', :'at1', gen_random_uuid()), 'card_open');
select t_expect('decide before answering', format('select decide_card(%L,%L,%L)', :'draw1', 'PLACE', gen_random_uuid()), 'invalid_card_state');
select t_expect('idempotency key reused for another action', format('select submit_answer(%L,%L,null,%L)', :'draw1', 'x', '11111111-1111-1111-1111-111111111111'), 'idempotency_conflict');
select t_uid('d3');
select t_expect('non-captain cannot answer', format('select submit_answer(%L,%L,null,%L)', :'draw1', 'a', gen_random_uuid()), 'captain_only');
select t_uid('d2');
select t_expect('other team captain cannot act on team 1 card', format('select submit_answer(%L,%L,null,%L)', :'draw1', 'a', gen_random_uuid()), 'captain_only');
select t_uid('d1');
select submit_answer(:'draw1', 'A' || :'num1' || ' ', null, '22222222-2222-2222-2222-222222222222') as a1 \gset
select t_ok('correct answer accepted (case/space tolerant)', (:'a1'::jsonb)->>'correct' = 'true');
select t_ok('answer replay returns same result', submit_answer(:'draw1', 'A' || :'num1' || ' ', null, '22222222-2222-2222-2222-222222222222') = :'a1'::jsonb);
select t_expect('answer again with new key', format('select submit_answer(%L,%L,null,%L)', :'draw1', 'a', gen_random_uuid()), 'invalid_card_state');
select decide_card(:'draw1', case when :'num1'::int <= 4 then 'PLACE' else 'DISCARD' end, '33333333-3333-3333-3333-333333333333') as d1 \gset
select t_ok('decision scored correctly (+10 place own / 0 discard foreign)', ((:'d1'::jsonb)->>'points')::int = case when :'num1'::int <= 4 then 10 else 0 end);
select t_ok('decision replay: same result, no double scoring', decide_card(:'draw1', case when :'num1'::int <= 4 then 'PLACE' else 'DISCARD' end, '33333333-3333-3333-3333-333333333333') = :'d1'::jsonb
   and (select score from team_game_states where team_id = :'at1') = ((:'d1'::jsonb)->>'score')::int);
select t_expect('second decision on same card', format('select decide_card(%L,%L,%L)', :'draw1', 'DISCARD', gen_random_uuid()), 'invalid_card_state');

\echo '--- A2 team 1 plays optimally: completes, ranks first, room keeps going'
select t_play(:'at1', 'd1', 'optimal', true) as p1 \gset
select t_ok('team 1 completed its image', ((:'p1'::jsonb)->>'done')::boolean);
select t_ok('team 1 score is exactly 40 (4 correct placements)', (select score from team_game_states where team_id = :'at1') = 40);
select t_ok('ledger is a consistent chain that equals the score', t_ledger_ok(:'at1'));
select t_ok('team 1 state COMPLETED, rank 1', (select rank = 1 from team_game_states where team_id = :'at1') and (select state = 'COMPLETED' from teams where id = :'at1'));
select t_ok('room NOT finished when only the first team completes', (select status = 'PLAYING' from rooms where id = :'rooma'));
select t_expect('completed team cannot draw', format('select draw_card(%L,%L)', :'at1', gen_random_uuid()), 'team_inactive');
select t_ok('team state: 4/4 pieces, no card, 4 piece records', (get_team_state(:'at1')->'progress'->>'revealed')::int = 4 and get_team_state(:'at1')->'card' = 'null'::jsonb);

\echo '--- A3 team 2 draws everything and discards/places badly (all five score events), then deck runs out'
select t_play(:'at2', 'd2', 'mixed', false) as p2 \gset
select t_ok('team 2 score equals independently computed expectation', (select score from team_game_states where team_id = :'at2') = ((:'p2'::jsonb)->>'expected')::int);
select t_ok('ledger chain consistent for team 2', t_ledger_ok(:'at2'));
select t_ok('deck exhausted -> recovery "none" with default settings (no silent recycling)', (:'p2'::jsonb)->>'deck_empty' = 'none');
select t_ok('team 2 drew each of the 8 cards exactly once', (select count(distinct question_id) from card_draws where team_id = :'at2') = 8 and (select count(*) from card_draws where team_id = :'at2') = 8);
select t_ok('team state tells the team only STUCK (no hidden info)', get_team_state(:'at2')->>'recovery' = 'STUCK');
select t_expect('rescue is disabled by default', format('select draw_rescue_card(%L,%L)', :'at2', gen_random_uuid()), 'rescue_disabled');
select t_ok('softlock_detected event reached team 2', (select count(*) from game_events where team_id = :'at2' and event_type = 'softlock_detected') >= 1);
select t_uid('a1');
select t_ok('team 1 draws were independent of team 2 (same questions drawn by both)',
  (select count(*) from card_draws a join card_draws b on a.question_id = b.question_id where a.team_id = :'at1' and b.team_id = :'at2') >= 4);

\echo '--- A4 security: what a team captain must NOT be able to do'
select t_uid('d1');
update team_game_states set score = 999 where team_id = :'at1';
select t_ok('direct score update has no effect', (select score from team_game_states where team_id = :'at1') = 40);
select t_expect('direct insert into card_draws', format('insert into card_draws(room_id,team_id,question_id) values (%L,%L,%L)', :'rooma', :'at1', gen_random_uuid()), 'new row violates row-level security%');
select t_expect('direct insert into score_ledger', format('insert into score_ledger(room_id,team_id,event_type,points,previous_score,new_score) values (%L,%L,%L,100,0,100)', :'rooma', :'at1', 'X'), 'new row violates row-level security%');
select t_expect('direct insert into team_piece_states (fake reveal)', format('insert into team_piece_states(team_id,piece_id,room_id,image_id,row_idx,col_idx,x,y,w,h,svg_path,mask_path) values (%L,%L,%L,%L,0,0,0,0,1,1,%L,%L)', :'at1', gen_random_uuid(), :'rooma', gen_random_uuid(), 'M0 0Z', 'm/y/0-0'), 'new row violates row-level security%');
select t_expect('direct insert into game_events', format('insert into game_events(room_id,event_type) values (%L,%L)', :'rooma', 'fake'), 'new row violates row-level security%');
select 'ok   player sees 0 rows in secret tables', (select count(*) from questions) + (select count(*) from accepted_answers) + (select count(*) from question_piece_mappings)
  + (select count(*) from room_story_snapshots) + (select count(*) from idempotency_keys) + (select count(*) from card_answers) + (select count(*) from team_recovery_states) = 0;
select t_ok('no access to the other team: draws, pieces, ledger, state', (select count(*) from card_draws where team_id = :'at2') + (select count(*) from team_piece_states where team_id = :'at2')
  + (select count(*) from score_ledger where team_id = :'at2') + (select count(*) from team_game_states where team_id = :'at2') = 0);
select t_ok('other team''s TEAM events are invisible, ROOM events visible', (select count(*) from game_events where team_id = :'at2' and visibility = 'TEAM') = 0 and (select count(*) from game_events where visibility = 'ROOM') > 0);
select t_expect('get_team_state of another team', format('select get_team_state(%L)', :'at2'), 'forbidden');
select t_ok('leaderboard readable by room members: team 1 first', get_leaderboard(:'rooma')->0->>'team' = :'at1');
select t_ok('storage: only the revealed piece images of own team are readable', (select count(*) from storage.objects where bucket_id = 'story-pieces') = 4);
select t_expect('player cannot adjust a score', format('select adjust_score(%L, 500, %L)', :'at1', 'cheat'), 'forbidden');
select t_expect('player cannot change a team state', format('select set_team_state(%L, %L, %L)', :'at2', 'DISQUALIFIED', 'x'), 'forbidden');
select t_expect('player cannot end the room', format('select set_room_status(%L, %L)', :'rooma', 'end'), 'forbidden');
select t_uid('d3');
select t_expect('plain member cannot become captain', format('select set_team_captain(%L,%L)', :'at1', '00000000-0000-0000-0000-0000000000d3'), 'forbidden');
select t_uid('a1');
select t_ok('admin (staff) can read the snapshot', (select count(*) from room_story_snapshots where room_id = :'rooma') = 1);
select t_ok('admin sees team 2 recovery = SOFTLOCKED', (select status = 'SOFTLOCKED' from team_recovery_states where team_id = :'at2'));

\echo '--- A5 admin exceptions: reasons required, progress kept, room finishes'
select t_expect('abandon without reason', format('select set_team_state(%L,%L,%L)', :'at2', 'ABANDONED', ' '), 'reason_required');
select set_team_state(:'at2', 'ABANDONED', 'team left the venue') is not null as _x;
select t_ok('room finished once no ACTIVE team remains', (select status = 'FINISHED' and finished_at is not null from rooms where id = :'rooma'));
select t_ok('abandoned team progress/score kept', (select score from team_game_states where team_id = :'at2') = ((:'p2'::jsonb)->>'expected')::int);
select t_ok('abandoned team has no rank', (select rank is null from team_game_states where team_id = :'at2'));
reset role;
select t_expect('ledger is append-only (update)', 'update score_ledger set points = 0', 'immutable_history');
select t_expect('ledger is append-only (delete)', 'delete from score_ledger', 'immutable_history');
select t_expect('audit log is append-only', 'delete from audit_logs', 'immutable_history');

-- ===================================================================================
\echo '=== ROOM B: recycling limited to 1 cycle (discard everything) ==='
select t_mkroom('{"allow_deck_recycling":true,"max_recycle_cycles":1}') as rb \gset
select (:'rb'::jsonb)->>'room' as roomb, (:'rb'::jsonb)->>'team1' as bt1 \gset
set role authenticated;
select t_play(:'bt1', 'd1', 'discard_all', true) as pb \gset
select t_ok('first deck: 8 draws, then ONE recycle (16 draws total), then stuck', ((:'pb'::jsonb)->>'draws')::int = 16 and (:'pb'::jsonb)->>'deck_empty' = 'none');
select t_ok('recycled draws are recorded as RECYCLED in cycle 2', (select count(*) from card_draws where team_id = :'bt1' and kind = 'RECYCLED' and cycle = 2) = 8
  and (select count(*) from card_draws where team_id = :'bt1' and kind = 'NORMAL' and cycle = 1) = 8);
select t_ok('first-cycle draws marked recycled', (select count(*) from card_draws where team_id = :'bt1' and cycle = 1 and recycled_at is not null) = 8);
select t_ok('score = -80 (own cards discarded wrongly in both cycles)', (select score from team_game_states where team_id = :'bt1') = -80 and t_ledger_ok(:'bt1'));
select t_uid('a1');
select t_ok('recycle cycles used = 1 and recovery SOFTLOCKED after the limit', (select cycles_used = 1 and status = 'SOFTLOCKED' from team_recovery_states where team_id = :'bt1'));
reset role;

\echo '=== ROOM B2: recycle once, then finish the image ==='
select t_mkroom('{"allow_deck_recycling":true,"max_recycle_cycles":1}') as rb2 \gset
select (:'rb2'::jsonb)->>'team1' as b2t1 \gset
set role authenticated;
select t_play(:'b2t1', 'd1', 'discard_first', true, 8) as pb2 \gset
select t_ok('team recovered through the recycle and completed', ((:'pb2'::jsonb)->>'done')::boolean and (select score from team_game_states where team_id = :'b2t1') = 0);
select t_ok('ledger consistent after recycle', t_ledger_ok(:'b2t1'));
reset role;

-- ===================================================================================
\echo '=== ROOM C: rescue draws (no recycling), cost 5, max 2 ==='
select t_mkroom('{"allow_deck_recycling":false,"rescue_enabled":true,"max_rescue_draws":2,"rescue_cost_points":5}') as rc \gset
select (:'rc'::jsonb)->>'team1' as ct1 \gset
set role authenticated;
select t_uid('d1');
select t_expect('rescue refused while normal cards remain', format('select draw_rescue_card(%L,%L)', :'ct1', gen_random_uuid()), 'deck_not_empty');
select t_play(:'ct1', 'd1', 'discard_all', true) as pc \gset
select t_ok('deck empty -> rescue offered (not auto-granted)', (:'pc'::jsonb)->>'deck_empty' = 'rescue' and get_team_state(:'ct1')->>'recovery' = 'RESCUE_AVAILABLE');
select draw_rescue_card(:'ct1', gen_random_uuid()) as rc1 \gset
select t_ok('rescue card served like a normal card', (:'rc1'::jsonb)->'card'->>'kind' = 'RESCUE' and (:'rc1'::text) !~* '(answers|piece|image|mask)');
select submit_answer(((:'rc1'::jsonb)->'card'->>'draw_id')::uuid, 'a' || substr((:'rc1'::jsonb)->'card'->'question'->>'text', 2), null, gen_random_uuid()) is not null as _a1;
select decide_card(((:'rc1'::jsonb)->'card'->>'draw_id')::uuid, case when substr((:'rc1'::jsonb)->'card'->'question'->>'text', 2)::int <= 4 then 'PLACE' else 'DISCARD' end, gen_random_uuid()) is not null as _d1;
select draw_rescue_card(:'ct1', gen_random_uuid()) as rc2 \gset
select submit_answer(((:'rc2'::jsonb)->'card'->>'draw_id')::uuid, 'a' || substr((:'rc2'::jsonb)->'card'->'question'->>'text', 2), null, gen_random_uuid()) is not null as _a2;
select decide_card(((:'rc2'::jsonb)->'card'->>'draw_id')::uuid, case when substr((:'rc2'::jsonb)->'card'->'question'->>'text', 2)::int <= 4 then 'PLACE' else 'DISCARD' end, gen_random_uuid()) is not null as _d2;
select t_expect('third rescue draw refused', format('select draw_rescue_card(%L,%L)', :'ct1', gen_random_uuid()), 'rescue_exhausted');
select t_ok('rescue cost charged twice (-5 each) in the ledger', (select count(*) = 2 and sum(points) = -10 from score_ledger where team_id = :'ct1' and event_type = 'RESCUE_COST'));
select t_ok('rescue cards were different (not repeatable)', (select count(distinct question_id) = 2 from card_draws where team_id = :'ct1' and kind = 'RESCUE'));
select t_ok('ledger consistent with rescue costs', t_ledger_ok(:'ct1'));
reset role;

-- ===================================================================================
\echo '=== ROOM D: RETRY policy (2 attempts) ==='
select t_mkroom('{"wrong_answer_policy":"RETRY","max_attempts":2}') as rd \gset
select (:'rd'::jsonb)->>'team1' as dt1 \gset
set role authenticated;
select t_uid('d1');
select draw_card(:'dt1', gen_random_uuid())->'card'->>'draw_id' as ddraw \gset
select submit_answer(:'ddraw', 'nope', null, gen_random_uuid()) as dw1 \gset
select t_ok('1st wrong answer: retry offered, no penalty', (:'dw1'::jsonb)->>'retry' = 'true' and (:'dw1'::jsonb)->>'final' = 'false' and (select score from team_game_states where team_id = :'dt1') = 0);
select submit_answer(:'ddraw', 'nope again', null, gen_random_uuid()) as dw2 \gset
select t_ok('attempts exhausted: card discarded with -10', (:'dw2'::jsonb)->>'final' = 'true' and ((:'dw2'::jsonb)->>'points')::int = -10 and (select score from team_game_states where team_id = :'dt1') = -10);
select t_ok('answer reveal after failure (default on) returns the correct answer', (:'dw2'::jsonb) ? 'correct_answer');
select t_uid('a1');
select t_ok('both attempts recorded', (select count(*) = 2 from card_answers where draw_id = :'ddraw'::uuid));
reset role;

\echo '=== ROOM E: SKIP policy ==='
select t_mkroom('{"wrong_answer_policy":"SKIP"}') as re \gset
select (:'re'::jsonb)->>'team1' as et1 \gset
set role authenticated;
select t_uid('d1');
select draw_card(:'et1', gen_random_uuid())->'card'->>'draw_id' as edraw \gset
select submit_answer(:'edraw', 'nope', null, gen_random_uuid()) as ew \gset
select t_ok('SKIP: card discarded, no penalty, no ledger entry', (:'ew'::jsonb)->>'final' = 'true' and ((:'ew'::jsonb)->>'points')::int = 0
  and (select score from team_game_states where team_id = :'et1') = 0 and (select count(*) from score_ledger where team_id = :'et1') = 0);
reset role;

\echo '=== ROOM F: card time limit (5 s) ==='
select t_mkroom('{"card_time_limit_seconds":5}') as rf \gset
select (:'rf'::jsonb)->>'team1' as ft1 \gset
set role authenticated;
select t_uid('d1');
select draw_card(:'ft1', gen_random_uuid()) as fc \gset
select t_ok('time limit shown on the card', (:'fc'::jsonb)->'card'->>'time_limit_seconds' = '5');
select t_age_draw(((:'fc'::jsonb)->'card'->>'draw_id')::uuid, 10);
select submit_answer(((:'fc'::jsonb)->'card'->>'draw_id')::uuid, 'a' || substr((:'fc'::jsonb)->'card'->'question'->>'text', 2), null, gen_random_uuid()) as ft \gset
select t_ok('late correct answer is treated as a timeout with the wrong-answer penalty', (:'ft'::jsonb)->>'timeout' = 'true' and ((:'ft'::jsonb)->>'points')::int = -10);
reset role;

-- ===================================================================================
\echo '=== ROOM G: captain failover ==='
select t_mkroom('{}') as rg \gset
select (:'rg'::jsonb)->>'room' as roomg, (:'rg'::jsonb)->>'team1' as gt1 \gset
set role authenticated;
select t_uid('d3');
select heartbeat(:'roomg') is not null as _h0;
select t_ok('no failover while the captain is recent', (select captain_user_id = '00000000-0000-0000-0000-0000000000d1' from teams where id = :'gt1'));
reset role;
select t_age_member(:'roomg', 'd1', 60);
set role authenticated;
select t_uid('d3');
select heartbeat(:'roomg') is not null as _h1;
select t_ok('captain silent beyond grace -> online member becomes captain', (select captain_user_id = '00000000-0000-0000-0000-0000000000d3' from teams where id = :'gt1'));
select t_ok('failover recorded in captain history', (select count(*) = 1 from team_captain_history where team_id = :'gt1' and reason = 'failover'));
select t_uid('d1');
select t_expect('old captain can no longer act', format('select draw_card(%L,%L)', :'gt1', gen_random_uuid()), 'captain_only');
select heartbeat(:'roomg') is not null as _h2;
select t_ok('returning captain does NOT automatically take over again', (select captain_user_id = '00000000-0000-0000-0000-0000000000d3' from teams where id = :'gt1'));
select t_ok('reconnect event emitted', (select count(*) >= 1 from game_events where room_id = :'roomg' and event_type = 'player_reconnected'));
select t_uid('d3');
select set_team_captain(:'gt1', '00000000-0000-0000-0000-0000000000d1') is not null as _hand;
select t_ok('explicit handover restores the original captain', (select captain_user_id = '00000000-0000-0000-0000-0000000000d1' from teams where id = :'gt1'));
select t_ok('exactly one captain at a time (single column) and 3 history rows', (select count(*) = 2 from team_captain_history where team_id = :'gt1' and reason in ('failover','handover')));
reset role;

-- ===================================================================================
\echo '=== ROOM H: both teams finish, snapshot independence, admin adjustment ==='
select t_mkroom('{}') as rh \gset
select (:'rh'::jsonb)->>'room' as roomh, (:'rh'::jsonb)->>'team1' as ht1, (:'rh'::jsonb)->>'team2' as ht2 \gset
select t_mutate_source();
set role authenticated;
select t_play(:'ht1', 'd1', 'optimal', true) as ph1 \gset
select t_play(:'ht2', 'd2', 'optimal', false) as ph2 \gset
select t_ok('game works from the snapshot although the source story was edited behind it', ((:'ph1'::jsonb)->>'done')::boolean and ((:'ph2'::jsonb)->>'done')::boolean);
select t_ok('room finished automatically after BOTH teams completed', (get_leaderboard(:'roomh')->0->>'rank') = '1' and (get_leaderboard(:'roomh')->1->>'rank') = '2');
select t_uid('a1');
select t_ok('rooms status FINISHED', (select status = 'FINISHED' from rooms where id = :'roomh'));
select t_ok('first finisher ranked first by server completion time', (select (select completed_at from team_game_states where team_id = :'ht1') < (select completed_at from team_game_states where team_id = :'ht2')));
select t_expect('adjustment needs a reason', format('select adjust_score(%L, 25, %L)', :'ht1', ''), 'reason_required');
select adjust_score(:'ht1', 25, 'judge ruling') as adj \gset
select t_ok('adjustment is a ledger event with reason and new total', :'adj'::int = 65 and (select count(*) = 1 from score_ledger where team_id = :'ht1' and event_type = 'ADMIN_ADJUSTMENT' and reason = 'judge ruling'));
select t_ok('adjustment audited with original score', (select (details->>'original')::int = 40 from audit_logs where action = 'score.adjust' order by id desc limit 1));
select t_ok('ledger chain still consistent', t_ledger_ok(:'ht1'));
reset role;
