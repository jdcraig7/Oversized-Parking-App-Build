-- Tests for sponsored listings. Lines marked EXPECT FAIL should print an ERROR.
\set ON_ERROR_STOP 0
\pset footer off

-- As the owner (Table Editor): Denver garage, Denver lift shop, an expired one,
-- a paused one, and one in Chicago.
insert into sponsored_listings (id, sponsor_name, kind, title, latitude, longitude, clearance_m, target_radius_m)
  values ('00000000-0000-0000-0000-000000000001', 'Acme Parking', 'spot', 'Acme Tall Garage', 39.7392, -104.9903, 2.60, 16000);
insert into sponsored_listings (id, sponsor_name, kind, title, category, latitude, longitude)
  values ('00000000-0000-0000-0000-000000000002', 'Lift Bros', 'business', 'Lift Bros', 'Lift & tire shop', 39.70, -105.02);
insert into sponsored_listings (sponsor_name, kind, title, latitude, longitude, open_air, starts_on, ends_on)
  values ('Old', 'spot', 'Expired lot', 39.74, -104.99, true, '2026-01-01', '2026-02-01');
insert into sponsored_listings (sponsor_name, kind, title, latitude, longitude, open_air, active)
  values ('Paused', 'spot', 'Paused lot', 39.74, -104.99, true, false);
insert into sponsored_listings (sponsor_name, kind, title, latitude, longitude, open_air)
  values ('Windy', 'spot', 'Chicago lot', 41.88, -87.63, true);
\echo EXPECT FAIL: spot sponsor without clearance
insert into sponsored_listings (sponsor_name, kind, title, latitude, longitude) values ('Bad', 'spot', 'No clearance', 39.7, -105);
\echo EXPECT FAIL: non-https website
insert into sponsored_listings (sponsor_name, kind, title, latitude, longitude, website) values ('Bad', 'business', 'X', 39.7, -105, 'http://x.com');

set role anon;
\echo From downtown Denver (expect Acme Tall Garage and Lift Bros only):
select title from get_sponsored_listings(39.7392, -104.9903) order by title;
\echo From 30 km away (expect none: outside 16 km targeting):
select title from get_sponsored_listings(39.7392, -104.64) order by title;
\echo EXPECT FAIL: anon reads raw tables
select count(*) from sponsored_listings;
select count(*) from sponsor_stats;

select record_sponsor_events(array['00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002']::uuid[], 'view');
select record_sponsor_events(array['00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001']::uuid[], 'view');
select record_sponsor_events(array['00000000-0000-0000-0000-000000000001']::uuid[], 'tap');
\echo EXPECT FAIL: unknown event
select record_sponsor_events(array['00000000-0000-0000-0000-000000000001']::uuid[], 'click');
-- Unknown ids are ignored, not errors.
select record_sponsor_events(array['00000000-0000-0000-0000-0000000000ff']::uuid[], 'view');

reset role;
\echo Stats (expect Acme 2 views 1 tap, Lift Bros 1 view 0 taps):
select l.title, s.views, s.taps from sponsor_stats s join sponsored_listings l on l.id = s.listing_id order by l.title;
