-- 0026: Detective group play – team (cooperative) and competitive parties with join codes.
-- Cooperative: one shared session; discoveries, answers and the evidence board are shared by all members.
-- Competitive: each member gets a private session of the same case; a live party leaderboard compares them.

create table if not exists detective_parties (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  case_id uuid not null references detective_cases(id),
  version_id uuid not null references detective_case_versions(id),
  host_id uuid not null,
  mode text not null check (mode in ('COOPERATIVE','COMPETITIVE')),
  status text not null default 'LOBBY' check (status in ('LOBBY','PLAYING','FINISHED','CLOSED')),
  shared_session uuid references detective_sessions(id) on delete set null,
  started_at timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists detective_party_members (
  party_id uuid not null references detective_parties(id) on delete cascade,
  user_id uuid not null,
  nickname text not null check (char_length(trim(nickname)) between 1 and 30),
  avatar text not null default 'owl',
  is_ready boolean not null default false,
  status text not null default 'ACTIVE' check (status in ('ACTIVE','LEFT')),
  session_id uuid references detective_sessions(id) on delete set null,
  joined_at timestamptz not null default now(),
  primary key (party_id, user_id)
);
create index if not exists detective_party_members_session_idx on detective_party_members(session_id);
alter table detective_parties enable row level security;
alter table detective_party_members enable row level security;
revoke all on detective_parties, detective_party_members from anon, authenticated;

create or replace function detective_shared(p_session uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select sharing <> 'PRIVATE' from detective_sessions where id = p_session), false);
$$;

create or replace function detective_session_version(p_session uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select s.version_id from detective_sessions s
  where s.id = p_session and auth.uid() is not null and (s.created_by = auth.uid()
    or exists (select 1 from room_members rm where rm.room_id = s.room_id and rm.user_id = auth.uid())
    or exists (select 1 from detective_party_members m where m.session_id = s.id and m.user_id = auth.uid() and m.status = 'ACTIVE'));
$$;


create or replace function detective_current_stage(p_session uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select st.id from detective_stages st join detective_sessions s on s.version_id = st.version_id
  where s.id = p_session and exists (select 1 from detective_questions q where q.stage_id = st.id
    and not exists (select 1 from detective_submissions sb where sb.session_id = p_session and sb.question_id = q.id and (sb.submitted_by = auth.uid() or detective_shared(p_session))))
  order by st.position limit 1;
$$;

create or replace function submit_detective_answer(p_session uuid, p_question uuid, p_answer jsonb, p_idempotency_key uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_version uuid; v_q detective_questions%rowtype; v_prev detective_submissions%rowtype; v_correct boolean := false; v_text text;
  v_delta int; v_score int; v_sub uuid; v_correct_option text;
begin
  if p_idempotency_key is null then raise exception 'unauthorized'; end if;
  v_version := detective_require_playing(p_session);
  select * into v_q from detective_questions where id = p_question and version_id = v_version;
  if v_q.id is null then raise exception 'question_forbidden'; end if;
  select * into v_prev from detective_submissions where session_id = p_session and question_id = p_question and (submitted_by = auth.uid() or detective_shared(p_session)) limit 1;
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

create or replace function detective_board_link(p_session uuid, p_from uuid, p_to uuid, p_relation text, p_remove boolean default false) returns void
language plpgsql security definer set search_path = public as $$
declare v_found uuid[];
begin
  perform detective_require_playing(p_session);
  if p_remove then
    delete from detective_board_links where session_id = p_session and (user_id = auth.uid() or detective_shared(p_session))
      and ((from_evidence = p_from and to_evidence = p_to) or (from_evidence = p_to and to_evidence = p_from));
    return;
  end if;
  v_found := detective_found_ids(p_session);
  if not (p_from = any(v_found)) or not (p_to = any(v_found)) or p_from = p_to then raise exception 'evidence_not_discovered'; end if;
  if p_relation not in ('SUPPORTS','CONTRADICTS','TEMPORAL','CONTEXTUAL','UNCERTAIN') then raise exception 'invalid_relation'; end if;
  if (select count(*) from detective_board_links where session_id = p_session and user_id = auth.uid()) >= 30 then raise exception 'too_many_links'; end if;
  delete from detective_board_links where session_id = p_session and (user_id = auth.uid() or detective_shared(p_session)) and from_evidence = p_to and to_evidence = p_from;
  insert into detective_board_links(session_id, user_id, from_evidence, to_evidence, relation) values (p_session, auth.uid(), p_from, p_to, p_relation)
  on conflict (session_id, user_id, from_evidence, to_evidence) do update set relation = excluded.relation, created_at = now();
end $$;

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
      from detective_timeline_events te where te.version_id = v_version), '[]'::jsonb),
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
    'questions_correct', (select count(*) from detective_submissions where session_id = p_session and (submitted_by = auth.uid() or detective_shared(p_session)) and is_correct),
    'hints_used', (select count(*) from detective_hint_uses where session_id = p_session and user_id = auth.uid()),
    'hint_penalty', (select coalesce(sum(penalty), 0) from detective_hint_uses where session_id = p_session and user_id = auth.uid()),
    'breakdown', (select coalesce(jsonb_object_agg(event_type, pts), '{}'::jsonb) from (select event_type, sum(points) pts from detective_score_events
      where session_id = p_session and user_id = auth.uid() group by event_type) x),
    'conclusion_correct', (select sb.is_correct from detective_submissions sb join detective_questions q on q.id = sb.question_id
      where sb.session_id = p_session and (sb.submitted_by = auth.uid() or detective_shared(p_session)) and q.question_type = 'FINAL_CONCLUSION' limit 1),
    'questions', coalesce((select jsonb_agg(jsonb_build_object('prompt', q.prompt, 'prompt_ar', q.prompt_ar, 'type', q.question_type, 'options', q.options,
        'answer_key', q.answer_key, 'your_answer', sb.answer, 'is_correct', sb.is_correct, 'points', sb.points_delta,
        'explanation', q.explanation, 'explanation_ar', q.explanation_ar) order by st.position, q.position)
      from detective_questions q left join detective_stages st on st.id = q.stage_id
      left join lateral (select * from detective_submissions x where x.question_id = q.id and x.session_id = p_session and (x.submitted_by = auth.uid() or detective_shared(p_session)) order by x.created_at limit 1) sb on true
      where q.version_id = v_version), '[]'::jsonb),
    'evidence', coalesce((select jsonb_agg(jsonb_build_object('id', e.id, 'title', e.public_title, 'title_ar', e.public_title_ar, 'description', e.public_description,
        'description_ar', e.public_description_ar, 'explanation', e.admin_explanation, 'classification', e.classification, 'importance', e.importance,
        'found', e.id = any(v_found), 'scene_id', e.scene_id, 'x', e.x, 'y', e.y, 'width', e.width, 'height', e.height) order by sc.position, e.importance desc)
      from detective_evidence e join detective_scenes sc on sc.id = e.scene_id where sc.version_id = v_version), '[]'::jsonb),
    'scenes', coalesce((select jsonb_agg(jsonb_build_object('id', sc.id, 'title', sc.title, 'title_ar', sc.title_ar, 'image_path', sc.image_path) order by sc.position)
      from detective_scenes sc where sc.version_id = v_version), '[]'::jsonb),
    'relations', coalesce((select jsonb_agg(jsonb_build_object('from', r.from_evidence_id, 'to', r.to_evidence_id, 'type', r.relation_type, 'explanation', r.public_explanation,
        'found_by_you', exists (select 1 from detective_board_links b where b.session_id = p_session and (b.user_id = auth.uid() or detective_shared(p_session)) and b.relation = r.relation_type
          and ((b.from_evidence = r.from_evidence_id and b.to_evidence = r.to_evidence_id) or (b.from_evidence = r.to_evidence_id and b.to_evidence = r.from_evidence_id)))))
      from detective_evidence_relations r where r.version_id = v_version), '[]'::jsonb),
    'your_links', coalesce((select jsonb_agg(jsonb_build_object('from', b.from_evidence, 'to', b.to_evidence, 'relation', b.relation,
        'correct', exists (select 1 from detective_evidence_relations r where r.version_id = v_version and r.relation_type = b.relation
          and ((b.from_evidence = r.from_evidence_id and b.to_evidence = r.to_evidence_id) or (b.from_evidence = r.to_evidence_id and b.to_evidence = r.from_evidence_id)))))
      from detective_board_links b where b.session_id = p_session and (b.user_id = auth.uid() or detective_shared(p_session))), '[]'::jsonb),
    'statements', coalesce((select jsonb_agg(jsonb_build_object('suspect', sp.name, 'suspect_ar', sp.name_ar, 'statement', st.statement, 'statement_ar', st.statement_ar,
        'truth', st.truth_status, 'explanation', st.admin_explanation, 'contradicted_by', to_jsonb(st.conflicting_evidence)) order by sp.name)
      from detective_statements st join detective_suspects sp on sp.id = st.suspect_id where sp.version_id = v_version), '[]'::jsonb),
    'team', (select coalesce(jsonb_agg(jsonb_build_object('nickname', m.nickname, 'avatar', m.avatar, 'score', pp2.score, 'completed', pp2.completed_at is not null) order by pp2.score desc), '[]'::jsonb)
      from detective_party_members m join detective_player_progress pp2 on pp2.session_id = m.session_id and pp2.user_id = m.user_id
      where m.party_id = (select party_id from detective_party_members where session_id = p_session and user_id = auth.uid() limit 1)),
    'party_mode', (select pa.mode from detective_party_members m join detective_parties pa on pa.id = m.party_id where m.session_id = p_session and m.user_id = auth.uid() limit 1),
    'solution', (select jsonb_build_object('reveal', s.public_reveal, 'reveal_ar', s.public_reveal_ar, 'explanation', s.educational_explanation,
        'explanation_ar', s.educational_explanation_ar, 'alternatives', s.alternative_hypotheses) from detective_solutions s where s.version_id = v_version limit 1));
end $$;

create or replace function detective_finish(p_session uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_version uuid; v_links int; s detective_sessions%rowtype;
begin
  v_version := detective_require_playing(p_session);
  if exists (select 1 from detective_questions q where q.version_id = v_version and q.question_type = 'FINAL_CONCLUSION'
      and not exists (select 1 from detective_submissions sb where sb.session_id = p_session and sb.question_id = q.id and (sb.submitted_by = auth.uid() or detective_shared(p_session))))
  then raise exception 'conclusion_required'; end if;
  select count(*) into v_links from detective_board_links b where b.session_id = p_session and (b.user_id = auth.uid() or detective_shared(p_session))
    and exists (select 1 from detective_evidence_relations r where r.version_id = v_version and r.relation_type = b.relation
      and ((b.from_evidence = r.from_evidence_id and b.to_evidence = r.to_evidence_id) or (b.from_evidence = r.to_evidence_id and b.to_evidence = r.from_evidence_id)));
  if v_links > 0 and not (select bonus_awarded from detective_player_progress where session_id = p_session and user_id = auth.uid()) then
    perform detective_add_score(p_session, 'LINK_BONUS', v_links * 10);
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
-- ---------- party lifecycle ----------
create or replace function detective_party_create(p_case uuid, p_mode text, p_nickname text, p_avatar text default 'owl') returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_version uuid; v_party uuid; v_code text; alphabet text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; i int;
begin
  if auth.uid() is null then raise exception 'unauthorized'; end if;
  if p_mode not in ('COOPERATIVE','COMPETITIVE') then raise exception 'invalid_mode'; end if;
  if char_length(trim(coalesce(p_nickname, ''))) not between 1 and 30 then raise exception 'invalid_nickname'; end if;
  select v.id into v_version from detective_case_versions v join detective_cases c on c.id = v.case_id
   where c.id = p_case and c.status = 'PUBLISHED' and v.status = 'PUBLISHED' order by v.version_number desc limit 1;
  if v_version is null then raise exception 'case_not_published'; end if;
  loop
    v_code := 'DT-'; for i in 1..6 loop v_code := v_code || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1); end loop;
    exit when not exists (select 1 from detective_parties where code = v_code);
  end loop;
  insert into detective_parties(code, case_id, version_id, host_id, mode) values (v_code, p_case, v_version, auth.uid(), p_mode) returning id into v_party;
  insert into detective_party_members(party_id, user_id, nickname, avatar, is_ready) values (v_party, auth.uid(), trim(p_nickname), bakasa_clean_avatar(p_avatar), true);
  return jsonb_build_object('party_id', v_party, 'code', v_code);
end $$;

create or replace function detective_party_join(p_code text, p_nickname text, p_avatar text default 'owl') returns jsonb
language plpgsql security definer set search_path = public as $$
declare pa detective_parties%rowtype; m detective_party_members%rowtype; v_sess uuid;
begin
  if auth.uid() is null then raise exception 'unauthorized'; end if;
  if char_length(trim(coalesce(p_nickname, ''))) not between 1 and 30 then raise exception 'invalid_nickname'; end if;
  select * into pa from detective_parties where code = upper(trim(p_code)) for update;
  if not found or pa.status in ('CLOSED','FINISHED') then return jsonb_build_object('status', 'not_found'); end if;
  select * into m from detective_party_members where party_id = pa.id and user_id = auth.uid();
  if found then
    update detective_party_members set status = 'ACTIVE', nickname = trim(p_nickname), avatar = bakasa_clean_avatar(p_avatar) where party_id = pa.id and user_id = auth.uid();
  else
    if (select count(*) from detective_party_members where party_id = pa.id and status = 'ACTIVE') >= 12 then return jsonb_build_object('status', 'full'); end if;
    insert into detective_party_members(party_id, user_id, nickname, avatar) values (pa.id, auth.uid(), trim(p_nickname), bakasa_clean_avatar(p_avatar));
    -- late joiner in a running cooperative party joins the shared session
    if pa.status = 'PLAYING' and pa.mode = 'COOPERATIVE' and pa.shared_session is not null then
      update detective_party_members set session_id = pa.shared_session where party_id = pa.id and user_id = auth.uid();
      insert into detective_player_progress(session_id, user_id) values (pa.shared_session, auth.uid()) on conflict do nothing;
    elsif pa.status = 'PLAYING' and pa.mode = 'COMPETITIVE' then
      insert into detective_sessions(version_id, mode, sharing, status, started_at, created_by) values (pa.version_id, 'COMPETITIVE', 'PRIVATE', 'PLAYING', now(), auth.uid()) returning id into v_sess;
      insert into detective_player_progress(session_id, user_id) values (v_sess, auth.uid());
      update detective_party_members set session_id = v_sess where party_id = pa.id and user_id = auth.uid();
    end if;
  end if;
  update detective_parties set updated_at = now() where id = pa.id;
  return jsonb_build_object('status', 'joined', 'party_id', pa.id);
end $$;

create or replace function detective_party_ready(p_party uuid, p_ready boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  update detective_party_members set is_ready = p_ready where party_id = p_party and user_id = auth.uid() and status = 'ACTIVE';
  if not found then raise exception 'not_member'; end if;
  update detective_parties set updated_at = now() where id = p_party;
end $$;

create or replace function detective_party_start(p_party uuid) returns void
language plpgsql security definer set search_path = public as $$
declare pa detective_parties%rowtype; m record; v_sess uuid;
begin
  select * into pa from detective_parties where id = p_party for update;
  if not found or pa.host_id <> auth.uid() then raise exception 'forbidden' using errcode = '42501'; end if;
  if pa.status <> 'LOBBY' then raise exception 'already_started'; end if;
  if (select count(*) from detective_party_members where party_id = p_party and status = 'ACTIVE') < 2 then raise exception 'not_enough_players'; end if;
  if exists (select 1 from detective_party_members where party_id = p_party and status = 'ACTIVE' and not is_ready) then raise exception 'players_not_ready'; end if;
  if pa.mode = 'COOPERATIVE' then
    insert into detective_sessions(version_id, mode, sharing, status, started_at, created_by) values (pa.version_id, 'COOPERATIVE', 'SHARED', 'PLAYING', now(), pa.host_id) returning id into v_sess;
    update detective_party_members set session_id = v_sess where party_id = p_party and status = 'ACTIVE';
    insert into detective_player_progress(session_id, user_id) select v_sess, user_id from detective_party_members where party_id = p_party and status = 'ACTIVE';
    update detective_parties set status = 'PLAYING', shared_session = v_sess, started_at = now(), updated_at = now() where id = p_party;
  else
    for m in select user_id from detective_party_members where party_id = p_party and status = 'ACTIVE' loop
      insert into detective_sessions(version_id, mode, sharing, status, started_at, created_by) values (pa.version_id, 'COMPETITIVE', 'PRIVATE', 'PLAYING', now(), m.user_id) returning id into v_sess;
      insert into detective_player_progress(session_id, user_id) values (v_sess, m.user_id);
      update detective_party_members set session_id = v_sess where party_id = p_party and user_id = m.user_id;
    end loop;
    update detective_parties set status = 'PLAYING', started_at = now(), updated_at = now() where id = p_party;
  end if;
end $$;

create or replace function detective_party_leave(p_party uuid) returns void
language plpgsql security definer set search_path = public as $$
declare pa detective_parties%rowtype; v_next uuid;
begin
  select * into pa from detective_parties where id = p_party for update;
  update detective_party_members set status = 'LEFT', is_ready = false where party_id = p_party and user_id = auth.uid();
  if pa.host_id = auth.uid() then
    select user_id into v_next from detective_party_members where party_id = p_party and status = 'ACTIVE' order by joined_at limit 1;
    if v_next is null then update detective_parties set status = 'CLOSED' where id = p_party;
    else update detective_parties set host_id = v_next where id = p_party; end if;
  end if;
  update detective_parties set updated_at = now() where id = p_party;
end $$;

-- Party view + live leaderboard. Only aggregate progress – never answers or evidence locations.
create or replace function detective_party_state(p_party uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare pa detective_parties%rowtype; v_total int;
begin
  select * into pa from detective_parties where id = p_party;
  if not found or not exists (select 1 from detective_party_members where party_id = p_party and user_id = auth.uid()) then raise exception 'forbidden' using errcode = '42501'; end if;
  select count(*) into v_total from detective_evidence e join detective_scenes sc on sc.id = e.scene_id where sc.version_id = pa.version_id;
  return jsonb_build_object('me', auth.uid(), 'server_now', now(),
    'party', jsonb_build_object('id', pa.id, 'code', pa.code, 'mode', pa.mode, 'status', pa.status, 'host_id', pa.host_id, 'started_at', pa.started_at, 'updated_at', pa.updated_at),
    'case', (select jsonb_build_object('id', c.id, 'title', c.title, 'title_ar', c.title_ar, 'cover_image_path', c.cover_image_path, 'difficulty', c.difficulty,
        'estimated_minutes', c.estimated_minutes, 'description', c.description, 'description_ar', c.description_ar) from detective_cases c where c.id = pa.case_id),
    'evidence_total', v_total,
    'questions_total', (select count(*) from detective_questions where version_id = pa.version_id),
    'my_session', (select session_id from detective_party_members where party_id = p_party and user_id = auth.uid()),
    'members', (select coalesce(jsonb_agg(jsonb_build_object('user_id', m.user_id, 'nickname', m.nickname, 'avatar', m.avatar, 'is_ready', m.is_ready, 'status', m.status,
        'score', pp.score, 'completed_at', pp.completed_at,
        'found', (select count(*) from detective_discoveries d where d.session_id = m.session_id and (d.discovered_by = m.user_id or pa.mode = 'COOPERATIVE')),
        'answered', (select count(*) from detective_submissions sb where sb.session_id = m.session_id and sb.submitted_by = m.user_id),
        'correct', (select count(*) from detective_submissions sb where sb.session_id = m.session_id and sb.submitted_by = m.user_id and sb.is_correct))
      order by coalesce(pp.score, 0) desc, m.joined_at), '[]'::jsonb)
      from detective_party_members m left join detective_player_progress pp on pp.session_id = m.session_id and pp.user_id = m.user_id
      where m.party_id = p_party and m.status = 'ACTIVE'));
end $$;

do $$ declare f text; begin
  execute 'revoke all on function detective_shared(uuid) from public, anon, authenticated';
  foreach f in array array['detective_party_create(uuid,text,text,text)','detective_party_join(text,text,text)','detective_party_ready(uuid,boolean)',
    'detective_party_start(uuid)','detective_party_leave(uuid)','detective_party_state(uuid)'] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;
