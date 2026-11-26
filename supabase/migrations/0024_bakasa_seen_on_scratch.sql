-- 0024: A role counts as seen only when the player actually reveals (scratches) the card, not when it loads.

create or replace function bakasa_my_role(p_room uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare r bakasa_rooms%rowtype; ro bakasa_roles%rowtype; rd bakasa_rounds%rowtype; w bakasa_words%rowtype; c bakasa_categories%rowtype;
begin
  select * into r from bakasa_rooms where id = p_room;
  if r.current_round is null then return jsonb_build_object('in_round', false); end if;
  select * into ro from bakasa_roles where round_id = r.current_round and user_id = auth.uid();
  if not found then return jsonb_build_object('in_round', false); end if;
  select * into rd from bakasa_rounds where id = r.current_round;
  select * into c from bakasa_categories where id = rd.category_id;
  if ro.is_spy then
    return jsonb_build_object('in_round', true, 'is_spy', true, 'category_ar', c.name_ar, 'category_en', c.name_en, 'emoji', c.emoji, 'color', c.color);
  end if;
  select * into w from bakasa_words where id = rd.word_id;
  return jsonb_build_object('in_round', true, 'is_spy', false, 'word_ar', w.word_ar, 'word_en', w.word_en,
    'category_ar', c.name_ar, 'category_en', c.name_en, 'emoji', c.emoji, 'color', c.color);
end $$;


create or replace function bakasa_mark_seen(p_room uuid) returns void
language plpgsql security definer set search_path = public as $$
declare r bakasa_rooms%rowtype;
begin
  select * into r from bakasa_rooms where id = p_room;
  if r.current_round is null then return; end if;
  update bakasa_roles set seen = true where round_id = r.current_round and user_id = auth.uid() and not seen;
  if found then perform bakasa_touch(p_room); end if;
end $$;
revoke all on function bakasa_mark_seen(uuid) from public, anon;
grant execute on function bakasa_mark_seen(uuid) to authenticated;
