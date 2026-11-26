-- 0025: Cross-game KPIs for the admin dashboard (report.view only). Read-only aggregates.
create or replace function admin_kpis(p_days int default 14) returns jsonb
language plpgsql stable security definer set search_path = public, auth as $$
declare v_days int := greatest(7, least(60, coalesce(p_days, 14))); v_from date := current_date - (greatest(7, least(60, coalesce(p_days, 14))) - 1);
begin
  if not has_permission('report.view') then raise exception 'forbidden' using errcode = '42501'; end if;
  return jsonb_build_object(
    'generated_at', now(), 'days', v_days,
    'users', jsonb_build_object(
      'total', (select count(*) from auth.users),
      'guests', (select count(*) from auth.users where is_anonymous),
      'registered', (select count(*) from auth.users where not coalesce(is_anonymous, false)),
      'new_7d', (select count(*) from auth.users where created_at > now() - interval '7 days'),
      'active_24h', (select count(*) from auth.users where last_sign_in_at > now() - interval '24 hours'),
      'admins', (select count(distinct user_id) from user_roles where role::text <> 'PLAYER')),
    'story', jsonb_build_object(
      'stories', (select count(*) from stories), 'published', (select count(*) from stories where status = 'PUBLISHED'),
      'drafts', (select count(*) from stories where status = 'DRAFT'), 'images', (select count(*) from story_images),
      'pieces', (select count(*) from puzzle_pieces), 'questions', (select count(*) from questions),
      'rooms', (select count(*) from rooms), 'rooms_live', (select count(*) from rooms where status::text in ('WAITING','READY','COUNTDOWN','PLAYING','PAUSED')),
      'rooms_finished', (select count(*) from rooms where status::text = 'FINISHED'), 'teams', (select count(*) from teams)),
    'bakasa', jsonb_build_object(
      'rooms', (select count(*) from bakasa_rooms), 'rooms_live', (select count(*) from bakasa_rooms where status not in ('FINISHED','CLOSED') and updated_at > now() - interval '15 minutes'),
      'rounds', (select count(*) from bakasa_rounds where ended_at is not null),
      'spy_wins', (select count(*) from bakasa_rounds where winner = 'SPY'), 'player_wins', (select count(*) from bakasa_rounds where winner = 'PLAYERS'),
      'players', (select count(distinct user_id) from bakasa_players),
      'words', (select count(*) from bakasa_words where active), 'categories', (select count(*) from bakasa_categories where active),
      'top_categories', coalesce((select jsonb_agg(x order by (x->>'rounds')::int desc) from (
          select jsonb_build_object('name_ar', c.name_ar, 'name_en', c.name_en, 'emoji', c.emoji, 'color', c.color, 'rounds', count(r.id)) x
          from bakasa_categories c left join bakasa_rounds r on r.category_id = c.id and r.ended_at is not null
          group by c.id order by count(r.id) desc limit 6) t), '[]'::jsonb)),
    'detective', jsonb_build_object(
      'cases', (select count(*) from detective_cases), 'published', (select count(*) from detective_cases where status = 'PUBLISHED'),
      'sessions', (select count(*) from detective_player_progress), 'completed', (select count(*) from detective_player_progress where completed_at is not null),
      'avg_score', (select round(avg(score)) from detective_player_progress where completed_at is not null),
      'avg_minutes', (select round(avg(extract(epoch from completed_at - started_at) / 60)::numeric, 1) from detective_player_progress where completed_at is not null),
      'solved', (select count(*) from detective_submissions sb join detective_questions q on q.id = sb.question_id where q.question_type = 'FINAL_CONCLUSION' and sb.is_correct),
      'hints', (select count(*) from detective_hint_uses),
      'discoveries', (select count(*) from detective_discoveries)),
    'series', (select jsonb_agg(jsonb_build_object('day', d::date,
        'users', (select count(*) from auth.users where created_at::date = d::date),
        'story', (select count(*) from rooms where created_at::date = d::date),
        'bakasa', (select count(*) from bakasa_rounds where started_at::date = d::date),
        'detective', (select count(*) from detective_player_progress where started_at::date = d::date)) order by d)
      from generate_series(v_from, current_date, interval '1 day') d),
    'top_bakasa', coalesce((select jsonb_agg(x) from (select jsonb_build_object('name', max(p.nickname), 'avatar', max(p.avatar), 'score', sum(p.score), 'matches', count(*)) x
      from bakasa_players p join bakasa_rooms r on r.id = p.room_id where r.round_no > 0 group by p.user_id order by sum(p.score) desc limit 5) t), '[]'::jsonb),
    'top_detectives', coalesce((select jsonb_agg(x) from (select jsonb_build_object('name', coalesce(max(u.raw_user_meta_data->>'display_name'), 'محقق'), 'score', max(pp.score), 'solved', count(*)) x
      from detective_player_progress pp join auth.users u on u.id = pp.user_id where pp.completed_at is not null group by pp.user_id order by max(pp.score) desc limit 5) t), '[]'::jsonb),
    'activity', coalesce((select jsonb_agg(x order by x->>'at' desc) from (
        (select jsonb_build_object('kind', 'audit', 'label', a.action, 'at', a.created_at) x from audit_logs a order by a.created_at desc limit 8)
        union all
        (select jsonb_build_object('kind', 'bakasa', 'label', 'bakasa.round:' || coalesce(r.winner, ''), 'at', r.ended_at) from bakasa_rounds r where r.ended_at is not null order by r.ended_at desc limit 6)
        union all
        (select jsonb_build_object('kind', 'detective', 'label', 'detective.completed:' || pp.score, 'at', pp.completed_at) from detective_player_progress pp where pp.completed_at is not null order by pp.completed_at desc limit 6)
        union all
        (select jsonb_build_object('kind', 'user', 'label', case when u.is_anonymous then 'user.guest' else 'user.registered' end, 'at', u.created_at) from auth.users u order by u.created_at desc limit 6)
      ) t), '[]'::jsonb));
end $$;
revoke all on function admin_kpis(int) from public, anon;
grant execute on function admin_kpis(int) to authenticated;
