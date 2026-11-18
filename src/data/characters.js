// Playable characters. Pure data: tuning numbers, UI copy, ability lists.
// Every number here really drives gameplay (see src/game/entities/Player.js).

export const CHARACTER_KEYS = Object.freeze(['mule', 'princess']);

export const CHARACTERS = Object.freeze({
  mule: {
    key: 'mule',
    name: 'Big Boss Mule',
    short: 'MULE',
    tagline: 'Agile. Confident in a fight. Nervous around her.',
    description:
      'A skateboarder in black streetwear and subtle armor. Builds speed on the board, then switches to a three-hit boxing combo up close.',
    stats: { speed: 3, power: 5, mobility: 3, defense: 4 },
    abilities: [
      { name: 'Skate boost', desc: 'Hold a direction to build speed on the board.' },
      { name: 'Boxing combo', desc: 'Tap Attack three times: jab, cross, hook with knockback.' },
      { name: 'Dash', desc: 'A quick burst with a moment of invulnerability.' },
      { name: 'Board tricks', desc: 'Attack in the air while riding for trick combo points. Grind rails.' },
    ],
    accent: '#9B5CFF',
    physics: {
      maxHealth: 8,
      walkSpeed: 112,
      rideMaxSpeed: 205,       // reached after ~1.2 s of holding a direction on the ground
      rideRampPerSec: 0.85,    // how fast the "ride charge" (0..1) builds
      accel: 760,
      groundDrag: 900,
      rideDrag: 170,           // coasting on the board
      airControl: 0.8,
      jumpVelocity: -352,
      jumpCutMultiplier: 0.5,  // releasing jump early shortens it
      extraJumps: 0,
      body: { w: 12, h: 30, offsetX: 18, offsetY: 14 },
    },
    attack: {
      type: 'melee',
      comboWindowMs: 520,
      combo: [
        { name: 'jab', damage: 1, reach: 22, height: 14, startMs: 50, activeMs: 90, totalMs: 230, knockback: 90 },
        { name: 'cross', damage: 1, reach: 24, height: 14, startMs: 50, activeMs: 90, totalMs: 240, knockback: 110 },
        { name: 'hook', damage: 2, reach: 28, height: 18, startMs: 90, activeMs: 120, totalMs: 380, knockback: 230 },
      ],
    },
    dash: { speed: 330, durationMs: 170, cooldownMs: 800, invulnMs: 210 },
  },

  princess: {
    key: 'princess',
    name: 'Princess',
    short: 'PRINCESS',
    tagline: 'Quick. Sharp. Always one step ahead.',
    description:
      'A fast, stylish runner with a double jump, a quick slip-dash and a light-energy pulse that hits from a distance.',
    stats: { speed: 5, power: 2, mobility: 5, defense: 2 },
    abilities: [
      { name: 'Double jump', desc: 'Jump again in mid-air.' },
      { name: 'Light pulse', desc: 'Fire an energy pulse. Every third pulse is a wide burst.' },
      { name: 'Slip', desc: 'A quick blink-dash that passes through harm.' },
      { name: 'Fast feet', desc: 'The quickest runner in the city.' },
    ],
    accent: '#FF72C6',
    physics: {
      maxHealth: 6,
      walkSpeed: 150,
      rideMaxSpeed: 150,
      rideRampPerSec: 0,
      accel: 980,
      groundDrag: 1250,
      rideDrag: 1250,
      airControl: 0.95,
      jumpVelocity: -338,
      jumpCutMultiplier: 0.5,
      extraJumps: 1,
      body: { w: 11, h: 28, offsetX: 18, offsetY: 16 },
    },
    attack: {
      type: 'ranged',
      cooldownMs: 300,
      burstEvery: 3,
      pulse: { speed: 300, rangePx: 170, damage: 1, knockback: 80 },
      burst: { speed: 260, rangePx: 150, damage: 2, knockback: 190, scale: 1.8 },
      totalMs: 200,
    },
    dash: { speed: 360, durationMs: 140, cooldownMs: 600, invulnMs: 260 },
  },
});

export function getCharacter(key) {
  return CHARACTERS[key] ?? CHARACTERS.mule;
}

export function otherCharacter(key) {
  return key === 'princess' ? 'mule' : 'princess';
}

export function isCharacterKey(key) {
  return CHARACTER_KEYS.includes(key);
}
