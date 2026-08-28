import assert from 'node:assert/strict';
import WebSocket from 'ws';

const url = process.env.GAME_SERVER_URL || 'ws://127.0.0.1:8787';

function waitFor(socket, predicate, timeout = 10_000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off('message', onMessage);
      reject(new Error('Timed out waiting for pause state'));
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

socket.send(JSON.stringify({ type: 'create_room', name: 'Pause Test', hero: 'vanguard', password: 'pause-test' }));
const joined = await waitFor(socket, (message) => message.type === 'joined');
const playerId = joined.playerId;
await waitFor(socket, (message) => message.type === 'state' && message.state.stage.state === 'active' && message.state.enemies.length > 0);

socket.send(JSON.stringify({ type: 'set_pause', paused: true }));
const paused = await waitFor(socket, (message) => message.type === 'state' && message.state.paused && message.state.pausedBy.some((entry) => entry.id === playerId));
const frozenPlayer = paused.state.players.find((player) => player.id === playerId);
const frozenEnemy = paused.state.enemies[0];
const frozenStage = { wave: paused.state.stage.wave, intermission: paused.state.stage.intermission };

socket.send(JSON.stringify({ type: 'input', sequence: 1, left: false, right: true, jump: false, attack: true }));
const later = await waitFor(socket, (message) => message.type === 'state' && message.state.paused && message.state.serverTick >= paused.state.serverTick + 10);
const laterPlayer = later.state.players.find((player) => player.id === playerId);
const laterEnemy = later.state.enemies[0];
assert.equal(laterPlayer.x, frozenPlayer.x, 'paused player position must remain frozen');
assert.equal(laterPlayer.hp, frozenPlayer.hp, 'paused player health must remain frozen');
assert.equal(laterEnemy.x, frozenEnemy.x, 'paused enemy position must remain frozen');
assert.equal(laterEnemy.hp, frozenEnemy.hp, 'paused enemy health must remain frozen');
assert.deepEqual({ wave: later.state.stage.wave, intermission: later.state.stage.intermission }, frozenStage, 'stage timers must remain frozen');

socket.send(JSON.stringify({ type: 'set_pause', paused: false }));
await waitFor(socket, (message) => message.type === 'state' && !message.state.paused);
socket.send(JSON.stringify({ type: 'input', sequence: 2, left: false, right: true, jump: false, attack: false }));
await waitFor(socket, (message) => {
  if (message.type !== 'state' || message.state.paused) return false;
  const player = message.state.players.find((entry) => entry.id === playerId);
  return player?.x > frozenPlayer.x + 8;
});

socket.close();
console.log('Room pause freezes players, enemies, combat, and stage progression, then resumes cleanly.');
