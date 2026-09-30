# MOMENTO conversion tracking

## Check conversions

Open the MOMENTO project in Supabase, open **SQL Editor**, and paste one query
from `supabase/analytics-queries.sql`. Query 3 shows the funnel and rates; query 4
shows Pinterest conversions; query 6 compares campaigns. Results stay admin-only.
There is no frontend analytics dashboard or public reporting endpoint.

Pinterest destination example:

`https://momento-orpin.vercel.app/?utm_source=pinterest&utm_medium=organic&utm_campaign=launch&utm_content=journal_video`

Use campaign slugs containing only letters, digits, dots, underscores and hyphens
(maximum 80 characters, normalized to lowercase). Other values are discarded to
avoid recording emails, URLs or arbitrary query content. Only the four UTM fields
are captured. The first touch persists, including a direct first visit.

## Events and definitions

| Event | When it fires |
| --- | --- |
| `page_view` | Once per loaded page, including refreshes; React StrictMode does not duplicate it |
| `hero_start_journal_clicked` | Existing OPEN YOUR JOURNAL / ADD A MEMORY / START YOUR STORY / MAKE YOUR FIRST MEMORY CTAs; source distinguishes placement |
| `journal_opened` | A journal modal opens, including after saving from the homepage composer |
| `memory_editor_opened` | An editor opens, or the homepage composer gains focus |
| `memory_created` | A new guest/cloud memory saves successfully, including successful imports |
| `memory_created_with_photo` | A new memory saves successfully with at least one photo |
| `memory_photos_added` | A successful creation or edit includes newly added photos |
| `first_memory_created` | First guest creation per browser, or first cloud creation per account |
| `memory_edited`, `memory_deleted` | Successful save of an edit / successful deletion |
| `signup_started` | Switching to CREATE ACCOUNT |
| `signup_completed` | Supabase accepts a new registration; `confirmation_required` distinguishes pending email confirmation; obfuscated duplicate registrations are excluded |
| `login_completed`, `logout` | Successful password login / signout |
| `guest_memories_import_started`, `guest_memories_import_completed` | Import attempt / successful completion with a count |
| `beta_feedback_submitted` | Feedback saves successfully |
| `returning_visitor` | Existing browser returns after at least 30 minutes since its last tracked interaction |

`momento_session_id` is a random UUID reused across browser visits, **not** a
unique person or a new session per visit. Storage failure falls back to memory
for the current page. Clearing browser storage creates a new identity. Cloud
first-memory uniqueness is enforced per user in the database across devices;
guest uniqueness uses a local flag and a database index. Existing guest journals
do not become new first-memory conversions. Cloud checks read only existing
memory IDs. Events are prospective; there is no historical backfill.

Funnel queries count browsers reaching milestones rather than requiring a fixed
order: guest memory creation may precede signup. Imported memories are new cloud
saves, separately identifiable with `source=import`; they do not imply new stories.
Signup acceptance is not email confirmation. Vercel Web Analytics remains enabled
and may report different counts due to blockers, visit definitions and best-effort delivery.

## Privacy and failure behavior

- Existing Supabase client only; no new trackers, fingerprinting or IP collection.
- Safe metadata is allowlisted in TypeScript **and database constraints**: source,
  mode, bounded counts, a confirmation boolean, and the four campaign slugs.
- No journal text, titles, locations, photo names/URLs, emails, passwords or bios.
- Respect browser Do Not Track and Global Privacy Control for these events.
- Asynchronous delivery with a five-second request timeout; failures are silent
  and never delay saving, authentication, imports or feedback. Delivery is best
  effort, so blocked requests and immediate navigation can omit events.
- Anonymous rows have a null user ID. Authenticated rows must match `auth.uid()`.
  Signout is recorded anonymously after successful signout. Browser ID connects
  it to the visit. Cloud account deletion cascades its associated event rows.
- Frontend roles have column-level INSERT only; SELECT, UPDATE and DELETE are
  denied. Clients cannot override timestamps. No SECURITY DEFINER functions.
- Guest and cloud first-memory milestones are separate identities; queries
  deduplicate browsers so a guest who signs up is counted once in visitor rates.

Anonymous public INSERT is necessary for guest telemetry. Bounds and identity
policies protect content/access, but browser-generated events are not an audited
business ledger; a visitor can forge their own allowed events.

## Verification

Use Node.js 22.18+ (or 24): `npm test`, `npm run typecheck`, `npm run build`.
The tests cover privacy, storage failures, first touch, return visits and first
guest conversion. `supabase/tests/analytics-security.sql` runs rollback-only
permission/constraint checks in the Supabase SQL Editor without saving fixtures.
