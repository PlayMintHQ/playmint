-- Saved games that SHARE an art set (client report 2026-11-05).
--
-- NOT a migration — kept outside supabase/migrations/ so `supabase db push` can
-- never run it. Read-only.
--
-- Before 2026-11-05 an edit re-uploaded its art under the same art id, and art
-- ids are shared (Quick Start, exact prompt hits, matcher reuse). Rows in the
-- same group below could therefore open each other's edits. Whether a row's art
-- was really replaced is decided by scripts/audit-art.mjs, which compares the
-- row's saved snapshot with the stored art — use it for the delete step:
--
--   node scripts/audit-art.mjs --out report.json          (with SUPABASE_SERVICE_ROLE_KEY)
--   node scripts/audit-art.mjs --delete --report report.json

select art_id,
       count(*)                                   as rows_sharing,
       array_agg(title order by updated_at desc)  as titles,
       array_agg(visibility order by updated_at desc) as visibility,
       max(updated_at)                            as last_saved
from public.games
where art_id is not null
group by art_id
having count(*) > 1
order by rows_sharing desc, last_saved desc;
