# MOMENTO — private memory journal / beta starter

This is the upgraded React + TypeScript + Vite version of MOMENTO. It preserves the supplied animated Wandor-style illustrated **hero** and all **nine static, custom hand-drawn illustrations** across the rest of the website. It adds an editable journal, five-photo memories, optional real accounts, private cloud sync, profile management, and a beta feedback form.

## Try it locally (no account or keys)

Requires Node 20.19+ or Node 22.12+.

```sh
npm install
npm run dev
```

Open the address printed by Vite, typically `http://localhost:5173`. Without the optional Supabase environment variables, the app opens in **guest demo mode**. Create memories, attach JPG/PNG/WebP photos (up to five per entry), edit/delete, search, filter and sort. Guest memories are stored locally in browser IndexedDB, not sent to a server. If IndexedDB is unavailable, the app uses browser localStorage; browser quotas may limit large images. Previous `momento-memories-v1` guest entries are migrated on the same origin when possible.

The standalone `momento-preview.html` is an independent **guest-only** browser preview. It cannot sign in or sync until you run the configured React project. Do not treat it as a cloud-connected beta.

## Enable real accounts and private cloud sync

The client is written using the [Supabase JavaScript SDK](https://supabase.com/docs/reference/javascript/introduction), Supabase Auth, Postgres Row Level Security (RLS), and private object Storage.

1. Create **your own** free Supabase project at [Supabase](https://supabase.com). No credentials or project have been created for you.
2. Open the project **SQL Editor**, then paste and run `supabase/schema.sql`. It creates the `profiles`, `memories`, `memory_photos` and `beta_feedback` tables, owner-only RLS policies, signup profile trigger, and the **private** `memory-photos` bucket with owner-only upload/read/delete permissions. Do not manually switch the bucket to public.
3. Copy `.env.example` to `.env.local` and fill in your actual **Project URL** and **publishable/anon** public key from Project Settings → API. **NEVER** put `service_role`, database passwords, or other privileged keys in client-side environment variables.
4. In Supabase **Authentication → URL configuration**, set the **Site URL** to your local Vite URL and add the localhost URL in **Redirect URLs** while testing. Add your deployed domain later. If email verification is enabled, test the signup confirmation email before inviting users. Supabase's default email delivery is restricted for production; configure a suitable email sender for beta signups.
5. Restart `npm run dev` after setting environment variables. The top navigation **Sign In** opens registration/login and personal profile. After login you can **explicitly import existing local guest drafts**; the app removes each guest draft only after a confirmed cloud save, so interrupted imports can be resumed without silent loss.
6. Use a separate browser/profile or device to verify that the same account sees its entries and privately signed photo URLs. Signed image URLs expire after one hour and are refreshed when journal data is reloaded. No public gallery of users' photos is enabled.

### What is stored and where?

| Area | Guest mode | Connected mode |
|---|---|---|
| Written memories and dates | This device's IndexedDB | `memories` with per-owner RLS |
| JPEG image versions (resized on-device to max 1600 px) | IndexedDB, fallback to localStorage | Private `memory-photos` bucket and `memory_photos` table |
| Profiles | Not available | Supabase Auth + `profiles` table |
| Beta feedback | Sign-in prompt | Authenticated-only inserts to `beta_feedback`, no public feedback read policy |

**Security notes:** client-only storage should not be described as encrypted or a secure backup. Anyone using an unlocked computer or the same browser profile can view guest entries. Configure Supabase access policies and perform an independent security review before a production public release. Confirm that users can access only their own memories, that cleanup works for deleted photos and that you have a suitable privacy policy and data-retention approach. Avoid exposing a service-role key or disabling RLS.

## Free beta launch checklist (deployment is not automated)

- Run `npm run typecheck` and `npm run build` on a machine that has downloaded the dependencies.
- Configure real Supabase email signups and verify email deliverability.
- Manually test create, read, update and delete from two separate users (ensure they **cannot** see each other's profiles, memories or photos).
- Upload 1–5 photographs per memory and verify that the user can remove some or all of them.
- Verify local guest-to-cloud import, interrupted import recovery and sync from another device.
- Create a **free** static Vite deployment on a host that supports Vite, such as Cloudflare Pages, Netlify, or Vercel. The build command is `npm run build`, publish directory `dist`, and the two `VITE_` variables belong in the host's environment variable settings. Add your production URL in Supabase auth settings. Hosting/domain/bandwidth quotas vary by provider; check before a public beta.
- Invite initial users to create free accounts and submit beta feedback through the integrated form. Review their feedback privately in the project's SQL dashboard (`beta_feedback`). For broader public launch, add rate limits/abuse protection, password recovery, proper account deletion/data export, monitoring, accessibility QA, privacy policy/terms, and appropriate legal reviews.

**Status:** Full client and SQL schema are included, but there is no connected Supabase project or deployed public beta provided with this download. Online accounts/sync/feedback are contingent on the configuration above. The old illustrated hero video comes from an external host and may fail; a bundled local loop is included as fallback.

## Project structure

- `src/components/Hero.tsx` — original homepage artwork, glass hero composer, landing sections and entry points.
- `src/components/MemoryStudio.tsx` — add/edit/detail/search/filter/sort journal with up to five photos.
- `src/components/AccountDialog.tsx` — login, registration, profile, explicit guest-to-cloud import.
- `src/components/BetaDialog.tsx` — authenticated early-beta feedback form.
- `src/hooks/useMomento.ts` — client state and guest/cloud selection.
- `src/lib/momento.ts` — IndexedDB guest persistence, photo optimization, Supabase cloud data/storage access.
- `supabase/schema.sql` — tables, signup profile trigger, RLS and private bucket.

## Visual assets

The original Wandor animated hero remains unchanged. Subsequent sections use the nine custom illustrated still images already in `public/` (journal, map, time capsule, window, memory wall, terrace, journey map, keepsake shelf and sunset time capsule) without zoom animations.
