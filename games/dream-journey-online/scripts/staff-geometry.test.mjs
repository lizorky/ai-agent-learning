import test from 'node:test';
import assert from 'node:assert/strict';
import { fistHitsEnemy, fistHitBox, SKILL_PROFILES } from '../game/combat-shapes.mjs';

const player = { x: 500, y: 440, facing: 1 };
const enemy = (x, y = 440, scale = 1) => ({ x, y, scale, dead: false });

test('fists contact nearby enemies ahead, never the player body or enemies behind', () => {
  assert.equal(fistHitsEnemy(player, enemy(555), 20, 72), true);
  assert.equal(fistHitsEnemy(player, enemy(500), 20, 72), false);
  assert.equal(fistHitsEnemy(player, enemy(490, 440, 1.46), 20, 72), false);
  assert.equal(fistHitsEnemy(player, enemy(620), 20, 72), false);
});

test('left-facing attacks mirror both reach and the inner safe region', () => {
  const left = { ...player, facing: -1 };
  assert.deepEqual(fistHitBox(left, 20, 72), { left: 428, right: 480, top: 339, bottom: 385 });
  assert.equal(fistHitsEnemy(left, enemy(445), 20, 72), true);
  assert.equal(fistHitsEnemy(left, enemy(555), 20, 72), false);
});

test('jumped-over or vertically distant enemies cannot be hit by ground-level fists', () => {
  assert.equal(fistHitsEnemy(player, enemy(555, 300), 20, 72), false);
  assert.equal(fistHitsEnemy({ ...player, y: 200 }, enemy(555), 20, 72), false);
  assert.equal(fistHitsEnemy({ ...player, y: 350 }, enemy(555), 20, 72), true);
});

test('boss hurtbox intersects the tip without expanding behind the hero', () => {
  assert.equal(fistHitsEnemy(player, enemy(615, 440, 1.46), 20, 96), true);
  assert.equal(fistHitsEnemy(player, enemy(640, 440, 1.46), 20, 96), false);
});

test('all skills keep damage ahead of the body and have an impact within their animation', () => {
  for (const profile of Object.values(SKILL_PROFILES)) {
    assert.ok(profile.start >= 20 && profile.range > profile.start);
    assert.ok(profile.impactAt > 0 && profile.impactAt < profile.duration);
    assert.equal(fistHitsEnemy(player, enemy(500), profile.start, profile.range), false);
  }
});
