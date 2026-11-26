-- 0021: Detective Mode v2 – real hidden-evidence discovery, fair scoring, hints, evidence board,
-- final report and history. Server-authoritative; content tables stay staff-only.
--
-- Fixes:
--  * Evidence coordinates were sent to every player up front. The payload now contains only evidence the
--    player has discovered; discovery happens by tapping the scene (detective_inspect), checked server-side.
--  * submit_detective_answer awarded points on every resubmission (new idempotency key each time).
--    Now one scored attempt per player and question; stages unlock in order.
--  * discover_detective_evidence let a client "discover" any evidence id without finding it. Revoked.

alter table detective_cases add column if not exists category text not null default 'MYSTERY';
alter table detective_cases add column if not exists estimated_minutes int not null default 15 check (estimated_minutes between 1 and 240);
alter table detective_cases add column if not exists briefing text;
alter table detective_cases add column if not exists briefing_ar text;
alter table detective_cases add column if not exists objective text;
alter table detective_cases add column if not exists objective_ar text;

create table if not exists detective_inspections (
  id bigint generated always as identity primary key,
  session_id uuid not null references detective_sessions(id) on delete cascade,
  user_id uuid not null,
  scene_id uuid not null references detective_scenes(id) on delete cascade,
  x numeric not null, y numeric not null,
  evidence_id uuid references detective_evidence(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists detective_inspections_session_idx on detective_inspections(session_id, user_id, created_at);

create table if not exists detective_hint_uses (
  session_id uuid not null references detective_sessions(id) on delete cascade,
  user_id uuid not null,
  hint_key text not null,
  penalty int not null default 0,
  created_at timestamptz not null default now(),
  primary key (session_id, user_id, hint_key)
);

create table if not exists detective_board_links (
  session_id uuid not null references detective_sessions(id) on delete cascade,
  user_id uuid not null,
  from_evidence uuid not null references detective_evidence(id) on delete cascade,
  to_evidence uuid not null references detective_evidence(id) on delete cascade,
  relation text not null check (relation in ('SUPPORTS','CONTRADICTS','TEMPORAL','CONTEXTUAL','UNCERTAIN')),
  created_at timestamptz not null default now(),
  primary key (session_id, user_id, from_evidence, to_evidence),
  check (from_evidence <> to_evidence)
);

alter table detective_inspections enable row level security;
alter table detective_hint_uses enable row level security;
alter table detective_board_links enable row level security;
revoke all on detective_inspections, detective_hint_uses, detective_board_links from anon, authenticated;

alter table detective_player_progress add column if not exists bonus_awarded boolean not null default false;

-- ---------- helpers ----------
create or replace function detective_session_version(p_session uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select s.version_id from detective_sessions s
  where s.id = p_session and auth.uid() is not null and (s.created_by = auth.uid()
    or exists (select 1 from room_members rm where rm.room_id = s.room_id and rm.user_id = auth.uid()));
$$;

-- Evidence ids visible to the caller in this session (own discoveries; shared sessions share them).
create or replace function detective_found_ids(p_session uuid) returns uuid[]
language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(distinct d.evidence_id), '{}') from detective_discoveries d join detective_sessions s on s.id = d.session_id
  where d.session_id = p_session and (d.discovered_by = auth.uid() or s.sharing <> 'PRIVATE');
$$;

-- First stage that still has unanswered questions for the caller (null = all answered).
create or replace function detective_current_stage(p_session uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select st.id from detective_stages st join detective_sessions s on s.version_id = st.version_id
  where s.id = p_session and exists (select 1 from detective_questions q where q.stage_id = st.id
    and not exists (select 1 from detective_submissions sb where sb.session_id = p_session and sb.question_id = q.id and sb.submitted_by = auth.uid()))
  order by st.position limit 1;
$$;

create or replace function detective_stage_unlocked(p_session uuid, p_stage uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select p_stage is null or detective_current_stage(p_session) is null
    or (select position from detective_stages where id = p_stage) <= (select position from detective_stages where id = detective_current_stage(p_session));
$$;

create or replace function detective_add_score(p_session uuid, p_event text, p_points int) returns int
language plpgsql security definer set search_path = public as $$
declare v_prev int; v_new int;
begin
  select score into v_prev from detective_player_progress where session_id = p_session and user_id = auth.uid() for update;
  if v_prev is null then raise exception 'progress_not_found'; end if;
  v_new := v_prev + p_points;
  update detective_player_progress set score = v_new where session_id = p_session and user_id = auth.uid();
  insert into detective_score_events(session_id, user_id, event_type, points, previous_score, new_score, idempotency_key)
  values (p_session, auth.uid(), p_event, p_points, v_prev, v_new, gen_random_uuid());
  return v_new;
end $$;

create or replace function detective_require_playing(p_session uuid) returns uuid
language plpgsql stable security definer set search_path = public as $$
declare v_version uuid;
begin
  v_version := detective_session_version(p_session);
  if v_version is null then raise exception 'session_forbidden'; end if;
  if not exists (select 1 from detective_sessions where id = p_session and status = 'PLAYING') then raise exception 'session_not_playing'; end if;
  if exists (select 1 from detective_player_progress where session_id = p_session and user_id = auth.uid() and completed_at is not null) then raise exception 'already_completed'; end if;
  return v_version;
end $$;

-- ---------- discovery ----------
create or replace function detective_inspect(p_session uuid, p_scene uuid, p_x numeric, p_y numeric) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_version uuid; v_found uuid[]; e detective_evidence%rowtype; v_tol numeric := 1.5; v_recent int; v_points int; v_score int;
  v_locked boolean := false; v_warm boolean;
begin
  v_version := detective_require_playing(p_session);
  if not exists (select 1 from detective_scenes where id = p_scene and version_id = v_version) then raise exception 'scene_forbidden'; end if;
  if p_x < 0 or p_x > 100 or p_y < 0 or p_y > 100 then raise exception 'invalid_point'; end if;
  select count(*) into v_recent from detective_inspections where session_id = p_session and user_id = auth.uid() and created_at > now() - interval '1 minute';
  if v_recent >= 40 then raise exception 'slow_down'; end if;
  v_found := detective_found_ids(p_session);
  -- smallest matching box wins (most specific object)
  select * into e from detective_evidence
   where scene_id = p_scene and p_x between x - v_tol and x + width + v_tol and p_y between y - v_tol and y + height + v_tol
   order by (id = any(v_found)), width * height limit 1;
  if e.id is not null and not (e.id = any(v_found)) then
    v_locked := exists (select 1 from jsonb_array_elements_text(coalesce(e.unlock_rule->'requires_evidence', '[]'::jsonb)) r where not (r::uuid = any(v_found)));
  end if;
  insert into detective_inspections(session_id, user_id, scene_id, x, y, evidence_id)
  values (p_session, auth.uid(), p_scene, p_x, p_y, case when e.id is not null and not v_locked then e.id end);
  if e.id is null then
    select exists (select 1 from detective_evidence ev where ev.scene_id = p_scene and not (ev.id = any(v_found))
      and sqrt(power(p_x - (ev.x + ev.width / 2), 2) + power(p_y - (ev.y + ev.height / 2), 2)) < 12) into v_warm;
    return jsonb_build_object('found', false, 'warm', v_warm);
  end if;
  if v_locked then return jsonb_build_object('found', false, 'locked', true); end if;
  if e.id = any(v_found) then
    return jsonb_build_object('found', true, 'already', true, 'evidence', jsonb_build_object('id', e.id));
  end if;
  insert into detective_discoveries(session_id, evidence_id, discovered_by, inspection_status) values (p_session, e.id, auth.uid(), 'DISCOVERED')
  on conflict do nothing;
  v_points := 5 + case when e.importance >= 4 then 5 else 0 end;
  v_score := detective_add_score(p_session, 'DISCOVERY', v_points);
  return jsonb_build_object('found', true, 'points', v_points, 'score', v_score,
    'evidence', jsonb_build_object('id', e.id, 'evidence_key', e.evidence_key, 'public_title', e.public_title, 'public_title_ar', e.public_title_ar,
      'public_description', e.public_description, 'public_description_ar', e.public_description_ar, 'classification', e.classification,
      'importance', e.importance, 'x', e.x, 'y', e.y, 'width', e.width, 'height', e.height, 'scene_id', e.scene_id));
end $$;

revoke execute on function discover_detective_evidence(uuid, uuid, uuid) from public, anon, authenticated;

-- ---------- answers: one scored attempt, stage order enforced ----------
create or replace function submit_detective_answer(p_session uuid, p_question uuid, p_answer jsonb, p_idempotency_key uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_version uuid; v_q detective_questions%rowtype; v_prev detective_submissions%rowtype; v_correct boolean := false; v_text text;
  v_delta int; v_score int; v_sub uuid; v_correct_option text;
begin
  if p_idempotency_key is null then raise exception 'unauthorized'; end if;
  v_version := detective_require_playing(p_session);
  select * into v_q from detective_questions where id = p_question and version_id = v_version;
  if v_q.id is null then raise exception 'question_forbidden'; end if;
  select * into v_prev from detective_submissions where session_id = p_session and question_id = p_question and submitted_by = auth.uid() limit 1;
  if v_prev.id is not null then
    return jsonb_build_object('submission_id', v_prev.id, 'is_correct', v_prev.is_correct, 'points_delta', v_prev.points_delta, 'duplicate', true);
  end if;
  if not detective_stage_unlocked(p_session, v_q.stage_id) then raise exception 'stage_locked'; end if;

  if v_q.answer_key ? 'option_id' then
    v_correct := coalesce(p_answer->>'option_id', '') = v_q.answer_key->>'option_id';
    v_correct_option := v_q.answer_key->>'option_id';
  elsif v_q.question_type = 'EVIDENCE_RELATIONSHIP' then
    v_correct := ((p_answer->>'from' = v_q.answer_key->>'from' and p_answer->>'to' = v_q.answer_key->>'to')
                  or (p_answer->>'from' = v_q.answer_key->>'to' and p_answer->>'to' = v_q.answer_key->>'from'))
      and coalesce(p_answer->>'relation', '') = coalesce(v_q.answer_key->>'relation', '');
  elsif v_q.question_type = 'TRUE_FALSE' then
    v_correct := coalesce(p_answer->>'value', '') = coalesce(v_q.answer_key->>'value', '');
  else
    v_text := lower(trim(coalesce(p_answer->>'text', p_answer->>'answer', '')));
    v_correct := v_text <> '' and (v_text = lower(trim(coalesce(v_q.answer_key->>'answer', '')))
      or exists (select 1 from jsonb_array_elements(coalesce(v_q.accepted_alternatives, '[]'::jsonb)) a where lower(trim(coalesce(a->>'answer', ''))) = v_text));
  end if;
  v_delta := case when v_correct then v_q.points else v_q.penalty end;
  insert into detective_submissions(session_id, question_id, submitted_by, answer, is_correct, points_delta, idempotency_key)
  values (p_session, p_question, auth.uid(), p_answer, v_correct, v_delta, p_idempotency_key) returning id into v_sub;
  v_score := detective_add_score(p_session, 'DETECTIVE_ANSWER', v_delta);
  update detective_player_progress set current_stage_id = detective_current_stage(p_session) where session_id = p_session and user_id = auth.uid();
  return jsonb_build_object('submission_id', v_sub, 'is_correct', v_correct, 'points_delta', v_delta, 'score', v_score,
    'correct_option', case when v_q.question_type <> 'FINAL_CONCLUSION' then v_correct_option end,
    'explanation', case when v_q.question_type <> 'FINAL_CONCLUSION' then v_q.explanation end,
    'explanation_ar', case when v_q.question_type <> 'FINAL_CONCLUSION' then v_q.explanation_ar end);
end $$;

-- ---------- hints: text hints per stage, then an area hint ----------
create or replace function detective_use_hint(p_session uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_version uuid; v_stage uuid; v_found uuid[]; h detective_hints%rowtype; e detective_evidence%rowtype; v_score int; v_pen int;
begin
  v_version := detective_require_playing(p_session);
  v_stage := detective_current_stage(p_session);
  v_found := detective_found_ids(p_session);
  select * into h from detective_hints dh
   where dh.version_id = v_version and (dh.stage_id = v_stage or dh.stage_id is null)
     and coalesce((dh.unlock_rule->>'requires_discoveries')::int, 0) <= coalesce(array_length(v_found, 1), 0)
     and not exists (select 1 from detective_hint_uses u where u.session_id = p_session and u.user_id = auth.uid() and u.hint_key = 'text:' || dh.id)
   order by dh.position limit 1;
  if h.id is not null then
    v_pen := least(0, coalesce(h.penalty, -2));
    insert into detective_hint_uses(session_id, user_id, hint_key, penalty) values (p_session, auth.uid(), 'text:' || h.id, v_pen);
    v_score := detective_add_score(p_session, 'HINT', v_pen);
    return jsonb_build_object('kind', 'text', 'text', h.hint_text, 'text_ar', h.hint_text_ar, 'penalty', v_pen, 'score', v_score);
  end if;
  select ev.* into e from detective_evidence ev join detective_scenes sc on sc.id = ev.scene_id
   where sc.version_id = v_version and not (ev.id = any(v_found))
     and not exists (select 1 from jsonb_array_elements_text(coalesce(ev.unlock_rule->'requires_evidence', '[]'::jsonb)) r where not (r::uuid = any(v_found)))
     and not exists (select 1 from detective_hint_uses u where u.session_id = p_session and u.user_id = auth.uid() and u.hint_key = 'area:' || ev.id)
   order by ev.importance desc, sc.position, ev.id limit 1;
  if e.id is null then raise exception 'no_hints'; end if;
  v_pen := -3;
  insert into detective_hint_uses(session_id, user_id, hint_key, penalty) values (p_session, auth.uid(), 'area:' || e.id, v_pen);
  v_score := detective_add_score(p_session, 'HINT', v_pen);
  -- deliberately coarse: a circle around the object, not its exact box
  return jsonb_build_object('kind', 'area', 'scene_id', e.scene_id, 'cx', round((e.x + e.width / 2) / 5) * 5, 'cy', round((e.y + e.height / 2) / 5) * 5,
    'r', greatest(12, round(greatest(e.width, e.height))), 'penalty', v_pen, 'score', v_score);
end $$;

-- ---------- evidence board ----------
create or replace function detective_board_link(p_session uuid, p_from uuid, p_to uuid, p_relation text, p_remove boolean default false) returns void
language plpgsql security definer set search_path = public as $$
declare v_found uuid[];
begin
  perform detective_require_playing(p_session);
  if p_remove then
    delete from detective_board_links where session_id = p_session and user_id = auth.uid()
      and ((from_evidence = p_from and to_evidence = p_to) or (from_evidence = p_to and to_evidence = p_from));
    return;
  end if;
  v_found := detective_found_ids(p_session);
  if not (p_from = any(v_found)) or not (p_to = any(v_found)) or p_from = p_to then raise exception 'evidence_not_discovered'; end if;
  if p_relation not in ('SUPPORTS','CONTRADICTS','TEMPORAL','CONTEXTUAL','UNCERTAIN') then raise exception 'invalid_relation'; end if;
  if (select count(*) from detective_board_links where session_id = p_session and user_id = auth.uid()) >= 30 then raise exception 'too_many_links'; end if;
  delete from detective_board_links where session_id = p_session and user_id = auth.uid() and from_evidence = p_to and to_evidence = p_from;
  insert into detective_board_links(session_id, user_id, from_evidence, to_evidence, relation) values (p_session, auth.uid(), p_from, p_to, p_relation)
  on conflict (session_id, user_id, from_evidence, to_evidence) do update set relation = excluded.relation, created_at = now();
end $$;

create or replace function detective_save_note(p_session uuid, p_body text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if detective_session_version(p_session) is null then raise exception 'session_forbidden'; end if;
  if char_length(coalesce(p_body, '')) > 5000 then raise exception 'note_too_long'; end if;
  insert into detective_player_notes(session_id, user_id, note_id, body, updated_at) values (p_session, auth.uid(), p_session, coalesce(p_body, ''), now())
  on conflict (session_id, user_id, note_id) do update set body = excluded.body, updated_at = now();
end $$;

-- ---------- player payload (no hidden evidence, no answer keys) ----------
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
          from detective_submissions sb where sb.session_id = p_session and sb.question_id = q.id and sb.submitted_by = auth.uid() limit 1))
        order by (select position from detective_stages where id = q.stage_id), q.position)
      from detective_questions q where q.version_id = v_version), '[]'::jsonb),
    'suspects', coalesce((select jsonb_agg(jsonb_build_object('id', sp.id, 'name', sp.name, 'name_ar', sp.name_ar, 'description', sp.description, 'description_ar', sp.description_ar,
        'relationship', sp.relationship, 'alibi', sp.alibi,
        'statements', coalesce((select jsonb_agg(jsonb_build_object('id', st.id, 'statement', st.statement, 'statement_ar', st.statement_ar) order by st.id)
          from detective_statements st where st.suspect_id = sp.id), '[]'::jsonb)) order by sp.name)
      from detective_suspects sp where sp.version_id = v_version), '[]'::jsonb),
    'timeline', coalesce((select jsonb_agg(jsonb_build_object('id', te.id, 'event_key', te.event_key, 'label', te.label, 'label_ar', te.label_ar, 'window_key', te.window_key, 'position', te.position) order by te.position)
      from detective_timeline_events te where te.version_id = v_version), '[]'::jsonb),
    'board', coalesce((select jsonb_agg(jsonb_build_object('from', b.from_evidence, 'to', b.to_evidence, 'relation', b.relation) order by b.created_at)
      from detective_board_links b where b.session_id = p_session and b.user_id = auth.uid()), '[]'::jsonb),
    'hints_used', coalesce((select jsonb_agg(jsonb_build_object('key', u.hint_key, 'penalty', u.penalty,
        'text', (select hint_text from detective_hints where 'text:' || id = u.hint_key), 'text_ar', (select hint_text_ar from detective_hints where 'text:' || id = u.hint_key)) order by u.created_at)
      from detective_hint_uses u where u.session_id = p_session and u.user_id = auth.uid()), '[]'::jsonb),
    'note', (select body from detective_player_notes where session_id = p_session and user_id = auth.uid() and note_id = p_session),
    'stats', jsonb_build_object('found', coalesce(array_length(v_found, 1), 0),
      'total', (select count(*) from detective_evidence e join detective_scenes sc on sc.id = e.scene_id where sc.version_id = v_version),
      'inspections', (select count(*) from detective_inspections where session_id = p_session and user_id = auth.uid())),
    'progress', (select jsonb_build_object('score', pp.score, 'current_stage_id', v_cur, 'started_at', pp.started_at, 'completed_at', pp.completed_at)
      from detective_player_progress pp where pp.session_id = p_session and pp.user_id = auth.uid()),
    'server_now', now());
end $$;

-- ---------- finish + report ----------
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
        'description_ar', e.public_description_ar, 'explanation', e.admin_explanation, 'classification', e.classification, 'importance', e.importance,
        'found', e.id = any(v_found), 'scene_id', e.scene_id, 'x', e.x, 'y', e.y, 'width', e.width, 'height', e.height) order by sc.position, e.importance desc)
      from detective_evidence e join detective_scenes sc on sc.id = e.scene_id where sc.version_id = v_version), '[]'::jsonb),
    'scenes', coalesce((select jsonb_agg(jsonb_build_object('id', sc.id, 'title', sc.title, 'title_ar', sc.title_ar, 'image_path', sc.image_path) order by sc.position)
      from detective_scenes sc where sc.version_id = v_version), '[]'::jsonb),
    'relations', coalesce((select jsonb_agg(jsonb_build_object('from', r.from_evidence_id, 'to', r.to_evidence_id, 'type', r.relation_type, 'explanation', r.public_explanation,
        'found_by_you', exists (select 1 from detective_board_links b where b.session_id = p_session and b.user_id = auth.uid() and b.relation = r.relation_type
          and ((b.from_evidence = r.from_evidence_id and b.to_evidence = r.to_evidence_id) or (b.from_evidence = r.to_evidence_id and b.to_evidence = r.from_evidence_id)))))
      from detective_evidence_relations r where r.version_id = v_version), '[]'::jsonb),
    'your_links', coalesce((select jsonb_agg(jsonb_build_object('from', b.from_evidence, 'to', b.to_evidence, 'relation', b.relation,
        'correct', exists (select 1 from detective_evidence_relations r where r.version_id = v_version and r.relation_type = b.relation
          and ((b.from_evidence = r.from_evidence_id and b.to_evidence = r.to_evidence_id) or (b.from_evidence = r.to_evidence_id and b.to_evidence = r.from_evidence_id)))))
      from detective_board_links b where b.session_id = p_session and b.user_id = auth.uid()), '[]'::jsonb),
    'statements', coalesce((select jsonb_agg(jsonb_build_object('suspect', sp.name, 'suspect_ar', sp.name_ar, 'statement', st.statement, 'statement_ar', st.statement_ar,
        'truth', st.truth_status, 'explanation', st.admin_explanation, 'contradicted_by', to_jsonb(st.conflicting_evidence)) order by sp.name)
      from detective_statements st join detective_suspects sp on sp.id = st.suspect_id where sp.version_id = v_version), '[]'::jsonb),
    'solution', (select jsonb_build_object('reveal', s.public_reveal, 'reveal_ar', s.public_reveal_ar, 'explanation', s.educational_explanation,
        'explanation_ar', s.educational_explanation_ar, 'alternatives', s.alternative_hypotheses) from detective_solutions s where s.version_id = v_version limit 1));
end $$;

create or replace function detective_finish(p_session uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_version uuid; v_links int; s detective_sessions%rowtype;
begin
  v_version := detective_require_playing(p_session);
  if exists (select 1 from detective_questions q where q.version_id = v_version and q.question_type = 'FINAL_CONCLUSION'
      and not exists (select 1 from detective_submissions sb where sb.session_id = p_session and sb.question_id = q.id and sb.submitted_by = auth.uid()))
  then raise exception 'conclusion_required'; end if;
  select count(*) into v_links from detective_board_links b where b.session_id = p_session and b.user_id = auth.uid()
    and exists (select 1 from detective_evidence_relations r where r.version_id = v_version and r.relation_type = b.relation
      and ((b.from_evidence = r.from_evidence_id and b.to_evidence = r.to_evidence_id) or (b.from_evidence = r.to_evidence_id and b.to_evidence = r.from_evidence_id)));
  if v_links > 0 and not (select bonus_awarded from detective_player_progress where session_id = p_session and user_id = auth.uid()) then
    perform detective_add_score(p_session, 'LINK_BONUS', v_links * 10);
  end if;
  update detective_player_progress set completed_at = now(), bonus_awarded = true where session_id = p_session and user_id = auth.uid();
  select * into s from detective_sessions where id = p_session;
  if s.room_id is null and s.created_by = auth.uid() then update detective_sessions set status = 'FINISHED', finished_at = now() where id = p_session; end if;
  return detective_report(p_session);
end $$;

-- ---------- catalog + history ----------
create or replace function get_detective_case_catalog() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'slug', c.slug, 'title', c.title, 'title_ar', c.title_ar, 'description', c.description,
    'description_ar', c.description_ar, 'case_type', c.case_type, 'difficulty', c.difficulty, 'age_min', c.age_min, 'age_max', c.age_max,
    'published_at', c.published_at, 'category', c.category, 'estimated_minutes', c.estimated_minutes, 'cover_image_path', c.cover_image_path,
    'briefing', c.briefing, 'briefing_ar', c.briefing_ar, 'objective', c.objective, 'objective_ar', c.objective_ar,
    'scenes', (select count(*) from detective_scenes sc where sc.version_id = v.id),
    'stages', (select count(*) from detective_stages st where st.version_id = v.id),
    'evidence', (select count(*) from detective_evidence e join detective_scenes sc on sc.id = e.scene_id where sc.version_id = v.id),
    'questions', (select count(*) from detective_questions q where q.version_id = v.id),
    'best_score', (select max(pp.score) from detective_player_progress pp join detective_sessions s on s.id = pp.session_id
      where s.version_id in (select id from detective_case_versions where case_id = c.id) and pp.user_id = auth.uid() and pp.completed_at is not null),
    'completed', exists (select 1 from detective_player_progress pp join detective_sessions s on s.id = pp.session_id
      where s.version_id in (select id from detective_case_versions where case_id = c.id) and pp.user_id = auth.uid() and pp.completed_at is not null),
    'resume_session', (select s.id from detective_sessions s join detective_player_progress pp on pp.session_id = s.id and pp.user_id = auth.uid()
      where s.version_id = v.id and s.status = 'PLAYING' and pp.completed_at is null and s.created_by = auth.uid() order by s.created_at desc limit 1))
    order by c.published_at desc), '[]'::jsonb)
  from detective_cases c
  join lateral (select id from detective_case_versions vv where vv.case_id = c.id and vv.status = 'PUBLISHED' order by vv.version_number desc limit 1) v on true
  where c.status = 'PUBLISHED';
$$;

create or replace function detective_my_history() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(x order by x->>'started_at' desc), '[]'::jsonb) from (
    select jsonb_build_object('session_id', s.id, 'case_id', c.id, 'title', c.title, 'title_ar', c.title_ar, 'difficulty', c.difficulty,
      'started_at', pp.started_at, 'completed_at', pp.completed_at, 'score', pp.score,
      'duration_seconds', case when pp.completed_at is not null then extract(epoch from pp.completed_at - pp.started_at)::int end,
      'found', (select count(*) from detective_discoveries d where d.session_id = s.id and d.discovered_by = auth.uid()),
      'total', (select count(*) from detective_evidence e join detective_scenes sc on sc.id = e.scene_id where sc.version_id = s.version_id)) x
    from detective_player_progress pp join detective_sessions s on s.id = pp.session_id
    join detective_case_versions v on v.id = s.version_id join detective_cases c on c.id = v.case_id
    where pp.user_id = auth.uid() order by pp.started_at desc limit 50) t;
$$;

-- Resume an unfinished solo session instead of creating duplicates.
create or replace function start_detective_session(p_case uuid, p_mode text default 'SOLO') returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_user uuid := auth.uid(); v_version uuid; v_session uuid;
begin
  if v_user is null then raise exception 'unauthorized'; end if;
  if p_mode not in ('SOLO','COOPERATIVE','COMPETITIVE','TEAMS') then raise exception 'invalid_mode'; end if;
  select v.id into v_version from detective_case_versions v join detective_cases c on c.id = v.case_id
   where c.id = p_case and c.status = 'PUBLISHED' and v.status = 'PUBLISHED' order by v.version_number desc limit 1;
  if v_version is null then raise exception 'case_not_published'; end if;
  if p_mode = 'SOLO' then
    select s.id into v_session from detective_sessions s join detective_player_progress pp on pp.session_id = s.id and pp.user_id = v_user
     where s.version_id = v_version and s.created_by = v_user and s.room_id is null and s.status = 'PLAYING' and pp.completed_at is null
     order by s.created_at desc limit 1;
    if v_session is not null then return jsonb_build_object('session_id', v_session, 'version_id', v_version, 'status', 'PLAYING', 'resumed', true); end if;
  end if;
  insert into detective_sessions(version_id, mode, sharing, status, started_at, created_by)
  values (v_version, p_mode, case when p_mode = 'SOLO' then 'PRIVATE' else 'SHARED' end, 'PLAYING', now(), v_user) returning id into v_session;
  insert into detective_player_progress(session_id, user_id) values (v_session, v_user);
  return jsonb_build_object('session_id', v_session, 'version_id', v_version, 'status', 'PLAYING');
end $$;

-- ---------- grants ----------
do $$ declare f text; begin
  foreach f in array array['detective_session_version(uuid)','detective_found_ids(uuid)','detective_current_stage(uuid)','detective_stage_unlocked(uuid,uuid)',
    'detective_add_score(uuid,text,integer)','detective_require_playing(uuid)'] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
  end loop;
  foreach f in array array['detective_inspect(uuid,uuid,numeric,numeric)','submit_detective_answer(uuid,uuid,jsonb,uuid)','detective_use_hint(uuid)',
    'detective_board_link(uuid,uuid,uuid,text,boolean)','detective_save_note(uuid,text)','get_detective_session_payload(uuid)','detective_report(uuid)',
    'detective_finish(uuid)','detective_my_history()','start_detective_session(uuid,text)'] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;
grant execute on function get_detective_case_catalog() to anon, authenticated;
