import assert from 'node:assert/strict';
import WebSocket from 'ws';

const url = process.env.GAME_SERVER_URL || 'ws://127.0.0.1:8787';
const smokeTimeout = Number(process.env.SMOKE_TIMEOUT || 30000);

function connect(timeout = smokeTimeout) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url);
    const timer = setTimeout(() => {
      socket.terminate();
      reject(new Error(`Timed out connecting to ${url}`));
    }, timeout);
    socket.once('open', () => {
      clearTimeout(timer);
      resolve(socket);
    });
    socket.once('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
  });
}

function waitFor(socket, predicate, timeout = smokeTimeout) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off('message', onMessage);
      reject(new Error('Timed out waiting for server message'));
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

const clients = [];
const password = 'friends-only';
const host = await connect();
clients.push(host);
let hostInputSequence = 0;

function sendHostInput(input) {
  hostInputSequence += 1;
  host.send(JSON.stringify({ type: 'input', sequence: hostInputSequence, left: false, right: false, jump: false, attack: false, ...input }));
}
host.send(JSON.stringify({
  type: 'create_room',
  name: 'Host',
  hero: 'vanguard',
  password,
  profile: {
    inventory: [
      { itemId: 'cloudsplitter-iron-rod', quantity: 1 },
      { itemId: 'vital-brew', quantity: 2 },
    ],
    equipment: {},
  },
}));
const hostJoined = await waitFor(host, (message) => message.type === 'joined');
assert.match(hostJoined.roomCode, /^[A-Z0-9]{6}$/);
console.log(`Created room ${hostJoined.roomCode}.`);

const restoredHost = hostJoined.state.players.find((player) => player.id === hostJoined.playerId);
assert.equal(restoredHost.inventory.find((entry) => entry.itemId === 'cloudsplitter-iron-rod')?.quantity, 1);
const equippedStatePromise = waitFor(host, (message) => {
  if (message.type !== 'state') return false;
  const player = message.state.players.find((item) => item.id === hostJoined.playerId);
  return player?.equipment.weapon === 'cloudsplitter-iron-rod';
});
host.send(JSON.stringify({ type: 'equip_item', itemId: 'cloudsplitter-iron-rod' }));
const equippedState = await equippedStatePromise;
const equippedHost = equippedState.state.players.find((player) => player.id === hostJoined.playerId);
assert.equal(equippedHost.combatStats.attack, 9);
console.log('Restored and equipped an authoritative item profile.');

const fullHealthRejectionPromise = waitFor(host, (message) => message.type === 'error' && message.code === 'ITEM_NOT_NEEDED');
host.send(JSON.stringify({ type: 'use_item', itemId: 'vital-brew' }));
await fullHealthRejectionPromise;
console.log('Prevented wasting a healing item at full health.');

const inventoryBeforeLoot = new Map(equippedHost.inventory.map((entry) => [entry.itemId, entry.quantity]));
const combatRangePromise = waitFor(host, (message) => {
  if (message.type !== 'state') return false;
  const player = message.state.players.find((item) => item.id === hostJoined.playerId);
  const enemy = message.state.enemies[0];
  return player?.respawnTimer === 0 && enemy && !enemy.dead && Math.abs(enemy.x - player.x) < 82;
});
sendHostInput({ right: true });
await combatRangePromise;
const lootPickupPromise = waitFor(host, (message) => {
  if (message.type !== 'state') return false;
  const player = message.state.players.find((item) => item.id === hostJoined.playerId);
  const enemy = message.state.enemies[0];
  if (!player || !enemy) return false;

  if (enemy.dead) {
    const drop = message.state.drops[0];
    if (drop) {
      const distanceToDrop = drop.x - player.x;
      sendHostInput({ left: distanceToDrop < -30, right: distanceToDrop > 30 });
    }
  } else {
    const distanceToEnemy = enemy.x - player.x;
    sendHostInput({
      left: distanceToEnemy < -74,
      right: distanceToEnemy > 74,
      attack: Math.abs(distanceToEnemy) <= 90,
    });
  }
  return player?.inventory.some((entry) => entry.quantity !== inventoryBeforeLoot.get(entry.itemId));
});
sendHostInput({ attack: true });
const lootPickupState = await lootPickupPromise;
sendHostInput({});
const lootingHost = lootPickupState.state.players.find((player) => player.id === hostJoined.playerId);
assert.ok(lootingHost.inventory.some((entry) => entry.quantity !== inventoryBeforeLoot.get(entry.itemId)));
console.log('Defeated an enemy and collected its authoritative ground loot.');

const wrongPassword = await connect();
wrongPassword.send(JSON.stringify({ type: 'join_room', roomCode: hostJoined.roomCode, name: 'Stranger', hero: 'vanguard', password: 'wrong' }));
const passwordRejection = await waitFor(wrongPassword, (message) => message.type === 'error');
assert.equal(passwordRejection.code, 'WRONG_PASSWORD');
wrongPassword.close();
console.log('Rejected a wrong password.');

for (let index = 1; index <= 3; index += 1) {
  const guest = await connect();
  clients.push(guest);
  guest.send(JSON.stringify({
    type: 'join_room',
    roomCode: hostJoined.roomCode,
    name: `Guest ${index}`,
    hero: ['sage', 'guardian', 'ranger'][index - 1],
    password,
  }));
  const joined = await waitFor(guest, (message) => message.type === 'joined');
  assert.equal(joined.roomCode, hostJoined.roomCode);
  console.log(`Joined guest ${index}.`);
}

const fourPlayerState = await waitFor(host, (message) => message.type === 'state' && message.state.players.length === 4);
const slots = fourPlayerState.state.players.map((player) => player.slot).sort();
assert.deepEqual(slots, [0, 1, 2, 3]);
console.log('Observed all four player slots.');

const hostBefore = fourPlayerState.state.players.find((player) => player.id === hostJoined.playerId).x;
sendHostInput({ right: true });
const movedState = await waitFor(host, (message) => {
  if (message.type !== 'state' || message.state.players.length !== 4) return false;
  const player = message.state.players.find((item) => item.id === hostJoined.playerId);
  return player && player.x > hostBefore + 4;
});
assert.equal(movedState.state.players.length, 4);
console.log('Observed synchronized movement.');

const overflow = await connect();
overflow.send(JSON.stringify({ type: 'join_room', roomCode: hostJoined.roomCode, name: 'Overflow', hero: 'vanguard', password }));
const rejection = await waitFor(overflow, (message) => message.type === 'error');
assert.equal(rejection.code, 'ROOM_FULL');

for (const socket of clients) socket.close();
overflow.close();
console.log(`Password protection and four-player smoke test passed for room ${hostJoined.roomCode}; fifth client rejected.`);
