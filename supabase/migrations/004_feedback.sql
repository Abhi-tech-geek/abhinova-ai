-- =============================================================================
-- 004 — In-app feedback
--
-- Write path: ONLY the server, via submit_feedback() with the service role.
-- Clients (anon / authenticated) have no table privileges at all, so nobody
-- can skip the API's validation, rate limit and secret redaction by talking to
-- PostgREST directly, or fake `is_guest`. The owner reads feedback in the
-- Supabase dashboard (Table Editor → feedback). Safe to re-run.
-- =============================================================================

create table if not exists public.feedback (
  id uuid primary key default gen_random_uuid(),
  -- Kept when a guest account is purged (set null), so feedback isn't lost.
  user_id uuid references auth.users (id) on delete set null,
  is_guest boolean not null default false,
  category text not null check (category in ('bug', 'idea', 'praise', 'other')),
  message text not null check (char_length(message) between 1 and 2000),
  page text check (char_length(page) <= 200),
  user_agent text check (char_length(user_agent) <= 300),
  created_at timestamptz not null default now()
);

create index if not exists feedback_created_at_idx on public.feedback (created_at desc);
create index if not exists feedback_user_day_idx on public.feedback (user_id, created_at desc);

-- RLS on with NO policies + privileges revoked → clients can't read or write.
alter table public.feedback enable row level security;
drop policy if exists "feedback_insert_own" on public.feedback;
revoke all on public.feedback from anon, authenticated;

-- Server-only insert with an atomic per-user cap (10 per rolling 24 hours).
-- Runs as the function owner, so the count sees every row (a count under the
-- caller's RLS would always be 0 here). The advisory lock serialises
-- concurrent submissions from the same user so the cap can't be raced.
-- Returns 'ok' or 'limit_reached'.
create or replace function public.submit_feedback(
  p_user_id uuid,
  p_is_guest boolean,
  p_category text,
  p_message text,
  p_page text,
  p_user_agent text
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  recent integer;
begin
  if p_user_id is null then
    raise exception 'user required';
  end if;

  perform pg_advisory_xact_lock(hashtext('feedback:' || p_user_id::text));

  select count(*) into recent
  from public.feedback
  where user_id = p_user_id and created_at > now() - interval '24 hours';

  if recent >= 10 then
    return 'limit_reached';
  end if;

  insert into public.feedback (user_id, is_guest, category, message, page, user_agent)
  values (p_user_id, coalesce(p_is_guest, false), p_category, p_message, p_page, p_user_agent);
  return 'ok';
end;
$$;

revoke all on function public.submit_feedback(uuid, boolean, text, text, text, text) from public, anon, authenticated;
grant execute on function public.submit_feedback(uuid, boolean, text, text, text, text) to service_role;

-- Read feedback in the SQL editor (newest first):
--   select created_at, category, message, page, is_guest
--   from public.feedback order by created_at desc;
