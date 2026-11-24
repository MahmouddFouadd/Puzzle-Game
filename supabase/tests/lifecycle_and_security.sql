\set ON_ERROR_STOP off
\pset tuples_only on
grant all on all tables in schema public to authenticated;
grant all on all sequences in schema public to authenticated;
insert into auth.users(id,email) values ('00000000-0000-0000-0000-0000000000a1','admin@x'),('00000000-0000-0000-0000-0000000000b2','player@x');
insert into user_roles(user_id,role) values ('00000000-0000-0000-0000-0000000000a1','SUPER_ADMIN');

set role authenticated;
set app.uid = '00000000-0000-0000-0000-0000000000a1';
\echo '--- ADMIN setup'
insert into stories(id,title,created_by) values ('11111111-1111-1111-1111-111111111111','Egypt','00000000-0000-0000-0000-0000000000a1');
insert into story_images(id,story_id,position,title,hint,storage_path,width,height,piece_count) values
 ('22222222-2222-2222-2222-222222222221','11111111-1111-1111-1111-111111111111',1,'Cairo','h','a.png',800,600,4),
 ('22222222-2222-2222-2222-222222222222','11111111-1111-1111-1111-111111111111',2,'Nile','h','b.png',800,600,4);
select save_image_pieces(i, 7, (select jsonb_agg(jsonb_build_object('row',r,'col',c,'x',0,'y',0,'w',10,'h',10,'path','M0 0Z','mask','m/'||r||c)) from generate_series(0,1) r, generate_series(0,1) c), false)
 from unnest(array['22222222-2222-2222-2222-222222222221','22222222-2222-2222-2222-222222222222']::uuid[]) i;
select 'pieces', count(*) from puzzle_pieces;
select 'reorder', reorder_story_images('11111111-1111-1111-1111-111111111111', array['22222222-2222-2222-2222-222222222222','22222222-2222-2222-2222-222222222221']::uuid[]);
select 'positions', string_agg(title||position, ',' order by position) from story_images;


\echo '--- questions'
select save_question('11111111-1111-1111-1111-111111111111', null, '{"text":"Which river passes through Cairo?","type":"MULTIPLE_CHOICE","published":true,"options":[{"text":"Nile","correct":true},{"text":"Amazon","correct":false}]}') as q1 \gset
select save_question('11111111-1111-1111-1111-111111111111', null, '{"text":"Pyramids are in Giza","type":"TRUE_FALSE","published":true,"answers":["true"]}') as q2 \gset
select 'two-correct-options (expect invalid_question)', save_question('11111111-1111-1111-1111-111111111111', null, '{"text":"x","type":"MULTIPLE_CHOICE","options":[{"text":"a","correct":true},{"text":"b","correct":true}]}');
select 'answers-rows', count(*) from accepted_answers;
\echo '--- mapping'
select id as p1 from puzzle_pieces where image_id='22222222-2222-2222-2222-222222222221' order by row_idx,col_idx limit 1 \gset
select id as p2 from puzzle_pieces where image_id='22222222-2222-2222-2222-222222222221' order by row_idx,col_idx offset 1 limit 1 \gset
select set_question_mapping(:'q1', :'p1');
select 'same piece again (expect piece_taken)', set_question_mapping(:'q2', :'p1');
select 'suggest-apply', apply_suggested_mappings('11111111-1111-1111-1111-111111111111', jsonb_build_array(jsonb_build_object('question', :'q2', 'piece', :'p2')));
select 'validate (unapproved + uncovered)', validate_story('11111111-1111-1111-1111-111111111111')->'errors';
select 'approve', approve_mappings('11111111-1111-1111-1111-111111111111');
select 'regen-with-mappings (expect mappings_exist)', save_image_pieces('22222222-2222-2222-2222-222222222221', 9, (select jsonb_agg(jsonb_build_object('row',r,'col',c,'x',0,'y',0,'w',1,'h',1,'path','M0 0Z','mask','z')) from generate_series(0,1) r, generate_series(0,1) c), false);
select 'publish-incomplete (expect validation_failed)', publish_story('11111111-1111-1111-1111-111111111111');
\echo '--- complete coverage: give every remaining piece a question, then publish'
do $$
declare p record; q uuid; sid uuid := '11111111-1111-1111-1111-111111111111';
begin
  for p in select pc.id from puzzle_pieces pc join story_images i on i.id=pc.image_id where i.story_id=sid
           and not exists (select 1 from question_piece_mappings m where m.piece_id=pc.id) loop
    q := save_question(sid, null, '{"text":"filler","type":"SHORT_TEXT","published":true,"answers":["a","b"]}');
    perform set_question_mapping(q, p.id);
  end loop;
end $$;
select 'validate-after', validate_story('11111111-1111-1111-1111-111111111111');
select 'publish', publish_story('11111111-1111-1111-1111-111111111111');
select 'status', status from stories;
\echo '--- frozen while published'
select 'edit question (expect story_published)', save_question('11111111-1111-1111-1111-111111111111', :'q1', '{"text":"changed","type":"SHORT_TEXT","answers":["a"]}');
update questions set text='hack' where id = :'q1';
delete from question_piece_mappings;
update stories set title='hack' where id='11111111-1111-1111-1111-111111111111';
delete from stories where id='11111111-1111-1111-1111-111111111111';
select 'regen while published (expect story_published)', save_image_pieces('22222222-2222-2222-2222-222222222221', 9, '[]', true);
select 'unpublish', set_story_status('11111111-1111-1111-1111-111111111111','DRAFT');
select 'status', status from stories;
select 'edit allowed again', save_question('11111111-1111-1111-1111-111111111111', :'q1', '{"text":"Which river passes through Cairo?","type":"SHORT_TEXT","published":true,"answers":["Nile","The Nile"]}') = :'q1'::uuid;
select 'audit actions', string_agg(distinct action, ',') from audit_logs;
\echo '--- PLAYER'
set app.uid = '00000000-0000-0000-0000-0000000000b2';
select 'player sees questions', count(*) from questions;
select 'player sees answers', count(*) from accepted_answers;
select 'player sees mappings', count(*) from question_piece_mappings;
select 'player sees pieces', count(*) from puzzle_pieces;
select 'player stats (expect forbidden)', admin_dashboard_stats();
select 'player save_question (expect forbidden)', save_question('11111111-1111-1111-1111-111111111111', null, '{"text":"x","type":"SHORT_TEXT","answers":["a"]}');
select 'player grant_role (expect forbidden)', grant_role('00000000-0000-0000-0000-0000000000b2','SUPER_ADMIN');
update team_game_states set score = 9999;
select 'player score rows changed', count(*) from team_game_states where score = 9999;
select 'player audit read', count(*) from audit_logs;
