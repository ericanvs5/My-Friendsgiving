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

-- Lets guests remove their own entry. The browser keeps a secret "remove code";
-- only a scrambled (SHA-256) copy of it is stored here.
alter table public.guests add column if not exists delete_token_hash text;

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

grant insert on public.guests to anon, authenticated;
-- Visitors can read every column EXCEPT the scrambled remove code.
revoke select on public.guests from anon, authenticated;
grant select (id, created_at, name, dish, category, photo_url) on public.guests to anon, authenticated;

-- 2b) "Remove my entry": deletes a guest only when the correct remove code is given.
create or replace function public.delete_my_guest(guest_id uuid, token text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  removed integer;
begin
  delete from public.guests
  where id = guest_id
    and delete_token_hash is not null
    and delete_token_hash = encode(sha256(convert_to(token, 'UTF8')), 'hex');
  get diagnostics removed = row_count;
  return removed > 0;
end;
$$;

revoke all on function public.delete_my_guest(uuid, text) from public;
grant execute on function public.delete_my_guest(uuid, text) to anon, authenticated;

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

-- When a guest removes their entry, their photo can be cleaned up too.
-- Only photos that no guest entry uses anymore can be deleted.
drop policy if exists "Anyone can see guest photo files" on storage.objects;
create policy "Anyone can see guest photo files"
  on storage.objects for select
  to anon, authenticated
  using (bucket_id = 'guest-photos');

drop policy if exists "Anyone can remove photos no longer in use" on storage.objects;
create policy "Anyone can remove photos no longer in use"
  on storage.objects for delete
  to anon, authenticated
  using (
    bucket_id = 'guest-photos'
    and not exists (
      select 1 from public.guests g
      where g.photo_url like '%/' || objects.name
    )
  );
