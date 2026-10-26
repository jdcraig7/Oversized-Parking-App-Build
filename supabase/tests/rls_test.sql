-- Security tests for spot_reports. Lines marked EXPECT FAIL should print an ERROR.
\set ON_ERROR_STOP 0
\pset footer off
insert into auth.users values ('11111111-1111-1111-1111-111111111111'), ('22222222-2222-2222-2222-222222222222');

-- Driver A
set role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', false);
insert into spot_reports (spot_id, user_id, clearance_m, price) values ('osm:way/1', '11111111-1111-1111-1111-111111111111', 2.10, '$5/hr');
-- upsert (same as supabase-js .upsert onConflict spot_id,user_id)
insert into spot_reports (spot_id, user_id, clearance_m, price, note) values ('osm:way/1', '11111111-1111-1111-1111-111111111111', 2.13, '$6/hr', 'low pipes L2')
  on conflict (spot_id, user_id) do update set clearance_m = excluded.clearance_m, price = excluded.price, note = excluded.note, spot_id = excluded.spot_id, user_id = excluded.user_id;
\echo EXPECT FAIL: spoof another user
insert into spot_reports (spot_id, user_id, clearance_m) values ('osm:way/1', '22222222-2222-2222-2222-222222222222', 1.6);
\echo EXPECT FAIL: unhide/hide own row
update spot_reports set hidden = true where spot_id = 'osm:way/1';
\echo EXPECT FAIL: bad spot id and bad clearance
insert into spot_reports (spot_id, user_id, clearance_m) values ('robert); drop', '11111111-1111-1111-1111-111111111111', 2);
insert into spot_reports (spot_id, user_id, clearance_m) values ('osm:way/2', '11111111-1111-1111-1111-111111111111', 40);

-- Driver B
select set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', false);
insert into spot_reports (spot_id, user_id, clearance_m) values ('osm:way/1', '22222222-2222-2222-2222-222222222222', 2.30);
\echo B sees only own rows (expect 1):
select count(*) from spot_reports;
\echo EXPECT DELETE 0: B deletes A report
delete from spot_reports where user_id = '11111111-1111-1111-1111-111111111111';
\echo EXPECT UPDATE 0: B edits A report
update spot_reports set price = 'hacked' where user_id = '11111111-1111-1111-1111-111111111111';

-- Logged out
reset role; set role anon;
select set_config('request.jwt.claim.sub', '', false);
\echo EXPECT FAIL or 0: anon reads raw table
select count(*) from spot_reports;
\echo Summary as anon (expect 2 reports, median 2.22, price $6/hr, note):
select * from get_spot_report_summaries(array['osm:way/1','osm:way/999']);
\echo EXPECT FAIL: anon calls trigger fn
select spot_reports_before_write();

-- Rate limit
reset role; set role authenticated;
select set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', false);
\echo EXPECT one Daily report limit reached error:
do $$ begin for i in 2..41 loop
  insert into spot_reports (spot_id, user_id, price) values ('osm:node/' || i, '22222222-2222-2222-2222-222222222222', 'free');
end loop; end $$;
select count(*) as b_rows_after_limit from spot_reports;

reset role;
\echo A report must be untouched by B (expect $6/hr):
select price from spot_reports where user_id = '11111111-1111-1111-1111-111111111111';
