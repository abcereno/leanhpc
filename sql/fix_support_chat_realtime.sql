-- sql/fix_support_chat_realtime.sql
--
-- sql/add_support_chat.sql already tries to add support_messages to the
-- supabase_realtime publication (an IF NOT EXISTS check against
-- pg_publication_tables), but that's clearly not taking effect — messages
-- aren't pushing live, only appearing after a manual reload. Rather than
-- debug why that check didn't fire, this is a standalone, safe-to-run-
-- anytime version: catches the "already a member" error instead of
-- checking for it first, so it can't silently no-op the way the original
-- might have.
--
-- Run this by itself in the Supabase SQL editor.

do $$
begin
  alter publication supabase_realtime add table public.support_messages;
  raise notice 'support_messages added to supabase_realtime publication.';
exception
  when duplicate_object then
    raise notice 'support_messages was already in the supabase_realtime publication — nothing to do.';
end $$;

-- --------------------------------------------------------------------------
-- Verify — should return exactly one row. If this returns 0 rows after
-- running the block above, the project's publication isn't named
-- "supabase_realtime" (unusual — check Database > Replication in the
-- Supabase dashboard for the actual publication name and adjust the
-- statement above).
-- --------------------------------------------------------------------------
select schemaname, tablename
from pg_publication_tables
where pubname = 'supabase_realtime'
  and schemaname = 'public'
  and tablename = 'support_messages';
