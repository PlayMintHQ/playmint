-- Cleanup of stray "PlayMint Core" rows (client report 2026-11-04).
--
-- NOT a migration — kept outside supabase/migrations/ on purpose so `supabase db
-- push` can never run it. Review the SELECT output first, then run the DELETE in
-- the Supabase SQL editor by hand.
--
-- Cause (fixed in the app the same day): auto-save wrote the DEFAULT preset that
-- sits behind the home screen ("PlayMint Core", Runner, empty prompt, no AI art)
-- into the library of any signed-in user as soon as their session loaded. Such a
-- row has exactly this shape: the default title, an empty prompt and no art.
-- A user who deliberately saved the default preset would match too — check the
-- list before deleting.

-- 1. Review.
select id, owner_id, title, mode, visibility, created_at, updated_at
from public.games
where title = 'PlayMint Core'
  and prompt = ''
  and art_id is null
order by created_at desc;

-- 2. Delete (run only after reviewing step 1).
-- delete from public.games
-- where title = 'PlayMint Core'
--   and prompt = ''
--   and art_id is null;
