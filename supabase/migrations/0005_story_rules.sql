-- 0005_story_rules.sql
-- Story-specific rule overrides: NULL = follow platform default, a value = explicit override.
-- card_time_limit_seconds: 0 = explicitly no limit, 5..3600 = seconds.

alter table story_settings
  add constraint ss_points check (
    coalesce(points_correct_place, 0) between -1000 and 1000 and coalesce(points_wrong_place, 0) between -1000 and 1000 and
    coalesce(points_correct_discard, 0) between -1000 and 1000 and coalesce(points_wrong_discard, 0) between -1000 and 1000 and
    coalesce(points_wrong_answer, 0) between -1000 and 1000),
  add constraint ss_attempts check (max_attempts is null or max_attempts between 1 and 10),
  add constraint ss_time check (card_time_limit_seconds is null or card_time_limit_seconds = 0 or card_time_limit_seconds between 5 and 3600);

create or replace function guard_story_settings() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_status story_status;
begin
  select status into v_status from stories where id = coalesce(new.story_id, old.story_id);
  if v_status = 'PUBLISHED' then raise exception 'story_published'; end if;
  return coalesce(new, old);
end $$;
create trigger guard_story_settings before insert or update or delete on story_settings
  for each row execute function guard_story_settings();
