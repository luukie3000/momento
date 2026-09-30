-- Anonymous browser IDs are pseudonymous, not fingerprints or counts of people.
-- No journal content is stored. Database constraints defend the client allowlist.
create table public.analytics_events (
  id uuid primary key default gen_random_uuid(),
  event_name text not null,
  session_id uuid not null,
  user_id uuid references auth.users(id) on delete cascade,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint analytics_event_name_allowed check (event_name in (
    'page_view', 'hero_start_journal_clicked', 'journal_opened', 'memory_editor_opened',
    'memory_created', 'memory_created_with_photo', 'memory_photos_added', 'memory_edited',
    'memory_deleted', 'signup_started', 'signup_completed', 'login_completed', 'logout',
    'guest_memories_import_started', 'guest_memories_import_completed',
    'beta_feedback_submitted', 'returning_visitor', 'first_memory_created'
  )),
  constraint analytics_metadata_object check (
    jsonb_typeof(metadata) = 'object' and octet_length(metadata::text) <= 1024
  ),
  constraint analytics_metadata_keys_allowed check (
    metadata - array['source', 'mode', 'photo_count', 'memory_count', 'confirmation_required',
      'utm_source', 'utm_medium', 'utm_campaign', 'utm_content'] = '{}'::jsonb
  ),
  constraint analytics_source_allowed check (
    not (metadata ? 'source') or (jsonb_typeof(metadata->'source') = 'string' and
      metadata->>'source' in ('hero', 'navigation', 'menu', 'intro', 'how_it_works', 'end',
        'footer', 'beta', 'account', 'journal', 'memory_detail', 'composer', 'import'))
  ),
  constraint analytics_mode_allowed check (
    not (metadata ? 'mode') or (jsonb_typeof(metadata->'mode') = 'string' and metadata->>'mode' in ('guest', 'cloud'))
  ),
  constraint analytics_photo_count_allowed check (
    not (metadata ? 'photo_count') or (jsonb_typeof(metadata->'photo_count') = 'number' and metadata->>'photo_count' ~ '^[0-5]$')
  ),
  constraint analytics_memory_count_allowed check (
    not (metadata ? 'memory_count') or (jsonb_typeof(metadata->'memory_count') = 'number' and metadata->>'memory_count' ~ '^([0-9]{1,5}|100000)$')
  ),
  constraint analytics_confirmation_allowed check (
    not (metadata ? 'confirmation_required') or jsonb_typeof(metadata->'confirmation_required') = 'boolean'
  ),
  constraint analytics_utm_source_allowed check (
    not (metadata ? 'utm_source') or (jsonb_typeof(metadata->'utm_source') = 'string' and metadata->>'utm_source' ~ '^[a-zA-Z0-9][a-zA-Z0-9._-]{0,79}$')
  ),
  constraint analytics_utm_medium_allowed check (
    not (metadata ? 'utm_medium') or (jsonb_typeof(metadata->'utm_medium') = 'string' and metadata->>'utm_medium' ~ '^[a-zA-Z0-9][a-zA-Z0-9._-]{0,79}$')
  ),
  constraint analytics_utm_campaign_allowed check (
    not (metadata ? 'utm_campaign') or (jsonb_typeof(metadata->'utm_campaign') = 'string' and metadata->>'utm_campaign' ~ '^[a-zA-Z0-9][a-zA-Z0-9._-]{0,79}$')
  ),
  constraint analytics_utm_content_allowed check (
    not (metadata ? 'utm_content') or (jsonb_typeof(metadata->'utm_content') = 'string' and metadata->>'utm_content' ~ '^[a-zA-Z0-9][a-zA-Z0-9._-]{0,79}$')
  ),
  constraint analytics_first_memory_identity check (
    event_name <> 'first_memory_created' or coalesce(
      (user_id is null and metadata->>'mode' = 'guest') or
      (user_id is not null and metadata->>'mode' = 'cloud'), false)
  )
);

alter table public.analytics_events enable row level security;
-- New public tables may inherit broad grants; strip them before permitting writes.
revoke all on public.analytics_events from public, anon, authenticated;
-- Clients cannot forge created_at, read even their own events, update or delete.
grant insert (id, event_name, session_id, user_id, metadata)
  on public.analytics_events to anon, authenticated;

create policy "Anonymous analytics inserts" on public.analytics_events
  for insert to anon with check (user_id is null);
create policy "Authenticated analytics inserts" on public.analytics_events
  for insert to authenticated with check (user_id = (select auth.uid()));
-- Intentionally no SELECT policy, public reporting views, or SECURITY DEFINER code.

create index analytics_events_created_at_idx on public.analytics_events (created_at);
create index analytics_events_event_created_idx on public.analytics_events (event_name, created_at);
create index analytics_events_session_created_idx on public.analytics_events (session_id, created_at);
create index analytics_events_user_idx on public.analytics_events (user_id) where user_id is not null;
-- Across tabs/devices and after all memories have been deleted, a first conversion
-- can never be inserted twice. Analytics failures/duplicate attempts are ignored by the client.
create unique index analytics_first_memory_guest_once on public.analytics_events (session_id)
  where event_name = 'first_memory_created' and user_id is null;
create unique index analytics_first_memory_user_once on public.analytics_events (user_id)
  where event_name = 'first_memory_created' and user_id is not null;

comment on table public.analytics_events is
  'Insert-only client telemetry. Admin SQL access only; bounded safe metadata; no memory content.';
comment on column public.analytics_events.session_id is
  'Random browser ID reused across visits; not a per-visit session or a unique person.';
