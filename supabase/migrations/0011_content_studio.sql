-- 0011_content_studio.sql
-- Additive editorial/content-management layer over the existing playable story model.
-- The existing stories/story_images/questions/puzzle_pieces/mappings remain canonical.
-- Editorial approval is deliberately separate from publish_story().

-- A reviewer capability distinct from ordinary story editing.
insert into role_permissions (role, permission)
values ('ADMIN', 'content.review')
on conflict (role, permission) do nothing;

create table content_categories (
  id uuid primary key default gen_random_uuid(),
  parent_id uuid references content_categories(id) on delete set null,
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name_en text not null check (char_length(trim(name_en)) between 1 and 80),
  name_ar text not null check (char_length(trim(name_ar)) between 1 and 80),
  description text,
  sort_order smallint not null default 0,
  is_active boolean not null default true,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into content_categories (slug, name_en, name_ar, sort_order) values
  ('science', 'Science', 'العلوم', 1),
  ('history', 'History & Civilizations', 'التاريخ والحضارات', 2),
  ('geography', 'Geography & Environment', 'الجغرافيا والبيئة', 3),
  ('mathematics', 'Mathematics & Logic', 'الرياضيات والمنطق', 4),
  ('arabic-language', 'Arabic Language', 'اللغة العربية', 5),
  ('life-skills', 'Life Skills', 'المهارات الحياتية', 6),
  ('technology', 'Technology', 'التكنولوجيا', 7)
on conflict (slug) do nothing;

create table content_tags (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 1 and 60),
  normalized_name text generated always as (lower(trim(name))) stored,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  unique (normalized_name)
);

create table story_content_metadata (
  story_id uuid primary key references stories(id) on delete cascade,
  language text not null default 'ar' check (language in ('ar','en')),
  age_min smallint check (age_min is null or age_min between 0 and 99),
  age_max smallint check (age_max is null or age_max between 0 and 99),
  subject_id uuid references content_categories(id) on delete set null,
  difficulty smallint not null default 1 check (difficulty between 1 and 5),
  source_type text not null default 'MANUAL' check (source_type in ('MANUAL','AI','IMPORT')),
  source_reference text,
  license_type text not null default 'UNKNOWN',
  attribution text,
  review_status text not null default 'DRAFT' check (review_status in ('DRAFT','IN_REVIEW','APPROVED','REJECTED','ARCHIVED')),
  author_id uuid references auth.users(id),
  reviewer_id uuid references auth.users(id),
  approved_at timestamptz,
  editorial_notes text,
  external_key text,
  import_payload_hash text check (import_payload_hash is null or import_payload_hash ~ '^[0-9a-f]{64}$'),
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  check (age_min is null or age_max is null or age_min <= age_max)
);
create unique index story_content_metadata_external_key_uq
  on story_content_metadata(external_key) where external_key is not null;
create index story_content_metadata_review_idx on story_content_metadata(review_status, updated_at desc);
create index story_content_metadata_age_idx on story_content_metadata(age_min, age_max);
create index story_content_metadata_subject_idx on story_content_metadata(subject_id);

-- Existing stories are given editorial metadata without inventing age/source information.
insert into story_content_metadata (story_id, language, difficulty, author_id)
select s.id, s.language, s.difficulty, s.created_by
from stories s
on conflict (story_id) do nothing;

create or replace function ensure_story_content_metadata() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into story_content_metadata (story_id, language, difficulty, author_id)
  values (new.id, new.language, new.difficulty, new.created_by)
  on conflict (story_id) do nothing;
  return new;
end $$;
create trigger stories_create_content_metadata
  after insert on stories for each row execute function ensure_story_content_metadata();

create or replace function guard_editorial_status() returns trigger
language plpgsql set search_path = public as $$
begin
  if tg_op = 'UPDATE' and new.review_status is distinct from old.review_status
     and coalesce(current_setting('app.content_review_transition', true), '') <> 'on' then
    raise exception 'use_set_story_review_status';
  end if;
  if tg_op = 'INSERT' and new.review_status <> 'DRAFT' then
    raise exception 'editorial_status_must_start_as_draft';
  end if;
  return new;
end $$;
create trigger story_content_metadata_status_guard
  before insert or update of review_status on story_content_metadata
  for each row execute function guard_editorial_status();

create table story_tags (
  story_id uuid not null references stories(id) on delete cascade,
  tag_id uuid not null references content_tags(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (story_id, tag_id)
);

create table content_assets (
  id uuid primary key default gen_random_uuid(),
  storage_path text not null unique,
  original_filename text not null,
  mime_type text not null,
  width integer not null check (width > 0),
  height integer not null check (height > 0),
  file_size bigint check (file_size is null or file_size between 0 and 52428800),
  sha256 text check (sha256 is null or sha256 ~ '^[0-9a-f]{64}$'),
  source_type text not null default 'UPLOAD' check (source_type in ('UPLOAD','AI','IMPORT','LEGACY')),
  source_provider text,
  license_type text not null default 'UNKNOWN',
  attribution text,
  generation_prompt text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  unique (sha256)
);
create index content_assets_created_idx on content_assets(created_at desc);
create index content_assets_name_idx on content_assets using gin (to_tsvector('simple', original_filename));

create table content_asset_usages (
  asset_id uuid not null references content_assets(id) on delete restrict,
  story_image_id uuid not null unique references story_images(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (asset_id, story_image_id)
);
create index content_asset_usages_asset_idx on content_asset_usages(asset_id);

-- Register legacy story originals so future deletes/reuse cannot unknowingly remove a shared object.
insert into content_assets (storage_path, original_filename, mime_type, width, height, source_type, created_by)
select distinct on (i.storage_path) i.storage_path,
       coalesce(nullif(split_part(i.storage_path, '/', 2), ''), 'legacy-image'),
       'application/octet-stream', i.width, i.height, 'LEGACY', s.created_by
from story_images i join stories s on s.id = i.story_id
order by i.storage_path, i.id
on conflict (storage_path) do nothing;

insert into content_asset_usages (asset_id, story_image_id)
select a.id, i.id
from story_images i join content_assets a on a.storage_path = i.storage_path
on conflict (story_image_id) do nothing;

create table content_import_batches (
  id uuid primary key default gen_random_uuid(),
  filename text not null,
  uploaded_by uuid not null references auth.users(id),
  status text not null default 'VALIDATING' check (status in ('VALIDATING','READY','IMPORTING','COMPLETED','PARTIAL','FAILED','CANCELLED')),
  dry_run boolean not null default true,
  total_rows integer not null default 0 check (total_rows >= 0),
  valid_rows integer not null default 0 check (valid_rows >= 0),
  imported_rows integer not null default 0 check (imported_rows >= 0),
  error_rows integer not null default 0 check (error_rows >= 0),
  created_at timestamptz not null default now(),
  finished_at timestamptz
);
create index content_import_batches_owner_idx on content_import_batches(uploaded_by, created_at desc);

create table content_import_errors (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references content_import_batches(id) on delete cascade,
  sheet_name text not null,
  row_number integer not null check (row_number >= 1),
  field_name text,
  error_code text not null,
  message text not null,
  created_at timestamptz not null default now(),
  unique (batch_id, sheet_name, row_number, field_name, error_code)
);

create table content_import_items (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references content_import_batches(id) on delete cascade,
  story_key text not null,
  payload_hash text not null check (payload_hash ~ '^[0-9a-f]{64}$'),
  story_id uuid references stories(id) on delete set null,
  status text not null default 'VALIDATED' check (status in ('VALIDATED','IMPORTING','IMPORTED','FAILED')),
  error_summary text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (batch_id, story_key)
);
create index content_import_items_status_idx on content_import_items(batch_id, status);

create table ai_generation_jobs (
  id uuid primary key default gen_random_uuid(),
  requested_by uuid not null references auth.users(id),
  job_type text not null default 'STORY' check (job_type in ('STORY','QUESTIONS','IMAGE','FULL_PACKAGE')),
  status text not null default 'QUEUED' check (status in ('QUEUED','RUNNING','DONE','FAILED','CANCELLED')),
  provider text,
  model text,
  input jsonb not null default '{}',
  attempts smallint not null default 0 check (attempts >= 0),
  error_code text,
  error_summary text,
  estimated_cost numeric(12,4),
  actual_cost numeric(12,4),
  duration_ms integer check (duration_ms is null or duration_ms >= 0),
  linked_story_id uuid references stories(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  finished_at timestamptz
);
create index ai_generation_jobs_owner_idx on ai_generation_jobs(requested_by, created_at desc);
create index ai_generation_jobs_status_idx on ai_generation_jobs(status, created_at);

create table ai_generation_results (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references ai_generation_jobs(id) on delete cascade,
  revision smallint not null default 1 check (revision > 0),
  result jsonb not null,
  created_at timestamptz not null default now(),
  unique (job_id, revision)
);

create table content_review_history (
  id uuid primary key default gen_random_uuid(),
  story_id uuid not null references stories(id) on delete cascade,
  actor_id uuid references auth.users(id),
  from_status text check (from_status is null or from_status in ('DRAFT','IN_REVIEW','APPROVED','REJECTED','ARCHIVED')),
  to_status text not null check (to_status in ('DRAFT','IN_REVIEW','APPROVED','REJECTED','ARCHIVED')),
  reason text,
  snapshot jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index content_review_history_story_idx on content_review_history(story_id, created_at desc);

create table content_versions (
  id uuid primary key default gen_random_uuid(),
  story_id uuid not null references stories(id) on delete cascade,
  version_number integer not null check (version_number > 0),
  created_by uuid references auth.users(id),
  change_reason text,
  snapshot jsonb not null,
  created_at timestamptz not null default now(),
  unique (story_id, version_number)
);
create index content_versions_story_idx on content_versions(story_id, version_number desc);

create table content_studio_settings (
  id boolean primary key default true check (id),
  max_stories_per_import smallint not null default 100 check (max_stories_per_import between 1 and 500),
  max_images_per_story smallint not null default 5 check (max_images_per_story between 1 and 20),
  max_questions_per_scene smallint not null default 6 check (max_questions_per_scene between 1 and 30),
  max_concurrent_ai_jobs smallint not null default 2 check (max_concurrent_ai_jobs between 1 and 20),
  max_image_bytes integer not null default 15728640 check (max_image_bytes between 1024 and 52428800),
  updated_at timestamptz not null default now()
);
insert into content_studio_settings (id) values (true) on conflict (id) do nothing;

create or replace function guard_content_import_batch() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.id is distinct from old.id or new.filename is distinct from old.filename
     or new.uploaded_by is distinct from old.uploaded_by or new.dry_run is distinct from old.dry_run
     or new.total_rows is distinct from old.total_rows or new.valid_rows is distinct from old.valid_rows
     or new.created_at is distinct from old.created_at then
    raise exception 'import_batch_identity_immutable';
  end if;
  if new.imported_rows is distinct from old.imported_rows
     and coalesce(current_setting('app.content_import_count',true),'') <> 'on' then
    raise exception 'import_counts_are_server_managed';
  end if;
  return new;
end $$;
create trigger content_import_batch_guard before update on content_import_batches
  for each row execute function guard_content_import_batch();

-- RLS: editorial metadata and operational records are staff-only. Writes that change
-- review state are restricted to the audited transition function below.
do $$
declare t text;
begin
  foreach t in array array[
    'content_categories','content_tags','story_content_metadata','story_tags','content_assets','content_asset_usages',
    'content_import_batches','content_import_errors','content_import_items','ai_generation_jobs','ai_generation_results',
    'content_review_history','content_versions','content_studio_settings']
  loop execute format('alter table %I enable row level security', t); end loop;
end $$;

create policy content_categories_staff_read on content_categories for select using (has_permission('story.manage'));
create policy content_categories_staff_write on content_categories for all using (has_permission('story.manage')) with check (has_permission('story.manage'));
create policy content_tags_staff_read on content_tags for select using (has_permission('story.manage'));
create policy content_tags_staff_write on content_tags for all using (has_permission('story.manage')) with check (has_permission('story.manage'));
create policy story_metadata_staff_read on story_content_metadata for select using (has_permission('story.manage'));
create policy story_tags_staff_read on story_tags for select using (has_permission('story.manage'));
create policy story_tags_staff_write on story_tags for all using (has_permission('story.manage')) with check (has_permission('story.manage'));
create policy content_assets_staff_read on content_assets for select using (has_permission('story.manage'));
create policy content_assets_staff_write on content_assets for all using (has_permission('story.manage')) with check (has_permission('story.manage'));
create policy content_asset_usages_staff_read on content_asset_usages for select using (has_permission('story.manage'));
create policy content_import_batches_owner_read on content_import_batches for select using (uploaded_by = auth.uid() or has_permission('content.review'));
create policy content_import_batches_owner_insert on content_import_batches for insert with check (uploaded_by = auth.uid() and has_permission('story.manage'));
create policy content_import_batches_owner_update on content_import_batches for update
  using (uploaded_by = auth.uid() and has_permission('story.manage'))
  with check (uploaded_by = auth.uid() and has_permission('story.manage'));
create policy content_import_errors_owner_read on content_import_errors for select
  using (exists (select 1 from content_import_batches b where b.id = batch_id and (b.uploaded_by = auth.uid() or has_permission('content.review'))));
create policy content_import_errors_owner_write on content_import_errors for all
  using (exists (select 1 from content_import_batches b where b.id = batch_id and b.uploaded_by = auth.uid() and has_permission('story.manage')))
  with check (exists (select 1 from content_import_batches b where b.id = batch_id and b.uploaded_by = auth.uid() and has_permission('story.manage')));
create policy content_import_items_owner_read on content_import_items for select
  using (exists (select 1 from content_import_batches b where b.id = batch_id and (b.uploaded_by = auth.uid() or has_permission('content.review'))));
create policy ai_jobs_owner_read on ai_generation_jobs for select using (requested_by = auth.uid() or has_permission('content.review'));
create policy ai_results_owner_read on ai_generation_results for select
  using (exists (select 1 from ai_generation_jobs j where j.id = job_id and (j.requested_by = auth.uid() or has_permission('content.review'))));
create policy content_review_history_staff_read on content_review_history for select using (has_permission('story.manage'));
create policy content_versions_staff_read on content_versions for select using (has_permission('story.manage'));
create policy content_studio_settings_staff_read on content_studio_settings for select using (has_permission('story.manage'));
create policy content_studio_settings_admin_write on content_studio_settings for update using (has_permission('*')) with check (has_permission('*'));

create trigger content_categories_touch before update on content_categories for each row execute function touch_updated_at();
create trigger story_content_metadata_touch before update on story_content_metadata for each row execute function touch_updated_at();
create trigger content_import_items_touch before update on content_import_items for each row execute function touch_updated_at();
create trigger ai_generation_jobs_touch before update on ai_generation_jobs for each row execute function touch_updated_at();

create or replace function content_story_snapshot(p_story uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'story', to_jsonb(s),
    'metadata', (select to_jsonb(m) from story_content_metadata m where m.story_id = s.id),
    'tags', (select coalesce(jsonb_agg(t.name order by t.name), '[]'::jsonb) from story_tags st join content_tags t on t.id = st.tag_id where st.story_id = s.id),
    'images', (select coalesce(jsonb_agg(to_jsonb(i) order by i.position), '[]'::jsonb) from story_images i where i.story_id = s.id),
    'questions', (select coalesce(jsonb_agg(jsonb_build_object(
      'question', to_jsonb(q),
      'options', (select coalesce(jsonb_agg(to_jsonb(o) order by o.position), '[]'::jsonb) from question_options o where o.question_id = q.id),
      'answers', (select coalesce(jsonb_agg(to_jsonb(a) order by a.is_primary desc), '[]'::jsonb) from accepted_answers a where a.question_id = q.id)
    ) order by q.created_at), '[]'::jsonb) from questions q where q.story_id = s.id)
  )
  from stories s where s.id = p_story and has_permission('story.manage');
$$;

create or replace function save_story_content_metadata(p_story uuid, p jsonb, p_tags text[] default '{}') returns void
language plpgsql security definer set search_path = public as $$
declare s stories%rowtype; v_tags text; v_tag_id uuid;
begin
  if not has_permission('story.manage') then raise exception 'forbidden' using errcode = '42501'; end if;
  select * into s from stories where id = p_story;
  if not found then raise exception 'story_not_found'; end if;
  if nullif(p->>'age_min','') is not null and nullif(p->>'age_max','') is not null
     and (p->>'age_min')::smallint > (p->>'age_max')::smallint then raise exception 'invalid_age_range'; end if;
  if coalesce(p->>'language', s.language) not in ('ar','en') then raise exception 'invalid_language'; end if;
  if coalesce(p->>'source_type','MANUAL') not in ('MANUAL','AI','IMPORT') then raise exception 'invalid_source_type'; end if;
  if nullif(p->>'subject_id','') is not null and not exists (select 1 from content_categories where id = (p->>'subject_id')::uuid and is_active) then raise exception 'category_not_found'; end if;

  insert into story_content_metadata (
    story_id, language, age_min, age_max, subject_id, difficulty, source_type, source_reference,
    license_type, attribution, author_id, editorial_notes
  ) values (
    p_story, coalesce(p->>'language', s.language), nullif(p->>'age_min','')::smallint, nullif(p->>'age_max','')::smallint,
    nullif(p->>'subject_id','')::uuid, coalesce((p->>'difficulty')::smallint, s.difficulty), coalesce(p->>'source_type','MANUAL'),
    nullif(trim(p->>'source_reference'),''), coalesce(nullif(trim(p->>'license_type'),''),'UNKNOWN'), nullif(trim(p->>'attribution'),''),
    coalesce((select author_id from story_content_metadata where story_id=p_story), auth.uid()), nullif(trim(p->>'editorial_notes'),'')
  ) on conflict (story_id) do update set
    language=excluded.language, age_min=excluded.age_min, age_max=excluded.age_max, subject_id=excluded.subject_id,
    difficulty=excluded.difficulty, source_type=excluded.source_type, source_reference=excluded.source_reference,
    license_type=excluded.license_type, attribution=excluded.attribution, editorial_notes=excluded.editorial_notes;

  delete from story_tags where story_id = p_story;
  foreach v_tags in array coalesce(p_tags, '{}') loop
    if char_length(trim(v_tags)) between 1 and 60 then
      insert into content_tags(name, created_by) values (trim(v_tags), auth.uid())
      on conflict (normalized_name) do update set name = excluded.name returning id into v_tag_id;
      insert into story_tags(story_id, tag_id) values (p_story, v_tag_id) on conflict do nothing;
    end if;
  end loop;

  insert into content_versions(story_id, version_number, created_by, change_reason, snapshot)
  select p_story, coalesce(max(version_number),0)+1, auth.uid(), 'metadata_saved', content_story_snapshot(p_story)
  from content_versions where story_id = p_story;
end $$;

create or replace function set_story_review_status(p_story uuid, p_status text, p_reason text default null) returns void
language plpgsql security definer set search_path = public as $$
declare v_from text; v_snapshot jsonb; v_version int;
begin
  if not has_permission('story.manage') then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_status not in ('DRAFT','IN_REVIEW','APPROVED','REJECTED','ARCHIVED') then raise exception 'invalid_review_status'; end if;
  if p_status in ('APPROVED','REJECTED') and not has_permission('content.review') then raise exception 'review_permission_required' using errcode = '42501'; end if;
  if p_status = 'REJECTED' and nullif(trim(p_reason),'') is null then raise exception 'review_reason_required'; end if;
  if not exists (select 1 from stories where id = p_story) then raise exception 'story_not_found'; end if;

  insert into story_content_metadata(story_id, language, author_id)
    select id, language, created_by from stories where id = p_story on conflict (story_id) do nothing;
  select review_status into v_from from story_content_metadata where story_id = p_story for update;
  if v_from = p_status then return; end if;
  if p_status in ('APPROVED','REJECTED') and v_from <> 'IN_REVIEW' then raise exception 'story_not_in_review'; end if;
  perform set_config('app.content_review_transition','on',true);
  update story_content_metadata set review_status=p_status,
    reviewer_id=case when p_status in ('APPROVED','REJECTED') then auth.uid() else reviewer_id end,
    approved_at=case when p_status='APPROVED' then now() when p_status <> 'APPROVED' then null else approved_at end,
    updated_at=now()
  where story_id=p_story;

  v_snapshot := content_story_snapshot(p_story);
  insert into content_review_history(story_id, actor_id, from_status, to_status, reason, snapshot)
    values(p_story,auth.uid(),v_from,p_status,nullif(trim(p_reason),''),coalesce(v_snapshot,'{}'::jsonb));
  select coalesce(max(version_number),0)+1 into v_version from content_versions where story_id=p_story;
  insert into content_versions(story_id,version_number,created_by,change_reason,snapshot)
    values(p_story,v_version,auth.uid(),coalesce(nullif(trim(p_reason),''),'review_status:'||p_status),coalesce(v_snapshot,'{}'::jsonb));
  insert into audit_logs(actor_id,action,target_type,target_id,details)
    values(auth.uid(),'content.review.'||lower(p_status),'story',p_story::text,jsonb_build_object('from',v_from,'to',p_status,'reason',nullif(trim(p_reason),'')));
end $$;

create or replace function attach_content_asset(p_story uuid, p_asset uuid, p_title text default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare a content_assets%rowtype; v_image uuid; v_position smallint; v_piece_count smallint;
begin
  if not has_permission('story.manage') then raise exception 'forbidden' using errcode = '42501'; end if;
  if not exists (select 1 from stories where id=p_story and status <> 'PUBLISHED') then raise exception 'story_not_editable'; end if;
  select * into a from content_assets where id=p_asset;
  if not found then raise exception 'asset_not_found'; end if;
  select coalesce(max(position),0)+1 into v_position from story_images where story_id=p_story;
  select min_piece_count into v_piece_count from platform_settings limit 1;
  insert into story_images(story_id,position,title,storage_path,width,height,piece_count)
  values(p_story,v_position,coalesce(nullif(trim(p_title),''),left(a.original_filename,80)),a.storage_path,a.width,a.height,coalesce(v_piece_count,4))
  returning id into v_image;
  insert into content_asset_usages(asset_id,story_image_id) values(a.id,v_image);
  insert into audit_logs(actor_id,action,target_type,target_id,details)
  values(auth.uid(),'content.asset.attach','story_image',v_image::text,jsonb_build_object('asset_id',a.id,'story_id',p_story));
  return v_image;
end $$;

create or replace function register_story_image_asset(p_asset uuid, p_image uuid) returns void
language plpgsql security definer set search_path = public as $$
declare a content_assets%rowtype; i story_images%rowtype;
begin
  if not has_permission('story.manage') then raise exception 'forbidden' using errcode = '42501'; end if;
  select * into a from content_assets where id=p_asset;
  select * into i from story_images where id=p_image;
  if not found or a.id is null then raise exception 'asset_or_image_not_found'; end if;
  if i.storage_path <> a.storage_path or i.width <> a.width or i.height <> a.height then raise exception 'asset_image_mismatch'; end if;
  if exists (select 1 from stories where id=i.story_id and status='PUBLISHED') then raise exception 'story_published'; end if;
  insert into content_asset_usages(asset_id,story_image_id) values(a.id,i.id)
  on conflict (story_image_id) do update set asset_id=excluded.asset_id;
end $$;

create or replace function create_ai_story_draft(p_job uuid, p_subject_id uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_job ai_generation_jobs%rowtype; v_result jsonb; v_story uuid; v_category content_categories%rowtype;
  v_scene jsonb; v_question jsonb; v_question_payload jsonb; v_answers jsonb; v_type text;
  v_meta jsonb; v_age_min smallint; v_age_max smallint; v_difficulty smallint;
  v_expected_scenes int; v_expected_questions int; v_question_count int; v_version int;
begin
  if not has_permission('story.manage') then raise exception 'forbidden' using errcode = '42501'; end if;
  select * into v_job from ai_generation_jobs where id=p_job and requested_by=auth.uid() and job_type='STORY' and status='DONE' for update;
  if not found then raise exception 'ai_job_not_found_or_not_ready'; end if;
  if v_job.linked_story_id is not null then return v_job.linked_story_id; end if;
  select result into v_result from ai_generation_results where job_id=p_job order by revision desc limit 1;
  if v_result is null then raise exception 'ai_result_not_found'; end if;
  select * into v_category from content_categories where id=p_subject_id and is_active;
  if not found then raise exception 'category_not_found'; end if;
  v_age_min := (v_job.input->>'age_min')::smallint;
  v_age_max := (v_job.input->>'age_max')::smallint;
  v_difficulty := (v_job.input->>'difficulty')::smallint;
  v_expected_scenes := (v_job.input->>'scenes')::int;
  v_expected_questions := (v_job.input->>'questions_per_scene')::int;
  if v_age_min < 4 or v_age_max > 99 or v_age_min > v_age_max or v_difficulty not between 1 and 5 then raise exception 'invalid_ai_job_metadata'; end if;
  if v_expected_scenes not between 3 and 5 or v_expected_questions not between 4 and 6 then raise exception 'invalid_ai_job_shape'; end if;
  if jsonb_typeof(v_result->'scenes') <> 'array' or jsonb_array_length(v_result->'scenes') <> v_expected_scenes then raise exception 'invalid_ai_result_scenes'; end if;
  if char_length(trim(coalesce(v_result->>'title',''))) not between 1 and 120 then raise exception 'invalid_ai_story_title'; end if;

  insert into stories(title,description,category,subject,difficulty,language,created_by)
  values(trim(v_result->>'title'),nullif(trim(v_result->>'educational_objective'),''),v_category.slug,v_category.name_en,v_difficulty,'ar',auth.uid())
  returning id into v_story;
  v_meta := jsonb_build_object(
    'language','ar','age_min',v_age_min,'age_max',v_age_max,'subject_id',v_category.id,
    'difficulty',v_difficulty,'source_type','AI','source_reference','AI generation job '||p_job::text,
    'license_type','UNKNOWN','editorial_notes',nullif(trim(v_result->>'source_note'),'')
  );
  perform save_story_content_metadata(v_story,v_meta,'{}');

  for v_scene in select value from jsonb_array_elements(v_result->'scenes') loop
    if jsonb_typeof(v_scene->'questions') <> 'array' or jsonb_array_length(v_scene->'questions') <> v_expected_questions then raise exception 'invalid_ai_scene_questions'; end if;
    for v_question in select value from jsonb_array_elements(v_scene->'questions') loop
      v_type := v_question->>'type';
      v_answers := coalesce(v_question->'answers','[]'::jsonb);
      if v_type='TRUE_FALSE' then v_answers := jsonb_build_array(v_question->>'answer'); end if;
      v_question_payload := jsonb_build_object(
        'text',v_question->>'text','type',v_type,'explanation',v_question->>'explanation','hint','',
        'difficulty',v_difficulty,'language','ar','published',false,
        'options',coalesce(v_question->'options','[]'::jsonb),'answers',v_answers
      );
      perform save_question(v_story,null,v_question_payload);
      v_question_count := coalesce(v_question_count,0)+1;
    end loop;
  end loop;

  delete from content_versions where story_id=v_story;
  v_version := 1;
  insert into content_versions(story_id,version_number,created_by,change_reason,snapshot)
  values(v_story,v_version,auth.uid(),'ai_draft_created',content_story_snapshot(v_story));
  update ai_generation_jobs set linked_story_id=v_story where id=p_job and requested_by=auth.uid();
  insert into audit_logs(actor_id,action,target_type,target_id,details)
    values(auth.uid(),'content.ai.draft','story',v_story::text,jsonb_build_object('job_id',p_job,'questions',v_question_count));
  return v_story;
end $$;

-- Serialize AI job reservations on the settings row so concurrent edge calls cannot
-- race past the configured active-job limit. Only the trusted Edge Function may call this.
create or replace function start_ai_generation_job(
  p_requested_by uuid, p_provider text, p_model text, p_input jsonb,
  p_status text, p_error_code text default null, p_error_summary text default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_limit smallint; v_active int; v_user_jobs int; v_job uuid;
begin
  if coalesce(auth.role(),'') <> 'service_role' then raise exception 'service_role_required' using errcode = '42501'; end if;
  if p_status not in ('RUNNING','FAILED') then raise exception 'invalid_initial_job_status'; end if;
  select max_concurrent_ai_jobs into v_limit from content_studio_settings where id=true for update;
  if not found then raise exception 'content_settings_missing'; end if;
  select count(*) into v_user_jobs from ai_generation_jobs
    where requested_by=p_requested_by and created_at > now()-interval '1 hour';
  if v_user_jobs >= 10 then raise exception 'ai_rate_limit_reached'; end if;
  if p_status='RUNNING' then
    select count(*) into v_active from ai_generation_jobs where status in ('QUEUED','RUNNING');
    if v_active >= v_limit then raise exception 'ai_capacity_reached'; end if;
  end if;
  insert into ai_generation_jobs(
    requested_by,job_type,status,provider,model,input,attempts,error_code,error_summary,finished_at
  ) values (
    p_requested_by,'STORY',p_status,left(p_provider,80),left(p_model,160),coalesce(p_input,'{}'::jsonb),
    case when p_status='RUNNING' then 1 else 0 end,
    case when p_status='FAILED' then left(coalesce(p_error_code,'generation_failed'),100) end,
    case when p_status='FAILED' then left(coalesce(p_error_summary,'Generation could not start'),500) end,
    case when p_status='FAILED' then now() end
  ) returning id into v_job;
  return v_job;
end $$;

revoke all on function start_ai_generation_job(uuid,text,text,jsonb,text,text,text) from public, anon, authenticated;
grant execute on function start_ai_generation_job(uuid,text,text,jsonb,text,text,text) to service_role;

-- Any edit to reviewed editorial content makes the prior review stale. This is
-- independent of gameplay publishing; it never changes stories.status.
create or replace function invalidate_story_content_review(p_story uuid, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
declare v_from text; v_snapshot jsonb; v_version int;
begin
  if p_story is null or not has_permission('story.manage') then return; end if;
  select review_status into v_from from story_content_metadata where story_id=p_story for update;
  if v_from is null or v_from not in ('IN_REVIEW','APPROVED') then return; end if;
  perform set_config('app.content_review_transition','on',true);
  update story_content_metadata set review_status='DRAFT',reviewer_id=null,approved_at=null,updated_at=now() where story_id=p_story;
  v_snapshot := content_story_snapshot(p_story);
  insert into content_review_history(story_id,actor_id,from_status,to_status,reason,snapshot)
    values(p_story,auth.uid(),v_from,'DRAFT','content_edited:'||left(coalesce(p_reason,'content'),80),coalesce(v_snapshot,'{}'::jsonb));
  select coalesce(max(version_number),0)+1 into v_version from content_versions where story_id=p_story;
  insert into content_versions(story_id,version_number,created_by,change_reason,snapshot)
    values(p_story,v_version,auth.uid(),'review_invalidated:'||left(coalesce(p_reason,'content'),80),coalesce(v_snapshot,'{}'::jsonb));
  insert into audit_logs(actor_id,action,target_type,target_id,details)
    values(auth.uid(),'content.review.invalidated','story',p_story::text,jsonb_build_object('from',v_from,'to','DRAFT','reason',p_reason));
end $$;

create or replace function content_review_invalidation_trigger() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_row jsonb; v_old jsonb; v_story uuid; v_old_story uuid; v_question uuid;
begin
  if tg_op <> 'INSERT' then v_old := to_jsonb(old); end if;
  if tg_op <> 'DELETE' then v_row := to_jsonb(new); end if;
  if tg_table_name='stories' then
    v_story := coalesce((v_row->>'id')::uuid,(v_old->>'id')::uuid);
    if tg_op='UPDATE' and v_old->>'id' is distinct from v_row->>'id' then v_old_story := (v_old->>'id')::uuid; end if;
  elsif tg_table_name in ('question_options','accepted_answers') then
    v_question := coalesce((v_row->>'question_id')::uuid,(v_old->>'question_id')::uuid);
    select story_id into v_story from questions where id=v_question;
  else
    v_story := coalesce((v_row->>'story_id')::uuid,(v_old->>'story_id')::uuid);
    if tg_op='UPDATE' and v_old->>'story_id' is distinct from v_row->>'story_id' then v_old_story := (v_old->>'story_id')::uuid; end if;
  end if;
  if v_old_story is not null and v_old_story is distinct from v_story then
    perform invalidate_story_content_review(v_old_story,tg_table_name);
  end if;
  perform invalidate_story_content_review(v_story,tg_table_name);
  if tg_op='DELETE' then return old; end if;
  return new;
end $$;

create trigger stories_invalidate_content_review after update of title,description,category,subject,difficulty,language on stories
  for each row when ((old.title,old.description,old.category,old.subject,old.difficulty,old.language) is distinct from (new.title,new.description,new.category,new.subject,new.difficulty,new.language))
  execute function content_review_invalidation_trigger();
create trigger story_images_invalidate_content_review after insert or delete or update of story_id,position,title,description,hint,storage_path,width,height on story_images
  for each row execute function content_review_invalidation_trigger();
create trigger questions_invalidate_content_review after insert or update or delete on questions
  for each row execute function content_review_invalidation_trigger();
create trigger options_invalidate_content_review after insert or update or delete on question_options
  for each row execute function content_review_invalidation_trigger();
create trigger answers_invalidate_content_review after insert or update or delete on accepted_answers
  for each row execute function content_review_invalidation_trigger();
create trigger tags_invalidate_content_review after insert or delete on story_tags
  for each row execute function content_review_invalidation_trigger();
create trigger metadata_invalidate_content_review after update of language,age_min,age_max,subject_id,difficulty,source_type,source_reference,license_type,attribution,editorial_notes on story_content_metadata
  for each row execute function content_review_invalidation_trigger();

revoke all on function content_story_snapshot(uuid) from public, anon;
revoke all on function save_story_content_metadata(uuid, jsonb, text[]) from public, anon;
revoke all on function set_story_review_status(uuid, text, text) from public, anon;
revoke all on function attach_content_asset(uuid, uuid, text) from public, anon;
revoke all on function register_story_image_asset(uuid, uuid) from public, anon;
revoke all on function create_ai_story_draft(uuid, uuid) from public, anon;
revoke all on function invalidate_story_content_review(uuid,text) from public, anon;
revoke all on function content_review_invalidation_trigger() from public, anon;
grant execute on function content_story_snapshot(uuid) to authenticated;
grant execute on function save_story_content_metadata(uuid, jsonb, text[]) to authenticated;
grant execute on function set_story_review_status(uuid, text, text) to authenticated;
grant execute on function attach_content_asset(uuid, uuid, text) to authenticated;
grant execute on function register_story_image_asset(uuid, uuid) to authenticated;
grant execute on function create_ai_story_draft(uuid, uuid) to authenticated;

-- Arabic is the default for newly created content; existing records are unchanged.
alter table stories alter column language set default 'ar';

-- Each item is imported transactionally. Images must already be registered private assets;
-- pieces and question mappings are intentionally generated/approved through the existing workflow.
create or replace function import_content_story(
  p_batch uuid, p_story jsonb, p_images jsonb, p_questions jsonb, p_tags text[] default '{}'
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := auth.uid(); v_story_id uuid; v_item content_import_items%rowtype; v_key text; v_hash text;
  v_meta jsonb; v_image jsonb; v_question jsonb; v_asset content_assets%rowtype;
  v_image_id uuid; v_question_id uuid; v_pos int; v_language text; v_source text;
begin
  if not has_permission('story.manage') then raise exception 'forbidden' using errcode = '42501'; end if;
  if not exists (select 1 from content_import_batches where id=p_batch and uploaded_by=v_user and not dry_run and status in ('READY','IMPORTING','PARTIAL','FAILED')) then
    raise exception 'import_batch_not_ready';
  end if;
  v_key := nullif(trim(p_story->>'story_key'),'');
  v_hash := lower(coalesce(p_story->>'payload_hash',''));
  if v_key is null or v_hash !~ '^[0-9a-f]{64}$' then raise exception 'invalid_story_key_or_hash'; end if;
  if char_length(trim(coalesce(p_story->>'title',''))) not between 1 and 120 then raise exception 'invalid_story_title'; end if;
  if jsonb_typeof(coalesce(p_images,'[]'::jsonb)) <> 'array' then raise exception 'invalid_story_images'; end if;
  if jsonb_array_length(coalesce(p_images,'[]'::jsonb)) not between 1 and 20 then raise exception 'invalid_story_images'; end if;
  if jsonb_typeof(coalesce(p_questions,'[]'::jsonb)) <> 'array' then raise exception 'invalid_story_questions'; end if;
  if jsonb_array_length(coalesce(p_questions,'[]'::jsonb)) > 600 then raise exception 'invalid_story_questions'; end if;

  insert into content_import_items(batch_id,story_key,payload_hash,status)
  values(p_batch,v_key,v_hash,'IMPORTING')
  on conflict (batch_id,story_key) do nothing;
  select * into v_item from content_import_items where batch_id=p_batch and story_key=v_key for update;
  if v_item.payload_hash <> v_hash then raise exception 'import_key_payload_conflict'; end if;
  if v_item.status='IMPORTED' and v_item.story_id is not null then return v_item.story_id; end if;
  if v_item.status='IMPORTED' then
    update content_import_items set status='VALIDATED',error_summary=null where id=v_item.id;
  end if;

  -- A stable story_key is also unique across prior imports. Never create a second story for it.
  select story_id into v_story_id from story_content_metadata where external_key=v_key;
  if v_story_id is not null then
    if (select import_payload_hash from story_content_metadata where story_id=v_story_id) is distinct from v_hash then
      raise exception 'import_story_key_payload_conflict';
    end if;
    update content_import_items set status='IMPORTED',story_id=v_story_id,error_summary=null where id=v_item.id;
    perform set_config('app.content_import_count','on',true);
    update content_import_batches set imported_rows=imported_rows+1 where id=p_batch;
    return v_story_id;
  end if;

  v_language := coalesce(p_story->>'language','ar');
  if v_language not in ('ar','en') then raise exception 'invalid_language'; end if;
  if nullif(p_story->>'age_min','') is not null and nullif(p_story->>'age_max','') is not null
     and (p_story->>'age_min')::smallint > (p_story->>'age_max')::smallint then raise exception 'invalid_age_range'; end if;
  v_source := coalesce(p_story->>'source_type','IMPORT');
  if v_source not in ('MANUAL','AI','IMPORT') then raise exception 'invalid_source_type'; end if;

  insert into stories(title,description,category,subject,difficulty,language,created_by)
  values(trim(p_story->>'title'),nullif(trim(p_story->>'description'),''),nullif(trim(p_story->>'subject'),''),
         nullif(trim(p_story->>'subject'),''),least(5,greatest(1,coalesce((p_story->>'difficulty')::smallint,1))),v_language,v_user)
  returning id into v_story_id;

  v_meta := jsonb_build_object(
    'language',v_language,'age_min',p_story->>'age_min','age_max',p_story->>'age_max','subject_id',p_story->>'subject_id',
    'difficulty',coalesce(p_story->>'difficulty','1'),'source_type',v_source,
    'source_reference',p_story->>'source_reference','license_type',coalesce(p_story->>'license_type','UNKNOWN'),
    'attribution',p_story->>'attribution','editorial_notes',p_story->>'notes'
  );
  perform save_story_content_metadata(v_story_id,v_meta,coalesce(p_tags,'{}'));
  update story_content_metadata set external_key=v_key,import_payload_hash=v_hash where story_id=v_story_id;

  v_pos := 0;
  for v_image in select value from jsonb_array_elements(p_images) loop
    v_pos := v_pos + 1;
    select * into v_asset from content_assets where id=(v_image->>'asset_id')::uuid;
    if not found then raise exception 'import_asset_not_found:%',coalesce(v_image->>'image_key',''); end if;
    insert into story_images(story_id,position,title,description,storage_path,width,height,piece_count,puzzle_seed)
    values(v_story_id,v_pos,
      coalesce(nullif(trim(v_image->>'title'),''),left(v_asset.original_filename,80)),
      nullif(trim(v_image->>'description'),''),v_asset.storage_path,v_asset.width,v_asset.height,
      coalesce((select min_piece_count from platform_settings limit 1),4),floor(random()*1000000)::bigint)
    returning id into v_image_id;
    insert into content_asset_usages(asset_id,story_image_id) values(v_asset.id,v_image_id);
  end loop;

  for v_question in select value from jsonb_array_elements(p_questions) loop
    if nullif(trim(v_question->>'text'),'') is null then raise exception 'invalid_import_question'; end if;
    if coalesce(v_question->>'type','') not in ('MULTIPLE_CHOICE','MCQ','TRUE_FALSE','SHORT_TEXT') then raise exception 'unsupported_import_question_type'; end if;
    v_question_id := save_question(v_story_id,null,jsonb_build_object(
      'text',v_question->>'text',
      'type',case when v_question->>'type'='MCQ' then 'MULTIPLE_CHOICE' else v_question->>'type' end,
      'explanation',v_question->>'explanation','hint',v_question->>'hint',
      'difficulty',coalesce(v_question->>'difficulty','1'),'language',v_language,'published',false,
      'options',coalesce(v_question->'options','[]'::jsonb),
      'answers',coalesce(v_question->'answers','[]'::jsonb)
    ));
  end loop;

  update content_import_items set status='IMPORTED',story_id=v_story_id,error_summary=null where id=v_item.id;
  perform set_config('app.content_import_count','on',true);
  update content_import_batches set imported_rows=imported_rows+1 where id=p_batch;
  insert into audit_logs(actor_id,action,target_type,target_id,details)
    values(v_user,'content.import.story','story',v_story_id::text,jsonb_build_object('batch_id',p_batch,'story_key',v_key));
  return v_story_id;
exception when others then
  raise;
end $$;
revoke all on function import_content_story(uuid,jsonb,jsonb,jsonb,text[]) from public,anon;
grant execute on function import_content_story(uuid,jsonb,jsonb,jsonb,text[]) to authenticated;
