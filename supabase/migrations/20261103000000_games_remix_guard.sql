-- PlayMint · remix lineage guard (Nov 2026 client feedback)
--
-- Playing a public game used to stamp it as its OWN remix parent, so an owner's
-- re-save wrote remix_parent_id = id (e.g. "Inferno Circuit"). The app no longer
-- does that; this repairs existing rows and makes the invariant a DB rule.

update public.games set remix_parent_id = null where remix_parent_id = id;

alter table public.games
  drop constraint if exists games_remix_parent_not_self;
alter table public.games
  add constraint games_remix_parent_not_self check (remix_parent_id is null or remix_parent_id <> id);
