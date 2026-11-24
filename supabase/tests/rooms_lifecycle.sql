-- Requires stub_supabase_schemas.sql + migrations 0001-0006 and the published story from lifecycle_and_security.sql
\set ON_ERROR_STOP off
\pset tuples_only on
reset role;
grant all on all tables in schema public to authenticated;
insert into auth.users(id,email) values
 ('00000000-0000-0000-0000-0000000000c1','p1'),('00000000-0000-0000-0000-0000000000c2','p2'),('00000000-0000-0000-0000-0000000000c3','p3'),
 ('00000000-0000-0000-0000-0000000000c4','p4'),('00000000-0000-0000-0000-0000000000c5','p5');
\set story '''11111111-1111-1111-1111-111111111111'''
\echo '=== admin creates rooms'
set role authenticated; set app.uid = '00000000-0000-0000-0000-0000000000a1';
select id as imga from story_images where story_id = :story order by position limit 1 \gset
select id as imgb from story_images where story_id = :story order by position desc limit 1 \gset
select 'too many teams (expect invalid_team_count)', create_room(:story, 3, 2, false, null, false, true);
select 'private w/o pin (expect pin_required)', create_room(:story, 2, 2, true, null, false, true);
select 'bad pin format (expect invalid_pin)', create_room(:story, 2, 2, true, 'ab', false, true);
select create_room(:story, 2, 2, true, '1234', false, true) ->> 'code' as code1 \gset
select create_room(:story, 2, 2, false, null, true, false, array['Admin Team A']) ->> 'code' as code2 \gset
select 'code format ok', :'code1' ~ '^[A-Z]{2}-[A-Z2-9]{6}$' and :'code1' <> :'code2';
select id as room1 from rooms where code = :'code1' \gset
select id as room2 from rooms where code = :'code2' \gset

\echo '=== PIN protection + rate limit'
set app.uid = '00000000-0000-0000-0000-0000000000c1';
select 'preview hides title for pin rooms', room_preview(:'code1');
select 'bad pin 1', join_room(:'code1', '0000', 'Mallory')->>'status';
select 'bad pin 2', join_room(:'code1', '1111', 'Mallory')->>'status';
select 'bad pin 3', join_room(:'code1', '2222', 'Mallory')->>'status';
select 'bad pin 4', join_room(:'code1', '3333', 'Mallory')->>'status';
select 'bad pin 5', join_room(:'code1', '4444', 'Mallory')->>'status';
select 'correct pin after 5 failures (expect too_many_attempts)', join_room(:'code1', '1234', 'Mallory')->>'status';
set app.uid = '00000000-0000-0000-0000-0000000000c5';
select 'no pin given by other user', join_room(:'code1', null, 'X')->>'status';
set app.uid = '00000000-0000-0000-0000-0000000000c2';
select 'p2 joins with pin', join_room(:'code1', '1234', 'Sara')->>'status';
select 'p2 rejoin is idempotent', join_room(:'code1', null, 'Sara')->>'status';
select 'unknown code', join_room('ZZ-AAAAAA', null, 'Sara')->>'status';

\echo '=== snapshot leaks nothing hidden'
select 'snapshot mentions image titles/answers? (expect f)', settings_snapshot::text ~* '(cairo|nile|storage_path|accepted|explanation)' from rooms where id = :'room1';
select 'player cannot read secrets', count(*) from room_secrets;
select 'player cannot read answers', count(*) from accepted_answers;

\echo '=== teams, capacity, captain'
select create_team(:'room1', 'Eagles') as team1 \gset
select 'creator is captain', captain_user_id = '00000000-0000-0000-0000-0000000000c2' from teams where id = :'team1';
select 'second team by same player (expect already_in_team)', create_team(:'room1', 'Dup');
set app.uid = '00000000-0000-0000-0000-0000000000c3';
select 'p3 joins', join_room(:'code1', '1234', 'Omar')->>'status';
select join_team(:'team1');
set app.uid = '00000000-0000-0000-0000-0000000000c4';
select 'p4 joins', join_room(:'code1', '1234', 'Lina')->>'status';
select 'team full (expect team_full)', join_team(:'team1');
select create_team(:'room1', 'Hawks') as team2 \gset
set app.uid = '00000000-0000-0000-0000-0000000000c5';
select 'third team (expect team_limit)', create_team(:'room1', 'Third');
select 'p5 outsider join_team (expect not_in_room)', join_team(:'team1');

\echo '=== atomic image selection, captain only'
set app.uid = '00000000-0000-0000-0000-0000000000c3';
select 'non-captain select (expect captain_only)', select_image(:'team1', :'imga');
select 'non-captain ready (expect captain_only)', set_team_ready(:'team1', true);
set app.uid = '00000000-0000-0000-0000-0000000000c2';
select 'captain selects A', select_image(:'team1', :'imga');
set app.uid = '00000000-0000-0000-0000-0000000000c4';
select 'other team same image (expect image_taken)', select_image(:'team2', :'imga');
select 'ready before image (expect select_image_first)', set_team_ready(:'team2', true);
select 'other team picks B', select_image(:'team2', :'imgb');
select 'ready', set_team_ready(:'team2', true);
select 'room status after one ready', status from rooms where id = :'room1';
set app.uid = '00000000-0000-0000-0000-0000000000c2';
select 'team1 ready', set_team_ready(:'team1', true);
select 'room status READY', status from rooms where id = :'room1';
select 'players see taken images', count(*) from team_image_assignments;
select 'p2 cannot see other room teams', count(*) from teams where room_id = :'room2';

\echo '=== direct writes are denied'
insert into teams(room_id,name) values (:'room1','Hack');
update teams set captain_user_id = '00000000-0000-0000-0000-0000000000c2';
update room_members set status = 'ACTIVE';
delete from team_image_assignments;
insert into game_events(room_id,event_type) values (:'room1','fake');
select 'assignments intact', count(*) from team_image_assignments;
select 'start by player (expect forbidden)', start_game(:'room1', false);

\echo '=== admin start with server countdown'
set app.uid = '00000000-0000-0000-0000-0000000000a1';
select 'start', start_game(:'room1', false);
select 'status', status from rooms where id = :'room1';
select 'too early advance stays COUNTDOWN', advance_room(:'room1');
select pg_sleep(3.2);
select 'advance after countdown', advance_room(:'room1');
select 'unpublish while room active (expect story_in_use)', set_story_status(:story, 'DRAFT');
select 'edit published image directly (expect story_published)', 1 where false;
update story_images set title = 'hack' where story_id = :story;
select 'pause', set_room_status(:'room1', 'pause');
select 'resume', set_room_status(:'room1', 'resume');
select 'remove captain p2 -> captain moves', remove_player(:'room1', '00000000-0000-0000-0000-0000000000c2');
select 'new captain is p3', captain_user_id = '00000000-0000-0000-0000-0000000000c3' from teams where id = :'team1';
set app.uid = '00000000-0000-0000-0000-0000000000c2';
select 'removed player cannot rejoin', join_room(:'code1', '1234', 'Sara')->>'status';
set app.uid = '00000000-0000-0000-0000-0000000000a1';
select 'cancel room1', set_room_status(:'room1', 'cancel');

\echo '=== admin-controlled joining (room2)'
set app.uid = '00000000-0000-0000-0000-0000000000c5';
select 'preview shows title (no pin)', room_preview(:'code2')->>'title';
select 'join -> pending', join_room(:'code2', null, 'Nour')->>'status';
select 'pending cannot create/join team (expect teams_disabled/not_in_room)', join_team((select id from teams where room_id = :'room2' limit 1));
select 'pending cannot see teams', count(*) from teams where room_id = :'room2';
set app.uid = '00000000-0000-0000-0000-0000000000a1';
select 'approve', resolve_member(:'room2', '00000000-0000-0000-0000-0000000000c5', true);
set app.uid = '00000000-0000-0000-0000-0000000000c5';
select 'now joins admin-made team', join_team((select id from teams where room_id = :'room2' limit 1));
select 'players cannot create teams here (expect teams_disabled)', create_team(:'room2', 'Mine');
select 'captain of admin team', captain_user_id = '00000000-0000-0000-0000-0000000000c5' from teams where room_id = :'room2';
reset role;
select 'audit', string_agg(distinct action, ',') from audit_logs where action like 'room.%';
select 'pin_fail events', count(*) from security_events where kind='pin_fail';
