-- Shared driver reports: clearance, price and notes people saw on site.
--
-- Privacy and abuse design:
-- * Drivers sign in anonymously (no email); each device gets a random user id.
-- * The raw table is NOT publicly readable. The app reads per-spot summaries
--   through get_spot_report_summaries(), which never exposes who reported what.
-- * One report per driver per spot (editing replaces it), and a daily cap.
-- * Set hidden = true on a row (Table Editor) to remove spam from summaries.

create table public.spot_reports (
  id uuid primary key default gen_random_uuid(),
  spot_id text not null check (spot_id ~ '^[a-z]+:[a-z]+/[0-9]+$' and char_length(spot_id) <= 64),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  clearance_m numeric(4, 2) check (clearance_m between 1.5 and 10),
  price text check (char_length(price) between 1 and 120),
  note text check (char_length(note) between 1 and 300),
  hidden boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (spot_id, user_id),
  check (clearance_m is not null or price is not null or note is not null)
);

create index spot_reports_spot_id_idx on public.spot_reports (spot_id) where not hidden;
create index spot_reports_user_recent_idx on public.spot_reports (user_id, created_at);

alter table public.spot_reports enable row level security;

-- Drivers can see, add, change and delete only their own reports.
create policy "read own reports" on public.spot_reports
  for select to authenticated using (user_id = auth.uid());
create policy "add own reports" on public.spot_reports
  for insert to authenticated with check (user_id = auth.uid() and not hidden);
create policy "edit own reports" on public.spot_reports
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "delete own reports" on public.spot_reports
  for delete to authenticated using (user_id = auth.uid());

-- Drivers can't un-hide a moderated report. (spot_id/user_id are listed because
-- upserts resend them; the policies above stop changing them to someone else's.)
revoke update on public.spot_reports from authenticated;
grant update (spot_id, user_id, clearance_m, price, note) on public.spot_reports to authenticated;

create function public.spot_reports_before_write() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    if (select count(*) from public.spot_reports
        where user_id = new.user_id and created_at > now() - interval '1 day') >= 40 then
      raise exception 'Daily report limit reached' using errcode = 'P0001';
    end if;
    new.created_at := now();
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create trigger spot_reports_before_write
  before insert or update on public.spot_reports
  for each row execute function public.spot_reports_before_write();

-- Per-spot summary for up to 500 spots at a time.
-- Median clearance (not min or latest) so one wrong report can't swing a spot.
create function public.get_spot_report_summaries(spot_ids text[])
returns table (
  spot_id text,
  report_count int,
  clearance_reports int,
  median_clearance_m numeric,
  latest_price text,
  latest_price_at timestamptz,
  recent_notes text[],
  last_report_at timestamptz
)
language sql stable security definer set search_path = public as $$
  select
    r.spot_id,
    count(*)::int,
    count(r.clearance_m)::int,
    round((percentile_cont(0.5) within group (order by r.clearance_m))::numeric, 2),
    (array_agg(r.price order by r.updated_at desc) filter (where r.price is not null))[1],
    max(r.updated_at) filter (where r.price is not null),
    coalesce((array_agg(r.note order by r.updated_at desc) filter (where r.note is not null))[1:3], '{}'),
    max(r.updated_at)
  from public.spot_reports r
  where r.spot_id = any (spot_ids[1:500])
    and not r.hidden
    and r.updated_at > now() - interval '3 years'
  group by r.spot_id;
$$;

revoke all on function public.get_spot_report_summaries(text[]) from public;
grant execute on function public.get_spot_report_summaries(text[]) to anon, authenticated;
revoke all on function public.spot_reports_before_write() from public, anon, authenticated;
