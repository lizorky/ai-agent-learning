import test from 'node:test';
import assert from 'node:assert/strict';
import { createEnemy, enemyAttackBox, enemyWeaponTriggerBox, isInsideEnemyWeaponRange, playerHurtBox, updateEnemy } from './enemy-combat.mjs';

test('nearby enemy attacks in place and hits only once per swing', () => {
  const enemy = createEnemy();
  const target = { x: 661, y: 180, w: 120, h: 255 };
  const attackBox = enemyAttackBox(target);
  const hurtBox = playerHurtBox(600, 435);
  let hits = 0;
  for (let i = 0; i < 100; i += 1) hits += Number(updateEnemy(enemy, 1 / 60, true, attackBox, hurtBox).hit);
  assert.equal(hits, 1);
  assert.equal(enemy.hits, 1);
});

test('enemy attack does not hit a distant player', () => {
  const enemy = createEnemy();
  const target = { x: 661, y: 180, w: 120, h: 255 };
  let hits = 0;
  for (let i = 0; i < 100; i += 1) hits += Number(updateEnemy(enemy, 1 / 60, true, enemyAttackBox(target), playerHurtBox(200, 435)).hit);
  assert.equal(hits, 0);
});

test('enemy telegraphs before its active attack frames', () => {
  const enemy = createEnemy();
  enemy.cooldown = 0;
  const target = { x: 661, y: 180, w: 120, h: 255 };
  const attackBox = enemyAttackBox(target);
  const hurtBox = playerHurtBox(600, 435);
  updateEnemy(enemy, 0, true, attackBox, hurtBox);
  for (let i = 0; i < 30; i += 1) assert.equal(updateEnemy(enemy, 1 / 60, true, attackBox, hurtBox).hit, false);
  let hit = false;
  for (let i = 0; i < 15; i += 1) hit ||= updateEnemy(enemy, 1 / 60, true, attackBox, hurtBox).hit;
  assert.equal(hit, true);
});

test('weapon model range starts the attack before body contact', () => {
  const target = { x: 661, y: 180, w: 120, h: 255 };
  const trigger = enemyWeaponTriggerBox(target);
  assert.equal(trigger.x, 517);
  assert.equal(isInsideEnemyWeaponRange(target, playerHurtBox(463, 435)), true);
  assert.equal(isInsideEnemyWeaponRange(target, playerHurtBox(450, 435)), false);
});
