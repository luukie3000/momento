-- MOMENTO PRIVATE CLOUD / v1
-- Paste this into the SQL Editor of YOUR Supabase project, then run it once.
-- Never expose the service_role key in client-side code.

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '' check (char_length(display_name) <= 60),
  bio text not null default '' check (char_length(bio) <= 240),
  updated_at timestamptz not null default now()
);
create table if not exists public.memories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 90),
  body text not null default '' check (char_length(body) <= 20000),
  memory_date date not null default current_date,
  location text not null default '' check (char_length(location) <= 140),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists memories_user_date_idx on public.memories (user_id, memory_date desc);
create table if not exists public.memory_photos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  memory_id uuid not null references public.memories(id) on delete cascade,
  object_path text not null unique,
  file_name text not null check(char_length(file_name) <= 255),
  created_at timestamptz not null default now()
);
create index if not exists memory_photos_memory_idx on public.memory_photos (memory_id);
create table if not exists public.beta_feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  rating smallint not null check(rating between 1 and 5),
  message text not null check(char_length(message) between 5 and 2000),
  created_at timestamptz not null default now()
);
create index if not exists beta_feedback_user_idx on public.beta_feedback (user_id, created_at desc);

alter table public.profiles enable row level security;
alter table public.memories enable row level security;
alter table public.memory_photos enable row level security;
alter table public.beta_feedback enable row level security;

create policy "Profile read by owner" on public.profiles for select to authenticated using ((select auth.uid()) = id);
create policy "Profile update by owner" on public.profiles for update to authenticated using ((select auth.uid()) = id) with check ((select auth.uid()) = id);
create policy "Profile insert by owner" on public.profiles for insert to authenticated with check ((select auth.uid()) = id);
create policy "Memories read by owner" on public.memories for select to authenticated using ((select auth.uid()) = user_id);
create policy "Memories insert by owner" on public.memories for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "Memories update by owner" on public.memories for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "Memories delete by owner" on public.memories for delete to authenticated using ((select auth.uid()) = user_id);
create policy "Photos read by owner" on public.memory_photos for select to authenticated using ((select auth.uid()) = user_id);
create policy "Photos insert into own memories" on public.memory_photos for insert to authenticated with check (
  (select auth.uid()) = user_id and exists (select 1 from public.memories m where m.id = memory_id and m.user_id = (select auth.uid()))
);
create policy "Photos delete by owner" on public.memory_photos for delete to authenticated using ((select auth.uid()) = user_id);
create policy "Beta feedback insert by author" on public.beta_feedback for insert to authenticated with check ((select auth.uid()) = user_id);
-- No SELECT policy on beta_feedback: visitors cannot browse anyone else's responses.

-- Give freshly registered users a private profile automatically.
create or replace function public.create_momento_profile() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles(id,display_name)
    values(new.id,left(coalesce(new.raw_user_meta_data->>'display_name',''),60))
    on conflict(id) do nothing;
  return new;
end;
$$;
drop trigger if exists create_momento_profile_on_signup on auth.users;
create trigger create_momento_profile_on_signup after insert on auth.users for each row execute function public.create_momento_profile();

-- Private object storage. Each user's uploads live under <auth.uid()>/<memory-id>/.
insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('memory-photos','memory-photos',false,12582912,ARRAY['image/jpeg','image/png','image/webp'])
on conflict(id) do update set public=false, file_size_limit=12582912,allowed_mime_types=ARRAY['image/jpeg','image/png','image/webp'];
create policy "Read own memory photos" on storage.objects for select to authenticated
using(bucket_id='memory-photos' and (storage.foldername(name))[1]=(select auth.uid())::text);
create policy "Upload own memory photos" on storage.objects for insert to authenticated
with check(bucket_id='memory-photos' and (storage.foldername(name))[1]=(select auth.uid())::text);
create policy "Delete own memory photos" on storage.objects for delete to authenticated
using(bucket_id='memory-photos' and (storage.foldername(name))[1]=(select auth.uid())::text);

create or replace function public.update_timestamp() returns trigger language plpgsql set search_path = '' as $$
begin new.updated_at=now();return new;end;$$;
drop trigger if exists memories_updated_at on public.memories;
create trigger memories_updated_at before update on public.memories for each row execute function public.update_timestamp();
drop trigger if exists profiles_updated_at on public.profiles;
create trigger profiles_updated_at before update on public.profiles for each row execute function public.update_timestamp();
