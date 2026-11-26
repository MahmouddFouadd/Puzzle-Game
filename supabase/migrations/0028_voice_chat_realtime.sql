-- Online voice chat: authorisation for the private Realtime channels that carry WebRTC signaling.
-- Topic format: voice:<kind>:<uuid>, kind in (room, bakasa, detective). Only SDP/ICE and small state
-- messages travel through Realtime; audio is peer to peer and is never stored.
-- Only members of the room/party may send or receive on its voice topic (broadcast + presence).

create or replace function public.voice_topic_allowed(p_topic text) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare v_kind text; v_id uuid; m text[];
begin
  if auth.uid() is null or p_topic is null then return false; end if;
  m := regexp_match(p_topic, '^voice:(room|bakasa|detective):([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$');
  if m is null then return false; end if;
  v_kind := m[1]; v_id := m[2]::uuid;
  if v_kind = 'room' then
    return is_room_member(v_id);
  elsif v_kind = 'bakasa' then
    return exists (select 1 from bakasa_players where room_id = v_id and user_id = auth.uid() and status = 'ACTIVE');
  elsif v_kind = 'detective' then
    return exists (select 1 from detective_party_members where party_id = v_id and user_id = auth.uid() and status = 'ACTIVE');
  end if;
  return false;
end $$;

revoke all on function public.voice_topic_allowed(text) from public, anon;
grant execute on function public.voice_topic_allowed(text) to authenticated;

-- realtime.messages exists on Supabase only (not in the local SQL test stub), so the policies are guarded.
do $$
begin
  if to_regclass('realtime.messages') is null then
    raise notice 'realtime.messages not present: voice chat policies skipped';
    return;
  end if;
  execute 'drop policy if exists voice_members_receive on realtime.messages';
  execute 'drop policy if exists voice_members_send on realtime.messages';
  execute $p$create policy voice_members_receive on realtime.messages for select to authenticated
    using (realtime.messages.extension in ('broadcast', 'presence') and realtime.topic() like 'voice:%' and public.voice_topic_allowed(realtime.topic()))$p$;
  execute $p$create policy voice_members_send on realtime.messages for insert to authenticated
    with check (realtime.messages.extension in ('broadcast', 'presence') and realtime.topic() like 'voice:%' and public.voice_topic_allowed(realtime.topic()))$p$;
end $$;
