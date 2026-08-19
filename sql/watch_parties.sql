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

    guest_user_id uuid
        references auth.users(id)
        on delete set null,

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
--
-- NOTE: If you already created the table WITHOUT guest_user_id,
-- add it with:
--
--   alter table watch_parties
--       add column guest_user_id uuid
--           references auth.users(id)
--           on delete set null;

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

-- =========================================================
-- ATOMIC GUEST SLOT CLAIM / RELEASE (race-safe)
-- =========================================================

-- Claim the guest slot for the calling user.
-- Returns the user_id of the successful claimant.
--   - If guest slot is empty: caller claims it, returns caller.
--   - If caller already owns the slot (reconnect): returns caller.
--   - If another user owns the slot: returns that other user_id (caller rejected).
-- Uses SELECT ... FOR UPDATE to serialize concurrent claims atomically.
create or replace function claim_guest_slot(p_room_code text, p_user_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
    v_guest uuid;
begin
    -- Only the authenticated caller may claim for themselves
    if p_user_id <> auth.uid() then
        return null;
    end if;

    select guest_user_id
      into v_guest
      from watch_parties
     where room_code = p_room_code
       for update;

    if not found then
        return null;
    end if;

    if v_guest is null or v_guest = p_user_id then
        update watch_parties
           set guest_user_id = p_user_id
         where room_code = p_room_code;
        return p_user_id;
    end if;

    return v_guest;
end;
$$;

revoke all on function claim_guest_slot(text, uuid) from public;
grant execute on function claim_guest_slot(text, uuid) to authenticated;

-- Release the guest slot, but only if it still belongs to the given user.
-- Can be called by the guest themselves, or by the party host.
-- Idempotent: no-op if guest_user_id doesn't match p_user_id.
create or replace function release_guest_slot(p_room_code text, p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
    -- Only the guest themselves or the host may release
    if not exists (
        select 1 from watch_parties
         where room_code = p_room_code
           and (host_user_id = auth.uid() or guest_user_id = auth.uid())
    ) then
        return;
    end if;

    update watch_parties
       set guest_user_id = null
     where room_code = p_room_code
       and guest_user_id = p_user_id;
end;
$$;

revoke all on function release_guest_slot(text, uuid) from public;
grant execute on function release_guest_slot(text, uuid) to authenticated;