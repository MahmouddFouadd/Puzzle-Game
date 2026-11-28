-- 0032_player_identity_fixes.sql
-- Re-state the guest identity contract after the later feature migrations.
create or replace function set_player_display_name(p_name text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  if char_length(trim(coalesce(p_name, ''))) not between 1 and 60 then raise exception 'invalid_name'; end if;
  update profiles set display_name = trim(p_name) where id = auth.uid();
  if not found then raise exception 'profile_not_found'; end if;
end $$;
revoke all on function set_player_display_name(text) from public, anon;
grant execute on function set_player_display_name(text) to authenticated;

create or replace function join_room(p_code text, p_pin text, p_name text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare r rooms%rowtype; m room_members%rowtype; v_fail int; v_hash text; v_name text := trim(coalesce(p_name, ''));
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  if char_length(v_name) not between 1 and 40 then raise exception 'invalid_name'; end if;
  update profiles set display_name = left(v_name, 60) where id = auth.uid();
  select * into r from rooms where code = upper(trim(p_code));
  if not found then return jsonb_build_object('status', 'not_found'); end if;
  select * into m from room_members where room_id = r.id and user_id = auth.uid();
  if found then
    update room_members set display_name = v_name where id = m.id;
    return jsonb_build_object('status', case m.status when 'ACTIVE' then 'joined' when 'PENDING' then 'pending' else 'rejected' end, 'room_id', r.id);
  end if;
  if r.status not in ('WAITING', 'READY') then return jsonb_build_object('status', 'closed'); end if;
  if r.has_pin then
    select count(*) into v_fail from security_events where user_id = auth.uid() and room_id = r.id and kind = 'pin_fail' and created_at > now() - interval '10 minutes';
    if v_fail >= 5 then return jsonb_build_object('status', 'too_many_attempts'); end if;
    select pin_hash into v_hash from room_secrets where room_id = r.id;
    if p_pin is null or encode(sha256(convert_to(p_pin || r.id::text, 'utf8')), 'hex') <> v_hash then
      insert into security_events (user_id, room_id, kind) values (auth.uid(), r.id, 'pin_fail');
      return jsonb_build_object('status', 'bad_pin');
    end if;
  end if;
  insert into room_members (room_id, user_id, display_name, status) values (r.id, auth.uid(), v_name, case when r.admin_controlled_joining then 'PENDING' else 'ACTIVE' end);
  perform room_event(r.id, null, 'player_joined', jsonb_build_object('name', v_name));
  return jsonb_build_object('status', case when r.admin_controlled_joining then 'pending' else 'joined' end, 'room_id', r.id);
end $$;
revoke all on function join_room(text, text, text) from public, anon;
grant execute on function join_room(text, text, text) to authenticated;
