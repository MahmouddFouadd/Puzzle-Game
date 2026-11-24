set role authenticated; set app.uid = '00000000-0000-0000-0000-0000000000a1';
select 'publish', publish_story('11111111-1111-1111-1111-111111111111');

do $$
begin
  begin
    update story_settings set points_correct_place = 99;
    raise exception 'FAIL published story rules update was allowed';
  exception when raise_exception then
    if sqlerrm='FAIL published story rules update was allowed' then raise; end if;
  end;
  begin
    delete from story_settings;
    raise exception 'FAIL published story rules delete was allowed';
  exception when raise_exception then
    if sqlerrm='FAIL published story rules delete was allowed' then raise; end if;
  end;
end $$;
select 'rules after publish attempt', points_correct_place from story_settings;
