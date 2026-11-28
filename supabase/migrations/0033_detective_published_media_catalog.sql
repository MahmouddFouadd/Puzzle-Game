-- Complete published Detective media without touching drafts or seed content.
-- Covers are derived from each case's own published first scene when missing.

update public.detective_cases c
set cover_image_path = s.image_path,
    updated_at = now()
from lateral (
  select sc.image_path
  from public.detective_case_versions v
  join public.detective_scenes sc on sc.version_id = v.id
  where v.case_id = c.id
    and v.status = 'PUBLISHED'
  order by v.version_number desc, sc.position asc
  limit 1
) s
where c.status = 'PUBLISHED'
  and nullif(trim(c.cover_image_path), '') is null;

create or replace function public.get_detective_case_catalog() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', c.id,
    'slug', c.slug,
    'title', c.title,
    'title_ar', c.title_ar,
    'description', c.description,
    'description_ar', c.description_ar,
    'case_type', c.case_type,
    'difficulty', c.difficulty,
    'age_min', c.age_min,
    'age_max', c.age_max,
    'published_at', c.published_at,
    'category', c.category,
    'estimated_minutes', c.estimated_minutes,
    'cover_image_path', c.cover_image_path,
    'briefing', c.briefing,
    'briefing_ar', c.briefing_ar,
    'objective', c.objective,
    'objective_ar', c.objective_ar,
    'scenes', (select count(*) from public.detective_scenes sc where sc.version_id = v.id),
    'stages', (select count(*) from public.detective_stages st where st.version_id = v.id),
    'evidence', (select count(*) from public.detective_evidence e join public.detective_scenes sc on sc.id = e.scene_id where sc.version_id = v.id),
    'questions', (select count(*) from public.detective_questions q where q.version_id = v.id),
    'best_score', (select max(pp.score) from public.detective_player_progress pp join public.detective_sessions s on s.id = pp.session_id
      where s.version_id = v.id and pp.user_id = auth.uid() and pp.completed_at is not null),
    'completed', exists (select 1 from public.detective_player_progress pp join public.detective_sessions s on s.id = pp.session_id
      where s.version_id = v.id and pp.user_id = auth.uid() and pp.completed_at is not null),
    'resume_session', (select s.id from public.detective_sessions s join public.detective_player_progress pp on pp.session_id = s.id and pp.user_id = auth.uid()
      where s.version_id = v.id and s.status = 'PLAYING' and pp.completed_at is null and s.created_by = auth.uid()
      order by s.created_at desc limit 1)
  ) order by c.published_at desc), '[]'::jsonb)
  from public.detective_cases c
  join lateral (
    select vv.id
    from public.detective_case_versions vv
    where vv.case_id = c.id and vv.status = 'PUBLISHED'
    order by vv.version_number desc
    limit 1
  ) v on true
  where c.status = 'PUBLISHED';
$$;

grant execute on function public.get_detective_case_catalog() to anon, authenticated;
