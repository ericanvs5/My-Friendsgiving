-- =====================================================================
-- Friendsgiving: Supabase setup
-- Paste this whole file into Supabase → SQL Editor → "Run".
-- It is safe to run more than once.
-- =====================================================================

-- 1) The table that holds every guest's sign-up --------------------------
create table if not exists public.guests (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  name        text not null check (char_length(name) between 1 and 40),
  dish        text not null check (char_length(dish) between 1 and 60),
  category    text not null check (category in ('Appetizer', 'Main', 'Side', 'Dessert', 'Drinks')),
  photo_url   text check (photo_url is null or char_length(photo_url) <= 500)
);

-- 2) Security: anyone with the website can READ the list and ADD themselves,
--    but nobody can edit or delete other people's entries from the website.
alter table public.guests enable row level security;

drop policy if exists "Anyone can view guests" on public.guests;
create policy "Anyone can view guests"
  on public.guests for select
  to anon, authenticated
  using (true);

drop policy if exists "Anyone can sign up" on public.guests;
create policy "Anyone can sign up"
  on public.guests for insert
  to anon, authenticated
  with check (true);

grant select, insert on public.guests to anon, authenticated;

-- 3) Live updates: new sign-ups appear on everyone's screen without refresh
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'guests'
  ) then
    alter publication supabase_realtime add table public.guests;
  end if;
end $$;

-- 4) Photo storage: a public bucket for guest icons (max 2 MB, images only)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('guest-photos', 'guest-photos', true, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public             = excluded.public,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Anyone can upload a guest photo" on storage.objects;
create policy "Anyone can upload a guest photo"
  on storage.objects for insert
  to anon, authenticated
  with check (bucket_id = 'guest-photos');
