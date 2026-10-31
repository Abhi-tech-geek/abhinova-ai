-- =============================================================================
-- 006 — Share a chat by link
--
-- The owner creates a share for one of their WORKSPACE conversations (never a
-- Wellness one). Anyone with the link can read that conversation — live, until
-- the owner stops sharing (row deleted) or deletes the chat (cascade).
-- Reading goes through get_shared_chat(), a SECURITY DEFINER function that
-- returns ONLY the shared conversation's user/assistant messages. Safe to re-run.
-- =============================================================================

create table if not exists public.shared_chats (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null unique references public.conversations (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.shared_chats enable row level security;

drop policy if exists "shared_chats_select_own" on public.shared_chats;
create policy "shared_chats_select_own" on public.shared_chats
  for select using (auth.uid() = user_id);

-- Only for a workspace conversation the caller owns.
drop policy if exists "shared_chats_insert_own" on public.shared_chats;
create policy "shared_chats_insert_own" on public.shared_chats
  for insert with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.conversations c
      where c.id = conversation_id and c.user_id = auth.uid() and c.mode = 'workspace'
    )
  );

drop policy if exists "shared_chats_delete_own" on public.shared_chats;
create policy "shared_chats_delete_own" on public.shared_chats
  for delete using (auth.uid() = user_id);

-- Public read of one shared chat. Unknown/revoked id → no rows.
create or replace function public.get_shared_chat(p_share_id uuid)
returns table (title text, role text, content text, created_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select c.title, m.role, m.content, m.created_at
  from public.shared_chats s
  join public.conversations c on c.id = s.conversation_id and c.mode = 'workspace'
  join public.messages m on m.conversation_id = c.id and m.role in ('user', 'assistant')
  where s.id = p_share_id
  order by m.created_at asc
  limit 400;
$$;

revoke all on function public.get_shared_chat(uuid) from public;
grant execute on function public.get_shared_chat(uuid) to anon, authenticated;

notify pgrst, 'reload schema';
