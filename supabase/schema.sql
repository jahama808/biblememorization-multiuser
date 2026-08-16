-- Scripture Memory — user data only.
-- Paste this into the Supabase SQL Editor (or apply via `supabase db push`).
-- Do not store a full-Bible verse cache. Translation text is fetched from API.Bible.

create extension if not exists "pgcrypto";

create schema if not exists private;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table if not exists public.user_profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  timezone text not null default 'Pacific/Honolulu',
  created_at timestamptz not null default now()
);

create table if not exists public.book_selections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  book_name text not null,
  translation_id text not null,
  translation_name text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create unique index if not exists book_selections_one_active_per_user
  on public.book_selections (user_id)
  where is_active;

create index if not exists book_selections_user_id_idx
  on public.book_selections (user_id);

create table if not exists public.chunks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  book_selection_id uuid not null references public.book_selections (id) on delete cascade,
  start_verse text not null,
  end_verse text not null,
  verse_text text not null,
  display_order integer not null,
  word_count integer not null,
  created_at timestamptz not null default now(),
  unique (book_selection_id, display_order)
);

create index if not exists chunks_user_book_idx
  on public.chunks (user_id, book_selection_id, display_order);

create table if not exists public.memorization_trackers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  chunk_id uuid not null references public.chunks (id) on delete cascade,
  phase text not null check (phase in ('DAILY', 'WEEKLY', 'QUARTERLY')),
  week_started date not null,
  phase_start_date date,
  graduated_to_weekly boolean not null default false,
  graduated_to_quarterly boolean not null default false,
  review_day_of_week integer check (review_day_of_week between 0 and 6),
  quarterly_review_sunday date,
  created_at timestamptz not null default now(),
  unique (chunk_id)
);

create index if not exists memorization_trackers_user_phase_idx
  on public.memorization_trackers (user_id, phase);

create table if not exists public.daily_completions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  chunk_id uuid not null references public.chunks (id) on delete cascade,
  completed_date date not null,
  phase_at_completion text not null check (phase_at_completion in ('DAILY', 'WEEKLY', 'QUARTERLY')),
  session_number integer not null default 1,
  created_at timestamptz not null default now(),
  unique (user_id, chunk_id, completed_date, session_number)
);

create index if not exists daily_completions_user_date_idx
  on public.daily_completions (user_id, completed_date);

-- ---------------------------------------------------------------------------
-- New-user profile (default timezone Pacific/Honolulu)
-- Kept in a private schema because it is SECURITY DEFINER.
-- ---------------------------------------------------------------------------

create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.user_profiles (id, timezone)
  values (new.id, 'Pacific/Honolulu')
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();

-- ---------------------------------------------------------------------------
-- Row Level Security — each user can only read/write their own rows
-- ---------------------------------------------------------------------------

alter table public.user_profiles enable row level security;
alter table public.book_selections enable row level security;
alter table public.chunks enable row level security;
alter table public.memorization_trackers enable row level security;
alter table public.daily_completions enable row level security;

drop policy if exists "profiles_select_own" on public.user_profiles;
drop policy if exists "profiles_insert_own" on public.user_profiles;
drop policy if exists "profiles_update_own" on public.user_profiles;

create policy "profiles_select_own"
  on public.user_profiles for select
  to authenticated
  using (id = auth.uid());

create policy "profiles_insert_own"
  on public.user_profiles for insert
  to authenticated
  with check (id = auth.uid());

create policy "profiles_update_own"
  on public.user_profiles for update
  to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

drop policy if exists "book_selections_all_own" on public.book_selections;
create policy "book_selections_all_own"
  on public.book_selections for all
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "chunks_all_own" on public.chunks;
create policy "chunks_all_own"
  on public.chunks for all
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "trackers_all_own" on public.memorization_trackers;
create policy "trackers_all_own"
  on public.memorization_trackers for all
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "completions_all_own" on public.daily_completions;
create policy "completions_all_own"
  on public.daily_completions for all
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

grant usage on schema public to authenticated;
grant select, insert, update, delete on public.user_profiles to authenticated;
grant select, insert, update, delete on public.book_selections to authenticated;
grant select, insert, update, delete on public.chunks to authenticated;
grant select, insert, update, delete on public.memorization_trackers to authenticated;
grant select, insert, update, delete on public.daily_completions to authenticated;
