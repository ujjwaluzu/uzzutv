-- =========================================================
-- 1) Verify the trigger is active (should return 1 row)
-- =========================================================

select tgname
from pg_trigger
where tgname = 'enforce_unique_username_trigger';

-- =========================================================
-- 2) Find existing accounts that already share a username
--    The trigger only prevents NEW duplicates; existing ones
--    must be cleaned up manually if you want them removed.
-- =========================================================

select
  raw_user_meta_data->>'username' as username,
  count(*) as accounts
from auth.users
where raw_user_meta_data->>'username' is not null
  and btrim(raw_user_meta_data->>'username') <> ''
group by 1
having count(*) > 1;

-- =========================================================
-- 3) List every account (id, email, username, created_at)
--    Use this to pick which duplicate to delete or rename.
-- =========================================================

select
  id,
  email,
  raw_user_meta_data->>'username' as username,
  created_at
from auth.users
where raw_user_meta_data->>'username' is not null
order by raw_user_meta_data->>'username', created_at;