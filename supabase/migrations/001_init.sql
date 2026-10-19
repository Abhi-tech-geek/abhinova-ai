-- =============================================================================
-- AbhiNova AI — initial schema (Session 1)
-- Rules (CLAUDE.md): RLS enabled on EVERY table, owner-only policies
-- (auth.uid() = user_id). Runs clean on a fresh Supabase project.
--
-- Note on guests: Supabase anonymous users get a real auth.uid() too, so every
-- owner-only policy below already covers them — no special-casing needed for
-- reads/writes of their own rows. Guest-locked features (document upload,
-- wellness writes, storage) additionally check the JWT's is_anonymous claim.
-- =============================================================================

-- ---------- extensions ----------
create extension if not exists vector;

-- ---------- helpers ----------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- true when the caller is an anonymous (guest) session
create or replace function public.is_guest_session()
returns boolean
language sql
stable
as $$
  select coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false);
$$;

-- =============================================================================
-- profiles
-- =============================================================================
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  avatar_url text,
  theme_pref text not null default 'dark' check (theme_pref in ('dark', 'light', 'wellness')),
  voice_lang_pref text not null default 'en-IN' check (voice_lang_pref in ('en-IN', 'hi-IN')),
  wellness_enabled boolean not null default false,
  is_guest boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "profiles_select_own" on public.profiles
  for select using (auth.uid() = id);
create policy "profiles_insert_own" on public.profiles
  for insert with check (auth.uid() = id);
create policy "profiles_update_own" on public.profiles
  for update using (auth.uid() = id);

-- Auto-create a profile on signup (any method — email, Google, or anonymous).
-- is_guest mirrors auth.users.is_anonymous at creation time.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, is_guest)
  values (new.id, coalesce(new.is_anonymous, false))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- When a guest upgrades (adds email/password or links Google), Supabase flips
-- auth.users.is_anonymous to false — mirror that into profiles.is_guest so the
-- guest banner disappears. Same user_id, so all their data is already theirs.
create or replace function public.handle_user_upgrade()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if coalesce(old.is_anonymous, false) and not coalesce(new.is_anonymous, false) then
    update public.profiles set is_guest = false where id = new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists on_auth_user_updated on auth.users;
create trigger on_auth_user_updated
  after update on auth.users
  for each row execute function public.handle_user_upgrade();

-- =============================================================================
-- conversations
-- =============================================================================
create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  title text not null default 'New chat',
  mode text not null check (mode in ('workspace', 'qa', 'wellness')),
  -- wellness session summary (generated on "End session")
  summary text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index conversations_user_id_idx on public.conversations (user_id, updated_at desc);

create trigger conversations_set_updated_at
  before update on public.conversations
  for each row execute function public.set_updated_at();

alter table public.conversations enable row level security;

create policy "conversations_select_own" on public.conversations
  for select using (auth.uid() = user_id);
create policy "conversations_insert_own" on public.conversations
  for insert with check (auth.uid() = user_id);
create policy "conversations_update_own" on public.conversations
  for update using (auth.uid() = user_id);
create policy "conversations_delete_own" on public.conversations
  for delete using (auth.uid() = user_id);

-- =============================================================================
-- messages
-- =============================================================================
create table public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null check (role in ('user', 'assistant', 'system')),
  content text not null,
  -- wellness crisis signal — boolean ONLY, analysis details are never stored
  crisis_flag boolean not null default false,
  created_at timestamptz not null default now()
);

create index messages_conversation_id_idx on public.messages (conversation_id, created_at);

alter table public.messages enable row level security;

create policy "messages_select_own" on public.messages
  for select using (auth.uid() = user_id);
create policy "messages_insert_own" on public.messages
  for insert with check (auth.uid() = user_id);
create policy "messages_delete_own" on public.messages
  for delete using (auth.uid() = user_id);

-- =============================================================================
-- documents (RAG uploads) — guests cannot create documents
-- =============================================================================
create table public.documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  file_name text not null,
  file_type text not null,
  storage_path text not null,
  status text not null default 'processing' check (status in ('processing', 'ready', 'failed')),
  created_at timestamptz not null default now()
);

create index documents_user_id_idx on public.documents (user_id, created_at desc);

alter table public.documents enable row level security;

create policy "documents_select_own" on public.documents
  for select using (auth.uid() = user_id);
create policy "documents_insert_own" on public.documents
  for insert with check (auth.uid() = user_id and not public.is_guest_session());
create policy "documents_update_own" on public.documents
  for update using (auth.uid() = user_id);
create policy "documents_delete_own" on public.documents
  for delete using (auth.uid() = user_id);

-- =============================================================================
-- document_chunks (pgvector, 768 dims = Gemini text-embedding-004)
-- =============================================================================
create table public.document_chunks (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  content text not null,
  embedding vector(768),
  chunk_index int not null,
  -- page/slide provenance for citations, e.g. {"page": 3} or {"slide": 2}
  metadata jsonb not null default '{}'::jsonb
);

create index document_chunks_document_id_idx on public.document_chunks (document_id, chunk_index);

-- ANN index for cosine similarity search
create index document_chunks_embedding_idx on public.document_chunks
  using ivfflat (embedding vector_cosine_ops)
  with (lists = 100);

alter table public.document_chunks enable row level security;

create policy "document_chunks_select_own" on public.document_chunks
  for select using (auth.uid() = user_id);
create policy "document_chunks_insert_own" on public.document_chunks
  for insert with check (auth.uid() = user_id and not public.is_guest_session());
create policy "document_chunks_delete_own" on public.document_chunks
  for delete using (auth.uid() = user_id);

-- RAG retrieval RPC. SECURITY INVOKER (the default, stated explicitly) so RLS
-- applies to the caller; the user_id filter narrows the ANN search as well.
create or replace function public.match_document_chunks(
  query_embedding vector(768),
  match_count int default 6,
  filter_document_ids uuid[] default null
)
returns table (
  id uuid,
  document_id uuid,
  file_name text,
  content text,
  chunk_index int,
  metadata jsonb,
  similarity float
)
language sql
security invoker
set search_path = public
as $$
  select
    c.id,
    c.document_id,
    d.file_name,
    c.content,
    c.chunk_index,
    c.metadata,
    1 - (c.embedding <=> query_embedding) as similarity
  from public.document_chunks c
  join public.documents d on d.id = c.document_id
  where c.user_id = auth.uid()
    and c.embedding is not null
    and (filter_document_ids is null or c.document_id = any (filter_document_ids))
  order by c.embedding <=> query_embedding
  limit match_count;
$$;

-- =============================================================================
-- mood_logs (wellness) — guests cannot use Wellness Mode
-- =============================================================================
create table public.mood_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  mood int not null check (mood between 1 and 5),
  note text,
  sleep_hours numeric,
  created_at timestamptz not null default now()
);

create index mood_logs_user_id_idx on public.mood_logs (user_id, created_at desc);

alter table public.mood_logs enable row level security;

create policy "mood_logs_select_own" on public.mood_logs
  for select using (auth.uid() = user_id);
create policy "mood_logs_insert_own" on public.mood_logs
  for insert with check (auth.uid() = user_id and not public.is_guest_session());
create policy "mood_logs_update_own" on public.mood_logs
  for update using (auth.uid() = user_id);
create policy "mood_logs_delete_own" on public.mood_logs
  for delete using (auth.uid() = user_id);

-- =============================================================================
-- journal_entries (wellness) — guests cannot use Wellness Mode
-- =============================================================================
create table public.journal_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  content text not null,
  distortions jsonb,
  reframe text,
  created_at timestamptz not null default now()
);

create index journal_entries_user_id_idx on public.journal_entries (user_id, created_at desc);

alter table public.journal_entries enable row level security;

create policy "journal_entries_select_own" on public.journal_entries
  for select using (auth.uid() = user_id);
create policy "journal_entries_insert_own" on public.journal_entries
  for insert with check (auth.uid() = user_id and not public.is_guest_session());
create policy "journal_entries_update_own" on public.journal_entries
  for update using (auth.uid() = user_id);
create policy "journal_entries_delete_own" on public.journal_entries
  for delete using (auth.uid() = user_id);

-- =============================================================================
-- wellness_insights (cached AI insights: weekly mood, monthly themes)
-- =============================================================================
create table public.wellness_insights (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null check (kind in ('weekly_mood', 'monthly_themes')),
  period_start date not null,
  content text not null,
  created_at timestamptz not null default now(),
  unique (user_id, kind, period_start)
);

alter table public.wellness_insights enable row level security;

create policy "wellness_insights_select_own" on public.wellness_insights
  for select using (auth.uid() = user_id);
create policy "wellness_insights_insert_own" on public.wellness_insights
  for insert with check (auth.uid() = user_id and not public.is_guest_session());
create policy "wellness_insights_update_own" on public.wellness_insights
  for update using (auth.uid() = user_id);
create policy "wellness_insights_delete_own" on public.wellness_insights
  for delete using (auth.uid() = user_id);

-- =============================================================================
-- qa_artifacts (QA Studio history) — available to guests
-- =============================================================================
create table public.qa_artifacts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  type text not null,
  input text not null,
  output text not null,
  created_at timestamptz not null default now()
);

create index qa_artifacts_user_id_idx on public.qa_artifacts (user_id, created_at desc);

alter table public.qa_artifacts enable row level security;

create policy "qa_artifacts_select_own" on public.qa_artifacts
  for select using (auth.uid() = user_id);
create policy "qa_artifacts_insert_own" on public.qa_artifacts
  for insert with check (auth.uid() = user_id);
create policy "qa_artifacts_delete_own" on public.qa_artifacts
  for delete using (auth.uid() = user_id);

-- =============================================================================
-- user_api_keys (BYOK) — HIGH sensitivity. Keys stored AES-GCM encrypted;
-- plaintext never touches the database. key_masked is the only display form.
-- =============================================================================
create table public.user_api_keys (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  provider text not null check (provider in ('openai', 'anthropic', 'groq', 'gemini', 'openrouter')),
  encrypted_key text not null,
  key_masked text not null,
  label text,
  created_at timestamptz not null default now()
);

create index user_api_keys_user_id_idx on public.user_api_keys (user_id);

alter table public.user_api_keys enable row level security;

create policy "user_api_keys_select_own" on public.user_api_keys
  for select using (auth.uid() = user_id);
create policy "user_api_keys_insert_own" on public.user_api_keys
  for insert with check (auth.uid() = user_id and not public.is_guest_session());
create policy "user_api_keys_delete_own" on public.user_api_keys
  for delete using (auth.uid() = user_id);

-- =============================================================================
-- code_docs (Code Studio generated PRD/TRD/architecture/API-spec docs)
-- =============================================================================
create table public.code_docs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  doc_type text not null check (doc_type in ('prd', 'trd', 'architecture', 'api-spec')),
  title text not null,
  content text not null,
  created_at timestamptz not null default now()
);

create index code_docs_user_id_idx on public.code_docs (user_id, created_at desc);

alter table public.code_docs enable row level security;

create policy "code_docs_select_own" on public.code_docs
  for select using (auth.uid() = user_id);
create policy "code_docs_insert_own" on public.code_docs
  for insert with check (auth.uid() = user_id and not public.is_guest_session());
create policy "code_docs_delete_own" on public.code_docs
  for delete using (auth.uid() = user_id);

-- =============================================================================
-- Storage: "documents" bucket, per-user folders ({user_id}/{file_id})
-- Users can only touch objects inside their own folder; guests get no storage.
-- =============================================================================
insert into storage.buckets (id, name, public)
values ('documents', 'documents', false)
on conflict (id) do nothing;

create policy "documents_storage_select_own" on storage.objects
  for select using (
    bucket_id = 'documents'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "documents_storage_insert_own" on storage.objects
  for insert with check (
    bucket_id = 'documents'
    and (storage.foldername(name))[1] = auth.uid()::text
    and not public.is_guest_session()
  );

create policy "documents_storage_update_own" on storage.objects
  for update using (
    bucket_id = 'documents'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "documents_storage_delete_own" on storage.objects
  for delete using (
    bucket_id = 'documents'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- =============================================================================
-- GUEST HYGIENE (run periodically — Supabase SQL Editor or a scheduled
-- pg_cron/Edge Function). Purges anonymous users older than 30 days; every
-- table cascades from auth.users, so their data goes with them. Guests can't
-- upload to storage, so no storage cleanup is needed for them.
--
--   delete from auth.users
--   where is_anonymous = true
--     and created_at < now() - interval '30 days';
--
-- pg_cron variant (enable the pg_cron extension first):
--   select cron.schedule('purge-old-guests', '0 4 * * *',
--     $$delete from auth.users where is_anonymous = true
--       and created_at < now() - interval '30 days'$$);
-- =============================================================================
