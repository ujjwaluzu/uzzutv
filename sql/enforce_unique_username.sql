-- =========================================================
-- Enforce unique usernames (stored in auth.users raw_user_meta_data)
-- Run this in: Supabase Dashboard -> SQL Editor
-- Safe to run multiple times (idempotent).
-- =========================================================

create or replace function public.enforce_unique_username()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  new_username text := nullif(btrim(coalesce(NEW.raw_user_meta_data->>'username', '')), '');
begin
  if new_username is not null then
    if exists (
      select 1
      from auth.users
      where id <> NEW.id
        and btrim(coalesce(raw_user_meta_data->>'username', '')) = new_username
    ) then
      raise exception 'Username already taken';
    end if;
  end if;
  return NEW;
end;
$$;

drop trigger if exists enforce_unique_username_trigger on auth.users;

create trigger enforce_unique_username_trigger
before insert on auth.users
for each row execute function public.enforce_unique_username();