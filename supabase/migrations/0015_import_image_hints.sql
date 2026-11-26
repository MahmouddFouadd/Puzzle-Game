-- 0015: Content import keeps per-image hints.
-- Root cause: import_content_story inserted story_images without the hint column, so every story
-- imported from an Excel/ZIP package (and the seed stories imported on 2026-11-26) had empty image hints.
-- This only replaces the function body; existing rows are not modified.

CREATE OR REPLACE FUNCTION public.import_content_story(p_batch uuid, p_story jsonb, p_images jsonb, p_questions jsonb, p_tags text[] DEFAULT '{}'::text[])
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
    insert into story_images(story_id,position,title,description,hint,storage_path,width,height,piece_count,puzzle_seed)
    values(v_story_id,v_pos,
      coalesce(nullif(trim(v_image->>'title'),''),left(v_asset.original_filename,80)),
      nullif(trim(v_image->>'description'),''),nullif(left(trim(coalesce(v_image->>'hint','')),300),''),v_asset.storage_path,v_asset.width,v_asset.height,
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
end $function$;
