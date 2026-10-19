-- =============================================================================
-- RLS VERIFICATION CHECKLIST — run in the Supabase SQL Editor after migrating.
-- Goal: every public table has RLS enabled + owner-only policies, and
-- cross-user access is denied.
-- =============================================================================

-- 1. Any public table WITHOUT RLS? (must return ZERO rows)
select schemaname, tablename
from pg_tables
where schemaname = 'public'
  and rowsecurity = false;

-- 2. Every table's policies at a glance (eyeball: each has owner-only
--    using/with-check on auth.uid()).
select tablename, policyname, cmd, qual, with_check
from pg_policies
where schemaname = 'public'
order by tablename, cmd;

-- 3. Storage policies for the documents bucket:
select policyname, cmd, qual, with_check
from pg_policies
where schemaname = 'storage' and tablename = 'objects';

-- =============================================================================
-- 4. CROSS-USER DENIAL TEST (manual, two browsers):
--    a. Sign up as user A; create a conversation; note its id:
--       select id from conversations limit 1;
--    b. Sign up as user B (different browser/incognito).
--    c. As B, in the app's browser console:
--       const { data } = await window.__nothing; // use the app: open
--       /chat/<A's-conversation-id> → must show 404, and any direct
--       supabase-js select on that id must return an empty array.
--    d. Repeat the idea for documents, mood_logs, journal_entries,
--       user_api_keys — B must never see A's rows.
--
-- 5. GUEST DENIAL TEST:
--    As a guest session, these must all fail/deny:
--      insert into documents …        (policy: not is_guest_session())
--      insert into mood_logs …        (policy: not is_guest_session())
--      insert into journal_entries …  (policy: not is_guest_session())
--      insert into user_api_keys …    (policy: not is_guest_session())
--      storage upload to documents/…  (policy: not is_guest_session())
--    And the API layer independently returns 403 for guests on
--    /api/documents/*, /api/wellness/*, /api/code/*, /api/models/keys.
-- =============================================================================
