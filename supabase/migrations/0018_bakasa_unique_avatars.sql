-- 0018: Give each joining player a distinct avatar when the one they picked is already taken in the room.
create or replace function bakasa_free_avatar(p_room uuid, p_wanted text, p_user uuid) returns text
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select bakasa_clean_avatar(p_wanted) where not exists (select 1 from bakasa_players where room_id = p_room and status = 'ACTIVE'
       and user_id <> p_user and avatar = bakasa_clean_avatar(p_wanted))),
    (select a from unnest(array['fox','cat','owl','lion','panda','frog','bear','tiger','koala','monkey','penguin','unicorn']) a
      where not exists (select 1 from bakasa_players where room_id = p_room and status = 'ACTIVE' and user_id <> p_user and avatar = a)
      order by random() limit 1),
    bakasa_clean_avatar(p_wanted));
$$;

create or replace function bakasa_join_room(p_code text, p_nickname text, p_avatar text default 'fox')
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_user uuid := auth.uid(); r bakasa_rooms%rowtype; p bakasa_players%rowtype; v_active int;
begin
  if v_user is null then raise exception 'unauthorized'; end if;
  if char_length(trim(coalesce(p_nickname,''))) not between 1 and 30 then raise exception 'invalid_nickname'; end if;
  select * into r from bakasa_rooms where code = upper(trim(p_code)) for update;
  if not found or r.status = 'CLOSED' then return jsonb_build_object('status','not_found'); end if;
  select * into p from bakasa_players where room_id = r.id and user_id = v_user;
  if found then
    if p.status = 'KICKED' then return jsonb_build_object('status','kicked'); end if;
    update bakasa_players set status = 'ACTIVE', nickname = trim(p_nickname), avatar = bakasa_free_avatar(r.id, p_avatar, v_user), last_seen = now()
      where room_id = r.id and user_id = v_user;
    perform bakasa_touch(r.id);
    return jsonb_build_object('status','joined','room_id', r.id);
  end if;
  if r.status = 'FINISHED' then return jsonb_build_object('status','finished'); end if;
  select count(*) into v_active from bakasa_players where room_id = r.id and status = 'ACTIVE';
  if v_active >= (r.settings->>'max_players')::int then return jsonb_build_object('status','full'); end if;
  insert into bakasa_players(room_id, user_id, nickname, avatar, seat)
  values (r.id, v_user, trim(p_nickname), bakasa_free_avatar(r.id, p_avatar, v_user), coalesce((select max(seat) from bakasa_players where room_id = r.id), 0) + 1);
  perform bakasa_touch(r.id, 'join:' || trim(p_nickname));
  return jsonb_build_object('status','joined','room_id', r.id);
end $$;
