-- Detective publish gate: a case is player-visible only after structural validation.
create or replace function validate_detective_case(p_case uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_version uuid;
  v_errors jsonb := '[]'::jsonb;
  v_warnings jsonb := '[]'::jsonb;
  v_count integer;
begin
  if not has_permission('story.manage') then raise exception 'forbidden'; end if;
  select id into v_version from detective_case_versions where case_id = p_case order by version_number desc limit 1;
  if v_version is null then return jsonb_build_object('errors', jsonb_build_array(jsonb_build_object('code','no_version')), 'warnings','[]'::jsonb); end if;
  select count(*) into v_count from detective_scenes where version_id = v_version;
  if v_count = 0 then v_errors := v_errors || jsonb_build_object('code','no_scenes'); end if;
  select count(*) into v_count from detective_stages where version_id = v_version;
  if v_count = 0 then v_errors := v_errors || jsonb_build_object('code','no_stages'); end if;
  select count(*) into v_count from detective_evidence e join detective_scenes s on s.id = e.scene_id where s.version_id = v_version;
  if v_count = 0 then v_errors := v_errors || jsonb_build_object('code','no_evidence'); end if;
  select count(*) into v_count from detective_questions where version_id = v_version;
  if v_count = 0 then v_errors := v_errors || jsonb_build_object('code','no_questions'); end if;
  select count(*) into v_count from detective_solutions where version_id = v_version;
  if v_count = 0 then v_errors := v_errors || jsonb_build_object('code','no_solution'); end if;
  select count(*) into v_count from detective_questions where version_id = v_version and jsonb_typeof(answer_key) <> 'object';
  if v_count > 0 then v_errors := v_errors || jsonb_build_object('code','invalid_answer_keys','count',v_count); end if;
  if exists (select 1 from detective_scenes where version_id = v_version and trim(image_path) = '') then v_errors := v_errors || jsonb_build_object('code','missing_scene_image'); end if;
  if exists (select 1 from detective_evidence e join detective_scenes s on s.id = e.scene_id where s.version_id = v_version and (e.x < 0 or e.x > 100 or e.y < 0 or e.y > 100)) then v_errors := v_errors || jsonb_build_object('code','invalid_hotspot_coordinates'); end if;
  return jsonb_build_object('errors', v_errors, 'warnings', v_warnings, 'version_id', v_version);
end $$;
revoke all on function validate_detective_case(uuid) from public, anon;
grant execute on function validate_detective_case(uuid) to authenticated;

create or replace function publish_detective_case(p_case uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_check jsonb;
  v_version uuid;
begin
  if not has_permission('story.manage') then raise exception 'forbidden'; end if;
  v_check := validate_detective_case(p_case);
  if jsonb_array_length(v_check->'errors') > 0 then raise exception 'detective_validation_failed' using detail = v_check::text; end if;
  v_version := (v_check->>'version_id')::uuid;
  update detective_cases set status = 'PUBLISHED', published_at = now(), updated_at = now() where id = p_case;
  update detective_case_versions set status = 'PUBLISHED', published_at = now() where id = v_version;
  return jsonb_build_object('case_id', p_case, 'version_id', v_version, 'status', 'PUBLISHED', 'validation', v_check);
end $$;
revoke all on function publish_detective_case(uuid) from public, anon;
grant execute on function publish_detective_case(uuid) to authenticated;
