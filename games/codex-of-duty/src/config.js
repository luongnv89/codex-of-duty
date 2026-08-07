/**
 * Black Relay's single source of truth. The overlay, guide, story panel,
 * progression HUD, tuning, and saved-run namespace all read from this file.
 */

export const SLUG = 'codex-of-duty';

export const META = {
  title: 'Codex of Duty: Black Relay',
  objective: 'Activate all three Black Relays and survive the final extraction.',
  premise: [
    'The city of Vanta has gone dark behind a hostile signal veil.',
    'You are Rook, the last field operative linked to an experimental command network. Reactivate the Black Relay chain while the Null Guard converges on every signal you restore.',
    'Bring the network online, break through the Black Core, and hold the extraction gate. Nobody else is coming.',
  ],
  ending:
    'A run ends when Rook falls, or after all five districts are cleared and the 70-second extraction survives.',
  controls: [
    { keys: 'W A S D / arrows', touch: 'Left stick', does: 'Move and strafe; push fully to sprint' },
    { keys: 'Mouse', touch: 'Drag right side', does: 'Look and aim' },
    { keys: 'Left mouse', touch: 'FIRE', does: 'Fire the equipped weapon' },
    { keys: 'Right mouse / Q', touch: 'AIM', does: 'Focus aim' },
    { keys: 'Shift', touch: 'Push stick to rim', does: 'Sprint' },
    { keys: 'C / Ctrl', touch: 'SLD', does: 'Combat slide while moving' },
    { keys: 'Space', touch: 'JMP', does: 'Jump; near a ledge, mantle up' },
    { keys: 'R', touch: 'RLD', does: 'Reload' },
    { keys: '1 / 2 / F / wheel', touch: 'SWP', does: 'Switch pulse rifle / scattergun' },
    { keys: 'E', touch: 'ACT', does: 'Hold to activate or stabilize a relay' },
    { keys: 'P / Esc', touch: 'Tap ❚❚', does: 'Pause and resume' },
    { keys: 'H', touch: 'Tap ?', does: 'How to play' },
    { keys: 'T', touch: 'Tap ✦', does: 'The story' },
    { keys: 'K', touch: 'Tap ★', does: 'High scores' },
    { keys: 'M', touch: 'Tap ♪', does: 'Mute' },
    { keys: 'Enter', touch: 'Tap Play again', does: 'Restart after a run' },
  ],
};

export const PALETTE = {
  ink: '#07111F',
  ground: '#15283B',
  accent: '#39E6D0',
  player: '#FFB547',
  threat: '#FF405D',
  surface: '#EAF6FF',
};

export const HEX = Object.fromEntries(
  Object.entries(PALETTE).map(([name, value]) => [name, Number.parseInt(value.slice(1), 16)]),
);

export const VIEW = { width: 1280, height: 720 };
export const ORIENTATION = 'landscape';

export const TUNING = {
  fixedStep: 1 / 60,
  maxDelta: 0.1,
  arenaHalfSize: 22,
  player: {
    walkSpeed: 5.3,
    sprintSpeed: 8.1,
    acceleration: 25,
    jumpSpeed: 6.2,
    gravity: 17,
    maxHealth: 100,
    startArmor: 35,
    eyeHeight: 1.68,
    radius: 0.42,
    slideDurationMs: 720,
    slideSpeed: 11.4,
    slideFriction: 3.2,
    mantleReach: 0.72,
    mantleHeight: 1.85,
  },
  weapons: {
    rifle: {
      name: 'VX-9 Pulse Rifle',
      magazine: 30,
      reserve: 150,
      damage: 27,
      fireEveryMs: 105,
      reloadMs: 1250,
      range: 42,
      spread: 0.012,
    },
    scatter: {
      name: 'K-12 Scattergun',
      magazine: 8,
      reserve: 40,
      damage: 92,
      fireEveryMs: 620,
      reloadMs: 1550,
      range: 15,
      spread: 0.07,
    },
  },
  maxEnemies: 18,
  spawnFloorMs: 620,
  pickupLifetimeMs: 16000,
  levels: [
    {
      name: 'Rainline Approach',
      code: 'RELAY ALPHA',
      targetKills: 5,
      captureMs: 4000,
      spawnEveryMs: 2350,
      enemySpeed: 0.88,
      enemyDamage: 0.78,
      projectileSpeed: 0.8,
      mix: ['rifle', 'rifle', 'rifle'],
      relay: [-11, -8],
      fog: 0.018,
    },
    {
      name: 'Glass Market',
      code: 'RELAY BETA',
      targetKills: 8,
      captureMs: 6000,
      spawnEveryMs: 1900,
      enemySpeed: 1,
      enemyDamage: 0.92,
      projectileSpeed: 0.95,
      mix: ['rifle', 'rifle', 'rusher'],
      relay: [11, -10],
      fog: 0.022,
    },
    {
      name: 'Ash Transit',
      code: 'RELAY GAMMA',
      targetKills: 11,
      captureMs: 8000,
      spawnEveryMs: 1550,
      enemySpeed: 1.1,
      enemyDamage: 1,
      projectileSpeed: 1.12,
      mix: ['rifle', 'rusher', 'sniper'],
      relay: [-12, 10],
      relayPulseEveryMs: 12000,
      fog: 0.026,
    },
    {
      name: 'The Black Core',
      code: 'CORE STABILIZER',
      targetKills: 14,
      captureMs: 9000,
      spawnEveryMs: 1250,
      enemySpeed: 1.18,
      enemyDamage: 1.12,
      projectileSpeed: 1.2,
      mix: ['rifle', 'rusher', 'sniper', 'shield'],
      relay: [0, 0],
      hudBlackoutEveryMs: 9000,
      fog: 0.031,
    },
    {
      name: 'Last Light Extraction',
      code: 'EVAC PAD',
      targetKills: 0,
      captureMs: 70000,
      spawnEveryMs: 1080,
      enemySpeed: 1.27,
      enemyDamage: 1.2,
      projectileSpeed: 1.3,
      mix: ['rifle', 'rusher', 'sniper', 'shield', 'rusher'],
      relay: [0, -4],
      extractionMs: 70000,
      fog: 0.035,
    },
  ],
};
