-- 0030: Hybrid Detective – live team sync and captain permissions.
-- 1) Realtime: every investigation change broadcasts a tiny "changed" ping on the private topic detective:<session>.
--    The ping carries no game data; clients refetch through the RPCs, so nothing secret travels over Realtime.
--    Only members of the session may receive (RLS on realtime.messages); nobody may send.
-- 2) Captain: in a cooperative party, only the party host (captain) may submit the accusation and close a case
--    that has an accusation stage. Exploring, lab requests, confrontations and questions stay open to every member.
--    Cases without an accusation stage (the four v1 cases) keep their existing behaviour.

create or replace function public.detective_topic_allowed(p_topic text) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare m text[];
begin
  if auth.uid() is null or p_topic is null then return false; end if;
  m := regexp_match(p_topic, '^detective:([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$');
  if m is null then return false; end if;
  return detective_session_version(m[1]::uuid) is not null;
end $$;
revoke all on function public.detective_topic_allowed(text) from public, anon;
grant execute on function public.detective_topic_allowed(text) to authenticated;

do $$
begin
  if to_regclass('realtime.messages') is null then
    raise notice 'realtime.messages not present: detective realtime policy skipped';
    return;
  end if;
  execute 'drop policy if exists detective_members_receive on realtime.messages';
  execute $p$create policy detective_members_receive on realtime.messages for select to authenticated
    using (realtime.messages.extension = 'broadcast' and realtime.topic() like 'detective:%' and public.detective_topic_allowed(realtime.topic()))$p$;
end $$;

create or replace function public.detective_notify_change() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_session uuid;
begin
  v_session := case when tg_op = 'DELETE' then old.session_id else new.session_id end;
  if v_session is not null and to_regprocedure('realtime.send(jsonb,text,text,boolean)') is not null then
    begin
      execute 'select realtime.send($1, $2, $3, true)'
        using jsonb_build_object('kind', tg_table_name, 'at', now()), 'changed', 'detective:' || v_session::text;
    exception when others then null;  -- a lost ping must never block gameplay; clients also poll
    end;
  end if;
  return null;
end $$;
revoke all on function public.detective_notify_change() from public, anon, authenticated;

do $$
declare t text;
begin
  foreach t in array array['detective_discoveries','detective_submissions','detective_board_links','detective_lab_requests',
                           'detective_confrontation_uses','detective_verdicts','detective_player_progress'] loop
    execute format('drop trigger if exists detective_notify on %I', t);
    execute format('create trigger detective_notify after insert or update or delete on %I for each row execute function public.detective_notify_change()', t);
  end loop;
end $$;

-- ---------- captain ----------
-- true when the caller may take team-wide decisions in this session: solo players always; in a cooperative party, the host.
create or replace function public.detective_is_captain(p_session uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select pa.host_id = auth.uid() from detective_parties pa
                   where pa.shared_session = p_session and pa.mode = 'COOPERATIVE' limit 1), true);
$$;
revoke all on function public.detective_is_captain(uuid) from public, anon;
grant execute on function public.detective_is_captain(uuid) to authenticated;

create or replace function detective_submit_verdict(p_session uuid, p_suspect uuid, p_motive text, p_method text, p_evidence uuid[], p_timeline text[], p_explanation text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_version uuid; v_found uuid[]; g jsonb;
begin
  v_version := detective_require_playing(p_session);
  if not exists (select 1 from detective_verdict_criteria where version_id = v_version) then raise exception 'no_verdict_stage'; end if;
  if not detective_is_captain(p_session) then raise exception 'captain_only'; end if;
  if exists (select 1 from detective_verdicts where session_id = p_session) then raise exception 'verdict_already_submitted'; end if;
  if p_suspect is null or not exists (select 1 from detective_suspects where id = p_suspect and version_id = v_version) then raise exception 'suspect_not_found'; end if;
  v_found := detective_found_ids(p_session);
  if exists (select 1 from unnest(coalesce(p_evidence, '{}')) x where not (x = any(v_found))) then raise exception 'evidence_not_found'; end if;
  if coalesce(array_length(p_evidence, 1), 0) > 6 then raise exception 'too_much_evidence'; end if;
  if coalesce(array_length(p_timeline, 1), 0) > 12 then raise exception 'too_many_events'; end if;
  g := detective_grade_verdict(v_version, p_suspect, p_motive, p_method, p_evidence, p_timeline);
  insert into detective_verdicts(session_id, submitted_by, suspect_id, motive, method, evidence, timeline, explanation, breakdown, points)
  values (p_session, auth.uid(), p_suspect, p_motive, p_method, coalesce(p_evidence, '{}'), coalesce(p_timeline, '{}'), nullif(trim(p_explanation), ''), g, (g->>'total')::int)
  on conflict (session_id) do nothing;
  return jsonb_build_object('submitted', true);
end $$;

-- finish: 0029 behaviour + captain rule for cases with an accusation stage
create or replace function detective_finish(p_session uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_version uuid; v_links int; s detective_sessions%rowtype; vd detective_verdicts%rowtype;
begin
  v_version := detective_require_playing(p_session);
  if exists (select 1 from detective_questions q where q.version_id = v_version and q.question_type = 'FINAL_CONCLUSION'
      and not exists (select 1 from detective_submissions sb where sb.session_id = p_session and sb.question_id = q.id and (sb.submitted_by = auth.uid() or detective_shared(p_session))))
  then raise exception 'conclusion_required'; end if;
  if exists (select 1 from detective_verdict_criteria where version_id = v_version) then
    if not detective_is_captain(p_session) then raise exception 'captain_only'; end if;
    if not exists (select 1 from detective_verdicts where session_id = p_session) then raise exception 'verdict_required'; end if;
  end if;
  select count(*) into v_links from detective_board_links b where b.session_id = p_session and (b.user_id = auth.uid() or detective_shared(p_session))
    and exists (select 1 from detective_evidence_relations r where r.version_id = v_version and r.relation_type = b.relation
      and ((b.from_evidence = r.from_evidence_id and b.to_evidence = r.to_evidence_id) or (b.from_evidence = r.to_evidence_id and b.to_evidence = r.from_evidence_id)));
  if v_links > 0 and not (select bonus_awarded from detective_player_progress where session_id = p_session and user_id = auth.uid()) then
    perform detective_add_score(p_session, 'LINK_BONUS', v_links * 10);
  end if;
  select * into vd from detective_verdicts where session_id = p_session for update;
  if vd.session_id is not null and not vd.awarded then
    if vd.points > 0 then perform detective_add_score(p_session, 'VERDICT', vd.points); end if;
    update detective_verdicts set awarded = true where session_id = p_session;
  end if;
  update detective_player_progress set completed_at = now(), bonus_awarded = true where session_id = p_session and user_id = auth.uid();
  if detective_shared(p_session) then update detective_player_progress set completed_at = coalesce(completed_at, now()), bonus_awarded = true where session_id = p_session; end if;
  select * into s from detective_sessions where id = p_session;
  if (s.room_id is null and s.created_by = auth.uid()) or detective_shared(p_session) then update detective_sessions set status = 'FINISHED', finished_at = now() where id = p_session; end if;
  update detective_parties pa set status = 'FINISHED', updated_at = now()
   where pa.id in (select party_id from detective_party_members where session_id = p_session)
     and not exists (select 1 from detective_party_members m join detective_player_progress pp on pp.session_id = m.session_id and pp.user_id = m.user_id
                     where m.party_id = pa.id and m.status = 'ACTIVE' and pp.completed_at is null);
  return detective_report(p_session);
end $$;

-- investigation view: 0029 payload + whether the caller is the captain
create or replace function get_detective_investigation(p_session uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_version uuid; v_found uuid[]; v_settings jsonb; v_last timestamptz; v_used int;
begin
  v_version := detective_session_version(p_session);
  if v_version is null then raise exception 'session_forbidden'; end if;
  v_found := detective_found_ids(p_session);
  v_settings := detective_case_settings(v_version);
  select max(created_at), count(*) into v_last, v_used from detective_hint_uses where session_id = p_session and user_id = auth.uid();
  return jsonb_build_object(
    'settings', jsonb_build_object('stages', coalesce(v_settings->'stages', '[]'::jsonb), 'guidance', coalesce(v_settings->'guidance', '{}'::jsonb)),
    'captain', detective_is_captain(p_session),
    'lab', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'key', p.procedure_key, 'exam_type', p.exam_type, 'title', p.title, 'title_ar', p.title_ar,
        'evidence_id', p.evidence_id,
        'available', not exists (select 1 from unnest(p.requires_evidence) x where not (x = any(v_found))),
        'status', case when r.session_id is null then null when r.ready_at <= now() then 'READY' else 'PENDING' end,
        'ready_at', r.ready_at,
        'result', case when r.ready_at <= now() then p.result end, 'result_ar', case when r.ready_at <= now() then p.result_ar end,
        'report', case when r.ready_at <= now() then p.report end) order by p.position, p.procedure_key)
      from detective_lab_procedures p left join detective_lab_requests r on r.session_id = p_session and r.procedure_id = p.id
      where p.version_id = v_version and (p.evidence_id is null or p.evidence_id = any(v_found))), '[]'::jsonb),
    'suspects', coalesce((select jsonb_agg(jsonb_build_object('id', s.id, 'portrait_path', s.portrait_path, 'motive', s.motive, 'motive_ar', s.motive_ar,
        'alibi_ar', s.alibi_ar, 'relationship_ar', s.relationship_ar, 'background', s.background)) from detective_suspects s where s.version_id = v_version), '[]'::jsonb),
    'confrontations', coalesce((select jsonb_agg(jsonb_build_object('suspect_id', c.suspect_id, 'evidence_id', c.evidence_id, 'response', c.response, 'response_ar', c.response_ar,
        'reveals_contradiction', c.reveals_contradiction) order by u.created_at)
      from detective_confrontation_uses u join detective_confrontations c on c.id = u.confrontation_id where u.session_id = p_session), '[]'::jsonb),
    'verdict', (select jsonb_build_object('enabled', true, 'motive_options', k.motive_options, 'method_options', k.method_options,
        'evidence_max', 6, 'timeline_events', coalesce(array_length(k.timeline_order, 1), 0),
        'submitted', (select jsonb_build_object('suspect_id', v.suspect_id, 'motive', v.motive, 'method', v.method, 'evidence', to_jsonb(v.evidence), 'timeline', to_jsonb(v.timeline), 'explanation', v.explanation)
          from detective_verdicts v where v.session_id = p_session))
      from detective_verdict_criteria k where k.version_id = v_version),
    'hints', jsonb_build_object('used', coalesce(v_used, 0), 'max', (v_settings->'guidance'->>'max_hints')::int,
      'cooldown_seconds', coalesce((v_settings->'guidance'->>'cooldown_seconds')::int, 0), 'last_used_at', v_last),
    'server_now', now());
end $$;

-- ---------- timeline events revealed by evidence ----------
-- A v2 case can keep a timeline event hidden until the evidence that establishes it is found
-- (otherwise the timeline tab would hand out the key facts before any investigating).
alter table detective_timeline_events add column if not exists reveal_evidence uuid references detective_evidence(id) on delete set null;

-- session payload: identical to 0026 except the timeline filter and the hidden-event count
create or replace function get_detective_session_payload(p_session uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_version uuid; v_found uuid[]; v_cur uuid;
begin
  v_version := detective_session_version(p_session);
  if v_version is null then raise exception 'session_forbidden'; end if;
  v_found := detective_found_ids(p_session);
  v_cur := detective_current_stage(p_session);
  return jsonb_build_object(
    'session', (select jsonb_build_object('id', s.id, 'mode', s.mode, 'sharing', s.sharing, 'status', s.status, 'version_id', s.version_id) from detective_sessions s where s.id = p_session),
    'case', (select jsonb_build_object('id', c.id, 'slug', c.slug, 'title', c.title, 'title_ar', c.title_ar, 'description', c.description, 'description_ar', c.description_ar,
        'briefing', c.briefing, 'briefing_ar', c.briefing_ar, 'objective', c.objective, 'objective_ar', c.objective_ar, 'category', c.category,
        'estimated_minutes', c.estimated_minutes, 'difficulty', c.difficulty, 'cover_image_path', c.cover_image_path, 'case_type', c.case_type,
        'age_min', c.age_min, 'age_max', c.age_max)
      from detective_cases c join detective_case_versions v on v.case_id = c.id where v.id = v_version),
    'stages', coalesce((select jsonb_agg(jsonb_build_object('id', st.id, 'stage_key', st.stage_key, 'position', st.position, 'title', st.title, 'title_ar', st.title_ar,
        'unlocked', detective_stage_unlocked(p_session, st.id), 'current', st.id = v_cur,
        'questions_total', (select count(*) from detective_questions q where q.stage_id = st.id)) order by st.position)
      from detective_stages st where st.version_id = v_version), '[]'::jsonb),
    'scenes', coalesce((select jsonb_agg(jsonb_build_object('id', sc.id, 'position', sc.position, 'title', sc.title, 'title_ar', sc.title_ar, 'image_path', sc.image_path,
        'introduction', sc.introduction, 'introduction_ar', sc.introduction_ar,
        'evidence_total', (select count(*) from detective_evidence e where e.scene_id = sc.id),
        'evidence', coalesce((select jsonb_agg(jsonb_build_object('id', e.id, 'evidence_key', e.evidence_key, 'public_title', e.public_title, 'public_title_ar', e.public_title_ar,
            'x', e.x, 'y', e.y, 'width', e.width, 'height', e.height, 'public_description', e.public_description, 'public_description_ar', e.public_description_ar,
            'classification', e.classification, 'importance', e.importance) order by e.evidence_key)
          from detective_evidence e where e.scene_id = sc.id and e.id = any(v_found)), '[]'::jsonb)) order by sc.position)
      from detective_scenes sc where sc.version_id = v_version), '[]'::jsonb),
    'questions', coalesce((select jsonb_agg(jsonb_build_object('id', q.id, 'stage_id', q.stage_id, 'question_type', q.question_type,
        'prompt', case when detective_stage_unlocked(p_session, q.stage_id) then q.prompt end,
        'prompt_ar', case when detective_stage_unlocked(p_session, q.stage_id) then q.prompt_ar end,
        'options', case when detective_stage_unlocked(p_session, q.stage_id) then q.options else '[]'::jsonb end,
        'associated_evidence', q.associated_evidence, 'points', q.points, 'penalty', q.penalty, 'position', q.position,
        'locked', not detective_stage_unlocked(p_session, q.stage_id),
        'answered', (select jsonb_build_object('is_correct', sb.is_correct, 'points_delta', sb.points_delta, 'answer', sb.answer,
            'correct_option', case when q.question_type <> 'FINAL_CONCLUSION' then q.answer_key->>'option_id' end,
            'explanation', case when q.question_type <> 'FINAL_CONCLUSION' then q.explanation end,
            'explanation_ar', case when q.question_type <> 'FINAL_CONCLUSION' then q.explanation_ar end)
          from detective_submissions sb where sb.session_id = p_session and sb.question_id = q.id and (sb.submitted_by = auth.uid() or detective_shared(p_session)) order by sb.created_at limit 1))
        order by (select position from detective_stages where id = q.stage_id), q.position)
      from detective_questions q where q.version_id = v_version), '[]'::jsonb),
    'suspects', coalesce((select jsonb_agg(jsonb_build_object('id', sp.id, 'name', sp.name, 'name_ar', sp.name_ar, 'description', sp.description, 'description_ar', sp.description_ar,
        'relationship', sp.relationship, 'alibi', sp.alibi,
        'statements', coalesce((select jsonb_agg(jsonb_build_object('id', st.id, 'statement', st.statement, 'statement_ar', st.statement_ar) order by st.id)
          from detective_statements st where st.suspect_id = sp.id), '[]'::jsonb)) order by sp.name)
      from detective_suspects sp where sp.version_id = v_version), '[]'::jsonb),
    'timeline', coalesce((select jsonb_agg(jsonb_build_object('id', te.id, 'event_key', te.event_key, 'label', te.label, 'label_ar', te.label_ar, 'window_key', te.window_key, 'position', te.position) order by te.position)
      from detective_timeline_events te where te.version_id = v_version and (te.reveal_evidence is null or te.reveal_evidence = any(v_found))), '[]'::jsonb),
    'timeline_hidden', (select count(*) from detective_timeline_events te where te.version_id = v_version and te.reveal_evidence is not null and not (te.reveal_evidence = any(v_found))),
    'board', coalesce((select jsonb_agg(jsonb_build_object('from', b.from_evidence, 'to', b.to_evidence, 'relation', b.relation) order by b.created_at)
      from detective_board_links b where b.session_id = p_session and (b.user_id = auth.uid() or detective_shared(p_session))), '[]'::jsonb),
    'hints_used', coalesce((select jsonb_agg(jsonb_build_object('key', u.hint_key, 'penalty', u.penalty,
        'text', (select hint_text from detective_hints where 'text:' || id = u.hint_key), 'text_ar', (select hint_text_ar from detective_hints where 'text:' || id = u.hint_key)) order by u.created_at)
      from detective_hint_uses u where u.session_id = p_session and u.user_id = auth.uid()), '[]'::jsonb),
    'note', (select body from detective_player_notes where session_id = p_session and user_id = auth.uid() and note_id = p_session),
    'stats', jsonb_build_object('found', coalesce(array_length(v_found, 1), 0),
      'total', (select count(*) from detective_evidence e join detective_scenes sc on sc.id = e.scene_id where sc.version_id = v_version),
      'inspections', (select count(*) from detective_inspections where session_id = p_session and user_id = auth.uid())),
    'progress', (select jsonb_build_object('score', pp.score, 'current_stage_id', v_cur, 'started_at', pp.started_at, 'completed_at', pp.completed_at)
      from detective_player_progress pp where pp.session_id = p_session and pp.user_id = auth.uid()),
    'party', (select jsonb_build_object('id', pa.id, 'code', pa.code, 'mode', pa.mode, 'status', pa.status)
      from detective_party_members m join detective_parties pa on pa.id = m.party_id where m.session_id = p_session and m.user_id = auth.uid() limit 1),
    'server_now', now());
end $$;

-- resolution: 0029 + the full timeline and suspect names (only after completion)
create or replace function detective_resolution(p_session uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_version uuid; k detective_verdict_criteria%rowtype; vd detective_verdicts%rowtype;
begin
  v_version := detective_session_version(p_session);
  if v_version is null then raise exception 'session_forbidden'; end if;
  if not exists (select 1 from detective_player_progress where session_id = p_session and user_id = auth.uid() and completed_at is not null) then raise exception 'not_completed'; end if;
  select * into k from detective_verdict_criteria where version_id = v_version;
  select * into vd from detective_verdicts where session_id = p_session;
  return jsonb_build_object(
    'verdict', case when k.version_id is null then null else jsonb_build_object(
      'correct', jsonb_build_object('suspect_id', k.suspect_id, 'motive', k.motive_answer, 'method', k.method_answer,
        'key_evidence', to_jsonb(k.key_evidence), 'timeline', to_jsonb(k.timeline_order), 'motive_options', k.motive_options, 'method_options', k.method_options),
      'yours', case when vd.session_id is null then null else jsonb_build_object('suspect_id', vd.suspect_id, 'motive', vd.motive, 'method', vd.method,
        'evidence', to_jsonb(vd.evidence), 'timeline', to_jsonb(vd.timeline), 'explanation', vd.explanation) end,
      'breakdown', vd.breakdown, 'points', vd.points) end,
    'lab', coalesce((select jsonb_agg(jsonb_build_object('key', p.procedure_key, 'title', p.title, 'title_ar', p.title_ar, 'exam_type', p.exam_type,
        'requested', r.session_id is not null, 'result', p.result, 'result_ar', p.result_ar, 'report', p.report) order by p.position)
      from detective_lab_procedures p left join detective_lab_requests r on r.session_id = p_session and r.procedure_id = p.id where p.version_id = v_version), '[]'::jsonb),
    'timeline', coalesce((select jsonb_agg(jsonb_build_object('event_key', te.event_key, 'label', te.label, 'label_ar', te.label_ar, 'window_key', te.window_key) order by te.position)
      from detective_timeline_events te where te.version_id = v_version), '[]'::jsonb),
    'suspects', coalesce((select jsonb_agg(jsonb_build_object('id', sp.id, 'name', sp.name, 'name_ar', sp.name_ar)) from detective_suspects sp where sp.version_id = v_version), '[]'::jsonb),
    'confrontations', jsonb_build_object(
      'total', (select count(*) from detective_confrontations where version_id = v_version),
      'used', (select count(*) from detective_confrontation_uses where session_id = p_session),
      'contradictions_total', (select count(*) from detective_confrontations where version_id = v_version and reveals_contradiction),
      'contradictions_found', (select count(*) from detective_confrontation_uses u join detective_confrontations c on c.id = u.confrontation_id where u.session_id = p_session and c.reveals_contradiction)));
end $$;
