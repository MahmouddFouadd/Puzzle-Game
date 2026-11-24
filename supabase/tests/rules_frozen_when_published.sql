set role authenticated; set app.uid = '00000000-0000-0000-0000-0000000000a1';
select 'publish', publish_story('11111111-1111-1111-1111-111111111111');
update story_settings set points_correct_place = 99;
delete from story_settings;
select 'rules after publish attempt', points_correct_place from story_settings;
