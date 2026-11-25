-- Detective Mode runtime APIs. Additive: existing rooms, auth and scoring remain canonical.
-- Player reads never expose answer keys or administrator explanations.

create or replace function start_detective_session(p_case uuid, p_mode text default 'SOLO')
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := auth.uid();
  v_version uuid;
  v_session uuid;
begin
  if v_user is null then raise exception 'unauthorized'; end if;
  if p_mode not in ('SOLO','COOPERATIVE','COMPETITIVE','TEAMS') then raise exception 'invalid_mode'; end if;
  select v.id into v_version
  from detective_case_versions v
  join detective_cases c on c.id = v.case_id
  where c.id = p_case and c.status = 'PUBLISHED' and v.status = 'PUBLISHED'
  order by v.version_number desc limit 1;
  if v_version is null then raise exception 'case_not_published'; end if;
  insert into detective_sessions(version_id, mode, sharing, status, started_at, created_by)
  values (v_version, p_mode, case when p_mode = 'SOLO' then 'PRIVATE' else 'SHARED' end, 'PLAYING', now(), v_user)
  returning id into v_session;
  insert into detective_player_progress(session_id, user_id)
  values (v_session, v_user);
  return jsonb_build_object('session_id', v_session, 'version_id', v_version, 'status', 'PLAYING');
end $$;
revoke all on function start_detective_session(uuid, text) from public, anon;
grant execute on function start_detective_session(uuid, text) to authenticated;

create or replace function get_detective_session_payload(p_session uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_user uuid := auth.uid();
  v_version uuid;
  v_payload jsonb;
begin
  if v_user is null then raise exception 'unauthorized'; end if;
  select s.version_id into v_version from detective_sessions s
  where s.id = p_session and (s.created_by = v_user or exists (
    select 1 from room_members rm where rm.room_id = s.room_id and rm.user_id = v_user
  ));
  if v_version is null then raise exception 'session_forbidden'; end if;
  select jsonb_build_object(
    'session', (select jsonb_build_object('id', s.id, 'mode', s.mode, 'sharing', s.sharing, 'status', s.status, 'version_id', s.version_id) from detective_sessions s where s.id = p_session),
    'case', (select jsonb_build_object('id', c.id, 'slug', c.slug, 'title', c.title, 'title_ar', c.title_ar, 'description', c.description, 'description_ar', c.description_ar)
      from detective_cases c join detective_case_versions v on v.case_id = c.id where v.id = v_version),
    'stages', coalesce((select jsonb_agg(jsonb_build_object('id', st.id, 'stage_key', st.stage_key, 'position', st.position, 'title', st.title, 'title_ar', st.title_ar) order by st.position) from detective_stages st where st.version_id = v_version), '[]'::jsonb),
    'scenes', coalesce((select jsonb_agg(jsonb_build_object('id', sc.id, 'position', sc.position, 'title', sc.title, 'title_ar', sc.title_ar, 'image_path', sc.image_path, 'introduction', sc.introduction, 'introduction_ar', sc.introduction_ar,
      'evidence', coalesce((select jsonb_agg(jsonb_build_object('id', e.id, 'evidence_key', e.evidence_key, 'public_title', e.public_title, 'public_title_ar', e.public_title_ar, 'x', e.x, 'y', e.y, 'width', e.width, 'height', e.height, 'zoom_image_path', e.zoom_image_path, 'public_description', e.public_description, 'public_description_ar', e.public_description_ar, 'classification', e.classification, 'importance', e.importance) order by e.id) from detective_evidence e where e.scene_id = sc.id), '[]'::jsonb)) order by sc.position) from detective_scenes sc where sc.version_id = v_version), '[]'::jsonb),
    'questions', coalesce((select jsonb_agg(jsonb_build_object('id', q.id, 'stage_id', q.stage_id, 'question_type', q.question_type, 'prompt', q.prompt, 'prompt_ar', q.prompt_ar, 'options', q.options, 'associated_evidence', q.associated_evidence, 'points', q.points, 'penalty', q.penalty, 'position', q.position) order by q.position) from detective_questions q where q.version_id = v_version), '[]'::jsonb),
    'suspects', coalesce((select jsonb_agg(jsonb_build_object('id', sp.id, 'name', sp.name, 'name_ar', sp.name_ar, 'description', sp.description, 'description_ar', sp.description_ar, 'relationship', sp.relationship, 'alibi', sp.alibi,
      'statements', coalesce((select jsonb_agg(jsonb_build_object('id', st.id, 'statement', st.statement, 'statement_ar', st.statement_ar) order by st.id) from detective_statements st where st.suspect_id = sp.id), '[]'::jsonb)) order by sp.id) from detective_suspects sp where sp.version_id = v_version), '[]'::jsonb),
    'timeline', coalesce((select jsonb_agg(jsonb_build_object('id', te.id, 'event_key', te.event_key, 'label', te.label, 'label_ar', te.label_ar, 'window_key', te.window_key, 'position', te.position) order by te.position) from detective_timeline_events te where te.version_id = v_version), '[]'::jsonb),
    'progress', (select jsonb_build_object('score', pp.score, 'current_stage_id', pp.current_stage_id, 'completed_at', pp.completed_at) from detective_player_progress pp where pp.session_id = p_session and pp.user_id = v_user)
  ) into v_payload;
  return v_payload;
end $$;
revoke all on function get_detective_session_payload(uuid) from public, anon;
grant execute on function get_detective_session_payload(uuid) to authenticated;

create or replace function submit_detective_answer(p_session uuid, p_question uuid, p_answer jsonb, p_idempotency_key uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := auth.uid();
  v_q record;
  v_existing record;
  v_correct boolean := false;
  v_delta integer;
  v_previous integer;
  v_new integer;
  v_submission uuid;
  v_text text;
begin
  if v_user is null or p_idempotency_key is null then raise exception 'unauthorized'; end if;
  select id, is_correct, points_delta into v_existing from detective_submissions where idempotency_key = p_idempotency_key;
  if v_existing.id is not null then
    return jsonb_build_object('submission_id', v_existing.id, 'is_correct', v_existing.is_correct, 'points_delta', v_existing.points_delta, 'duplicate', true);
  end if;
  select q.* into v_q from detective_questions q join detective_sessions s on s.version_id = q.version_id
  where q.id = p_question and s.id = p_session and s.status = 'PLAYING'
    and (s.created_by = v_user or exists (select 1 from room_members rm where rm.room_id = s.room_id and rm.user_id = v_user));
  if v_q.id is null then raise exception 'question_forbidden'; end if;

  if v_q.question_type = 'MULTIPLE_CHOICE' then
    v_correct := coalesce(p_answer->>'option_id', '') = coalesce(v_q.answer_key->>'option_id', '');
  elsif v_q.question_type = 'EVIDENCE_RELATIONSHIP' then
    v_correct := coalesce(p_answer->>'from', '') = coalesce(v_q.answer_key->>'from', '')
      and coalesce(p_answer->>'to', '') = coalesce(v_q.answer_key->>'to', '')
      and coalesce(p_answer->>'relation', '') = coalesce(v_q.answer_key->>'relation', '');
  elsif v_q.question_type in ('FINAL_CONCLUSION','SHORT_TEXT') then
    v_text := lower(trim(coalesce(p_answer->>'text', p_answer->>'answer', '')));
    v_correct := v_text = lower(trim(coalesce(v_q.answer_key->>'answer', '')))
      or exists (select 1 from jsonb_array_elements(coalesce(v_q.accepted_alternatives, '[]'::jsonb)) a where lower(trim(coalesce(a->>'answer', ''))) = v_text);
  elsif v_q.question_type = 'TRUE_FALSE' then
    v_correct := coalesce(p_answer->>'value', '') = coalesce(v_q.answer_key->>'value', '');
  end if;
  v_delta := case when v_correct then v_q.points else v_q.penalty end;
  select score into v_previous from detective_player_progress where session_id = p_session and user_id = v_user for update;
  if v_previous is null then raise exception 'progress_not_found'; end if;
  v_new := v_previous + v_delta;
  insert into detective_submissions(session_id, question_id, submitted_by, answer, is_correct, points_delta, idempotency_key)
  values (p_session, p_question, v_user, p_answer, v_correct, v_delta, p_idempotency_key) returning id into v_submission;
  update detective_player_progress set score = v_new where session_id = p_session and user_id = v_user;
  insert into detective_score_events(session_id, user_id, event_type, points, previous_score, new_score, submission_id, idempotency_key)
  values (p_session, v_user, 'DETECTIVE_ANSWER', v_delta, v_previous, v_new, v_submission, gen_random_uuid());
  return jsonb_build_object('submission_id', v_submission, 'is_correct', v_correct, 'points_delta', v_delta, 'score', v_new, 'explanation', case when v_correct then v_q.explanation else null end, 'explanation_ar', case when v_correct then v_q.explanation_ar else null end, 'duplicate', false);
exception when unique_violation then
  select id, is_correct, points_delta into v_existing from detective_submissions where idempotency_key = p_idempotency_key;
  return jsonb_build_object('submission_id', v_existing.id, 'is_correct', v_existing.is_correct, 'points_delta', v_existing.points_delta, 'duplicate', true);
end $$;
revoke all on function submit_detective_answer(uuid, uuid, jsonb, uuid) from public, anon;
grant execute on function submit_detective_answer(uuid, uuid, jsonb, uuid) to authenticated;
