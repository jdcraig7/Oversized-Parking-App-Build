-- Sponsored listings: businesses that pay to be featured in a city's results.
--
-- You add and edit sponsors yourself in the Supabase Table Editor; the app can
-- only read active listings near a search and add to their view/tap counts.
--
-- Two kinds:
-- * 'spot'     a parking place (garage, lot, truck stop). Shown only to drivers
--              whose vehicle fits, so clearance_m (or open_air) must be set.
-- * 'business' a related business (lift shop, RV park, tire shop). Shown as a
--              card; it never claims to be parking.

create table public.sponsored_listings (
  id uuid primary key default gen_random_uuid(),
  sponsor_name text not null,                  -- who pays (for your records)
  kind text not null check (kind in ('spot', 'business')),
  -- Links the listing to the OpenStreetMap spot it promotes, so the app shows
  -- the same spot (with its data) instead of a duplicate. Optional.
  spot_id text check (spot_id ~ '^[a-z]+:[a-z]+/[0-9]+$'),
  title text not null check (char_length(title) between 1 and 80),
  tagline text check (char_length(tagline) <= 140),   -- e.g. "8'2\" clearance, 40 oversized spaces"
  offer text check (char_length(offer) <= 140),       -- e.g. "Free shower with 50 gal diesel"
  category text check (char_length(category) <= 40),  -- e.g. "Truck stop", "Lift & tire shop"
  latitude double precision not null check (latitude between -90 and 90),
  longitude double precision not null check (longitude between -180 and 180),
  address text check (char_length(address) <= 200),
  phone text check (char_length(phone) <= 40),
  website text check (website ~ '^https://'),
  price text check (char_length(price) <= 120),
  hours text check (char_length(hours) <= 120),
  clearance_m numeric(4, 2) check (clearance_m between 1.5 and 10),
  open_air boolean not null default false,     -- no overhead limit at all
  -- Searches whose center is within this distance see the listing.
  target_radius_m integer not null default 16000 check (target_radius_m between 500 and 200000),
  starts_on date not null default current_date,
  ends_on date,                                -- leave empty for open-ended
  active boolean not null default true,        -- pause without deleting
  weight integer not null default 1 check (weight between 1 and 100), -- share when several compete
  created_at timestamptz not null default now(),
  check (kind = 'business' or clearance_m is not null or open_air),
  check (ends_on is null or ends_on >= starts_on)
);

alter table public.sponsored_listings enable row level security;
-- No policies: the app never reads this table directly (only through the function below).
revoke all on public.sponsored_listings from anon, authenticated;

-- Listings active today whose target area covers the search center.
create function public.get_sponsored_listings(lat double precision, lon double precision)
returns table (
  id uuid, kind text, spot_id text, title text, tagline text, offer text, category text,
  latitude double precision, longitude double precision, address text, phone text, website text,
  price text, hours text, clearance_m numeric, open_air boolean, weight integer
)
language sql stable security definer set search_path = public as $$
  select s.id, s.kind, s.spot_id, s.title, s.tagline, s.offer, s.category,
         s.latitude, s.longitude, s.address, s.phone, s.website,
         s.price, s.hours, s.clearance_m, s.open_air, s.weight
  from public.sponsored_listings s
  where s.active
    and current_date >= s.starts_on
    and (s.ends_on is null or current_date <= s.ends_on)
    -- Distance in meters (equirectangular approximation, accurate at these scales).
    and 6371000 * sqrt(
          power(radians(s.latitude - lat), 2) +
          power(radians(s.longitude - lon) * cos(radians((s.latitude + lat) / 2)), 2)
        ) <= s.target_radius_m
  limit 50;
$$;

-- Daily view and tap counts per listing, for sponsor reports.
create table public.sponsor_stats (
  listing_id uuid not null references public.sponsored_listings (id) on delete cascade,
  day date not null default current_date,
  views integer not null default 0,
  taps integer not null default 0,
  primary key (listing_id, day)
);
alter table public.sponsor_stats enable row level security;
revoke all on public.sponsor_stats from anon, authenticated;

-- The app reports what it showed. Counts are capped per call so one device
-- can't inflate a sponsor's numbers much.
create function public.record_sponsor_events(listing_ids uuid[], event text)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if event not in ('view', 'tap') then
    raise exception 'unknown event %', event using errcode = '22023';
  end if;
  insert into public.sponsor_stats as st (listing_id, day, views, taps)
  select l.id, current_date,
         case when event = 'view' then 1 else 0 end,
         case when event = 'tap' then 1 else 0 end
  from (select distinct unnest(listing_ids[1:10]) as id) ids
  join public.sponsored_listings l on l.id = ids.id
  on conflict (listing_id, day) do update
    set views = st.views + excluded.views,
        taps = st.taps + excluded.taps;
end;
$$;

-- Monthly report to send each sponsor (run in the SQL Editor):
--   select l.sponsor_name, l.title, date_trunc('month', s.day)::date as month,
--          sum(s.views) as views, sum(s.taps) as taps
--   from sponsor_stats s join sponsored_listings l on l.id = s.listing_id
--   group by 1, 2, 3 order by 3 desc, 1;

revoke all on function public.get_sponsored_listings(double precision, double precision) from public;
revoke all on function public.record_sponsor_events(uuid[], text) from public;
grant execute on function public.get_sponsored_listings(double precision, double precision) to anon, authenticated;
grant execute on function public.record_sponsor_events(uuid[], text) to anon, authenticated;
