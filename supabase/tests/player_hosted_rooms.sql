-- Player-hosted rooms (0027). Runs after game_engine.sql, whose fixture story 9999... exists.
-- Every line prints "ok" or "FAIL".
\set ON_ERROR_STOP off
\pset tuples_only on
reset role;
grant all on all tables in schema public to authenticated;
insert into auth.users(id,email) select ('00000000-0000-0000-0000-0000000000e' || n)::uuid, 'h' || n from generate_series(1,4) n on conflict do nothing;

-- a second published two-image story, plus one that stays disabled
create or replace function t_fixture_story(p_id uuid, p_title text) returns uuid language plpgsql security definer as $$
declare ia uuid := gen_random_uuid(); ib uuid := gen_random_uuid(); pa uuid[]; pb uuid[]; qid uuid; i int;
begin
  perform set_config('app.uid', '00000000-0000-0000-0000-0000000000a1', false);
  insert into stories(id,title,description,created_by) values (p_id, p_title, 'SECRET PLOT of ' || p_title, '00000000-0000-0000-0000-0000000000a1');
  insert into story_images(id,story_id,position,title,hint,storage_path,width,height,piece_count) values
    (ia,p_id,1,'A','hint a','a.png',800,600,4),(ib,p_id,2,'B','hint b','b.png',800,600,4);
  perform save_image_pieces(ia, 1, (select jsonb_agg(jsonb_build_object('row',r,'col',c,'x',c*10,'y',r*10,'w',10,'h',10,'path','M0 0Z','mask','m/'||ia||'/'||r||'-'||c)) from generate_series(0,1) r, generate_series(0,1) c), false);
  perform save_image_pieces(ib, 2, (select jsonb_agg(jsonb_build_object('row',r,'col',c,'x',c*10,'y',r*10,'w',10,'h',10,'path','M0 0Z','mask','m/'||ib||'/'||r||'-'||c)) from generate_series(0,1) r, generate_series(0,1) c), false);
  select array_agg(id order by row_idx,col_idx) into pa from puzzle_pieces where image_id = ia;
  select array_agg(id order by row_idx,col_idx) into pb from puzzle_pieces where image_id = ib;
  for i in 1..8 loop
    qid := save_question(p_id, null, jsonb_build_object('text','Q'||i,'type','SHORT_TEXT','published',true,'explanation','why','answers',jsonb_build_array('ANSWER'||i)));
    perform set_question_mapping(qid, case when i <= 4 then pa[i] else pb[i-4] end);
  end loop;
  perform approve_mappings(p_id); perform publish_story(p_id);
  return p_id;
end $$;
select t_fixture_story('88888888-8888-8888-8888-888888888881', 'Story Two') is not null as story_two;
select t_fixture_story('88888888-8888-8888-8888-888888888882', 'Hidden Story') is not null as story_hidden;
create or replace function t_team_images(p_room uuid) returns uuid[] language sql security definer as $$ select array_agg(id order by position) from story_images where story_id = (select story_id from rooms where id = p_room) $$;
create or replace function t_snapshot_title(p_room uuid) returns text language sql security definer as $$ select content->'story'->>'title' from room_story_snapshots where room_id = p_room $$;

-- the administrator enables the two playable stories; Hidden Story stays off
select t_uid('a1');
select set_story_player_selectable('99999999-9999-9999-9999-999999999999', true);
select set_story_player_selectable('88888888-8888-8888-8888-888888888881', true);
select set_story_player_selectable('88888888-8888-8888-8888-888888888882', false);

set role authenticated;
select t_uid('e1');
\echo '=== story list exposes titles only ==='
select t_ok('list has the two enabled stories', jsonb_array_length(list_selectable_stories()) >= 2
  and list_selectable_stories()::text like '%Story Two%' and list_selectable_stories()::text not like '%Hidden Story%');
select t_ok('cards carry only id/title/language/cover_url', not exists (
  select 1 from jsonb_array_elements(list_selectable_stories()) e, jsonb_object_keys(e) k where k not in ('id','title','language','cover_url')));
select t_ok('no description, questions or answers in the list', list_selectable_stories()::text not like '%SECRET PLOT%' and list_selectable_stories()::text not like '%ANSWER%');
\echo '=== direct API access to story content is denied ==='
select t_ok('players cannot read stories rows', (select count(*) from stories) = 0);
select t_ok('players cannot read questions', (select count(*) from questions) = 0);
select t_ok('players cannot read story images', (select count(*) from story_images) = 0);
select t_ok('players cannot read accepted answers', (select count(*) from accepted_answers) = 0);

\echo '=== creating a room ==='
select t_expect('disabled story rejected', $$select player_create_room('88888888-8888-8888-8888-888888888882', 'Host', 2)$$, '%story_not_available%');
select t_expect('unknown story rejected', $$select player_create_room(gen_random_uuid(), 'Host', 2)$$, '%story_not_available%');
select t_expect('a player cannot use the admin create_room', $$select create_room('99999999-9999-9999-9999-999999999999', 2, 4, false, null, false, true)$$, '%forbidden%');
create temp table t_room as select (x->>'id')::uuid id, x->>'code' code from (select player_create_room('99999999-9999-9999-9999-999999999999', 'Host', 2) x) y;
select t_ok('room is player-hosted and the creator is its host', (select player_hosted from rooms where id = (select id from t_room)) and is_room_host((select id from t_room)));
select t_ok('creator joined as an active member', exists (select 1 from room_members where room_id = (select id from t_room) and user_id = auth.uid() and status = 'ACTIVE'));
select t_ok('host cannot read the content snapshot', (select count(*) from room_story_snapshots where room_id = (select id from t_room)) = 0);
select t_expect('host cannot pause/end', $$select set_room_status((select id from t_room), 'end')$$, '%forbidden%');
select t_expect('host cannot remove players', $$select remove_player((select id from t_room), '00000000-0000-0000-0000-0000000000e2')$$, '%forbidden%');
select t_expect('host cannot enable stories', $$select set_story_player_selectable('88888888-8888-8888-8888-888888888882', true)$$, '%forbidden%');
select t_expect('host cannot update the room row directly', $$update rooms set max_teams = 9 where id = (select id from t_room) returning 1$$, 'NO_ERROR');
select t_ok('...and the direct update changed nothing', (select max_teams from rooms where id = (select id from t_room)) = 2);

\echo '=== choosing the story ==='
select t_uid('e2');
select t_ok('a second player joins by code', join_room((select code from t_room), null, 'P2')->>'status' = 'joined');
select t_expect('a non-host member cannot change the story', $$select player_set_room_story((select id from t_room), '88888888-8888-8888-8888-888888888881')$$, '%forbidden%');
select t_uid('e1');
select t_expect('host cannot pick a disabled story', $$select player_set_room_story((select id from t_room), '88888888-8888-8888-8888-888888888882')$$, '%story_not_available%');
select t_ok('host changes the story', player_set_room_story((select id from t_room), '88888888-8888-8888-8888-888888888881')->>'title' = 'Story Two');
select t_ok('lobby shows the new title', (select settings_snapshot->'story'->>'title' from rooms where id = (select id from t_room)) = 'Story Two');
reset role;
select t_ok('server snapshot switched to the new story', t_snapshot_title((select id from t_room)) = 'Story Two');
select t_ok('story_selected event broadcast', exists (select 1 from game_events where room_id = (select id from t_room) and event_type = 'story_selected'));
set role authenticated;

\echo '=== starting ==='
create temp table t_teams as select create_team((select id from t_room), 'Red') t1;
select t_uid('e2');
insert into t_teams select create_team((select id from t_room), 'Blue');
create temp table t_imgs as select t_team_images((select id from t_room)) imgs;
select t_uid('e1'); select select_image((select t1 from t_teams limit 1), (select imgs[1] from t_imgs)); select set_team_ready((select t1 from t_teams limit 1), true);
select t_uid('e2'); select select_image((select t1 from t_teams offset 1 limit 1), (select imgs[2] from t_imgs)); select set_team_ready((select t1 from t_teams offset 1 limit 1), true);
select t_expect('a non-host member cannot start', $$select start_game((select id from t_room), false)$$, '%forbidden%');
select t_uid('e1');
select t_expect('host starts once every team is ready', $$select start_game((select id from t_room), false)$$, 'NO_ERROR');
select t_ok('host started the game', (select status::text from rooms where id = (select id from t_room)) = 'COUNTDOWN');
select t_expect('story is locked after start', $$select player_set_room_story((select id from t_room), '99999999-9999-9999-9999-999999999999')$$, '%room_locked%');
select t_expect('host cannot cancel after start', $$select set_room_status((select id from t_room), 'cancel')$$, '%forbidden%');

\echo '=== host limits and admins ==='
create temp table t_room2 as select (player_create_room('99999999-9999-9999-9999-999999999999', 'Host', 2)->>'id')::uuid id;
select t_expect('host may cancel their own lobby', $$select set_room_status((select id from t_room2), 'cancel')$$, 'NO_ERROR');
select t_uid('e2');
select t_expect('another player cannot cancel it', $$select set_room_status((select id from t_room), 'cancel')$$, '%forbidden%');
select t_uid('e3');
select player_create_room('99999999-9999-9999-9999-999999999999', 'P3', 2); select player_create_room('99999999-9999-9999-9999-999999999999', 'P3', 2); select player_create_room('99999999-9999-9999-9999-999999999999', 'P3', 2);
select t_expect('at most three open rooms per player', $$select player_create_room('99999999-9999-9999-9999-999999999999', 'P3', 2)$$, '%too_many_open_rooms%');
select t_uid('a1');
select t_ok('admins still create rooms as before', (create_room('99999999-9999-9999-9999-999999999999', 2, 4, false, null, false, true)->>'id') is not null);
select t_ok('admins still read story content', (select count(*) from stories where id = '88888888-8888-8888-8888-888888888881') = 1);
reset role;
