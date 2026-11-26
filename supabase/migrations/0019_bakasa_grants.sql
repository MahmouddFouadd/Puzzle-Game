-- 0019: Table privileges for Bakasa. RLS policies still decide which rows are visible/writable.
-- Without SELECT, realtime cannot deliver row changes and the public category list cannot load.
grant select on bakasa_categories to anon, authenticated;
grant insert, update on bakasa_categories to authenticated;          -- RLS: story.manage only
grant select, insert, update on bakasa_words to authenticated;       -- RLS: story.manage only (no player policy)
grant select on bakasa_rooms, bakasa_players, bakasa_messages to authenticated;  -- RLS: members only
-- bakasa_rounds, bakasa_roles, bakasa_votes stay without any grants.
