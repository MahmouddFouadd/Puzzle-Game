-- 0022: Arabic explanations for evidence, evidence relations and statements (shown in the final report).
alter table detective_evidence add column if not exists admin_explanation_ar text;
alter table detective_evidence_relations add column if not exists public_explanation_ar text;
alter table detective_statements add column if not exists admin_explanation_ar text;

create or replace function detective_report(p_session uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_version uuid; v_found uuid[]; pp detective_player_progress%rowtype; v_hits int; v_insp int;
begin
  v_version := detective_session_version(p_session);
  if v_version is null then raise exception 'session_forbidden'; end if;
  select * into pp from detective_player_progress where session_id = p_session and user_id = auth.uid();
  if pp.completed_at is null then raise exception 'not_completed'; end if;
  v_found := detective_found_ids(p_session);
  select count(*) filter (where evidence_id is not null), count(*) into v_hits, v_insp from detective_inspections where session_id = p_session and user_id = auth.uid();
  return jsonb_build_object(
    'case', (select jsonb_build_object('title', c.title, 'title_ar', c.title_ar, 'estimated_minutes', c.estimated_minutes, 'id', c.id)
      from detective_cases c join detective_case_versions v on v.case_id = c.id where v.id = v_version),
    'score', pp.score, 'duration_seconds', extract(epoch from pp.completed_at - pp.started_at)::int,
    'evidence_found', coalesce(array_length(v_found, 1), 0),
    'evidence_total', (select count(*) from detective_evidence e join detective_scenes sc on sc.id = e.scene_id where sc.version_id = v_version),
    'inspections', v_insp, 'hits', v_hits,
    'questions_total', (select count(*) from detective_questions where version_id = v_version),
    'questions_correct', (select count(*) from detective_submissions where session_id = p_session and submitted_by = auth.uid() and is_correct),
    'hints_used', (select count(*) from detective_hint_uses where session_id = p_session and user_id = auth.uid()),
    'hint_penalty', (select coalesce(sum(penalty), 0) from detective_hint_uses where session_id = p_session and user_id = auth.uid()),
    'breakdown', (select coalesce(jsonb_object_agg(event_type, pts), '{}'::jsonb) from (select event_type, sum(points) pts from detective_score_events
      where session_id = p_session and user_id = auth.uid() group by event_type) x),
    'conclusion_correct', (select sb.is_correct from detective_submissions sb join detective_questions q on q.id = sb.question_id
      where sb.session_id = p_session and sb.submitted_by = auth.uid() and q.question_type = 'FINAL_CONCLUSION' limit 1),
    'questions', coalesce((select jsonb_agg(jsonb_build_object('prompt', q.prompt, 'prompt_ar', q.prompt_ar, 'type', q.question_type, 'options', q.options,
        'answer_key', q.answer_key, 'your_answer', sb.answer, 'is_correct', sb.is_correct, 'points', sb.points_delta,
        'explanation', q.explanation, 'explanation_ar', q.explanation_ar) order by st.position, q.position)
      from detective_questions q left join detective_stages st on st.id = q.stage_id
      left join detective_submissions sb on sb.question_id = q.id and sb.session_id = p_session and sb.submitted_by = auth.uid()
      where q.version_id = v_version), '[]'::jsonb),
    'evidence', coalesce((select jsonb_agg(jsonb_build_object('id', e.id, 'title', e.public_title, 'title_ar', e.public_title_ar, 'description', e.public_description,
        'description_ar', e.public_description_ar, 'explanation', e.admin_explanation, 'explanation_ar', e.admin_explanation_ar, 'classification', e.classification, 'importance', e.importance,
        'found', e.id = any(v_found), 'scene_id', e.scene_id, 'x', e.x, 'y', e.y, 'width', e.width, 'height', e.height) order by sc.position, e.importance desc)
      from detective_evidence e join detective_scenes sc on sc.id = e.scene_id where sc.version_id = v_version), '[]'::jsonb),
    'scenes', coalesce((select jsonb_agg(jsonb_build_object('id', sc.id, 'title', sc.title, 'title_ar', sc.title_ar, 'image_path', sc.image_path) order by sc.position)
      from detective_scenes sc where sc.version_id = v_version), '[]'::jsonb),
    'relations', coalesce((select jsonb_agg(jsonb_build_object('from', r.from_evidence_id, 'to', r.to_evidence_id, 'type', r.relation_type, 'explanation', r.public_explanation, 'explanation_ar', r.public_explanation_ar,
        'found_by_you', exists (select 1 from detective_board_links b where b.session_id = p_session and b.user_id = auth.uid() and b.relation = r.relation_type
          and ((b.from_evidence = r.from_evidence_id and b.to_evidence = r.to_evidence_id) or (b.from_evidence = r.to_evidence_id and b.to_evidence = r.from_evidence_id)))))
      from detective_evidence_relations r where r.version_id = v_version), '[]'::jsonb),
    'your_links', coalesce((select jsonb_agg(jsonb_build_object('from', b.from_evidence, 'to', b.to_evidence, 'relation', b.relation,
        'correct', exists (select 1 from detective_evidence_relations r where r.version_id = v_version and r.relation_type = b.relation
          and ((b.from_evidence = r.from_evidence_id and b.to_evidence = r.to_evidence_id) or (b.from_evidence = r.to_evidence_id and b.to_evidence = r.from_evidence_id)))))
      from detective_board_links b where b.session_id = p_session and b.user_id = auth.uid()), '[]'::jsonb),
    'statements', coalesce((select jsonb_agg(jsonb_build_object('suspect', sp.name, 'suspect_ar', sp.name_ar, 'statement', st.statement, 'statement_ar', st.statement_ar,
        'truth', st.truth_status, 'explanation', st.admin_explanation, 'explanation_ar', st.admin_explanation_ar, 'contradicted_by', to_jsonb(st.conflicting_evidence)) order by sp.name)
      from detective_statements st join detective_suspects sp on sp.id = st.suspect_id where sp.version_id = v_version), '[]'::jsonb),
    'solution', (select jsonb_build_object('reveal', s.public_reveal, 'reveal_ar', s.public_reveal_ar, 'explanation', s.educational_explanation,
        'explanation_ar', s.educational_explanation_ar, 'alternatives', s.alternative_hypotheses) from detective_solutions s where s.version_id = v_version limit 1));
end $$;
