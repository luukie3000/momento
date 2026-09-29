# MOMENTO

The MOMENTO memory-journal app. Production source is packaged separately while initial Vercel setup is in progress.

Deployment checklist:
1. Upload the React + Vite source from `momento-vercel-ready.zip` into this repository (contents of the `momento/` folder, not the ZIP itself).
2. Import `luukie3000/momento` in Vercel as a Vite project (`npm run build`, output `dist`).
3. For real accounts and cloud-synced memories, provision the Supabase schema and configure `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in Vercel's environment settings.

Do not commit secrets. Guest-mode demonstration uses browser-local storage.
