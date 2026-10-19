-- =============================================================================
-- AbhiNova AI — 002: Projects, knowledge sources & connectors (Session 8)
-- Rules: RLS on every new table (owner-only). project_id is NULLABLE
-- everywhere so existing chats/documents keep working exactly as before.
-- Run AFTER 001_init.sql. Safe to run once on an existing database.
-- =============================================================================

-- =============================================================================
-- projects
-- Shape note: a future project_members table (team/shared projects) can join
-- on projects.id without restructuring — RLS would then OR in membership.
-- =============================================================================
create table public.projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  description text check (char_length(description) <= 500),
  custom_instructions text check (char_length(custom_instructions) <= 4000),
  icon text not null default '📁',
  color text not null default 'violet',
  is_archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index projects_user_id_idx on public.projects (user_id, updated_at desc);

create trigger projects_set_updated_at
  before update on public.projects
  for each row execute function public.set_updated_at();

alter table public.projects enable row level security;

create policy "projects_select_own" on public.projects
  for select using (auth.uid() = user_id);
-- Guests: at most 1 project (also enforced in the API with a friendly 403).
create policy "projects_insert_own" on public.projects
  for insert with check (
    auth.uid() = user_id
    and (
      not public.is_guest_session()
      or (select count(*) from public.projects p where p.user_id = auth.uid()) < 1
    )
  );
create policy "projects_update_own" on public.projects
  for update using (auth.uid() = user_id);
create policy "projects_delete_own" on public.projects
  for delete using (auth.uid() = user_id);

-- =============================================================================
-- project_notes — permanent facts the AI always sees for a project
-- =============================================================================
create table public.project_notes (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  content text not null check (char_length(content) between 1 and 1000),
  created_at timestamptz not null default now()
);

create index project_notes_project_id_idx on public.project_notes (project_id, created_at);

alter table public.project_notes enable row level security;

create policy "project_notes_select_own" on public.project_notes
  for select using (auth.uid() = user_id);
create policy "project_notes_insert_own" on public.project_notes
  for insert with check (auth.uid() = user_id);
create policy "project_notes_update_own" on public.project_notes
  for update using (auth.uid() = user_id);
create policy "project_notes_delete_own" on public.project_notes
  for delete using (auth.uid() = user_id);

-- =============================================================================
-- connector_accounts — OAuth tokens (HIGH sensitivity). Tokens are AES-GCM
-- encrypted by the server before insert; plaintext never touches the DB.
-- =============================================================================
create table public.connector_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  provider text not null check (provider in ('jira', 'github', 'notion', 'gdrive')),
  encrypted_access_token text not null,
  encrypted_refresh_token text,
  expires_at timestamptz,
  scopes text,
  account_label text,
  -- provider extras, e.g. Jira cloud id/site url. Never secrets.
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, provider)
);

create trigger connector_accounts_set_updated_at
  before update on public.connector_accounts
  for each row execute function public.set_updated_at();

alter table public.connector_accounts enable row level security;

create policy "connector_accounts_select_own" on public.connector_accounts
  for select using (auth.uid() = user_id);
create policy "connector_accounts_insert_own" on public.connector_accounts
  for insert with check (auth.uid() = user_id and not public.is_guest_session());
create policy "connector_accounts_update_own" on public.connector_accounts
  for update using (auth.uid() = user_id);
create policy "connector_accounts_delete_own" on public.connector_accounts
  for delete using (auth.uid() = user_id);

-- =============================================================================
-- project_sources — a URL or connector feed attached to a project
-- =============================================================================
create table public.project_sources (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  source_type text not null check (source_type in ('url', 'jira', 'github', 'notion', 'gdrive')),
  external_id text,
  title text not null,
  -- e.g. {"jql": "..."} / {"repo": "owner/name"} / {"url": "..."}
  config jsonb not null default '{}'::jsonb,
  last_synced_at timestamptz,
  sync_status text not null default 'idle' check (sync_status in ('idle', 'syncing', 'synced', 'failed')),
  sync_error text,
  item_count int not null default 0,
  created_at timestamptz not null default now()
);

create index project_sources_project_id_idx on public.project_sources (project_id);

alter table public.project_sources enable row level security;

create policy "project_sources_select_own" on public.project_sources
  for select using (auth.uid() = user_id);
-- Guests: no links/connectors (file upload only).
create policy "project_sources_insert_own" on public.project_sources
  for insert with check (auth.uid() = user_id and not public.is_guest_session());
create policy "project_sources_update_own" on public.project_sources
  for update using (auth.uid() = user_id);
create policy "project_sources_delete_own" on public.project_sources
  for delete using (auth.uid() = user_id);

-- =============================================================================
-- Nullable project_id on existing tables (backward compatible)
-- =============================================================================
alter table public.conversations
  add column project_id uuid references public.projects (id) on delete set null;
alter table public.qa_artifacts
  add column project_id uuid references public.projects (id) on delete set null;
alter table public.code_docs
  add column project_id uuid references public.projects (id) on delete set null;

create index conversations_project_id_idx on public.conversations (project_id);
create index qa_artifacts_project_id_idx on public.qa_artifacts (project_id);
create index code_docs_project_id_idx on public.code_docs (project_id);

-- Citations for project chats survive a reload (sources stored with the reply).
alter table public.messages
  add column metadata jsonb not null default '{}'::jsonb;

-- documents: project scope + connector provenance. Connector/URL items have no
-- storage file, so storage_path becomes nullable.
alter table public.documents
  alter column storage_path drop not null,
  add column project_id uuid references public.projects (id) on delete set null,
  add column source_id uuid references public.project_sources (id) on delete cascade,
  add column external_id text,
  add column source_url text,
  add column updated_at timestamptz not null default now();

create index documents_project_id_idx on public.documents (project_id);
-- Re-sync upserts by (source, external item) — never duplicates.
create unique index documents_source_external_idx
  on public.documents (source_id, external_id)
  where source_id is not null;

-- Guests may upload up to 2 documents, and only into a project
-- (relaxes 001's blanket guest block; the API enforces the same limits).
drop policy "documents_insert_own" on public.documents;
create policy "documents_insert_own" on public.documents
  for insert with check (
    auth.uid() = user_id
    and (
      not public.is_guest_session()
      or (
        project_id is not null
        and (select count(*) from public.documents d where d.user_id = auth.uid()) < 2
      )
    )
  );

drop policy "document_chunks_insert_own" on public.document_chunks;
create policy "document_chunks_insert_own" on public.document_chunks
  for insert with check (auth.uid() = user_id);

drop policy "documents_storage_insert_own" on storage.objects;
create policy "documents_storage_insert_own" on storage.objects
  for insert with check (
    bucket_id = 'documents'
    and (storage.foldername(name))[1] = auth.uid()::text
    and (
      not public.is_guest_session()
      or (select count(*) from public.documents d where d.user_id = auth.uid()) < 2
    )
  );

-- =============================================================================
-- Retrieval RPC: optional project scope. Signature changes, so drop first
-- (create-or-replace would add an ambiguous overload). SECURITY INVOKER keeps
-- RLS in force; p_project_id null = exactly the old behaviour.
-- =============================================================================
drop function if exists public.match_document_chunks(vector, int, uuid[]);

create or replace function public.match_document_chunks(
  query_embedding vector(768),
  match_count int default 6,
  filter_document_ids uuid[] default null,
  p_project_id uuid default null
)
returns table (
  id uuid,
  document_id uuid,
  file_name text,
  source_url text,
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
    d.source_url,
    c.content,
    c.chunk_index,
    c.metadata,
    1 - (c.embedding <=> query_embedding) as similarity
  from public.document_chunks c
  join public.documents d on d.id = c.document_id
  where c.user_id = auth.uid()
    and c.embedding is not null
    and (filter_document_ids is null or c.document_id = any (filter_document_ids))
    and (p_project_id is null or d.project_id = p_project_id)
  order by c.embedding <=> query_embedding
  limit match_count;
$$;
