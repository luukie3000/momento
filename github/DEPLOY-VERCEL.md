# Deploy MOMENTO on Vercel

1. Create/import a Vercel project from the **momento** root directory (which contains `package.json`).
2. Framework: **Vite**; build command: `npm run build`; output directory: `dist`.
3. Optional (required for real user accounts, cross-device memories, and beta feedback): add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in Vercel project environment variables. Use only the **public anon/publishable** key, never the service-role key.
4. Apply `supabase/schema.sql` to your Supabase project and configure your production URL in Supabase Auth redirect URLs before enabling real users. RLS policies should be checked in Supabase before launch.
5. With no Supabase environment variables, MOMENTO is **guest-only**: memories are saved locally in the current browser and are **not synchronized across devices**. This is suitable as a design preview, not as the promised cloud beta.

Source images are served from `public/`. The animated opening video remains a locally bundled asset. No API secrets are included in this bundle.
