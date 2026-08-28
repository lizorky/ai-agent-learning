import assert from 'node:assert/strict';
import WebSocket from 'ws';

const url = process.env.GAME_SERVER_URL || 'ws://127.0.0.1:8787';

function waitFor(socket, predicate, timeout = 10_000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off('message', onMessage);
      reject(new Error('Timed out waiting for combat state'));
    }, timeout);
    function onMessage(raw) {
      const message = JSON.parse(raw.toString());
      if (!predicate(message)) return;
      clearTimeout(timer);
      socket.off('message', onMessage);
      resolve(message);
    }
    socket.on('message', onMessage);
  });
}

const socket = new WebSocket(url);
await new Promise((resolve, reject) => {
  socket.once('open', resolve);
  socket.once('error', reject);
});

socket.send(JSON.stringify({ type: 'create_room', name: 'Combat Test', hero: 'vanguard', password: 'test-only' }));
const joined = await waitFor(socket, (message) => message.type === 'joined');
const playerId = joined.playerId;
let sequence = 1;
socket.send(JSON.stringify({ type: 'input', sequence, left: false, right: true, jump: false, attack: false }));

const inRange = await waitFor(socket, (message) => {
  if (message.type !== 'state') return false;
  const player = message.state.players.find((entry) => entry.id === playerId);
  const enemy = message.state.enemies[0];
  return player && enemy && Math.abs(enemy.x - player.x) < 120;
});
const beforePlayer = inRange.state.players.find((entry) => entry.id === playerId);
const beforeEnemy = inRange.state.enemies[0];
sequence += 1;
socket.send(JSON.stringify({ type: 'input', sequence, left: false, right: false, jump: false, attack: false }));
socket.send(JSON.stringify({ type: 'cast_skill', skillId: 'staff-sweep' }));

const skillState = await waitFor(socket, (message) => {
  if (message.type !== 'state') return false;
  const player = message.state.players.find((entry) => entry.id === playerId);
  const enemy = message.state.enemies[0];
  return player?.skillCooldowns?.['staff-sweep'] > 0 && enemy?.hp < beforeEnemy.hp;
});
const afterPlayer = skillState.state.players.find((entry) => entry.id === playerId);
const afterEnemy = skillState.state.enemies[0];
assert.ok(afterPlayer.mp <= beforePlayer.mp - 10.5, 'skill should spend mana after allowing for regeneration during the cast');
assert.ok(afterEnemy.hp <= beforeEnemy.hp - 30, 'skill should damage the enemy');
assert.ok(afterEnemy.hitStun > 0, 'skill should apply enemy hit stun');
assert.ok(afterPlayer.skillCooldowns['staff-sweep'] > 2, 'skill should start a cooldown');

sequence += 1;
socket.send(JSON.stringify({ type: 'input', sequence, left: false, right: true, jump: false, attack: false }));
const basicReady = await waitFor(socket, (message) => {
  if (message.type !== 'state') return false;
  const player = message.state.players.find((entry) => entry.id === playerId);
  const enemy = message.state.enemies.find((entry) => !entry.dead);
  if (!player || !enemy || player.skill) return false;
  const forwardDistance = (enemy.x - player.x) * player.facing;
  return forwardDistance > 52 && forwardDistance < 108;
});
const basicEnemy = basicReady.state.enemies.find((entry) => !entry.dead);
sequence += 1;
socket.send(JSON.stringify({ type: 'input', sequence, left: false, right: false, jump: false, attack: true }));
sequence += 1;
socket.send(JSON.stringify({ type: 'input', sequence, left: false, right: false, jump: false, attack: false }));

const windup = await waitFor(socket, (message) => {
  if (message.type !== 'state') return false;
  const player = message.state.players.find((entry) => entry.id === playerId);
  return player?.attacking && player.attackTimer > player.attackImpactAt + 0.03;
});
assert.equal(windup.state.enemies.find((entry) => entry.id === basicEnemy.id)?.hp, basicEnemy.hp, 'wind-up frame must not deal damage from the player body');

const basicHit = await waitFor(socket, (message) => {
  if (message.type !== 'state') return false;
  const enemy = message.state.enemies.find((entry) => entry.id === basicEnemy.id);
  return enemy && enemy.hp < basicEnemy.hp;
});
const impactPlayer = basicHit.state.players.find((entry) => entry.id === playerId);
assert.ok(impactPlayer.attackTimer <= impactPlayer.attackImpactAt + 0.02, 'basic damage must land on the staff impact frame');
assert.ok(impactPlayer.attackStart >= 30, 'basic attack box must start in front of the player hurt box');

socket.close();
console.log('Authoritative skill combat and forward staff-impact hitbox smoke test passed.');
