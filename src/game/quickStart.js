// Quick Start world pool (2026-11-07).
//
// Client report: "Quick Start / random generation always returns the same Runner",
// across reloads, a closed page and a different account. Cause: generateRandom
// hard-coded the ice theme with an empty prompt and cached its art under one
// `preset:<mode>` key, so every Quick Start of a mode replayed one ice art set
// from this browser's IndexedDB.
//
// Quick Start now draws a WORLD from this pool and never repeats the last few.
// Every world's art is stored once and shared by everyone ($0 per click):
//  - side view (Runner + Action Quest): 16 worlds pinned to art sets that were
//    already generated (reviewed on contact sheets). Their characters predate
//    the Nov 5 sprite checks or are missing (playerless population sets), so a
//    world's first use draws its animated player once and stores the upgraded
//    set under the world's key (window.__PM_WARM_QUICKSTART() does that for all
//    of them up front).
//  - top-down (Shooter): only the cyberpunk rooftop exists. The pool fills
//    itself: when a player has seen every cached top-down world recently and
//    fewer than SELF_FILL_TARGET exist, the next world below is generated once.
//
// Prompts are mode-neutral on purpose ("runner"/"quest" in a world prompt would
// switch an Action Quest Quick Start into a runner via parsePromptKeywords).

export const SELF_FILL_TARGET = 6;
const RECENT_WINDOW = 5;
const RECENT_KEY = 'PM_QS_RECENT';

export const QUICK_START_WORLDS = {
  side: [
    { id: 'ice-kingdom', label: 'Ice Kingdom', theme: 'ice', baseArtId: '0d8e9e9b-4ad0-4b2b-9656-8a2970886c38',
      prompt: 'a frozen ice kingdom with an ice castle, ice dragon enemies and crystal shard pickups',
      titles: ['Glacier', 'Frostspire', 'Icecrown', 'Crystal'] },
    { id: 'lava-rivers', label: 'Lava Rivers', theme: 'lava', baseArtId: '704d3bf3-f6bc-4eb8-825d-e3dc1594fbf8',
      prompt: 'a volcanic world with rivers of molten lava and red dragon enemies',
      titles: ['Magma', 'Inferno', 'Ember', 'Cinder'] },
    { id: 'enchanted-forest', label: 'Enchanted Forest', theme: 'forest', baseArtId: '7d909f35-636e-4ef6-bc30-3f8cdbb0a161',
      prompt: 'an enchanted forest with thorn hazards and glowing acorn pickups',
      titles: ['Wildwood', 'Thornwood', 'Glimmer', 'Grove'] },
    { id: 'neon-city', label: 'Neon City', theme: 'city', baseArtId: '7934135b-1f40-4a16-ae2f-9fcd7aba1889',
      prompt: 'a neon cyberpunk city at night with security drone enemies and data coin pickups',
      titles: ['Neon', 'Chrome', 'Gridlight', 'Synth'] },
    { id: 'deep-space', label: 'Deep Space', theme: 'space', baseArtId: 'd162da73-8a57-4141-a9f3-7f8b4dfa02e4',
      prompt: 'a deep space station with alien blob enemies and energy cell pickups',
      titles: ['Orbital', 'Nebula', 'Starfall', 'Void'] },
    { id: 'desert-giants', label: 'Desert Giants', theme: 'lava', baseArtId: '6715960f-98e2-465f-8ae6-2bad4164b038',
      prompt: 'a desert of giant stone ruins with blue spirit enemies',
      titles: ['Dune', 'Sandstone', 'Mirage', 'Colossus'] },
    { id: 'african-future', label: 'African Future City', theme: 'city', baseArtId: '4786aee8-5174-48b7-b609-d13a6d5518b2',
      prompt: 'a futuristic african safari city at sunset with robot hyena enemies',
      titles: ['Savanna', 'Sunspire', 'Safari', 'Afrofuture'] },
    { id: 'sunken-temple', label: 'Sunken Temple', theme: 'space', baseArtId: 'fd13f302-3394-44fa-bcca-14cf0de8af2d',
      prompt: 'an ancient sunken temple under the sea with glowing jellyfish enemies',
      titles: ['Abyssal', 'Coral', 'Tidal', 'Sunken'] },
    { id: 'haunted-graveyard', label: 'Haunted Graveyard', theme: 'forest', baseArtId: '29c3f933-a53e-44d3-88e0-100fd27c84e9',
      prompt: 'a haunted graveyard under a full moon with ghost enemies and skull token pickups',
      titles: ['Phantom', 'Gravemoon', 'Wraith', 'Hollow'] },
    { id: 'candy-land', label: 'Candy Land', theme: 'forest', baseArtId: 'f20bd8f4-c5ea-4394-9091-91105b7d5832',
      prompt: 'a candy land with gummy bear enemies and lollipop coin pickups',
      titles: ['Sugar', 'Gumdrop', 'Candy', 'Sprinkle'] },
    { id: 'steampunk-factory', label: 'Steampunk Factory', theme: 'city', baseArtId: '94c8ab11-589c-4b63-a587-89e4c9f84337',
      prompt: 'a steampunk factory with clockwork robot enemies and brass gear pickups',
      titles: ['Cogwork', 'Brass', 'Steamforge', 'Gearspring'] },
    { id: 'cherry-blossom', label: 'Cherry Blossom', theme: 'forest', baseArtId: '0056c49b-159a-414b-8a3d-9dc216fb31ad',
      prompt: 'a cherry blossom garden with oni spirit enemies and sakura petal pickups',
      titles: ['Sakura', 'Blossom', 'Moonpetal', 'Shrine'] },
    { id: 'sky-castle', label: 'Sky Castle', theme: 'space', baseArtId: 'bf567ff0-40a5-4f1a-a564-da0052735412',
      prompt: 'a castle kingdom in the clouds with storm imp enemies and star fragment pickups',
      titles: ['Skyward', 'Cloudspire', 'Zephyr', 'Stormcrest'] },
    { id: 'pirate-cove', label: 'Pirate Cove', theme: 'forest', baseArtId: '32ad8e6a-6639-4d7d-8f3c-9bc6093938ca',
      prompt: 'a moonlit pirate cove with crab enemies, wooden spikes and doubloon coins',
      titles: ['Corsair', 'Blackwater', 'Doubloon', 'Buccaneer'] },
    { id: 'mushroom-village', label: 'Mushroom Village', theme: 'forest', baseArtId: 'ce65c134-fc16-496c-aca5-faee1af04348',
      prompt: 'a glowing mushroom village with snail enemies and dewdrop pickups',
      titles: ['Toadstool', 'Spore', 'Mossglow', 'Fungal'] },
    { id: 'midnight-carnival', label: 'Midnight Carnival', theme: 'city', baseArtId: '2eb31812-5a4a-4c28-be4b-af32fff4fd14',
      prompt: 'a midnight carnival with juggler jester enemies and golden ticket pickups',
      titles: ['Carnival', 'Jester', 'Midway', 'Lantern'] }
  ],
  topdown: [
    { id: 'cyber-rooftop', label: 'Cyberpunk Rooftop', theme: 'city', baseArtId: '1a1a3ff2-232c-4156-816d-cc7dc5549cc8',
      prompt: 'a cyberpunk rooftop arena with robot enemies',
      titles: ['Neon', 'Rooftop', 'Skyline', 'Chrome'] },
    // Filled over time, in this order (each world shows off a different arena rule).
    { id: 'lava-fortress', label: 'Lava Fortress', theme: 'lava',
      prompt: 'a volcanic fortress courtyard with pools of molten lava and fire imp enemies',
      titles: ['Molten', 'Inferno', 'Ashen', 'Cinder'] },
    { id: 'sky-ruins', label: 'Sky Ruins', theme: 'space',
      prompt: 'ancient marble temple ruins on a floating sky island with harpy enemies',
      titles: ['Skyfall', 'Cloudbreak', 'Zenith', 'Windswept'] },
    { id: 'toxic-factory', label: 'Toxic Factory', theme: 'city',
      prompt: 'an abandoned toxic factory floor with acid pools and mutant enemies',
      titles: ['Toxic', 'Biohazard', 'Sludge', 'Fallout'] },
    { id: 'jungle-temple', label: 'Jungle Temple', theme: 'forest',
      prompt: 'a jungle temple courtyard with flooded pools and lizardman enemies',
      titles: ['Jungle', 'Serpent', 'Emerald', 'Overgrown'] },
    { id: 'ice-fortress', label: 'Ice Fortress', theme: 'ice',
      prompt: 'a walled ice fortress arena with yeti enemies',
      titles: ['Frostbite', 'Glacier', 'Polar', 'Blizzard'] },
    { id: 'desert-outpost', label: 'Desert Outpost', theme: 'lava',
      prompt: 'a desert outpost with sinkhole pits and scorpion enemies',
      titles: ['Sandstorm', 'Outpost', 'Scorpion', 'Dustline'] },
    { id: 'space-hangar', label: 'Space Hangar', theme: 'space',
      prompt: 'a space station hangar deck with alien invader enemies',
      titles: ['Orbital', 'Hangar', 'Starport', 'Invader'] }
  ]
};

export const viewForMode = (mode) => (mode === 'shooter_arena' ? 'topdown' : 'side');

// One key per world and view; mode-agnostic within a view (a side-view set
// serves Runner AND Action Quest). Normal quality tier only: a Quick Start is
// never a demo/quality-mode run.
export const makeQuickStartKey = (view, worldId) => `v1|qs:${view}:${worldId}|q0|`;

const MODE_WORDS = {
  standard: ['Run', 'Dash', 'Rush', 'Sprint'],
  action_quest: ['Quest', 'Saga', 'Raid', 'Legend'],
  shooter_arena: ['Strike', 'Siege', 'Assault', 'Onslaught']
};
const pick = (list, rnd = Math.random) => list[Math.floor(rnd() * list.length)];
export const quickStartTitle = (world, mode, rnd = Math.random) =>
  `${pick(world.titles, rnd)} ${pick(MODE_WORDS[mode] || MODE_WORDS.standard, rnd)}`;

const readRecentAll = () => {
  try {
    const parsed = JSON.parse(localStorage.getItem(RECENT_KEY) || '{}');
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
};
export const readRecent = (view) => {
  const list = readRecentAll()[view];
  return Array.isArray(list) ? list : [];
};
export const recordQuickStartPick = (view, worldId) => {
  try {
    const all = readRecentAll();
    all[view] = [worldId, ...readRecent(view).filter((id) => id !== worldId)].slice(0, RECENT_WINDOW);
    localStorage.setItem(RECENT_KEY, JSON.stringify(all));
  } catch { /* private mode: no memory, still random */ }
};

/**
 * Pick the next world for a Quick Start.
 * @param {'side'|'topdown'} view
 * @param {{ cachedIds: Set<string>, canSpend: boolean, recent?: string[], rnd?: () => number }} opts
 *   cachedIds — worlds that already have an upgraded entry under their key;
 *   canSpend  — Gemini available and Cache only off (redraws/self-fill allowed).
 * @returns {{ world, generate: boolean } | null}
 */
export function pickQuickStartWorld(view, { cachedIds = new Set(), canSpend = false, recent = readRecent(view), rnd = Math.random } = {}) {
  const worlds = QUICK_START_WORLDS[view] || [];
  // Usable without a fresh generation: an upgraded entry, or a pinned base set.
  // Without spending, prefer upgraded entries (a pinned base may be playerless).
  const upgraded = worlds.filter((w) => cachedIds.has(w.id));
  const usable = canSpend
    ? worlds.filter((w) => cachedIds.has(w.id) || w.baseArtId)
    : (upgraded.length ? upgraded : worlds.filter((w) => w.baseArtId));
  let candidates = usable.filter((w) => !recent.includes(w.id));
  // Self-fill (top-down only): everything cached was seen recently and the pool
  // is still small → generate the next world once; it is free for everyone after.
  if (view === 'topdown' && canSpend && !candidates.length && usable.length < SELF_FILL_TARGET) {
    const next = worlds.find((w) => !usable.includes(w));
    if (next) return { world: next, generate: true };
  }
  if (!candidates.length) candidates = usable.filter((w) => w.id !== recent[0]);
  if (!candidates.length) candidates = usable;
  if (!candidates.length) return null;
  return { world: pick(candidates, rnd), generate: false };
}
