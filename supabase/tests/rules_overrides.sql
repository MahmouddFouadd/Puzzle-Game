set role authenticated; set app.uid = '00000000-0000-0000-0000-0000000000a1';
insert into story_settings(story_id, points_correct_place, card_time_limit_seconds) values ('11111111-1111-1111-1111-111111111111', 20, 0);
select 'rules saved', points_correct_place, points_wrong_place is null as follows_default, card_time_limit_seconds from story_settings;
insert into story_settings(story_id, max_attempts) values ('11111111-1111-1111-1111-111111111111', 5) on conflict (story_id) do update set max_attempts = 5;
update platform_settings set points_correct_place = 50;
select 'override survives default change', points_correct_place from story_settings;
