-- 0020: Defence in depth – client roles never need TRUNCATE/TRIGGER/REFERENCES on Bakasa tables.
revoke truncate, trigger, references on bakasa_categories, bakasa_words, bakasa_rooms, bakasa_players,
  bakasa_rounds, bakasa_roles, bakasa_votes, bakasa_messages from anon, authenticated;
