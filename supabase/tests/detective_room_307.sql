-- Case 01 "Room 307" (pack v2) played through every hybrid layer as one detective:
-- all lab procedures, every authored confrontation, the full accusation, then the resolution.
do $$
declare v_case uuid; v_ver uuid; v_s uuid; e record; p record; c record; r jsonb; inv jsonb; v_ev uuid[]; v_sherif uuid; v_score int;
begin
  select id into v_case from detective_cases where slug = 'room-307';
  select id into v_ver from detective_case_versions where case_id = v_case;
  perform set_config('app.uid', '00000000-0000-0000-0000-0000000000a1', false);
  if exists (select 1 from detective_cases where id = v_case and status <> 'PUBLISHED') then perform publish_detective_case(v_case); end if;
  perform set_config('app.uid', '00000000-0000-0000-0000-0000000000d2', false);
  v_s := (start_detective_session(v_case, 'SOLO')->>'session_id')::uuid;
  inv := get_detective_investigation(v_s);
  if jsonb_array_length(inv->'lab') <> 1 then raise exception 'FAIL only the medical examiner summary should be available at start: %', inv->'lab'; end if;
  for e in select ev.* from detective_evidence ev join detective_scenes sc on sc.id = ev.scene_id where sc.version_id = v_ver loop
    perform detective_inspect(v_s, e.scene_id, e.x + e.width / 2, e.y + e.height / 2);
  end loop;
  for p in select * from detective_lab_procedures where version_id = v_ver loop perform detective_lab_request(v_s, p.id); end loop;
  update detective_lab_requests set ready_at = now() where session_id = v_s;
  inv := get_detective_investigation(v_s);
  if exists (select 1 from jsonb_array_elements(inv->'lab') x where x->>'status' <> 'READY' or x->>'result_ar' is null) or jsonb_array_length(inv->'lab') <> 9 then raise exception 'FAIL lab %', inv->'lab'; end if;
  for c in select * from detective_confrontations where version_id = v_ver loop perform detective_confront(v_s, c.suspect_id, c.evidence_id); end loop;
  inv := get_detective_investigation(v_s);
  if jsonb_array_length(inv->'confrontations') <> 9 then raise exception 'FAIL confrontations %', jsonb_array_length(inv->'confrontations'); end if;
  if inv::text ~ '"motive_answer"|"method_answer"|"key_evidence"' then raise exception 'FAIL verdict key leaked'; end if;
  select suspect_id, key_evidence into v_sherif, v_ev from detective_verdict_criteria where version_id = v_ver;
  perform detective_submit_verdict(v_s, v_sherif, 'fraud', 'masterkey-knife', v_ev, array['card_encoded','camera_off','room_entered','knife_dumped'], 'السجل والكاميرا والجاكيت');
  perform submit_detective_answer(v_s, q.id,
    case when q.answer_key ? 'option_id' then jsonb_build_object('option_id', q.answer_key->>'option_id')
         when q.question_type = 'TRUE_FALSE' then jsonb_build_object('value', q.answer_key->>'value') else q.answer_key end, gen_random_uuid())
  from detective_questions q join detective_stages st on st.id = q.stage_id where q.version_id = v_ver order by st.position, q.position;
  r := detective_finish(v_s);
  if (r->>'questions_correct')::int <> 9 or (r->>'conclusion_correct')::boolean is not true then raise exception 'FAIL report %', r; end if;
  r := detective_resolution(v_s);
  if (r->'verdict'->>'points')::int <> 100 or (r->'confrontations'->>'contradictions_found')::int <> 3 then raise exception 'FAIL resolution %', r; end if;
  select score into v_score from detective_player_progress where session_id = v_s;
  raise notice 'PASS room-307 : 12 clues, 9 lab reports, 9 confrontations (3 contradictions), verdict 100/100, total score %', v_score;
end $$;
