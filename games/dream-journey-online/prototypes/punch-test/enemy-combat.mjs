export const ENEMY_ATTACK_FRAME_COUNT = 12;
export const ENEMY_ATTACK_FPS = 10;
export const ENEMY_ACTIVE_FRAMES = new Set([6, 7, 8]);

const intersects = (a, b) => Array.isArray(b)?b.some(part=>intersects(a,part)):a && b && a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

export function createEnemy() {
  return { state: 'idle', idleTime: 0, attackTime: 0, cooldown: 0.35, hit: false, hits: 0, airHeight: 0, airVelocity: 0 };
}

export function launchEnemy(enemy) {
  enemy.state = 'airborne';
  enemy.airHeight = Math.max(0, enemy.airHeight);
  enemy.airVelocity = 480;
  enemy.attackTime = 0;
  enemy.hit = false;
}

export function staggerEnemy(enemy) {
  enemy.recoil = 0.18;
  if (enemy.state === 'airborne') return;
  enemy.state = 'stunned';
  enemy.stunTime = 0.7;
  enemy.attackTime = 0;
  enemy.hit = false;
}

export function enemyFrame(enemy) {
  if (enemy.state !== 'attack') return { clip: 'idle', index: Math.floor(enemy.idleTime * 8) % 12, active: false };
  const index = Math.min(ENEMY_ATTACK_FRAME_COUNT - 1, Math.floor(enemy.attackTime * ENEMY_ATTACK_FPS));
  return { clip: 'attack', index, active: ENEMY_ACTIVE_FRAMES.has(index) };
}

export function enemyAttackBox(target) {
  return {
    x: target.x - target.w * 0.72,
    y: target.y + target.h * 0.31,
    w: target.w * 0.95,
    h: target.h * 0.46,
  };
}

export function enemyWeaponTriggerBox(target) {
  return {
    x: target.x - target.w * 1.2,
    y: target.y + target.h * 0.18,
    w: target.w * 1.2,
    h: target.h * 0.72,
  };
}

export function isInsideEnemyWeaponRange(target, hurtBox) {
  return intersects(enemyWeaponTriggerBox(target), hurtBox);
}

export function playerHurtBox(x, floor, jumpHeight = 0) {
  return { x: x - 45, y: floor - jumpHeight - 180, w: 100, h: 180 };
}

export function updateEnemy(enemy, dt, canAttack, attackBox, hurtBox) {
  enemy.recoil = Math.max(0, (enemy.recoil || 0) - dt);
  if (enemy.state === 'stunned') {
    enemy.stunTime = Math.max(0, enemy.stunTime - dt);
    if (enemy.stunTime === 0) { enemy.state = 'idle'; enemy.cooldown = 0.4; }
    return { hit: false, frame: enemyFrame(enemy) };
  }
  if (enemy.state === 'airborne') {
    enemy.airHeight += enemy.airVelocity * dt - 420 * dt * dt;
    enemy.airVelocity -= 840 * dt;
    if (enemy.airHeight <= 0 && enemy.airVelocity < 0) {
      enemy.airHeight = 0;
      enemy.airVelocity = 0;
      enemy.state = 'idle';
      enemy.cooldown = 0.6;
    }
    return { hit: false, frame: enemyFrame(enemy) };
  }
  enemy.idleTime += dt;
  if (enemy.state === 'idle') {
    enemy.cooldown = Math.max(0, enemy.cooldown - dt);
    if (canAttack && enemy.cooldown === 0) {
      enemy.state = 'attack';
      enemy.attackTime = 0;
      enemy.hit = false;
    }
    return { hit: false, frame: enemyFrame(enemy) };
  }

  enemy.attackTime += dt;
  const frame = enemyFrame(enemy);
  const hit = frame.active && !enemy.hit && intersects(attackBox, hurtBox);
  if (hit) {
    enemy.hit = true;
    enemy.hits += 1;
  }
  if (enemy.attackTime >= ENEMY_ATTACK_FRAME_COUNT / ENEMY_ATTACK_FPS) {
    enemy.state = 'idle';
    enemy.attackTime = 0;
    enemy.cooldown = 1.1;
    enemy.hit = false;
  }
  return { hit: Boolean(hit), frame };
}
