-- Hybrid Detective foundation (0029): lab, interrogation, verdict, guidance, team sharing and isolation.
-- Run after migrations and supabase/tests/fixtures/hybrid_mini.sql (case 'hybrid-mini-fixture').
-- Users: a1 admin, d1/d2 players (team), d3 outsider.
do $$
declare v_case uuid; v_ver uuid; v_s uuid; v_t uuid; r jsonb; inv jsonb; v_knife uuid; v_towel uuid; v_card uuid; v_scene uuid;
  v_mgr uuid; v_cln uuid; v_lab1 uuid; v_lab2 uuid; v_score int; v_party uuid; v_code text; ok boolean;
  A constant text := '00000000-0000-0000-0000-0000000000a1'; D1 constant text := '00000000-0000-0000-0000-0000000000d1';
  D2 constant text := '00000000-0000-0000-0000-0000000000d2'; D3 constant text := '00000000-0000-0000-0000-0000000000d3';
begin
  select id into v_case from detective_cases where slug = 'hybrid-mini-fixture';
  perform set_config('app.uid', A, false);
  r := validate_detective_case(v_case);
  if jsonb_array_length(r->'errors') <> 0 then raise exception 'FAIL fixture invalid: %', r; end if;
  perform publish_detective_case(v_case);
  select id into v_ver from detective_case_versions where case_id = v_case;
  select e.id into v_knife from detective_evidence e join detective_scenes s on s.id = e.scene_id where s.version_id = v_ver and e.evidence_key = 'knife';
  select e.id into v_towel from detective_evidence e join detective_scenes s on s.id = e.scene_id where s.version_id = v_ver and e.evidence_key = 'towel';
  select e.id, e.scene_id into v_card, v_scene from detective_evidence e join detective_scenes s on s.id = e.scene_id where s.version_id = v_ver and e.evidence_key = 'card';
  select id into v_mgr from detective_suspects where version_id = v_ver and name = 'Manager';
  select id into v_cln from detective_suspects where version_id = v_ver and name = 'Cleaner';
  select id into v_lab1 from detective_lab_procedures where version_id = v_ver and procedure_key = 'blood-knife';
  select id into v_lab2 from detective_lab_procedures where version_id = v_ver and procedure_key = 'prints-card';

  -- ===== solo player d1 =====
  perform set_config('app.uid', D1, false);
  v_s := (start_detective_session(v_case, 'SOLO')->>'session_id')::uuid;
  inv := get_detective_investigation(v_s);
  if jsonb_array_length(inv->'lab') <> 0 then raise exception 'FAIL lab visible before any sample found: %', inv->'lab'; end if;
  if inv->'verdict' ? 'correct' or inv::text ~ '"motive_answer"|"method_answer"|"key_evidence"|"timeline_order"' then raise exception 'FAIL verdict key leaked'; end if;
  if (inv->'settings'->'stages') <> '["BRIEFING", "CRIME_SCENE", "LAB", "INTERROGATION", "VERDICT"]'::jsonb then raise exception 'FAIL settings %', inv->'settings'; end if;
  raise notice 'ok investigation payload hides lab results, answers and verdict key';

  begin perform detective_lab_request(v_s, v_lab1); raise exception 'FAIL lab without sample'; exception when others then if sqlerrm <> 'sample_missing' then raise; end if; end;
  begin perform detective_confront(v_s, v_mgr, v_card); raise exception 'FAIL confront without evidence'; exception when others then if sqlerrm <> 'evidence_not_found' then raise; end if; end;
  raise notice 'ok lab and confrontation need the evidence to be discovered first';

  perform detective_inspect(v_s, v_scene, 15, 15);   -- knife
  inv := get_detective_investigation(v_s);
  if jsonb_array_length(inv->'lab') <> 1 or inv->'lab'->0->>'result_ar' is not null then raise exception 'FAIL lab before request: %', inv->'lab'; end if;
  r := detective_lab_request(v_s, v_lab1);
  if r->>'status' <> 'READY' then raise exception 'FAIL instant lab not ready %', r; end if;
  v_score := (select score from detective_player_progress where session_id = v_s and user_id = D1::uuid);
  r := detective_lab_request(v_s, v_lab1);
  if not (r->>'already')::boolean or (select score from detective_player_progress where session_id = v_s and user_id = D1::uuid) <> v_score then raise exception 'FAIL lab points twice'; end if;
  inv := get_detective_investigation(v_s);
  if inv->'lab'->0->>'result_ar' <> 'الدم يطابق الضحية' or inv->'lab'->0->'report'->'sample_ids'->>0 <> 'S-1' then raise exception 'FAIL lab result after request %', inv->'lab'; end if;
  raise notice 'ok lab request is idempotent (points once) and returns the report';

  perform detective_inspect(v_s, v_scene, 75, 75);   -- card
  r := detective_lab_request(v_s, v_lab2);
  if r->>'status' <> 'PENDING' then raise exception 'FAIL delayed lab should be pending %', r; end if;
  inv := get_detective_investigation(v_s);
  if exists (select 1 from jsonb_array_elements(inv->'lab') x where x->>'key' = 'prints-card' and (x->>'result_ar' is not null or x->>'status' <> 'PENDING')) then raise exception 'FAIL pending lab result leaked'; end if;
  raise notice 'ok delayed lab stays pending without result';

  r := detective_confront(v_s, v_cln, v_card);
  if (r->>'matched')::boolean then raise exception 'FAIL unauthored confrontation matched'; end if;
  v_score := (select score from detective_player_progress where session_id = v_s and user_id = D1::uuid);
  r := detective_confront(v_s, v_mgr, v_card);
  if not (r->>'matched')::boolean or not (r->>'reveals_contradiction')::boolean or r->>'response_ar' <> 'يمكن نسيته هناك' then raise exception 'FAIL confrontation %', r; end if;
  r := detective_confront(v_s, v_mgr, v_card);
  if not (r->>'already')::boolean or (select score from detective_player_progress where session_id = v_s and user_id = D1::uuid) <> v_score + 20 then raise exception 'FAIL confrontation points'; end if;
  raise notice 'ok confrontation: authored response, contradiction, points once';

  -- hints: level order, cooldown, max
  r := detective_use_hint(v_s);
  if (r->>'level')::int <> 1 then raise exception 'FAIL first hint should be level 1: %', r; end if;
  begin perform detective_use_hint(v_s); raise exception 'FAIL hint cooldown'; exception when others then if sqlerrm <> 'hint_cooldown' then raise; end if; end;
  update detective_hint_uses set created_at = now() - interval '2 minutes' where session_id = v_s;
  r := detective_use_hint(v_s);
  if (r->>'level')::int <> 2 then raise exception 'FAIL second hint level %', r; end if;
  update detective_hint_uses set created_at = now() - interval '2 minutes' where session_id = v_s;
  begin perform detective_use_hint(v_s); raise exception 'FAIL hint max'; exception when others then if sqlerrm <> 'hint_limit' then raise; end if; end;
  raise notice 'ok hints follow level order, cooldown and maximum';

  -- verdict
  begin perform detective_finish(v_s); raise exception 'FAIL finish without verdict'; exception when others then if sqlerrm not in ('verdict_required', 'conclusion_required') then raise; end if; end;
  begin perform detective_submit_verdict(v_s, v_mgr, 'fraud', 'knife', array[v_towel], array['enter','fight','leave']); raise exception 'FAIL undiscovered evidence in verdict'; exception when others then if sqlerrm <> 'evidence_not_found' then raise; end if; end;
  r := detective_submit_verdict(v_s, v_mgr, 'fraud', 'knife', array[v_knife, v_card], array['enter','fight','leave'], 'الكارت');
  if r::text ~ 'total|correct|points' then raise exception 'FAIL verdict reveals grading %', r; end if;
  begin perform detective_submit_verdict(v_s, v_cln, 'anger', 'poison', '{}', '{}'); raise exception 'FAIL second verdict'; exception when others then if sqlerrm <> 'verdict_already_submitted' then raise; end if; end;
  begin perform detective_resolution(v_s); raise exception 'FAIL resolution before finish'; exception when others then if sqlerrm <> 'not_completed' then raise; end if; end;
  raise notice 'ok verdict: once, only discovered evidence, no grading or answer before finish';

  -- answer questions, finish
  perform submit_detective_answer(v_s, q.id, jsonb_build_object('option_id', q.answer_key->>'option_id'), gen_random_uuid()) from detective_questions q where q.version_id = v_ver order by q.position;
  v_score := (select score from detective_player_progress where session_id = v_s and user_id = D1::uuid);
  r := detective_finish(v_s);
  if (select score from detective_player_progress where session_id = v_s and user_id = D1::uuid) <> v_score + 100 then
    raise exception 'FAIL verdict points: before % after % (expected +100)', v_score, (select score from detective_player_progress where session_id = v_s and user_id = D1::uuid); end if;
  r := detective_resolution(v_s);
  if (r->'verdict'->>'points')::int <> 100 or r->'verdict'->'correct'->>'motive' <> 'fraud' or (r->'confrontations'->>'contradictions_found')::int <> 1 then raise exception 'FAIL resolution %', r; end if;
  raise notice 'ok full verdict = 100 points, awarded once at finish; resolution shows the answer';
end $$;

-- partial credit (pure grading function, run as the database owner)
do $$
declare v_ver uuid; v_mgr uuid; v_cln uuid; v_knife uuid; v_card uuid; v_towel uuid; g jsonb;
begin
  select v.id into v_ver from detective_case_versions v join detective_cases c on c.id = v.case_id where c.slug = 'hybrid-mini-fixture';
  select id into v_mgr from detective_suspects where version_id = v_ver and name = 'Manager';
  select id into v_cln from detective_suspects where version_id = v_ver and name = 'Cleaner';
  select e.id into v_knife from detective_evidence e join detective_scenes s on s.id = e.scene_id where s.version_id = v_ver and e.evidence_key = 'knife';
  select e.id into v_card from detective_evidence e join detective_scenes s on s.id = e.scene_id where s.version_id = v_ver and e.evidence_key = 'card';
  select e.id into v_towel from detective_evidence e join detective_scenes s on s.id = e.scene_id where s.version_id = v_ver and e.evidence_key = 'towel';
  g := detective_grade_verdict(v_ver, v_mgr, 'anger', 'poison', '{}', '{}');
  if (g->>'total')::int <> 20 then raise exception 'FAIL right suspect without evidence should be half (20): %', g; end if;
  g := detective_grade_verdict(v_ver, v_cln, 'fraud', 'knife', array[v_knife], array['enter','leave','fight']);
  if (g->>'suspect')::int <> 0 or (g->>'motive')::int <> 15 or (g->>'evidence')::int <> 10 or (g->>'timeline')::int <> 3 then raise exception 'FAIL partial %', g; end if;
  g := detective_grade_verdict(v_ver, v_mgr, 'fraud', 'knife', array[v_knife, v_card, v_towel], array['enter','fight','leave']);
  if (g->>'evidence')::int <> 15 then raise exception 'FAIL wrong evidence should cost half a piece: %', g; end if;
  raise notice 'ok partial credit: suspect without evidence halved, motive/method/evidence/timeline scored separately';
end $$;

-- team sharing and isolation
do $$
declare v_case uuid; v_ver uuid; v_party uuid; v_code text; v_s uuid; v_o uuid; v_card uuid; v_scene uuid; v_mgr uuid; inv jsonb;
  D1 constant text := '00000000-0000-0000-0000-0000000000d1'; D2 constant text := '00000000-0000-0000-0000-0000000000d2'; D3 constant text := '00000000-0000-0000-0000-0000000000d3';
begin
  select id into v_case from detective_cases where slug = 'hybrid-mini-fixture';
  select id into v_ver from detective_case_versions where case_id = v_case;
  select e.id, e.scene_id into v_card, v_scene from detective_evidence e join detective_scenes s on s.id = e.scene_id where s.version_id = v_ver and e.evidence_key = 'card';
  select id into v_mgr from detective_suspects where version_id = v_ver and name = 'Manager';
  perform set_config('app.uid', D1, false);
  select (x->>'party_id')::uuid, x->>'code' into v_party, v_code from detective_party_create(v_case, 'COOPERATIVE', 'Detective 1') x;
  perform detective_party_ready(v_party, true);
  perform set_config('app.uid', D2, false);
  perform detective_party_join(v_code, 'Detective 2');
  perform detective_party_ready(v_party, true);
  perform set_config('app.uid', D1, false);
  perform detective_party_start(v_party);
  select shared_session into v_s from detective_parties where id = v_party;
  perform set_config('app.uid', D2, false);
  perform detective_inspect(v_s, v_scene, 75, 75);
  perform detective_confront(v_s, v_mgr, v_card);
  perform set_config('app.uid', D1, false);
  inv := get_detective_investigation(v_s);
  if jsonb_array_length(inv->'confrontations') <> 1 then raise exception 'FAIL teammate does not see the confrontation: %', inv->'confrontations'; end if;
  raise notice 'ok teammates share confrontations';
  perform set_config('app.uid', D3, false);
  begin perform get_detective_investigation(v_s); raise exception 'FAIL outsider read team investigation'; exception when others then if sqlerrm <> 'session_forbidden' then raise; end if; end;
  begin perform detective_confront(v_s, v_mgr, v_card); raise exception 'FAIL outsider confronted'; exception when others then if sqlerrm <> 'session_forbidden' then raise; end if; end;
  v_o := (start_detective_session(v_case, 'SOLO')->>'session_id')::uuid;
  inv := get_detective_investigation(v_o);
  if jsonb_array_length(inv->'confrontations') <> 0 or jsonb_array_length(inv->'lab') <> 0 then raise exception 'FAIL another team sees progress'; end if;
  raise notice 'ok other players cannot read or act on a team investigation, and do not inherit its progress';
end $$;
