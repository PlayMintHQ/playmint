export function parsePromptKeywords(text) {
  const lower = text.toLowerCase().trim();

  let mode = null;
  let themeKey = null;
  const modifiers = {
    isFast: false,
    isSlow: false,
    isHard: false,
    isLowGravity: false,
    highJump: false,
    lessSpeed: false,
    moreSpeed: false,
    hardcore: false,
  };
  let keywordsMatched = 0;

  if (lower.match(/(action|quest|fight|platformer|enemies|shoot|kill|combat)/)) {
    mode = 'action_quest';
    keywordsMatched++;
  } else if (lower.match(/(run|dash|jump|runner|dodge|sprint)/)) {
    mode = 'standard';
    keywordsMatched++;
  }

  const themeDefs = [
    { key: 'lava', regex: /(lava|volcano|molten|inferno|ash)/ },
    { key: 'ice', regex: /(ice|snow|frost|glacier|winter)/ },
    { key: 'forest', regex: /(forest|jungle|wood|trees|verdant)/ },
    { key: 'city', regex: /(city|urban|town|building|skyscraper|street|sidewalk|neon)/ },
    { key: 'space', regex: /(space|cosmic|galaxy|nebula|planet|asteroid|star|solar|alien)/ }
  ];

  const matchedThemes = [];
  themeDefs.forEach(t => {
    const match = lower.match(t.regex);
    if (match) {
      matchedThemes.push({ key: t.key, index: match.index });
    }
  });

  matchedThemes.sort((a, b) => a.index - b.index);

  themeKey = null;
  let secondaryThemeKey = null;

  if (matchedThemes.length > 0) {
    themeKey = matchedThemes[0].key;
    keywordsMatched++;
  }
  if (matchedThemes.length > 1) {
    secondaryThemeKey = matchedThemes[1].key;
    keywordsMatched++;
  }

  if (lower.match(/(high(er)? jump|big jump|jump higher)/)) {
    modifiers.highJump = true;
    keywordsMatched++;
  }
  if (lower.match(/(less speed|slow(er)?|less speed|chill)/)) {
    modifiers.lessSpeed = true;
    modifiers.isSlow = true;
    keywordsMatched++;
  }
  if (lower.match(/(more speed|fast(er)?|speed up)/)) {
    modifiers.moreSpeed = true;
    modifiers.isFast = true;
    keywordsMatched++;
  }
  if (lower.match(/(hardcore|insane|extreme|impossible|chaos)/)) {
    modifiers.hardcore = true;
    modifiers.isHard = true;
    keywordsMatched++;
  }

  if (lower.match(/(moon|float|space|fly|low gravity|zero gravity)/)) {
    modifiers.isLowGravity = true;
    keywordsMatched++;
  }

  return { mode, themeKey, secondaryThemeKey, modifiers, keywordsMatched };
}

export function generateTitle(text, mode, themeKey) {
  const trimmed = text.trim();
  if (trimmed.length > 4 && trimmed.length < 36) {
    return trimmed
      .split(/\s+/)
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ');
  }

  const themeWords = {
    lava: ['Ashfall', 'Molten', 'Cinder', 'Inferno', 'Ember', 'Scorch'],
    ice: ['Glacier', 'Frost', 'Arctic', 'Snowfall', 'Permafrost', 'Hoarfrost'],
    forest: ['Verdant', 'Wildwood', 'Grove', 'Emerald', 'Fern', 'Canopy'],
    city: ['Urban', 'Metro', 'Concrete', 'Skyline', 'Asphalt', 'Neon'],
    space: ['Stellar', 'Cosmic', 'Astral', 'Orbit', 'Nebula', 'Void'],
    default: ['Prime', 'Core', 'Nova', 'Omega', 'Apex', 'Flux'],
  };
  const modeWords =
    mode === 'action_quest'
      ? ['Quest', 'Runes', 'Raid', 'Path', 'Chronicle', 'Saga']
      : ['Run', 'Sprint', 'Rush', 'Dash', 'Circuit', 'Marathon'];

  const list = themeWords[themeKey] || themeWords.default;
  return `${list[Math.floor(Math.random() * list.length)]} ${modeWords[Math.floor(Math.random() * modeWords.length)]}`;
}
