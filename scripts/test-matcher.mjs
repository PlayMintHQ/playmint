// $0 Matcher Strict World Tightening Unit Test Suite (October 2026 Milestone)
//
// Tests deterministic post-validation of cache matches without spending any API credits.
// Runs locally: node scripts/test-matcher.mjs

import { validateSemanticMatch, tokenizePrompt } from '../src/game/assetCache/matcher.js';

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`\x1b[32m  ✓ PASS:\x1b[0m ${message}`);
    passed++;
  } else {
    console.error(`\x1b[31m  ✗ FAIL:\x1b[0m ${message}`);
    failed++;
  }
}

console.log('\x1b[36m=== Testing Matcher Deterministic World Validation ===\x1b[0m\n');

// Test 1: Strict Theme Conflict Barrier (Lava vs Ice)
{
  const userPrompt = 'lava inferno runner with molten rocks';
  const iceCandidate = {
    id: 'cand-ice-1',
    sourcePrompt: 'frozen glacier cavern runner with ice crystals',
    config: { themeKey: 'ice' },
    assetMeta: { tags: ['ice', 'glacier', 'snow'] }
  };
  const result = validateSemanticMatch({
    userPrompt,
    candidate: iceCandidate,
    replaceSlots: ['enemy']
  });
  assert(!result.valid, 'Incompatible themes (Lava vs Ice) are rejected');
  assert(result.reason === 'world-theme-mismatch', `Rejection reason is "world-theme-mismatch" (got: ${result.reason})`);
}

// Test 2: Matching Theme with Subject Redraw (Lava with Skeleton vs Lava with Golem)
{
  const userPrompt = 'lava runner with dark skeleton warrior';
  const lavaCandidate = {
    id: 'cand-lava-1',
    sourcePrompt: 'molten lava runner with fire golem',
    config: { themeKey: 'lava' },
    assetMeta: {
      tags: ['lava', 'fire', 'volcano'],
      slots: { enemy: { entity: 'fire golem' } }
    }
  };
  const result = validateSemanticMatch({
    userPrompt,
    candidate: lavaCandidate,
    replaceSlots: ['enemy']
  });
  assert(result.valid, 'Matching theme (Lava vs Lava) with single enemy redraw is accepted');
}

// Test 3: Custom World (No static theme) with ZERO overlap
{
  const userPrompt = 'cyberpunk neon ninja flying across skyscraper rooftops';
  const dungeonCandidate = {
    id: 'cand-dungeon-1',
    sourcePrompt: 'ancient medieval stone dungeon with goblin archer',
    config: { themeKey: null },
    assetMeta: { tags: ['dungeon', 'medieval', 'stone', 'goblin'] }
  };
  const result = validateSemanticMatch({
    userPrompt,
    candidate: dungeonCandidate,
    replaceSlots: []
  });
  assert(!result.valid, 'Custom worlds with zero semantic overlap are rejected');
  assert(result.reason === 'custom-world-low-overlap', `Rejection reason is "custom-world-low-overlap" (got: ${result.reason})`);
}

// Test 4: Custom World with Significant Overlap
{
  const userPrompt = 'cyberpunk neon hoverboard rider dodging drones';
  const cyberCandidate = {
    id: 'cand-cyber-1',
    sourcePrompt: 'futuristic cyberpunk city with neon billboards and security drones',
    config: { themeKey: null },
    assetMeta: { tags: ['cyberpunk', 'neon', 'futuristic', 'drones'] }
  };
  const result = validateSemanticMatch({
    userPrompt,
    candidate: cyberCandidate,
    replaceSlots: ['player']
  });
  assert(result.valid, 'Custom worlds sharing semantic tokens (cyberpunk, neon, drones) are accepted');
}

// Test 5: Multiple World Slots Clashing (Attempt to redraw backgrounds)
{
  const userPrompt = 'forest runner with cute fox';
  const forestCandidate = {
    id: 'cand-forest-1',
    sourcePrompt: 'enchanted forest runner',
    config: { themeKey: 'forest' },
    assetMeta: { tags: ['forest', 'trees'] }
  };
  const result = validateSemanticMatch({
    userPrompt,
    candidate: forestCandidate,
    replaceSlots: ['background_far', 'background_mid']
  });
  assert(!result.valid, 'Matches requiring multiple world slot redraws are rejected as world-clash');
  assert(result.reason === 'world-clash', `Rejection reason is "world-clash" (got: ${result.reason})`);
}

console.log(`\n\x1b[36m=== Matcher Validation Results: ${passed} passed, ${failed} failed ===\x1b[0m`);
if (failed > 0) {
  process.exit(1);
} else {
  console.log('\x1b[32mAll matcher tightening checks passed successfully!\x1b[0m\n');
  process.exit(0);
}
