-- =============================================================================
-- 004 — In-app feedback
--
-- Anyone signed in (guests included) can send feedback; nobody can read,
-- edit or delete it from the app — the owner reads it in the Supabase
-- dashboard (Table Editor → feedback). Because users can't delete rows, the
-- per-day cap in the insert policy can't be reset. Safe to re-run.
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

alter table public.feedback enable row level security;

-- Insert only: your own row, at most 10 per rolling 24 hours.
drop policy if exists "feedback_insert_own" on public.feedback;
create policy "feedback_insert_own" on public.feedback
  for insert with check (
    auth.uid() = user_id
    and (
      select count(*) from public.feedback f
      where f.user_id = auth.uid() and f.created_at > now() - interval '24 hours'
    ) < 10
  );
-- No select / update / delete policies on purpose.

-- Read feedback in the SQL editor (newest first):
--   select created_at, category, message, page, is_guest
--   from public.feedback order by created_at desc;
