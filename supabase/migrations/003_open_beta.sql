-- =============================================================================
-- 003 — Open beta (no login page; every visitor is an anonymous guest)
--
-- 1. beta_usage: tamper-proof usage counters. NO RLS policies → only the
--    service role (server) can read/write. Guests deleting their chats can't
--    reset a limit, because limits are counted here, not from live rows.
-- 2. consume_beta_quota(): atomically checks + increments several counters
--    (per-user, per-IP, site-wide) in one transaction.
-- 3. Guests may now write wellness + Code Studio rows and upload up to 2
--    documents outside projects (the API still gates all of it by OPEN_BETA).
-- Safe to re-run.
-- =============================================================================

create table if not exists public.beta_usage (
  subject text not null,            -- 'user:<uuid>' | 'ip:<sha256>' | 'site'
  bucket text not null,             -- 'ai:2026-10-18' | 'chat' | 'qa:2026-10-18' ...
  used integer not null default 0 check (used >= 0),
  updated_at timestamptz not null default now(),
  primary key (subject, bucket)
);

alter table public.beta_usage enable row level security;
-- Intentionally no policies: anon/authenticated roles can't touch this table.
revoke all on public.beta_usage from anon, authenticated;

-- p_items: [{"subject": "...", "bucket": "...", "limit": 25, "code": "daily_limit_reached"}, ...]
-- Returns 'ok' (all counters incremented) or the `code` of the first counter
-- that is already at its limit (nothing incremented).
create or replace function public.consume_beta_quota(p_items jsonb)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  item jsonb;
  current_used integer;
begin
  -- Lock every row first (stable order → no deadlocks), then check, then bump.
  for item in
    select value from jsonb_array_elements(p_items)
    order by value->>'subject', value->>'bucket'
  loop
    insert into public.beta_usage (subject, bucket)
    values (item->>'subject', item->>'bucket')
    on conflict (subject, bucket) do nothing;

    select used into current_used
    from public.beta_usage
    where subject = item->>'subject' and bucket = item->>'bucket'
    for update;

    if current_used >= (item->>'limit')::integer then
      return coalesce(item->>'code', 'limit_reached');
    end if;
  end loop;

  update public.beta_usage u
  set used = u.used + 1, updated_at = now()
  from jsonb_array_elements(p_items) i
  where u.subject = i.value->>'subject' and u.bucket = i.value->>'bucket';

  return 'ok';
end;
$$;

revoke all on function public.consume_beta_quota(jsonb) from public, anon, authenticated;
grant execute on function public.consume_beta_quota(jsonb) to service_role;

-- Housekeeping: daily buckets older than 14 days can be deleted any time:
--   delete from public.beta_usage where updated_at < now() - interval '14 days' and bucket like '%:%';

-- -----------------------------------------------------------------------------
-- Guest write access for beta surfaces (defence in depth; API is the gate)
-- -----------------------------------------------------------------------------

-- Documents: guests may upload up to 2 in total (inside OR outside a project).
drop policy if exists "documents_insert_own" on public.documents;
create policy "documents_insert_own" on public.documents
  for insert with check (
    auth.uid() = user_id
    and (
      not public.is_guest_session()
      or (select count(*) from public.documents d where d.user_id = auth.uid()) < 2
    )
  );

-- Wellness: guests can log moods / journal (capped so a script can't flood).
drop policy if exists "mood_logs_insert_own" on public.mood_logs;
create policy "mood_logs_insert_own" on public.mood_logs
  for insert with check (
    auth.uid() = user_id
    and (
      not public.is_guest_session()
      or (select count(*) from public.mood_logs m where m.user_id = auth.uid()) < 30
    )
  );

drop policy if exists "journal_entries_insert_own" on public.journal_entries;
create policy "journal_entries_insert_own" on public.journal_entries
  for insert with check (
    auth.uid() = user_id
    and (
      not public.is_guest_session()
      or (select count(*) from public.journal_entries j where j.user_id = auth.uid()) < 30
    )
  );

drop policy if exists "wellness_insights_insert_own" on public.wellness_insights;
create policy "wellness_insights_insert_own" on public.wellness_insights
  for insert with check (
    auth.uid() = user_id
    and (
      not public.is_guest_session()
      or (select count(*) from public.wellness_insights w where w.user_id = auth.uid()) < 30
    )
  );

-- Code Studio generated docs.
drop policy if exists "code_docs_insert_own" on public.code_docs;
create policy "code_docs_insert_own" on public.code_docs
  for insert with check (
    auth.uid() = user_id
    and (
      not public.is_guest_session()
      or (select count(*) from public.code_docs c where c.user_id = auth.uid()) < 20
    )
  );
