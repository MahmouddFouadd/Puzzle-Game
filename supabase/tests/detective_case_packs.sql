-- Plays every case-pack seed end to end: publish validation, tapping each hotspot centre, answering every
-- question with its answer key, finishing, and checking that the player payload never carries answers.
-- Run after the migrations and after loading supabase/seed/detective_{blue_ring_heist,clock_that_stopped,missing_180}.sql.
do $$
declare c record; v_session uuid; s record; e record; qq record; r jsonb; v_payload jsonb; v_rep jsonb; v_ans jsonb; v_found int; v_total int;
begin
  perform set_config('app.uid', '00000000-0000-0000-0000-0000000000a1', false);
  for c in select id, slug from detective_cases where slug in ('the-blue-ring-heist', 'the-clock-that-stopped', 'the-missing-180') order by slug loop
    perform publish_detective_case(c.id);
    perform set_config('app.uid', '00000000-0000-0000-0000-0000000000d1', false);
    v_session := (start_detective_session(c.id, 'SOLO')->>'session_id')::uuid;
    v_payload := get_detective_session_payload(v_session);
    if v_payload::text ~ '"answer_key"|"admin_explanation|"truth_status"|"public_reveal' then raise exception 'FAIL % payload leaks answers', c.slug; end if;
    if jsonb_array_length(v_payload->'scenes'->0->'evidence') <> 0 then raise exception 'FAIL % undiscovered evidence visible', c.slug; end if;
    -- an empty corner finds nothing
    for s in select sc.id from detective_scenes sc join detective_case_versions v on v.id = sc.version_id where v.case_id = c.id loop
      r := detective_inspect(v_session, s.id, 1, 1);
      if (r->>'found')::boolean and not exists (select 1 from detective_evidence where scene_id = s.id and x <= 2.5 and y <= 2.5) then raise exception 'FAIL % corner tap found evidence', c.slug; end if;
    end loop;
    -- every hotspot centre finds its own clue, and a second tap scores nothing
    for e in select ev.* from detective_evidence ev join detective_scenes sc on sc.id = ev.scene_id join detective_case_versions v on v.id = sc.version_id where v.case_id = c.id order by ev.width * ev.height loop
      r := detective_inspect(v_session, e.scene_id, e.x + e.width / 2, e.y + e.height / 2);
      if not (r->>'found')::boolean then raise exception 'FAIL % centre of % found nothing: %', c.slug, e.evidence_key, r; end if;
      if (r->'evidence'->>'id')::uuid <> e.id and coalesce((r->>'already')::boolean, false) = false then raise exception 'FAIL % centre of % found %', c.slug, e.evidence_key, r->'evidence'->>'evidence_key'; end if;
    end loop;
    select count(*) into v_found from detective_discoveries where session_id = v_session;
    select count(*) into v_total from detective_evidence ev join detective_scenes sc on sc.id = ev.scene_id join detective_case_versions v on v.id = sc.version_id where v.case_id = c.id;
    if v_found <> v_total then raise exception 'FAIL % found % of % (a hotspot is hidden under another)', c.slug, v_found, v_total; end if;
    -- answer everything correctly in stage order
    for qq in select q.* from detective_questions q join detective_stages st on st.id = q.stage_id join detective_case_versions v on v.id = q.version_id where v.case_id = c.id order by st.position, q.position loop
      v_ans := case when qq.answer_key ? 'option_id' then jsonb_build_object('option_id', qq.answer_key->>'option_id')
                    when qq.question_type = 'TRUE_FALSE' then jsonb_build_object('value', qq.answer_key->>'value') else qq.answer_key end;
      r := submit_detective_answer(v_session, qq.id, v_ans, gen_random_uuid());
      if not (r->>'is_correct')::boolean then raise exception 'FAIL % question % (%) graded wrong', c.slug, qq.position, qq.question_type; end if;
    end loop;
    v_rep := detective_finish(v_session);
    if (v_rep->>'questions_correct')::int <> (v_rep->>'questions_total')::int or (v_rep->>'conclusion_correct')::boolean is not true then raise exception 'FAIL % report %', c.slug, v_rep; end if;
    raise notice 'PASS % : % clues, % questions, score %', c.slug, v_total, v_rep->>'questions_total', v_rep->>'score';
    perform set_config('app.uid', '00000000-0000-0000-0000-0000000000a1', false);
  end loop;
end $$;
