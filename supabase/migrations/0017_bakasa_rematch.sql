-- 0017: Bakasa rematch on the same room. Each match keeps its own rounds for history.
alter table bakasa_rooms add column if not exists match_no int not null default 1;
alter table bakasa_rounds add column if not exists match_no int not null default 1;
alter table bakasa_rounds drop constraint if exists bakasa_rounds_room_id_round_no_key;
create unique index if not exists bakasa_rounds_match_round_key on bakasa_rounds(room_id, match_no, round_no);

create or replace function bakasa_rematch(p_room uuid) returns void
language plpgsql security definer set search_path = public as $$
declare r bakasa_rooms%rowtype;
begin
  r := bakasa_require_host(p_room);
  if r.status not in ('FINISHED','RESULT') then raise exception 'round_in_progress'; end if;
  update bakasa_rooms set status = 'LOBBY', match_no = match_no + 1, round_no = 0, current_round = null,
    phase_ends_at = null, turn_ends_at = null, turn_idx = 0 where id = p_room;
  update bakasa_players set score = 0, is_ready = false where room_id = p_room;
  perform bakasa_touch(p_room, 'rematch');
end $$;

-- start_round: record the match number on the round.
create or replace function bakasa_stamp_match() returns trigger language plpgsql as $$
begin
  new.match_no := (select match_no from bakasa_rooms where id = new.room_id);
  return new;
end $$;
drop trigger if exists bakasa_rounds_stamp_match on bakasa_rounds;
create trigger bakasa_rounds_stamp_match before insert on bakasa_rounds for each row execute function bakasa_stamp_match();
