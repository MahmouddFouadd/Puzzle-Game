-- Voice chat topic authorisation (migration 0028). Uses a minimal stand-in for Supabase's realtime schema
-- so the RLS policies on realtime.messages can be exercised locally.
do $$ begin
  if to_regclass('realtime.messages') is null then
    create schema if not exists realtime;
    create table realtime.messages (id bigserial primary key, topic text not null, extension text not null, payload jsonb);
    create function realtime.topic() returns text language sql stable as $f$ select nullif(current_setting('realtime.topic', true), '') $f$;
    alter table realtime.messages enable row level security;
    grant usage on schema realtime to authenticated;
    grant select, insert on realtime.messages to authenticated;
    grant usage on sequence realtime.messages_id_seq to authenticated;
  end if;
end $$;
\ir ../migrations/0028_voice_chat_realtime.sql

insert into auth.users(id, email) values ('00000000-0000-0000-0000-00000000aa01','v1@x'), ('00000000-0000-0000-0000-00000000aa02','v2@x'), ('00000000-0000-0000-0000-00000000aa03','v3@x') on conflict do nothing;
do $$
declare v_b uuid := gen_random_uuid(); v_ok boolean;
begin
  insert into bakasa_rooms(id, code, name, host_id, settings) values (v_b, 'BK-VOICE1', 'voice test', '00000000-0000-0000-0000-00000000aa01', '{}');
  insert into bakasa_players(room_id, user_id, nickname, seat, status) values
    (v_b, '00000000-0000-0000-0000-00000000aa01', 'A', 1, 'ACTIVE'), (v_b, '00000000-0000-0000-0000-00000000aa02', 'B', 2, 'KICKED');
  perform set_config('t.bakasa', v_b::text, false);

  perform set_config('app.uid', '00000000-0000-0000-0000-00000000aa01', false);
  if not voice_topic_allowed('voice:bakasa:' || v_b) then raise exception 'FAIL active member denied'; end if;
  if voice_topic_allowed('voice:room:' || v_b) then raise exception 'FAIL wrong kind allowed'; end if;
  if voice_topic_allowed('voice:bakasa:' || v_b || 'x') or voice_topic_allowed('bakasa-' || v_b) or voice_topic_allowed(null) then raise exception 'FAIL malformed topic allowed'; end if;
  perform set_config('app.uid', '00000000-0000-0000-0000-00000000aa02', false);
  if voice_topic_allowed('voice:bakasa:' || v_b) then raise exception 'FAIL kicked player allowed'; end if;
  perform set_config('app.uid', '00000000-0000-0000-0000-00000000aa03', false);
  if voice_topic_allowed('voice:bakasa:' || v_b) then raise exception 'FAIL stranger allowed'; end if;
  perform set_config('app.uid', '', false);
  if voice_topic_allowed('voice:bakasa:' || v_b) then raise exception 'FAIL anonymous allowed'; end if;
  raise notice 'PASS voice_topic_allowed';
end $$;

-- RLS on realtime.messages, as the authenticated role
set role authenticated;
select set_config('realtime.topic', 'voice:bakasa:' || current_setting('t.bakasa'), false);
select set_config('app.uid', '00000000-0000-0000-0000-00000000aa01', false);
insert into realtime.messages(topic, extension, payload) values (realtime.topic(), 'broadcast', '{}');
do $$ begin
  if (select count(*) from realtime.messages) <> 1 then raise exception 'FAIL member cannot read own channel'; end if;
end $$;
select set_config('app.uid', '00000000-0000-0000-0000-00000000aa03', false);
do $$ begin
  if (select count(*) from realtime.messages) <> 0 then raise exception 'FAIL stranger can read the channel'; end if;
  begin
    insert into realtime.messages(topic, extension, payload) values (realtime.topic(), 'broadcast', '{}');
    raise exception 'FAIL stranger could send';
  exception when insufficient_privilege then null;
  end;
  raise notice 'PASS realtime.messages policies';
end $$;
reset role;
