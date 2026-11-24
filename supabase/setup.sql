-- Watch List: cloud sync tables. Run once in Supabase → SQL Editor → New query → Run.
-- Safe to re-run.

-- Who may edit. Everyone else can only view what is shared with them.
-- (Email changes require confirmation in Supabase, so the email is a stable identity.)
create or replace function public.watchlist_is_editor() returns boolean
language sql stable as $$
  select lower(coalesce(auth.jwt() ->> 'email', '')) in ('stephanie@bostonprivatetutors.com')
$$;

-- One row per owner holding their whole watch list.
create table if not exists public.watchlist_state (
  user_id     uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  owner_email text,
  data        jsonb not null,
  updated_at  timestamptz not null default now()
);

-- People an owner has shared their data with (view only).
create table if not exists public.watchlist_viewers (
  owner_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  viewer_email text not null,
  created_at   timestamptz not null default now(),
  primary key (owner_id, viewer_email)
);

-- Table access for signed-in users (newer projects don't grant this automatically).
-- Row-level security below still limits which rows each person can see or change.
grant usage on schema public to authenticated;
grant select, insert, update on public.watchlist_state   to authenticated;
grant select, insert, delete on public.watchlist_viewers to authenticated;
revoke all on public.watchlist_state, public.watchlist_viewers from anon;

alter table public.watchlist_state   enable row level security;
alter table public.watchlist_viewers enable row level security;

-- Owners: full access to their own row.
drop policy if exists "owner reads own"   on public.watchlist_state;
drop policy if exists "owner inserts own" on public.watchlist_state;
drop policy if exists "owner updates own" on public.watchlist_state;
create policy "owner reads own"   on public.watchlist_state for select to authenticated using (auth.uid() = user_id);
create policy "owner inserts own" on public.watchlist_state for insert to authenticated
  with check (auth.uid() = user_id and public.watchlist_is_editor());
create policy "owner updates own" on public.watchlist_state for update to authenticated
  using (auth.uid() = user_id and public.watchlist_is_editor()) with check (auth.uid() = user_id and public.watchlist_is_editor());

-- Viewers: read-only access to rows shared with their (verified) email.
drop policy if exists "viewers read shared" on public.watchlist_state;
create policy "viewers read shared" on public.watchlist_state for select to authenticated using (
  exists (
    select 1 from public.watchlist_viewers v
    where v.owner_id = watchlist_state.user_id
      and lower(v.viewer_email) = lower(auth.jwt() ->> 'email')
  )
);

-- Owners manage their own viewer list; viewers can see the grants made to them.
drop policy if exists "owner manages viewers" on public.watchlist_viewers;
drop policy if exists "viewer sees own grants" on public.watchlist_viewers;
create policy "owner manages viewers" on public.watchlist_viewers for all to authenticated
  using (auth.uid() = owner_id and public.watchlist_is_editor()) with check (auth.uid() = owner_id and public.watchlist_is_editor());
create policy "viewer sees own grants" on public.watchlist_viewers for select to authenticated
  using (lower(viewer_email) = lower(auth.jwt() ->> 'email'));
