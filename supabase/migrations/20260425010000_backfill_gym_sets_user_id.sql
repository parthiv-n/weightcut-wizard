-- Backfill user_id on legacy gym_sets rows that were inserted before user_id was
-- consistently populated by the client. RLS scopes by auth.uid() = user_id, so
-- NULL rows are invisible to the owner and exclude valid history from charts.
update public.gym_sets s
set user_id = sess.user_id
from public.gym_sessions sess
where s.session_id = sess.id
  and s.user_id is null;
