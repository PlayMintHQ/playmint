-- Hide public games whose artwork no longer exists (client report 2026-11-07).
--
-- NOT a migration — kept outside supabase/migrations/ so `supabase db push` can
-- never run it. Run it by hand in the Supabase SQL editor.
--
-- "Spiders" is public, but its art set (339a2f24…) was never uploaded to the Blob
-- store (games/<art_id>/meta.json answers 404), so every Community player got the
-- built-in world. The row is made PRIVATE, not deleted: the owner keeps it in My
-- Games (with an "Artwork missing" badge) and can redraw it with Quick Edit.
--
-- The app now also hides such rows from Community at load time and refuses to
-- publish a game whose art is not stored, so this is a one-off clean-up.
-- `node scripts/audit-art.mjs` lists any further missing-art rows and prints the
-- matching statement.

update public.games
set visibility = 'private',
    published_at = null
where id in (
  '28a30c7f-b0db-4f94-aab6-d11039f044c5'  -- "Spiders" (art 339a2f24-abd2-465d-b4f2-3a47758bfc72)
)
and visibility = 'public';
