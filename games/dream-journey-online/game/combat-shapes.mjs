// Shared by the renderer and authoritative server. Coordinates are foot-relative.
export const STRIKE_BAND = Object.freeze({ top: -101, bottom: -55, center: -78 });

export const SKILL_PROFILES = Object.freeze({
  'flurry-fist': { cost: 12, cooldown: 3.2, duration: 0.42, impactAt: 0.24, damage: 30, range: 105, start: 22, knockback: 210, maxTargets: 3 },
  'rising-punch': { cost: 20, cooldown: 5.5, duration: 0.58, impactAt: 0.3, damage: 48, range: 90, start: 20, knockback: 360, maxTargets: 2 },
  'blazing-step': { cost: 28, cooldown: 9, duration: 0.72, impactAt: 0.38, damage: 72, range: 140, start: 24, knockback: 460, maxTargets: 3 },
});

export function fistHitBox(player, start, reach) {
  const left = player.facing > 0 ? player.x + start : player.x - reach;
  const right = player.facing > 0 ? player.x + reach : player.x - start;
  return { left, right, top: player.y + STRIKE_BAND.top, bottom: player.y + STRIKE_BAND.bottom };
}

export function fistHitsEnemy(player, enemy, start, reach) {
  if (enemy.dead || (enemy.x - player.x) * player.facing <= 0) return false;
  const box = fistHitBox(player, start, reach);
  const radius = 28 * enemy.scale;
  return enemy.x + radius >= box.left && enemy.x - radius <= box.right
    && enemy.y - 8 >= box.top && enemy.y - 150 * enemy.scale <= box.bottom;
}
