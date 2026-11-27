-- 0031: TRUNCATE bypasses row-level security, so clients must never hold it on Detective tables.
-- Mirrors the production hotfix "detective_revoke_truncate" (2026-11-27) and extends it to the tables added by 0021/0029.
do $$
declare t text;
begin
  for t in select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
           where n.nspname = 'public' and c.relkind = 'r' and c.relname like 'detective\_%' loop
    execute format('revoke truncate on table public.%I from anon, authenticated', t);
  end loop;
end $$;
