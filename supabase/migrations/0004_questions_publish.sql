-- 0004_questions_publish.sql
-- Question bank, hidden question->piece mappings, validation, publish/unpublish/archive.
-- All writes go through staff-only SECURITY DEFINER functions; triggers add defense in depth.

create or replace function effective_multi_per_piece(p_story uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select allow_multiple_questions_per_piece from story_settings where story_id = p_story),
    (select allow_multiple_questions_per_piece from platform_settings limit 1), false);
$$;

-- ---------- guards: published stories are frozen ----------
create or replace function guard_published_story() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_story uuid; v_status story_status;
begin
  if tg_table_name = 'questions' then
    v_story := coalesce(new.story_id, old.story_id);
  else
    select q.story_id into v_story from questions q where q.id = coalesce(new.question_id, old.question_id);
  end if;
  select status into v_status from stories where id = v_story;
  if v_status = 'PUBLISHED' then raise exception 'story_published'; end if;
  return coalesce(new, old);
end $$;
create trigger guard_questions before insert or update or delete on questions for each row execute function guard_published_story();
create trigger guard_options before insert or update or delete on question_options for each row execute function guard_published_story();
create trigger guard_answers before insert or update or delete on accepted_answers for each row execute function guard_published_story();
create trigger guard_mappings before insert or update or delete on question_piece_mappings for each row execute function guard_published_story();

create or replace function guard_story_change() returns trigger
language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    if old.status = 'PUBLISHED' then raise exception 'story_published'; end if;
    return old;
  end if;
  if new.status = 'PUBLISHED' and old.status <> 'PUBLISHED' and coalesce(current_setting('app.publishing', true), '') <> 'on' then
    raise exception 'use_publish_story';
  end if;
  if old.status = 'PUBLISHED' and new.status = 'PUBLISHED'
     and (to_jsonb(new) - 'updated_at') <> (to_jsonb(old) - 'updated_at') then
    raise exception 'story_published';
  end if;
  return new;
end $$;
create trigger guard_story before update or delete on stories for each row execute function guard_story_change();

-- ---------- question CRUD ----------
create or replace function save_question(p_story uuid, p_id uuid, p jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_type question_type; v_opts jsonb; v_ans jsonb; v_opt uuid; o jsonb; i int; v_correct int := 0;
begin
  if not has_permission('story.manage') then raise exception 'forbidden' using errcode = '42501'; end if;
  if not exists (select 1 from stories where id = p_story) then raise exception 'story_not_found'; end if;
  if (select status from stories where id = p_story) = 'PUBLISHED' then raise exception 'story_published'; end if;
  if char_length(trim(coalesce(p->>'text', ''))) = 0 then raise exception 'invalid_question'; end if;
  v_type := (p->>'type')::question_type;
  v_opts := coalesce(p->'options', '[]'::jsonb);
  v_ans := coalesce(p->'answers', '[]'::jsonb);

  if p_id is null then
    insert into questions (story_id, text, type, explanation, hint, difficulty, language, published)
    values (p_story, trim(p->>'text'), v_type, nullif(p->>'explanation', ''), nullif(p->>'hint', ''),
            coalesce((p->>'difficulty')::smallint, 1), coalesce(p->>'language', 'en'), coalesce((p->>'published')::boolean, false))
    returning id into v_id;
  else
    update questions set text = trim(p->>'text'), type = v_type, explanation = nullif(p->>'explanation', ''), hint = nullif(p->>'hint', ''),
      difficulty = coalesce((p->>'difficulty')::smallint, 1), language = coalesce(p->>'language', 'en'),
      published = coalesce((p->>'published')::boolean, false)
    where id = p_id and story_id = p_story returning id into v_id;
    if v_id is null then raise exception 'question_not_found'; end if;
    delete from accepted_answers where question_id = v_id;
    delete from question_options where question_id = v_id;
  end if;

  if v_type = 'MULTIPLE_CHOICE' then
    if jsonb_array_length(v_opts) not between 2 and 8 then raise exception 'invalid_question'; end if;
    for i in 0 .. jsonb_array_length(v_opts) - 1 loop
      o := v_opts -> i;
      if char_length(trim(coalesce(o->>'text', ''))) = 0 then raise exception 'invalid_question'; end if;
      insert into question_options (question_id, position, text) values (v_id, i + 1, trim(o->>'text')) returning id into v_opt;
      if coalesce((o->>'correct')::boolean, false) then
        v_correct := v_correct + 1;
        insert into accepted_answers (question_id, answer_text, option_id, is_primary) values (v_id, trim(o->>'text'), v_opt, true);
      end if;
    end loop;
    if v_correct <> 1 then raise exception 'invalid_question'; end if;
  elsif v_type = 'TRUE_FALSE' then
    if jsonb_array_length(v_ans) <> 1 or (v_ans->>0) not in ('true', 'false') then raise exception 'invalid_question'; end if;
    insert into accepted_answers (question_id, answer_text, is_primary) values (v_id, v_ans->>0, true);
  else
    if jsonb_array_length(v_ans) < 1 or jsonb_array_length(v_ans) > 20 then raise exception 'invalid_question'; end if;
    for i in 0 .. jsonb_array_length(v_ans) - 1 loop
      if char_length(trim(coalesce(v_ans->>i, ''))) = 0 then raise exception 'invalid_question'; end if;
      insert into accepted_answers (question_id, answer_text, is_primary) values (v_id, trim(v_ans->>i), i = 0);
    end loop;
  end if;
  return v_id;
end $$;

-- ---------- mappings ----------
create or replace function set_question_mapping(p_question uuid, p_piece uuid, p_suggested boolean default false) returns void
language plpgsql security definer set search_path = public as $$
declare v_story uuid; v_piece_story uuid;
begin
  if not has_permission('story.manage') then raise exception 'forbidden' using errcode = '42501'; end if;
  select story_id into v_story from questions where id = p_question;
  if v_story is null then raise exception 'question_not_found'; end if;
  if (select status from stories where id = v_story) = 'PUBLISHED' then raise exception 'story_published'; end if;
  if p_piece is null then delete from question_piece_mappings where question_id = p_question; return; end if;

  select i.story_id into v_piece_story from puzzle_pieces p join story_images i on i.id = p.image_id where p.id = p_piece;
  if v_piece_story is distinct from v_story then raise exception 'piece_not_in_story'; end if;
  if exists (select 1 from question_piece_mappings where piece_id = p_piece and question_id <> p_question)
     and not effective_multi_per_piece(v_story) then
    raise exception 'piece_taken';
  end if;
  delete from question_piece_mappings where question_id = p_question and piece_id <> p_piece;
  insert into question_piece_mappings (question_id, piece_id, suggested_by_system, approved)
  values (p_question, p_piece, p_suggested, not p_suggested)
  on conflict (question_id, piece_id) do update set suggested_by_system = excluded.suggested_by_system, approved = excluded.approved;
end $$;

-- Replace all UNAPPROVED mappings of a story with the given suggestions [{question, piece}, ...].
create or replace function apply_suggested_mappings(p_story uuid, p_pairs jsonb) returns int
language plpgsql security definer set search_path = public as $$
declare e jsonb; n int := 0;
begin
  if not has_permission('story.manage') then raise exception 'forbidden' using errcode = '42501'; end if;
  if (select status from stories where id = p_story) = 'PUBLISHED' then raise exception 'story_published'; end if;
  delete from question_piece_mappings m using questions q where m.question_id = q.id and q.story_id = p_story and not m.approved;
  for e in select * from jsonb_array_elements(p_pairs) loop
    continue when exists (select 1 from question_piece_mappings where question_id = (e->>'question')::uuid and approved);
    begin
      perform set_question_mapping((e->>'question')::uuid, (e->>'piece')::uuid, true);
      n := n + 1;
    exception when others then
      if sqlerrm not in ('piece_taken', 'piece_not_in_story', 'question_not_found') then raise; end if;
    end;
  end loop;
  return n;
end $$;

create or replace function approve_mappings(p_story uuid) returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if not has_permission('story.manage') then raise exception 'forbidden' using errcode = '42501'; end if;
  if (select status from stories where id = p_story) = 'PUBLISHED' then raise exception 'story_published'; end if;
  update question_piece_mappings m set approved = true from questions q where m.question_id = q.id and q.story_id = p_story and not m.approved;
  get diagnostics n = row_count;
  insert into audit_logs (actor_id, action, target_type, target_id, details) values (auth.uid(), 'mappings.approve', 'story', p_story::text, jsonb_build_object('count', n));
  return n;
end $$;

-- ---------- validation + lifecycle ----------
create or replace function validate_story(p_story uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare errs jsonb := '[]'; warns jsonb := '[]'; r record; n int;
begin
  if not has_permission('story.manage') then raise exception 'forbidden' using errcode = '42501'; end if;
  select count(*) into n from story_images where story_id = p_story;
  if n = 0 then errs := errs || jsonb_build_object('code', 'no_images'); end if;
  if n = 1 then warns := warns || jsonb_build_object('code', 'single_image'); end if;

  for r in
    select i.id, i.title, count(p.id) as pieces,
           count(p.id) filter (where not exists (
             select 1 from question_piece_mappings m join questions q on q.id = m.question_id
             where m.piece_id = p.id and m.approved and q.published)) as uncovered
    from story_images i left join puzzle_pieces p on p.image_id = i.id
    where i.story_id = p_story group by i.id, i.title
  loop
    if r.pieces = 0 then errs := errs || jsonb_build_object('code', 'image_no_pieces', 'image', r.title);
    elsif r.uncovered > 0 then errs := errs || jsonb_build_object('code', 'piece_uncovered', 'image', r.title, 'count', r.uncovered); end if;
  end loop;

  select count(*) into n from question_piece_mappings m join questions q on q.id = m.question_id where q.story_id = p_story and not m.approved;
  if n > 0 then errs := errs || jsonb_build_object('code', 'unapproved_mappings', 'count', n); end if;
  select count(*) into n from question_piece_mappings m join questions q on q.id = m.question_id where q.story_id = p_story and not q.published;
  if n > 0 then errs := errs || jsonb_build_object('code', 'mapped_question_unpublished', 'count', n); end if;

  select count(*) into n from questions q where q.story_id = p_story and q.published
    and not exists (select 1 from question_piece_mappings m where m.question_id = q.id);
  if n > 0 then warns := warns || jsonb_build_object('code', 'unmapped_questions', 'count', n); end if;
  for r in select title from story_images where story_id = p_story and coalesce(trim(hint), '') = '' loop
    warns := warns || jsonb_build_object('code', 'missing_hint', 'image', r.title);
  end loop;
  return jsonb_build_object('errors', errs, 'warnings', warns);
end $$;

create or replace function publish_story(p_story uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v jsonb;
begin
  if not has_permission('story.manage') then raise exception 'forbidden' using errcode = '42501'; end if;
  v := validate_story(p_story);
  if jsonb_array_length(v->'errors') > 0 then raise exception 'validation_failed'; end if;
  perform set_config('app.publishing', 'on', true);
  update stories set status = 'PUBLISHED' where id = p_story and status <> 'PUBLISHED';
  insert into audit_logs (actor_id, action, target_type, target_id, details) values (auth.uid(), 'story.publish', 'story', p_story::text, jsonb_build_object('warnings', v->'warnings'));
end $$;

-- Unpublish / archive / restore. Publishing itself only happens through publish_story().
create or replace function set_story_status(p_story uuid, p_status story_status) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not has_permission('story.manage') then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_status = 'PUBLISHED' then raise exception 'use_publish_story'; end if;
  update stories set status = p_status where id = p_story;
  insert into audit_logs (actor_id, action, target_type, target_id, details) values (auth.uid(), 'story.status', 'story', p_story::text, jsonb_build_object('status', p_status));
end $$;

do $$
declare f text;
begin
  foreach f in array array[
    'save_question(uuid, uuid, jsonb)', 'set_question_mapping(uuid, uuid, boolean)', 'apply_suggested_mappings(uuid, jsonb)',
    'approve_mappings(uuid)', 'validate_story(uuid)', 'publish_story(uuid)', 'set_story_status(uuid, story_status)']
  loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;
