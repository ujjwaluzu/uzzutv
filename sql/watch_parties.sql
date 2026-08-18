-- =========================================================
-- UzzUTV Watch Party - Stage 1
-- Run this in the Supabase SQL Editor (Dashboard > SQL Editor).
-- Uses only RLS + auth.uid(); no service-role key is required
-- anywhere in the app.
-- =========================================================

-- ---------- TABLE ----------

create table watch_parties (
    id uuid primary key default gen_random_uuid(),

    room_code text not null unique,

    host_user_id uuid not null
        references auth.users(id)
        on delete cascade,

    media_id int not null,

    media_type text not null
        check (media_type in ('movie', 'tv')),

    season int,

    episode int,

    created_at timestamptz default now(),

    expires_at timestamptz default (now() + interval '24 hours')
);

-- NOTE: If you already created the table WITHOUT season/episode
-- (e.g. an earlier draft of this schema), add the missing columns:
--
--   alter table watch_parties
--       add column season int,
--       add column episode int;

-- ---------- ROW LEVEL SECURITY ----------

alter table watch_parties enable row level security;

-- Authenticated users can create their own party
create policy "Users can create their own party"
    on watch_parties for insert
    to authenticated
    with check (host_user_id = auth.uid());

-- Authenticated users can read party information
create policy "Authenticated users can read parties"
    on watch_parties for select
    to authenticated
    using (true);

-- Users can delete their own party only
create policy "Users can delete their own party"
    on watch_parties for delete
    to authenticated
    using (host_user_id = auth.uid());