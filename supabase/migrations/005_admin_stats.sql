-- =============================================================================
-- 005 — Usage dashboard stats (owner-only)
--
-- One aggregate-only function for /admin. It returns counts, never message
-- text or emails (except the latest feedback notes, which are meant to be
-- read). Service-role only: clients can't call it. Days are UTC calendar days,
-- matching the open-beta quota buckets. Safe to re-run.
-- =============================================================================

create or replace function public.admin_usage_stats(
  p_days integer,
  p_ai_user_cap integer,
  p_ai_ip_cap integer,
  p_ai_site_cap integer,
  p_chat_cap integer,
  p_qa_cap integer,
  p_doc_cap integer
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_days integer := least(greatest(coalesce(p_days, 14), 1), 90);
  v_today date := (now() at time zone 'utc')::date;
  v_from date := v_today - (v_days - 1);
  v_from_ts timestamptz := v_from::timestamp at time zone 'utc';
  result jsonb;
begin
  with days as (
    select generate_series(v_from, v_today, interval '1 day')::date as day
  ),
  user_msgs as (
    select m.created_at, c.user_id, c.mode, c.project_id
    from public.messages m
    join public.conversations c on c.id = m.conversation_id
    where m.role = 'user' and m.created_at >= v_from_ts
  ),
  activity as (
    select (created_at at time zone 'utc')::date as day, user_id from user_msgs
    union all
    select (created_at at time zone 'utc')::date, user_id from public.qa_artifacts where created_at >= v_from_ts
    union all
    select (created_at at time zone 'utc')::date, user_id from public.documents where created_at >= v_from_ts
    union all
    select (created_at at time zone 'utc')::date, user_id from public.code_docs where created_at >= v_from_ts
  ),
  daily as (
    select
      d.day,
      (select count(*) from auth.users u where (u.created_at at time zone 'utc')::date = d.day) as new_visitors,
      (select count(distinct a.user_id) from activity a where a.day = d.day) as active_users,
      coalesce((select b.used from public.beta_usage b where b.subject = 'site' and b.bucket = 'ai:' || d.day::text), 0) as ai_replies,
      (select count(*) from user_msgs um where (um.created_at at time zone 'utc')::date = d.day) as messages
    from days d
  )
  select jsonb_build_object(
    'generatedAt', now(),
    'days', v_days,
    'today', v_today,
    'daily', (select jsonb_agg(jsonb_build_object(
        'day', day, 'newVisitors', new_visitors, 'activeUsers', active_users,
        'aiReplies', ai_replies, 'messages', messages) order by day) from daily),
    'totals', jsonb_build_object(
      'visitors', (select count(*) from auth.users),
      'guests', (select count(*) from auth.users where coalesce(is_anonymous, false)),
      'chats', (select count(*) from public.conversations where mode = 'workspace' and project_id is null),
      'projectChats', (select count(*) from public.conversations where mode = 'workspace' and project_id is not null),
      'wellnessSessions', (select count(*) from public.conversations where mode = 'wellness'),
      'userMessages', (select count(*) from public.messages where role = 'user'),
      'qaRuns', (select count(*) from public.qa_artifacts),
      'documents', (select count(*) from public.documents),
      'projects', (select count(*) from public.projects),
      'codeDocs', (select count(*) from public.code_docs),
      'feedback', (select count(*) from public.feedback),
      'aiRepliesAllTime', coalesce((select sum(used) from public.beta_usage where subject = 'site' and bucket like 'ai:%'), 0)
    ),
    'features', jsonb_build_object(
      'chat', (select count(*) from user_msgs where mode = 'workspace' and project_id is null),
      'projects', (select count(*) from user_msgs where mode = 'workspace' and project_id is not null),
      'qaStudio', (select count(*) from public.qa_artifacts where created_at >= v_from_ts),
      'documents', (select count(*) from public.documents where created_at >= v_from_ts and project_id is null),
      'projectFiles', (select count(*) from public.documents where created_at >= v_from_ts and project_id is not null),
      'codeStudio', (select count(*) from public.code_docs where created_at >= v_from_ts),
      'wellness', (select count(*) from user_msgs where mode = 'wellness')
    ),
    'limitsToday', jsonb_build_object(
      'siteAiUsed', coalesce((select used from public.beta_usage where subject = 'site' and bucket = 'ai:' || v_today::text), 0),
      'siteAiCap', p_ai_site_cap,
      'usersAtAiCap', (select count(*) from public.beta_usage where subject like 'user:%' and bucket = 'ai:' || v_today::text and used >= p_ai_user_cap),
      'networksAtAiCap', (select count(*) from public.beta_usage where subject like 'ip:%' and bucket = 'ai:' || v_today::text and used >= p_ai_ip_cap),
      'usersAtQaCap', (select count(*) from public.beta_usage where subject like 'user:%' and bucket = 'qa:' || v_today::text and used >= p_qa_cap),
      'usersAtChatCap', (select count(*) from public.beta_usage where subject like 'user:%' and bucket = 'chat' and used >= p_chat_cap),
      'usersAtDocCap', (select count(*) from public.beta_usage where subject like 'user:%' and bucket = 'doc' and used >= p_doc_cap),
      'aiUsersToday', (select count(*) from public.beta_usage where subject like 'user:%' and bucket = 'ai:' || v_today::text and used > 0)
    ),
    'qaTools', coalesce((
      select jsonb_agg(jsonb_build_object('tool', type, 'runs', n) order by n desc)
      from (select type, count(*) as n from public.qa_artifacts where created_at >= v_from_ts group by type order by n desc limit 8) t
    ), '[]'::jsonb),
    'feedbackByCategory', coalesce((
      select jsonb_object_agg(category, n)
      from (select category, count(*) as n from public.feedback group by category) f
    ), '{}'::jsonb),
    'recentFeedback', coalesce((
      select jsonb_agg(jsonb_build_object('createdAt', created_at, 'category', category, 'message', message, 'page', page, 'isGuest', is_guest) order by created_at desc)
      from (select * from public.feedback order by created_at desc limit 8) r
    ), '[]'::jsonb)
  ) into result;

  return result;
end;
$$;

revoke all on function public.admin_usage_stats(integer, integer, integer, integer, integer, integer, integer) from public, anon, authenticated;
grant execute on function public.admin_usage_stats(integer, integer, integer, integer, integer, integer, integer) to service_role;

-- Make the API layer (PostgREST) see the new function immediately.
notify pgrst, 'reload schema';
