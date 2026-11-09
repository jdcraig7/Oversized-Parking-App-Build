-- Driver photos of clearance signs and garage entrances.
--
-- Privacy and abuse design (same approach as spot_reports):
-- * Drivers sign in anonymously; photos are stored under their random user id.
-- * Anyone can see photos that aren't hidden. Drivers can add and delete only
--   their own, at most 20 a day.
-- * Any driver can report a photo; after 2 reports from different drivers it is
--   hidden automatically until someone reviews it (set hidden = false in the
--   Table Editor to restore, or delete it).

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('sign-photos', 'sign-photos', true, 3145728, array['image/jpeg', 'image/png', 'image/heic'])
on conflict (id) do nothing;

create table public.sign_photos (
  id uuid primary key default gen_random_uuid(),
  spot_id text not null check (spot_id ~ '^[a-z]+:[a-z]+/[0-9]+$' and char_length(spot_id) <= 64),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  -- Path inside the sign-photos bucket: <user_id>/<spot>/<file>.jpg
  path text not null check (char_length(path) <= 200),
  hidden boolean not null default false,
  created_at timestamptz not null default now()
);

create index sign_photos_spot_idx on public.sign_photos (spot_id, created_at desc) where not hidden;
create index sign_photos_user_recent_idx on public.sign_photos (user_id, created_at);

alter table public.sign_photos enable row level security;

create policy "see visible photos" on public.sign_photos
  for select to anon, authenticated using (not hidden or user_id = auth.uid());
create policy "add own photos" on public.sign_photos
  for insert to authenticated
  with check (user_id = auth.uid() and not hidden and path like auth.uid()::text || '/%');
create policy "delete own photos" on public.sign_photos
  for delete to authenticated using (user_id = auth.uid());

create function public.sign_photos_before_insert() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (select count(*) from public.sign_photos
      where user_id = new.user_id and created_at > now() - interval '1 day') >= 20 then
    raise exception 'Daily photo limit reached' using errcode = 'P0001';
  end if;
  new.created_at := now();
  new.hidden := false;
  return new;
end;
$$;

create trigger sign_photos_before_insert
  before insert on public.sign_photos
  for each row execute function public.sign_photos_before_insert();

-- Reports: one per driver per photo; 2 reports hide the photo.
create table public.sign_photo_flags (
  photo_id uuid not null references public.sign_photos (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (photo_id, user_id)
);
alter table public.sign_photo_flags enable row level security; -- no direct access; use report_sign_photo()

create function public.report_sign_photo(photo uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then
    raise exception 'Sign in required' using errcode = '42501';
  end if;
  insert into public.sign_photo_flags (photo_id, user_id) values (photo, auth.uid()) on conflict do nothing;
  update public.sign_photos set hidden = true
  where id = photo and (select count(*) from public.sign_photo_flags where photo_id = photo) >= 2;
end;
$$;
revoke all on function public.report_sign_photo(uuid) from public;
grant execute on function public.report_sign_photo(uuid) to authenticated;

-- Storage: public read; drivers upload and delete only inside their own folder.
create policy "sign photos are public" on storage.objects
  for select to anon, authenticated using (bucket_id = 'sign-photos');
create policy "upload own sign photos" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'sign-photos' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "delete own sign photos" on storage.objects
  for delete to authenticated
  using (bucket_id = 'sign-photos' and (storage.foldername(name))[1] = auth.uid()::text);
