import assert from 'node:assert/strict';
import WebSocket from 'ws';

const url = process.env.GAME_SERVER_URL || 'ws://127.0.0.1:8787';
const timeout = Number(process.env.STAGE_SMOKE_TIMEOUT || 120_000);
const requestedRoomCode = String(process.argv[2] || '').toUpperCase();
const requestedPassword = String(process.argv[3] || 'stage-test');
const pauseAtBoss = process.argv.includes('--pause-boss');

const socket = new WebSocket(url);
await new Promise((resolve, reject) => {
  socket.once('open', resolve);
  socket.once('error', reject);
});

socket.send(JSON.stringify({
  type: requestedRoomCode ? 'join_room' : 'create_room',
  roomCode: requestedRoomCode,
  name: 'Stage Runner',
  hero: 'vanguard',
  password: requestedPassword,
  profile: {
    inventory: [{ itemId: 'sunfire-cudgel', quantity: 1 }],
    equipment: { weapon: 'sunfire-cudgel' },
  },
}));

const result = await new Promise((resolve, reject) => {
  let playerId = '';
  let sequence = 0;
  const observedTypes = new Set();
  let observedElite = false;
  const timer = setTimeout(() => reject(new Error('Timed out before stage victory')), timeout);

  function sendInput(input = {}) {
    sequence += 1;
    socket.send(JSON.stringify({ type: 'input', sequence, left: false, right: false, jump: false, attack: false, ...input }));
  }

  socket.on('message', (raw) => {
    const message = JSON.parse(raw.toString());
    if (message.type === 'joined') {
      playerId = message.playerId;
      return;
    }
    if (message.type !== 'state' || !playerId) return;
    const state = message.state;
    const player = state.players.find((entry) => entry.id === playerId);
    for (const enemy of state.enemies) {
      observedTypes.add(enemy.type);
      observedElite ||= enemy.elite === true;
    }

    if (state.stage.state === 'victory') {
      clearTimeout(timer);
      sendInput();
      resolve({ state, player, observedTypes, observedElite });
      return;
    }
    if (pauseAtBoss && state.stage.wave === 4 && state.stage.state === 'active') {
      clearTimeout(timer);
      sendInput();
      resolve({ state, player, observedTypes, observedElite, paused: true });
      return;
    }
    if (!player || player.respawnTimer > 0 || state.stage.state !== 'active') {
      sendInput();
      return;
    }

    const enemies = state.enemies.filter((enemy) => !enemy.dead);
    if (enemies.length === 0) {
      sendInput();
      return;
    }
    const target = enemies.reduce((closest, enemy) =>
      Math.abs(enemy.x - player.x) < Math.abs(closest.x - player.x) ? enemy : closest,
    );
    const distance = target.x - player.x;
    const absoluteDistance = Math.abs(distance);
    sendInput({
      left: distance < -88,
      right: distance > 88,
      attack: absoluteDistance <= 112,
    });

    if (absoluteDistance <= 175 && player.hero === 'vanguard') {
      const preferredSkill = target.boss ? 'blazing-rush' : enemies.length > 1 ? 'staff-sweep' : 'sky-breaker';
      if ((player.skillCooldowns?.[preferredSkill] || 0) <= 0) {
        socket.send(JSON.stringify({ type: 'cast_skill', skillId: preferredSkill }));
      }
    }
  });
});

assert.equal(result.state.stage.wave, 4);
if (result.paused) {
  assert.equal(result.state.stage.state, 'active');
  assert.ok(result.state.enemies.some((enemy) => enemy.type === 'cloud-horn-king' && !enemy.dead));
  socket.close();
  console.log('Paused at a live Cloud-Horn Demon King for visual inspection.');
  process.exit(0);
}
assert.equal(result.state.stage.state, 'victory');
assert.deepEqual([...result.observedTypes].sort(), ['cloud-horn-king', 'ember-shaman', 'mountain-scout', 'stone-brute']);
assert.equal(result.observedElite, true);
assert.ok(result.player.inventory.some((entry) => entry.itemId === 'mountain-demon-fragment' && entry.quantity >= 12));
assert.ok(result.player.inventory.some((entry) => entry.itemId === 'vital-brew' && entry.quantity >= 2));

socket.close();
console.log('Cleared all four waves, observed three enemy classes plus boss and elite, and received stage rewards.');
