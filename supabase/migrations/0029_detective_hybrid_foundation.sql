-- 0029: Hybrid Detective Mode – foundation (Phase 1). Additive only: no existing column, table or policy changes.
-- Adds: per-case settings, forensic lab procedures/requests, suspect confrontations, structured verdict criteria/verdicts,
-- hint guidance levels/cooldowns, and the RPCs that use them. Answer keys stay staff-only; players only reach data
-- through security-definer RPCs that return what their session has unlocked.

alter table detective_cases add column if not exists settings jsonb not null default '{}'::jsonb;
alter table detective_suspects add column if not exists motive text;
alter table detective_suspects add column if not exists motive_ar text;
alter table detective_suspects add column if not exists alibi_ar text;
alter table detective_suspects add column if not exists relationship_ar text;
alter table detective_hints add column if not exists level smallint not null default 2 check (level between 1 and 3);

-- ---------- forensic lab ----------
create table if not exists detective_lab_procedures (
  id uuid primary key default gen_random_uuid(),
  version_id uuid not null references detective_case_versions(id) on delete cascade,
  procedure_key text not null,
  evidence_id uuid references detective_evidence(id) on delete cascade,
  exam_type text not null check (exam_type in ('DNA','BLOOD','FINGERPRINT','WEAPON','TOXICOLOGY','TIME_OF_DEATH','DIGITAL','DOCUMENT','OTHER')),
  title text not null, title_ar text not null,
  requires_evidence uuid[] not null default '{}',
  result text not null, result_ar text not null,
  report jsonb not null default '{}'::jsonb,          -- player-visible document body once READY (sample ids, findings, limitations)
  release_seconds int not null default 0 check (release_seconds between 0 and 3600),
  points int not null default 0 check (points between 0 and 1000),
  position smallint not null default 1,
  unique (version_id, procedure_key)
);
create table if not exists detective_lab_requests (
  session_id uuid not null references detective_sessions(id) on delete cascade,
  procedure_id uuid not null references detective_lab_procedures(id) on delete cascade,
  requested_by uuid not null,
  requested_at timestamptz not null default now(),
  ready_at timestamptz not null,
  primary key (session_id, procedure_id)
);

-- ---------- interrogation ----------
create table if not exists detective_confrontations (
  id uuid primary key default gen_random_uuid(),
  version_id uuid not null references detective_case_versions(id) on delete cascade,
  suspect_id uuid not null references detective_suspects(id) on delete cascade,
  evidence_id uuid not null references detective_evidence(id) on delete cascade,
  response text not null, response_ar text not null,
  reveals_contradiction boolean not null default false,
  points int not null default 0 check (points between 0 and 1000),
  unique (suspect_id, evidence_id)
);
create table if not exists detective_confrontation_uses (
  session_id uuid not null references detective_sessions(id) on delete cascade,
  confrontation_id uuid not null references detective_confrontations(id) on delete cascade,
  used_by uuid not null,
  created_at timestamptz not null default now(),
  primary key (session_id, confrontation_id)
);

-- ---------- verdict ----------
create table if not exists detective_verdict_criteria (
  version_id uuid primary key references detective_case_versions(id) on delete cascade,
  suspect_id uuid not null references detective_suspects(id) on delete cascade,
  motive_options jsonb not null default '[]'::jsonb,   -- [{id,text,text_ar}]
  motive_answer text not null,
  method_options jsonb not null default '[]'::jsonb,
  method_answer text not null,
  key_evidence uuid[] not null default '{}',
  timeline_order text[] not null default '{}',          -- event_key order
  weights jsonb not null default '{"suspect":40,"motive":15,"method":15,"evidence":20,"timeline":10}'::jsonb
);
create table if not exists detective_verdicts (
  session_id uuid primary key references detective_sessions(id) on delete cascade,
  submitted_by uuid not null,
  suspect_id uuid,
  motive text, method text,
  evidence uuid[] not null default '{}',
  timeline text[] not null default '{}',
  explanation text check (explanation is null or char_length(explanation) <= 2000),
  breakdown jsonb not null default '{}'::jsonb,
  points int not null default 0,
  awarded boolean not null default false,
  created_at timestamptz not null default now()
);

alter table detective_lab_procedures enable row level security;
alter table detective_lab_requests enable row level security;
alter table detective_confrontations enable row level security;
alter table detective_confrontation_uses enable row level security;
alter table detective_verdict_criteria enable row level security;
alter table detective_verdicts enable row level security;
create policy detective_lab_staff_all on detective_lab_procedures for all using (has_permission('story.manage')) with check (has_permission('story.manage'));
create policy detective_confront_staff_all on detective_confrontations for all using (has_permission('story.manage')) with check (has_permission('story.manage'));
create policy detective_verdict_criteria_staff_all on detective_verdict_criteria for all using (has_permission('story.manage')) with check (has_permission('story.manage'));
-- runtime tables: no direct client access at all; RPCs only
revoke all on detective_lab_requests, detective_confrontation_uses, detective_verdicts from anon, authenticated;

-- ---------- helpers ----------
create or replace function detective_case_settings(p_version uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(c.settings, '{}'::jsonb) from detective_cases c join detective_case_versions v on v.case_id = c.id where v.id = p_version;
$$;

-- ---------- lab ----------
create or replace function detective_lab_request(p_session uuid, p_procedure uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_version uuid; v_found uuid[]; p detective_lab_procedures%rowtype; r detective_lab_requests%rowtype; v_score int;
begin
  v_version := detective_require_playing(p_session);
  select * into p from detective_lab_procedures where id = p_procedure and version_id = v_version;
  if p.id is null then raise exception 'procedure_not_found'; end if;
  v_found := detective_found_ids(p_session);
  if (p.evidence_id is not null and not (p.evidence_id = any(v_found)))
     or exists (select 1 from unnest(p.requires_evidence) x where not (x = any(v_found))) then raise exception 'sample_missing'; end if;
  insert into detective_lab_requests(session_id, procedure_id, requested_by, ready_at)
  values (p_session, p.id, auth.uid(), now() + make_interval(secs => p.release_seconds))
  on conflict (session_id, procedure_id) do nothing returning * into r;
  if r.session_id is null then
    select * into r from detective_lab_requests where session_id = p_session and procedure_id = p.id;
    return jsonb_build_object('status', case when r.ready_at <= now() then 'READY' else 'PENDING' end, 'ready_at', r.ready_at, 'already', true);
  end if;
  if p.points > 0 then v_score := detective_add_score(p_session, 'LAB_ANALYSIS', p.points); end if;
  return jsonb_build_object('status', case when r.ready_at <= now() then 'READY' else 'PENDING' end, 'ready_at', r.ready_at, 'already', false, 'score', v_score);
end $$;

-- ---------- interrogation ----------
create or replace function detective_confront(p_session uuid, p_suspect uuid, p_evidence uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_version uuid; c detective_confrontations%rowtype; v_new boolean; v_score int;
begin
  v_version := detective_require_playing(p_session);
  if not exists (select 1 from detective_suspects where id = p_suspect and version_id = v_version) then raise exception 'suspect_not_found'; end if;
  if not (p_evidence = any(detective_found_ids(p_session))) then raise exception 'evidence_not_found'; end if;
  select * into c from detective_confrontations where suspect_id = p_suspect and evidence_id = p_evidence and version_id = v_version;
  if c.id is null then return jsonb_build_object('matched', false); end if;
  insert into detective_confrontation_uses(session_id, confrontation_id, used_by) values (p_session, c.id, auth.uid())
  on conflict do nothing returning true into v_new;
  if coalesce(v_new, false) and c.points > 0 then v_score := detective_add_score(p_session, case when c.reveals_contradiction then 'CONTRADICTION' else 'INTERROGATION' end, c.points); end if;
  return jsonb_build_object('matched', true, 'response', c.response, 'response_ar', c.response_ar, 'reveals_contradiction', c.reveals_contradiction,
    'already', not coalesce(v_new, false), 'score', v_score);
end $$;

-- ---------- verdict ----------
create or replace function detective_grade_verdict(p_version uuid, p_suspect uuid, p_motive text, p_method text, p_evidence uuid[], p_timeline text[]) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare k detective_verdict_criteria%rowtype; w jsonb; v_key int; v_hit int; v_wrong int; s_sus numeric; s_mot numeric; s_met numeric; s_ev numeric; s_tl numeric; v_pos int := 0; i int;
begin
  select * into k from detective_verdict_criteria where version_id = p_version;
  if k.version_id is null then return null; end if;
  w := k.weights;
  v_key := greatest(1, coalesce(array_length(k.key_evidence, 1), 0));
  select count(*) filter (where x = any(k.key_evidence)), count(*) filter (where not (x = any(k.key_evidence))) into v_hit, v_wrong from (select distinct unnest(coalesce(p_evidence, '{}'))) t(x);
  s_ev := round(coalesce((w->>'evidence')::numeric, 20) * greatest(0, v_hit - v_wrong * 0.5) / v_key);
  s_sus := case when p_suspect = k.suspect_id then coalesce((w->>'suspect')::numeric, 40) else 0 end;
  if s_sus > 0 and v_hit = 0 then s_sus := round(s_sus / 2); end if;   -- right name without any supporting evidence is not full credit
  s_mot := case when p_motive = k.motive_answer then coalesce((w->>'motive')::numeric, 15) else 0 end;
  s_met := case when p_method = k.method_answer then coalesce((w->>'method')::numeric, 15) else 0 end;
  if coalesce(array_length(k.timeline_order, 1), 0) > 0 then
    for i in 1..array_length(k.timeline_order, 1) loop
      if coalesce(p_timeline[i], '') = k.timeline_order[i] then v_pos := v_pos + 1; end if;
    end loop;
    s_tl := round(coalesce((w->>'timeline')::numeric, 10) * v_pos / array_length(k.timeline_order, 1));
  else s_tl := 0; end if;
  return jsonb_build_object('suspect', s_sus, 'motive', s_mot, 'method', s_met, 'evidence', s_ev, 'timeline', s_tl,
    'evidence_hits', v_hit, 'evidence_wrong', v_wrong, 'timeline_positions', v_pos,
    'total', s_sus + s_mot + s_met + s_ev + s_tl,
    'max', coalesce((w->>'suspect')::numeric,40) + coalesce((w->>'motive')::numeric,15) + coalesce((w->>'method')::numeric,15) + coalesce((w->>'evidence')::numeric,20) + coalesce((w->>'timeline')::numeric,10));
end $$;

create or replace function detective_submit_verdict(p_session uuid, p_suspect uuid, p_motive text, p_method text, p_evidence uuid[], p_timeline text[], p_explanation text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_version uuid; v_found uuid[]; g jsonb;
begin
  v_version := detective_require_playing(p_session);
  if not exists (select 1 from detective_verdict_criteria where version_id = v_version) then raise exception 'no_verdict_stage'; end if;
  if exists (select 1 from detective_verdicts where session_id = p_session) then raise exception 'verdict_already_submitted'; end if;
  if p_suspect is null or not exists (select 1 from detective_suspects where id = p_suspect and version_id = v_version) then raise exception 'suspect_not_found'; end if;
  v_found := detective_found_ids(p_session);
  if exists (select 1 from unnest(coalesce(p_evidence, '{}')) x where not (x = any(v_found))) then raise exception 'evidence_not_found'; end if;
  if coalesce(array_length(p_evidence, 1), 0) > 6 then raise exception 'too_much_evidence'; end if;
  g := detective_grade_verdict(v_version, p_suspect, p_motive, p_method, p_evidence, p_timeline);
  insert into detective_verdicts(session_id, submitted_by, suspect_id, motive, method, evidence, timeline, explanation, breakdown, points)
  values (p_session, auth.uid(), p_suspect, p_motive, p_method, coalesce(p_evidence, '{}'), coalesce(p_timeline, '{}'), nullif(trim(p_explanation), ''), g, (g->>'total')::int)
  on conflict (session_id) do nothing;
  -- correctness is not returned here; it is revealed by the resolution after the case is finished
  return jsonb_build_object('submitted', true);
end $$;

-- ---------- player view of the new investigation layers ----------
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

-- ---------- hints: guidance level order, max count and cooldown (wraps the 0021 behaviour) ----------
create or replace function detective_use_hint(p_session uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_version uuid; v_stage uuid; v_found uuid[]; h detective_hints%rowtype; e detective_evidence%rowtype; v_score int; v_pen int;
  v_g jsonb; v_used int; v_last timestamptz;
begin
  v_version := detective_require_playing(p_session);
  v_g := coalesce(detective_case_settings(v_version)->'guidance', '{}'::jsonb);
  select count(*), max(created_at) into v_used, v_last from detective_hint_uses where session_id = p_session and user_id = auth.uid();
  if (v_g->>'max_hints') is not null and v_used >= (v_g->>'max_hints')::int then raise exception 'hint_limit'; end if;
  if coalesce((v_g->>'cooldown_seconds')::int, 0) > 0 and v_last is not null and v_last > now() - make_interval(secs => (v_g->>'cooldown_seconds')::int) then raise exception 'hint_cooldown'; end if;
  v_stage := detective_current_stage(p_session);
  v_found := detective_found_ids(p_session);
  select * into h from detective_hints dh
   where dh.version_id = v_version and (dh.stage_id = v_stage or dh.stage_id is null)
     and coalesce((dh.unlock_rule->>'requires_discoveries')::int, 0) <= coalesce(array_length(v_found, 1), 0)
     and not exists (select 1 from detective_hint_uses u where u.session_id = p_session and u.user_id = auth.uid() and u.hint_key = 'text:' || dh.id)
   order by dh.level, dh.position limit 1;
  if h.id is not null then
    v_pen := least(0, coalesce(h.penalty, -2));
    insert into detective_hint_uses(session_id, user_id, hint_key, penalty) values (p_session, auth.uid(), 'text:' || h.id, v_pen);
    v_score := detective_add_score(p_session, 'HINT', v_pen);
    return jsonb_build_object('kind', 'text', 'level', h.level, 'text', h.hint_text, 'text_ar', h.hint_text_ar, 'penalty', v_pen, 'score', v_score);
  end if;
  if coalesce((v_g->>'area_hints')::boolean, true) is false then raise exception 'no_hints'; end if;
  select ev.* into e from detective_evidence ev join detective_scenes sc on sc.id = ev.scene_id
   where sc.version_id = v_version and not (ev.id = any(v_found))
     and not exists (select 1 from jsonb_array_elements_text(coalesce(ev.unlock_rule->'requires_evidence', '[]'::jsonb)) r where not (r::uuid = any(v_found)))
     and not exists (select 1 from detective_hint_uses u where u.session_id = p_session and u.user_id = auth.uid() and u.hint_key = 'area:' || ev.id)
   order by ev.importance desc, sc.position, ev.id limit 1;
  if e.id is null then raise exception 'no_hints'; end if;
  v_pen := coalesce((v_g->>'area_penalty')::int, -3);
  insert into detective_hint_uses(session_id, user_id, hint_key, penalty) values (p_session, auth.uid(), 'area:' || e.id, v_pen);
  v_score := detective_add_score(p_session, 'HINT', v_pen);
  return jsonb_build_object('kind', 'area', 'level', 3, 'scene_id', e.scene_id, 'cx', round((e.x + e.width / 2) / 5) * 5, 'cy', round((e.y + e.height / 2) / 5) * 5,
    'r', greatest(12, round(greatest(e.width, e.height))), 'penalty', v_pen, 'score', v_score);
end $$;

-- ---------- finish: same as 0026 plus "verdict required" and verdict points ----------
create or replace function detective_finish(p_session uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_version uuid; v_links int; s detective_sessions%rowtype; vd detective_verdicts%rowtype;
begin
  v_version := detective_require_playing(p_session);
  if exists (select 1 from detective_questions q where q.version_id = v_version and q.question_type = 'FINAL_CONCLUSION'
      and not exists (select 1 from detective_submissions sb where sb.session_id = p_session and sb.question_id = q.id and (sb.submitted_by = auth.uid() or detective_shared(p_session))))
  then raise exception 'conclusion_required'; end if;
  if exists (select 1 from detective_verdict_criteria where version_id = v_version) and not exists (select 1 from detective_verdicts where session_id = p_session)
  then raise exception 'verdict_required'; end if;
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

-- ---------- resolution: only after the player's progress is completed ----------
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
    'confrontations', jsonb_build_object(
      'total', (select count(*) from detective_confrontations where version_id = v_version),
      'used', (select count(*) from detective_confrontation_uses where session_id = p_session),
      'contradictions_total', (select count(*) from detective_confrontations where version_id = v_version and reveals_contradiction),
      'contradictions_found', (select count(*) from detective_confrontation_uses u join detective_confrontations c on c.id = u.confrontation_id where u.session_id = p_session and c.reveals_contradiction)));
end $$;

-- ---------- validator: 0014 checks + hybrid content references ----------
create or replace function validate_detective_case(p_case uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_version uuid; v_errors jsonb := '[]'::jsonb; v_warnings jsonb := '[]'::jsonb; v_count integer;
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
  if exists (select 1 from detective_evidence e join detective_scenes s on s.id = e.scene_id where s.version_id = v_version
      and (e.x < 0 or e.y < 0 or e.width <= 0 or e.height <= 0 or e.x + e.width > 100.01 or e.y + e.height > 100.01)) then v_errors := v_errors || jsonb_build_object('code','invalid_hotspot_coordinates'); end if;
  -- duplicate evidence keys across scenes of one version
  select count(*) into v_count from (select e.evidence_key from detective_evidence e join detective_scenes s on s.id = e.scene_id where s.version_id = v_version group by e.evidence_key having count(*) > 1) d;
  if v_count > 0 then v_errors := v_errors || jsonb_build_object('code','duplicate_evidence_keys','count',v_count); end if;
  -- unlock rules must point at evidence of this version
  if exists (select 1 from detective_evidence e join detective_scenes s on s.id = e.scene_id, jsonb_array_elements_text(coalesce(e.unlock_rule->'requires_evidence','[]'::jsonb)) r
      where s.version_id = v_version and not exists (select 1 from detective_evidence e2 join detective_scenes s2 on s2.id = e2.scene_id where s2.version_id = v_version and e2.id::text = r)) then
    v_errors := v_errors || jsonb_build_object('code','unreachable_evidence'); end if;
  -- lab
  if exists (select 1 from detective_lab_procedures p where p.version_id = v_version and p.evidence_id is not null
      and not exists (select 1 from detective_evidence e join detective_scenes s on s.id = e.scene_id where e.id = p.evidence_id and s.version_id = v_version)) then
    v_errors := v_errors || jsonb_build_object('code','lab_evidence_not_in_case'); end if;
  if exists (select 1 from detective_lab_procedures p where p.version_id = v_version and (trim(p.result_ar) = '' or trim(p.title_ar) = '')) then
    v_errors := v_errors || jsonb_build_object('code','lab_result_missing'); end if;
  -- interrogation
  if exists (select 1 from detective_confrontations c where c.version_id = v_version and (
      not exists (select 1 from detective_suspects sp where sp.id = c.suspect_id and sp.version_id = v_version)
      or not exists (select 1 from detective_evidence e join detective_scenes s on s.id = e.scene_id where e.id = c.evidence_id and s.version_id = v_version))) then
    v_errors := v_errors || jsonb_build_object('code','broken_confrontation_reference'); end if;
  -- verdict
  if exists (select 1 from detective_verdict_criteria k where k.version_id = v_version) then
    if exists (select 1 from detective_verdict_criteria k where k.version_id = v_version and (
        not exists (select 1 from detective_suspects sp where sp.id = k.suspect_id and sp.version_id = v_version)
        or not exists (select 1 from jsonb_array_elements(k.motive_options) o where o->>'id' = k.motive_answer)
        or not exists (select 1 from jsonb_array_elements(k.method_options) o where o->>'id' = k.method_answer)
        or coalesce(array_length(k.key_evidence, 1), 0) = 0)) then
      v_errors := v_errors || jsonb_build_object('code','invalid_verdict_criteria'); end if;
    if exists (select 1 from detective_verdict_criteria k, unnest(k.key_evidence) kx(eid) where k.version_id = v_version
        and not exists (select 1 from detective_evidence e join detective_scenes s on s.id = e.scene_id where e.id = kx.eid and s.version_id = v_version)) then
      v_errors := v_errors || jsonb_build_object('code','verdict_evidence_not_in_case'); end if;
    if exists (select 1 from detective_verdict_criteria k, unnest(k.timeline_order) t where k.version_id = v_version
        and not exists (select 1 from detective_timeline_events te where te.version_id = v_version and te.event_key = t)) then
      v_errors := v_errors || jsonb_build_object('code','verdict_timeline_unknown_event'); end if;
  end if;
  -- translations (warnings: the app is Arabic-first and falls back to Arabic)
  select count(*) into v_count from detective_evidence e join detective_scenes s on s.id = e.scene_id where s.version_id = v_version and (coalesce(trim(e.public_title_ar),'') = '' or coalesce(trim(e.public_title),'') = '');
  if v_count > 0 then v_warnings := v_warnings || jsonb_build_object('code','missing_evidence_translation','count',v_count); end if;
  select count(*) into v_count from detective_questions where version_id = v_version and (coalesce(trim(prompt_ar),'') = '' or coalesce(trim(prompt),'') = '');
  if v_count > 0 then v_warnings := v_warnings || jsonb_build_object('code','missing_question_translation','count',v_count); end if;
  return jsonb_build_object('errors', v_errors, 'warnings', v_warnings, 'version_id', v_version);
end $$;

revoke all on function detective_case_settings(uuid), detective_grade_verdict(uuid, uuid, text, text, uuid[], text[]) from public, anon, authenticated;
revoke all on function detective_lab_request(uuid, uuid), detective_confront(uuid, uuid, uuid),
  detective_submit_verdict(uuid, uuid, text, text, uuid[], text[], text), get_detective_investigation(uuid), detective_resolution(uuid) from public, anon;
grant execute on function detective_lab_request(uuid, uuid), detective_confront(uuid, uuid, uuid),
  detective_submit_verdict(uuid, uuid, text, text, uuid[], text[], text), get_detective_investigation(uuid), detective_resolution(uuid) to authenticated;
