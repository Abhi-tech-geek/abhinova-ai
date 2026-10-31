-- =============================================================================
-- 007 — 👍/👎 on replies, AI memory, saved prompts
--
-- message_feedback : one rating per assistant reply (+1 / -1), owner only.
-- user_memories    : short facts the user asked AbhiNova to remember; only
--                    used when profiles.memory_enabled is on. Max 30 per user.
-- saved_prompts    : reusable prompts for the "/" menu. Max 50 per user.
-- Every table: RLS, owner-only. Safe to re-run.
-- =============================================================================

-- 👍 / 👎 ---------------------------------------------------------------------
create table if not exists public.message_feedback (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null unique references public.messages (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  rating smallint not null check (rating in (-1, 1)),
  created_at timestamptz not null default now()
);
create index if not exists message_feedback_user_id_idx on public.message_feedback (user_id);
alter table public.message_feedback enable row level security;

drop policy if exists "message_feedback_select_own" on public.message_feedback;
create policy "message_feedback_select_own" on public.message_feedback
  for select using (auth.uid() = user_id);
-- Only on an assistant reply the caller owns.
drop policy if exists "message_feedback_insert_own" on public.message_feedback;
create policy "message_feedback_insert_own" on public.message_feedback
  for insert with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.messages m
      where m.id = message_id and m.user_id = auth.uid() and m.role = 'assistant'
    )
  );
drop policy if exists "message_feedback_update_own" on public.message_feedback;
create policy "message_feedback_update_own" on public.message_feedback
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "message_feedback_delete_own" on public.message_feedback;
create policy "message_feedback_delete_own" on public.message_feedback
  for delete using (auth.uid() = user_id);

-- Memory ----------------------------------------------------------------------
alter table public.profiles
  add column if not exists memory_enabled boolean not null default false;

create table if not exists public.user_memories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  content text not null check (char_length(content) between 1 and 300),
  created_at timestamptz not null default now()
);
create index if not exists user_memories_user_id_idx on public.user_memories (user_id, created_at);
alter table public.user_memories enable row level security;

drop policy if exists "user_memories_select_own" on public.user_memories;
create policy "user_memories_select_own" on public.user_memories
  for select using (auth.uid() = user_id);
drop policy if exists "user_memories_insert_own" on public.user_memories;
create policy "user_memories_insert_own" on public.user_memories
  for insert with check (
    auth.uid() = user_id
    and (select count(*) from public.user_memories u where u.user_id = auth.uid()) < 30
  );
drop policy if exists "user_memories_delete_own" on public.user_memories;
create policy "user_memories_delete_own" on public.user_memories
  for delete using (auth.uid() = user_id);

-- Saved prompts ---------------------------------------------------------------
create table if not exists public.saved_prompts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 80),
  content text not null check (char_length(content) between 1 and 4000),
  created_at timestamptz not null default now()
);
create index if not exists saved_prompts_user_id_idx on public.saved_prompts (user_id, created_at);
alter table public.saved_prompts enable row level security;

drop policy if exists "saved_prompts_select_own" on public.saved_prompts;
create policy "saved_prompts_select_own" on public.saved_prompts
  for select using (auth.uid() = user_id);
drop policy if exists "saved_prompts_insert_own" on public.saved_prompts;
create policy "saved_prompts_insert_own" on public.saved_prompts
  for insert with check (
    auth.uid() = user_id
    and (select count(*) from public.saved_prompts s where s.user_id = auth.uid()) < 50
  );
drop policy if exists "saved_prompts_delete_own" on public.saved_prompts;
create policy "saved_prompts_delete_own" on public.saved_prompts
  for delete using (auth.uid() = user_id);

notify pgrst, 'reload schema';
