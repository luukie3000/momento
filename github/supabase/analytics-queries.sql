-- Run these separately in the MOMENTO Supabase SQL Editor as an administrator.
-- No browser role can SELECT this table. These queries create no public views.
-- session_id is a persistent random browser ID, not a person or individual visit.
-- All dates below use UTC. Change 'UTC' consistently for local reporting.

-- 1. Total visitors, visitors today, and unique browser IDs across all events.
select
  count(distinct session_id) filter (where event_name = 'page_view') as total_visitors,
  count(distinct session_id) filter (
    where event_name = 'page_view'
      and created_at >= date_trunc('day', now() at time zone 'UTC') at time zone 'UTC'
  ) as visitors_today,
  count(distinct session_id) as unique_browser_sessions,
  count(*) filter (where event_name = 'page_view') as page_views
from public.analytics_events;

-- 2. Event totals and unique browsers reaching each event.
select event_name, count(*) as events, count(distinct session_id) as browsers
from public.analytics_events
group by event_name order by events desc, event_name;

-- 3. Funnel and conversion rates. Each browser counts once per milestone.
-- These are milestone reach rates, not a mandatory ordered funnel: guest memory
-- creation can happen before signup. Imports count as successful cloud creations.
-- Denominator is browsers with a page_view, avoiding orphan-event inflation.
-- For a date cohort, filter page_view dates in the HAVING clause, not all events:
-- that preserves conversions recorded after the acquisition date.
with browsers as (
  select session_id,
    bool_or(event_name = 'hero_start_journal_clicked') as started,
    bool_or(event_name = 'journal_opened') as opened,
    bool_or(event_name = 'signup_completed') as signed_up,
    bool_or(event_name = 'first_memory_created') as first_memory,
    bool_or(event_name = 'memory_created') as created_memory,
    bool_or(event_name = 'memory_created_with_photo') as created_with_photo,
    bool_or(event_name = 'memory_photos_added') as added_photos
  from public.analytics_events
  group by session_id having bool_or(event_name = 'page_view')
), totals as (
  select count(*) as visitors,
    count(*) filter (where started) as start_journal_clicks,
    count(*) filter (where opened) as journal_opens,
    count(*) filter (where signed_up) as signups,
    count(*) filter (where first_memory) as first_memories,
    count(*) filter (where created_memory) as memory_creators,
    count(*) filter (where created_with_photo) as memories_with_photos,
    count(*) filter (where added_photos) as photo_users
  from browsers
)
select *,
  round(100.0 * start_journal_clicks / nullif(visitors, 0), 2) as start_journal_ctr_pct,
  round(100.0 * signups / nullif(visitors, 0), 2) as signup_conversion_pct,
  round(100.0 * first_memories / nullif(visitors, 0), 2) as first_memory_conversion_pct,
  round(100.0 * memory_creators / nullif(visitors, 0), 2) as memory_creation_rate_pct,
  round(100.0 * memories_with_photos / nullif(visitors, 0), 2) as photo_memory_conversion_pct
from totals;

-- 4. Pinterest visitors to signup, first memory and any memory conversion.
-- First-touch attribution is persisted, so later direct visits retain Pinterest.
with pinterest_browsers as (
  select session_id,
    bool_or(event_name = 'signup_completed') as signed_up,
    bool_or(event_name = 'first_memory_created') as first_memory,
    bool_or(event_name = 'memory_created') as created_memory
  from public.analytics_events
  group by session_id
  having bool_or(event_name = 'page_view' and metadata->>'utm_source' = 'pinterest')
), totals as (
  select count(*) as pinterest_visitors,
    count(*) filter (where signed_up) as signups,
    count(*) filter (where first_memory) as first_memories,
    count(*) filter (where created_memory) as memory_creators
  from pinterest_browsers
)
select *,
  round(100.0 * signups / nullif(pinterest_visitors, 0), 2) as pinterest_signup_conversion_pct,
  round(100.0 * first_memories / nullif(pinterest_visitors, 0), 2) as pinterest_first_memory_conversion_pct,
  round(100.0 * memory_creators / nullif(pinterest_visitors, 0), 2) as pinterest_memory_conversion_pct
from totals;

-- 5. Daily events over the last 30 UTC calendar days (today included).
select (created_at at time zone 'UTC')::date as day, event_name,
  count(*) as events, count(distinct session_id) as browsers
from public.analytics_events
where created_at >= (date_trunc('day', now() at time zone 'UTC') - interval '29 days') at time zone 'UTC'
group by day, event_name order by day desc, event_name;

-- 6. Top first-touch UTM campaigns with deduplicated conversion rates.
with browsers as (
  select session_id,
    coalesce(max(metadata->>'utm_source'), '(direct)') as utm_source,
    coalesce(max(metadata->>'utm_medium'), '(none)') as utm_medium,
    coalesce(max(metadata->>'utm_campaign'), '(none)') as utm_campaign,
    coalesce(max(metadata->>'utm_content'), '(none)') as utm_content,
    bool_or(event_name = 'signup_completed') as signed_up,
    bool_or(event_name = 'first_memory_created') as first_memory,
    bool_or(event_name = 'memory_created') as created_memory
  from public.analytics_events
  group by session_id having bool_or(event_name = 'page_view')
)
select utm_source, utm_medium, utm_campaign, utm_content,
  count(*) as visitors,
  count(*) filter (where signed_up) as signups,
  count(*) filter (where first_memory) as first_memories,
  count(*) filter (where created_memory) as memory_creators,
  round(100.0 * count(*) filter (where signed_up) / nullif(count(*), 0), 2) as signup_conversion_pct,
  round(100.0 * count(*) filter (where first_memory) / nullif(count(*), 0), 2) as first_memory_conversion_pct
from browsers
group by utm_source, utm_medium, utm_campaign, utm_content
order by visitors desc, utm_source, utm_campaign;

-- 7. Returning browsers, return visits and returning browser rate.
-- A new page load after >=30 minutes of inactivity is a return visit;
-- refreshes within the same active visit don't fire returning_visitor.
select
  count(distinct session_id) filter (where event_name = 'returning_visitor') as returning_browsers,
  count(*) filter (where event_name = 'returning_visitor') as return_visits,
  round(100.0 * count(distinct session_id) filter (where event_name = 'returning_visitor') /
    nullif(count(distinct session_id) filter (where event_name = 'page_view'), 0), 2) as returning_browser_pct
from public.analytics_events;

-- 8. Memory creation volume by mode (imports are labeled source=import).
select metadata->>'mode' as mode, metadata->>'source' as source,
  count(*) as memories_created, count(distinct session_id) as creating_browsers,
  count(*) filter (where coalesce((metadata->>'photo_count')::int, 0) > 0) as with_photos
from public.analytics_events where event_name = 'memory_created'
group by mode, source order by memories_created desc;
