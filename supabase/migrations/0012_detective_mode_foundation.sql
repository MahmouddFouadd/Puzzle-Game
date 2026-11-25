-- 0012_detective_mode_foundation.sql
-- Additive Detective Mode foundation. Existing rooms/scoring/auth remain canonical.
-- Player-visible reads are exposed through SECURITY DEFINER functions only; answer keys and
-- administrator explanations are never granted to client roles.

create table if not exists detective_cases (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  title text not null check (char_length(trim(title)) between 1 and 160),
  title_ar text not null check (char_length(trim(title_ar)) between 1 and 160),
  description text,
  description_ar text,
  cover_image_path text,
  case_type text not null default 'FULL' check (case_type in ('FULL','QUICK')),
  difficulty smallint not null default 1 check (difficulty between 1 and 5),
  age_min smallint check (age_min is null or age_min between 0 and 99),
  age_max smallint check (age_max is null or age_max between 0 and 99),
  status text not null default 'DRAFT' check (status in ('DRAFT','IN_REVIEW','APPROVED','PUBLISHED','ARCHIVED')),
  created_by uuid not null references auth.users(id),
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (age_min is null or age_max is null or age_min <= age_max)
);

create table if not exists detective_case_versions (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references detective_cases(id) on delete cascade,
  version_number integer not null check (version_number > 0),
  status text not null default 'DRAFT' check (status in ('DRAFT','IN_REVIEW','APPROVED','PUBLISHED','ARCHIVED')),
  created_by uuid not null references auth.users(id),
  approved_by uuid references auth.users(id),
  published_at timestamptz,
  created_at timestamptz not null default now(),
  unique (case_id, version_number)
);

create table if not exists detective_scenes (
  id uuid primary key default gen_random_uuid(),
  version_id uuid not null references detective_case_versions(id) on delete cascade,
  position smallint not null check (position > 0),
  title text not null,
  title_ar text not null,
  image_path text not null,
  introduction text,
  introduction_ar text,
  unique (version_id, position)
);

create table if not exists detective_stages (
  id uuid primary key default gen_random_uuid(),
  version_id uuid not null references detective_case_versions(id) on delete cascade,
  stage_key text not null,
  position smallint not null check (position > 0),
  title text not null,
  title_ar text not null,
  unlock_rule jsonb not null default '{}'::jsonb,
  unique (version_id, stage_key),
  unique (version_id, position)
);

create table if not exists detective_evidence (
  id uuid primary key default gen_random_uuid(),
  scene_id uuid not null references detective_scenes(id) on delete cascade,
  evidence_key text not null,
  internal_title text not null,
  public_title text not null,
  public_title_ar text not null,
  x numeric(6,3) not null check (x between 0 and 100),
  y numeric(6,3) not null check (y between 0 and 100),
  width numeric(6,3) not null check (width > 0 and width <= 100),
  height numeric(6,3) not null check (height > 0 and height <= 100),
  zoom_image_path text,
  public_description text,
  public_description_ar text,
  admin_explanation text,
  classification text not null default 'OBSERVATION' check (classification in ('OBSERVATION','FACT','INFERENCE','PROBABILITY','ASSUMPTION')),
  importance smallint not null default 1 check (importance between 1 and 5),
  unlock_rule jsonb not null default '{}'::jsonb,
  unique (scene_id, evidence_key)
);

create table if not exists detective_evidence_relations (
  id uuid primary key default gen_random_uuid(),
  version_id uuid not null references detective_case_versions(id) on delete cascade,
  from_evidence_id uuid not null references detective_evidence(id) on delete cascade,
  to_evidence_id uuid not null references detective_evidence(id) on delete cascade,
  relation_type text not null check (relation_type in ('SUPPORTS','CONTRADICTS','TEMPORAL','CONTEXTUAL')),
  public_explanation text,
  admin_explanation text,
  unique (version_id, from_evidence_id, to_evidence_id, relation_type),
  check (from_evidence_id <> to_evidence_id)
);

create table if not exists detective_questions (
  id uuid primary key default gen_random_uuid(),
  version_id uuid not null references detective_case_versions(id) on delete cascade,
  stage_id uuid references detective_stages(id) on delete set null,
  question_type text not null check (question_type in ('MULTIPLE_CHOICE','MULTIPLE_SELECT','TRUE_FALSE','SHORT_TEXT','EVIDENCE_IDENTIFICATION','EVIDENCE_COMPARISON','EVIDENCE_RELATIONSHIP','EVENT_ORDERING','SUSPECT_SELECTION','CONTRADICTION_IDENTIFICATION','CONFIDENCE','FINAL_CONCLUSION')),
  prompt text not null,
  prompt_ar text not null,
  options jsonb not null default '[]'::jsonb,
  answer_key jsonb not null default '{}'::jsonb,
  accepted_alternatives jsonb not null default '[]'::jsonb,
  explanation text,
  explanation_ar text,
  associated_evidence uuid[] not null default '{}',
  points integer not null default 10 check (points between 0 and 1000),
  penalty integer not null default -10 check (penalty between -1000 and 0),
  hint_rule jsonb not null default '{}'::jsonb,
  unlock_rule jsonb not null default '{}'::jsonb,
  position smallint not null default 1 check (position > 0)
);

create table if not exists detective_suspects (
  id uuid primary key default gen_random_uuid(),
  version_id uuid not null references detective_case_versions(id) on delete cascade,
  name text not null,
  name_ar text not null,
  portrait_path text,
  description text,
  description_ar text,
  relationship text,
  background text,
  timeline jsonb not null default '[]'::jsonb,
  alibi text
);

create table if not exists detective_statements (
  id uuid primary key default gen_random_uuid(),
  suspect_id uuid not null references detective_suspects(id) on delete cascade,
  statement text not null,
  statement_ar text not null,
  truth_status text not null default 'UNREVIEWED' check (truth_status in ('TRUE','FALSE','INCOMPLETE','UNREVIEWED')),
  conflicting_evidence uuid[] not null default '{}',
  admin_explanation text
);

create table if not exists detective_hints (
  id uuid primary key default gen_random_uuid(),
  version_id uuid not null references detective_case_versions(id) on delete cascade,
  stage_id uuid references detective_stages(id) on delete cascade,
  hint_text text not null,
  hint_text_ar text not null,
  unlock_rule jsonb not null default '{}'::jsonb,
  penalty integer not null default 0 check (penalty between -1000 and 0),
  position smallint not null default 1 check (position > 0)
);

create table if not exists detective_solutions (
  id uuid primary key default gen_random_uuid(),
  version_id uuid not null unique references detective_case_versions(id) on delete cascade,
  public_reveal text not null,
  public_reveal_ar text not null,
  solution_key jsonb not null default '{}'::jsonb,
  alternative_hypotheses jsonb not null default '[]'::jsonb,
  educational_explanation text,
  educational_explanation_ar text
);

create table if not exists detective_timeline_events (
  id uuid primary key default gen_random_uuid(),
  version_id uuid not null references detective_case_versions(id) on delete cascade,
  event_key text not null,
  label text not null,
  label_ar text not null,
  window_key text,
  position smallint not null check (position > 0),
  unique (version_id, event_key)
);

create table if not exists detective_sessions (
  id uuid primary key default gen_random_uuid(),
  room_id uuid references rooms(id) on delete cascade,
  version_id uuid not null references detective_case_versions(id),
  mode text not null check (mode in ('SOLO','COOPERATIVE','COMPETITIVE','TEAMS')),
  sharing text not null default 'TEAM_SHARED' check (sharing in ('PRIVATE','SHARED','TEAM_SHARED','HOST_CONTROLLED')),
  status text not null default 'WAITING' check (status in ('WAITING','PLAYING','PAUSED','FINISHED','CANCELLED')),
  started_at timestamptz,
  finished_at timestamptz,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);

create table if not exists detective_player_progress (
  session_id uuid not null references detective_sessions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  current_stage_id uuid references detective_stages(id),
  score integer not null default 0,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  primary key (session_id, user_id)
);

create table if not exists detective_discoveries (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references detective_sessions(id) on delete cascade,
  evidence_id uuid not null references detective_evidence(id),
  discovered_by uuid not null references auth.users(id),
  discovered_at timestamptz not null default now(),
  inspection_status text not null default 'DISCOVERED' check (inspection_status in ('DISCOVERED','INSPECTED','ANALYZED')),
  unique (session_id, evidence_id, discovered_by)
);

create table if not exists detective_submissions (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references detective_sessions(id) on delete cascade,
  question_id uuid not null references detective_questions(id),
  submitted_by uuid not null references auth.users(id),
  answer jsonb not null,
  is_correct boolean not null,
  points_delta integer not null,
  idempotency_key uuid not null unique,
  created_at timestamptz not null default now()
);

create table if not exists detective_player_notes (
  session_id uuid not null references detective_sessions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  note_id uuid not null default gen_random_uuid(),
  body text not null check (char_length(body) <= 5000),
  updated_at timestamptz not null default now(),
  primary key (session_id, user_id, note_id)
);

create table if not exists detective_deductions (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references detective_sessions(id) on delete cascade,
  created_by uuid not null references auth.users(id),
  body text not null,
  confidence text not null check (confidence in ('FACT','INFERENCE','PROBABILITY','ASSUMPTION')),
  evidence_ids uuid[] not null default '{}',
  created_at timestamptz not null default now()
);

create table if not exists detective_score_events (
  id bigint generated always as identity primary key,
  session_id uuid not null references detective_sessions(id) on delete cascade,
  user_id uuid not null references auth.users(id),
  event_type text not null,
  points integer not null,
  previous_score integer not null,
  new_score integer not null,
  submission_id uuid references detective_submissions(id),
  idempotency_key uuid not null unique,
  created_at timestamptz not null default clock_timestamp()
);

create index if not exists detective_cases_status_idx on detective_cases(status, updated_at desc);
create index if not exists detective_versions_case_idx on detective_case_versions(case_id, version_number desc);
create index if not exists detective_sessions_room_idx on detective_sessions(room_id, created_at desc);
create index if not exists detective_discoveries_session_idx on detective_discoveries(session_id, discovered_at);
create index if not exists detective_submissions_session_idx on detective_submissions(session_id, created_at);

alter table detective_cases enable row level security;
alter table detective_case_versions enable row level security;
alter table detective_scenes enable row level security;
alter table detective_stages enable row level security;
alter table detective_evidence enable row level security;
alter table detective_evidence_relations enable row level security;
alter table detective_questions enable row level security;
alter table detective_suspects enable row level security;
alter table detective_statements enable row level security;
alter table detective_hints enable row level security;
alter table detective_solutions enable row level security;
alter table detective_timeline_events enable row level security;
alter table detective_sessions enable row level security;
alter table detective_player_progress enable row level security;
alter table detective_discoveries enable row level security;
alter table detective_submissions enable row level security;
alter table detective_player_notes enable row level security;
alter table detective_deductions enable row level security;
alter table detective_score_events enable row level security;

create policy detective_case_staff_all on detective_cases for all using (has_permission('story.manage')) with check (has_permission('story.manage'));
create policy detective_version_staff_all on detective_case_versions for all using (has_permission('story.manage')) with check (has_permission('story.manage'));
create policy detective_scene_staff_all on detective_scenes for all using (has_permission('story.manage')) with check (has_permission('story.manage'));
create policy detective_stage_staff_all on detective_stages for all using (has_permission('story.manage')) with check (has_permission('story.manage'));
create policy detective_evidence_staff_all on detective_evidence for all using (has_permission('story.manage')) with check (has_permission('story.manage'));
create policy detective_relation_staff_all on detective_evidence_relations for all using (has_permission('story.manage')) with check (has_permission('story.manage'));
create policy detective_question_staff_all on detective_questions for all using (has_permission('story.manage')) with check (has_permission('story.manage'));
create policy detective_suspect_staff_all on detective_suspects for all using (has_permission('story.manage')) with check (has_permission('story.manage'));
create policy detective_statement_staff_all on detective_statements for all using (has_permission('story.manage')) with check (has_permission('story.manage'));
create policy detective_hint_staff_all on detective_hints for all using (has_permission('story.manage')) with check (has_permission('story.manage'));
create policy detective_solution_staff_all on detective_solutions for all using (has_permission('story.manage')) with check (has_permission('story.manage'));
create policy detective_timeline_staff_all on detective_timeline_events for all using (has_permission('story.manage')) with check (has_permission('story.manage'));

create policy detective_session_member_read on detective_sessions for select using (
  exists (select 1 from room_members rm where rm.room_id = detective_sessions.room_id and rm.user_id = auth.uid())
  or created_by = auth.uid() or has_permission('game.control')
);
create policy detective_progress_own_read on detective_player_progress for select using (user_id = auth.uid() or has_permission('game.control'));
create policy detective_discovery_authorized_read on detective_discoveries for select using (
  discovered_by = auth.uid() or has_permission('game.control')
  or exists (select 1 from detective_sessions s join room_members rm on rm.room_id = s.room_id where s.id = detective_discoveries.session_id and rm.user_id = auth.uid() and s.sharing in ('SHARED','TEAM_SHARED'))
);
create policy detective_notes_own on detective_player_notes for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy detective_deductions_member_read on detective_deductions for select using (created_by = auth.uid() or has_permission('game.control'));
create policy detective_submissions_own_read on detective_submissions for select using (submitted_by = auth.uid() or has_permission('game.control'));
create policy detective_scores_own_read on detective_score_events for select using (user_id = auth.uid() or has_permission('game.control'));

-- Published player-safe case catalog. It intentionally omits answer_key, admin explanations,
-- statement truth status, and solution_key.
create or replace function get_detective_case_catalog()
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'slug', c.slug, 'title', c.title, 'title_ar', c.title_ar,
      'description', c.description, 'description_ar', c.description_ar, 'case_type', c.case_type,
      'difficulty', c.difficulty, 'age_min', c.age_min, 'age_max', c.age_max, 'published_at', c.published_at)
      order by c.published_at desc), '[]'::jsonb)
  from detective_cases c where c.status = 'PUBLISHED';
$$;
revoke all on function get_detective_case_catalog() from public, anon;
grant execute on function get_detective_case_catalog() to authenticated;

-- Evidence discovery is server-authoritative. Unlock-rule evaluation is intentionally kept in
-- the database boundary; the first safe rule is previous-evidence dependency.
create or replace function discover_detective_evidence(p_session uuid, p_evidence uuid, p_key uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_user uuid := auth.uid(); v_exists boolean; v_result jsonb;
begin
  if v_user is null or p_key is null then raise exception 'unauthorized'; end if;
  if not exists (select 1 from detective_sessions s where s.id = p_session and s.status = 'PLAYING'
    and (s.created_by = v_user or exists (select 1 from room_members rm where rm.room_id = s.room_id and rm.user_id = v_user))) then raise exception 'session_forbidden'; end if;
  if not exists (select 1 from detective_evidence e join detective_scenes sc on sc.id = e.scene_id join detective_case_versions v on v.id = sc.version_id join detective_sessions s on s.version_id = v.id where e.id = p_evidence and s.id = p_session) then raise exception 'evidence_not_found'; end if;
  insert into detective_discoveries(session_id, evidence_id, discovered_by) values (p_session, p_evidence, v_user)
    on conflict (session_id, evidence_id, discovered_by) do nothing;
  select jsonb_build_object('session_id', p_session, 'evidence_id', p_evidence, 'status', 'DISCOVERED') into v_result;
  return v_result;
end $$;
revoke all on function discover_detective_evidence(uuid, uuid, uuid) from public, anon;
grant execute on function discover_detective_evidence(uuid, uuid, uuid) to authenticated;

-- No direct INSERT/UPDATE grants are added for submissions or score events. A follow-up
-- migration will add question validation after the case-version publishing validator exists.
