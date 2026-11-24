-- 0003_story_storage.sql
-- Private buckets + trusted functions for saving generated pieces and reordering images.
-- Players never get direct access to either bucket; Phase 4 serves revealed pieces via signed URLs from a server function.

insert into storage.buckets (id, name, public)
values ('story-originals', 'story-originals', false), ('story-pieces', 'story-pieces', false)
on conflict (id) do nothing;

create policy story_files_staff on storage.objects for all to authenticated
  using (bucket_id in ('story-originals', 'story-pieces') and has_permission('story.manage'))
  with check (bucket_id in ('story-originals', 'story-pieces') and has_permission('story.manage'));

-- Replace all pieces of an image atomically. Refuses on published stories, and refuses to drop existing
-- question mappings unless p_force is true (the caller must confirm with the admin first).
create or replace function save_image_pieces(p_image uuid, p_seed bigint, p_pieces jsonb, p_force boolean default false)
returns int language plpgsql security definer set search_path = public as $$
declare v_story uuid; v_status story_status; v_count int; v_maps int;
begin
  if not has_permission('story.manage') then raise exception 'forbidden' using errcode = '42501'; end if;
  select s.id, s.status into v_story, v_status from story_images i join stories s on s.id = i.story_id where i.id = p_image;
  if v_story is null then raise exception 'image_not_found'; end if;
  if v_status = 'PUBLISHED' then raise exception 'story_published'; end if;
  v_count := jsonb_array_length(p_pieces);
  if v_count < 4 or v_count > 100 then raise exception 'invalid_piece_count'; end if;

  select count(*) into v_maps from question_piece_mappings m join puzzle_pieces p on p.id = m.piece_id where p.image_id = p_image;
  if v_maps > 0 and not p_force then raise exception 'mappings_exist:%', v_maps; end if;

  delete from puzzle_pieces where image_id = p_image;
  insert into puzzle_pieces (image_id, row_idx, col_idx, x, y, w, h, svg_path, mask_path)
  select p_image, (e->>'row')::smallint, (e->>'col')::smallint, (e->>'x')::int, (e->>'y')::int,
         (e->>'w')::int, (e->>'h')::int, e->>'path', e->>'mask'
  from jsonb_array_elements(p_pieces) e;

  update story_images set piece_count = v_count, puzzle_seed = p_seed where id = p_image;
  insert into audit_logs (actor_id, action, target_type, target_id, details)
  values (auth.uid(), 'puzzle.generate', 'story_image', p_image::text,
          jsonb_build_object('pieces', v_count, 'seed', p_seed, 'dropped_mappings', v_maps));
  return v_count;
end $$;
revoke all on function save_image_pieces(uuid, bigint, jsonb, boolean) from public, anon;
grant execute on function save_image_pieces(uuid, bigint, jsonb, boolean) to authenticated;

-- Reorder: p_ids must be exactly the story's image ids in the new order.
create or replace function reorder_story_images(p_story uuid, p_ids uuid[]) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not has_permission('story.manage') then raise exception 'forbidden' using errcode = '42501'; end if;
  if (select count(*) from story_images where story_id = p_story) <> coalesce(array_length(p_ids, 1), 0)
     or exists (select 1 from unnest(p_ids) u where not exists (select 1 from story_images where id = u and story_id = p_story)) then
    raise exception 'ids_mismatch';
  end if;
  update story_images set position = position + 1000 where story_id = p_story;
  update story_images i set position = x.ord from unnest(p_ids) with ordinality as x(id, ord) where i.id = x.id;
end $$;
revoke all on function reorder_story_images(uuid, uuid[]) from public, anon;
grant execute on function reorder_story_images(uuid, uuid[]) to authenticated;
