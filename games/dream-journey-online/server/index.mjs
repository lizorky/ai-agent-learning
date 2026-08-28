import { createServer, request as createProxyRequest } from 'node:http';
import { randomBytes, randomUUID, scryptSync, timingSafeEqual } from 'node:crypto';
import { WebSocket, WebSocketServer } from 'ws';
import itemCatalogData from '../data/item-catalog.json' with { type: 'json' };

const PORT = Number(process.env.GAME_SERVER_PORT || 8787);
const HOST = process.env.GAME_SERVER_HOST || '127.0.0.1';
const FRONTEND_PROXY_URL = process.env.FRONTEND_PROXY_URL || 'http://127.0.0.1:3000';
const MAX_PLAYERS = 4;
const BROADCAST_RATE = 20;
const SIMULATION_RATE = 60;
const ROOM_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const HEROES = new Set(['vanguard', 'sage', 'guardian', 'ranger']);
const PLAYER_COLORS = ['#d85a34', '#4f8f9d', '#b28a3f', '#6b78b8'];
const ITEM_CATALOG = itemCatalogData;
const ITEM_BY_ID = new Map(ITEM_CATALOG.map((item) => [item.id, item]));
const EQUIPMENT_SLOTS = new Set(['weapon', 'armor', 'trinket']);
const PICKUP_RADIUS = 88;
const SKILLS = {
  'staff-sweep': { cost: 12, cooldown: 3.2, duration: 0.42, impactAt: 0.24, damage: 30, range: 150, knockback: 260, maxTargets: 4 },
  'sky-breaker': { cost: 20, cooldown: 5.5, duration: 0.58, impactAt: 0.3, damage: 48, range: 125, knockback: 380, maxTargets: 2 },
  'blazing-rush': { cost: 28, cooldown: 9, duration: 0.72, impactAt: 0.38, damage: 72, range: 185, knockback: 520, maxTargets: 3 },
};
const BASIC_ATTACKS = {
  vanguard: [
    { duration: 0.3, impactAt: 0.13, start: 34, reach: 116 },
    { duration: 0.34, impactAt: 0.15, start: 36, reach: 130 },
    { duration: 0.42, impactAt: 0.19, start: 38, reach: 152 },
  ],
  default: [
    { duration: 0.26, impactAt: 0.11, start: 30, reach: 100 },
    { duration: 0.3, impactAt: 0.13, start: 32, reach: 112 },
    { duration: 0.36, impactAt: 0.16, start: 34, reach: 128 },
  ],
};
const ENEMY_TYPES = {
  'mountain-scout': { name: '青角山妖', hp: 64, speed: 108, damage: 7, attackRange: 70, attackCooldown: 1.05, attackDuration: 0.42, impactAt: 0.18, scale: 0.88 },
  'stone-brute': { name: '石甲力士', hp: 145, speed: 58, damage: 14, attackRange: 86, attackCooldown: 1.5, attackDuration: 0.62, impactAt: 0.24, scale: 1.06 },
  'ember-shaman': { name: '火符妖巫', hp: 96, speed: 68, damage: 10, attackRange: 270, preferredRange: 205, attackCooldown: 1.7, attackDuration: 0.58, impactAt: 0.22, ranged: true, projectileColor: '#ff7a22', scale: 0.94 },
  'cloud-horn-king': { name: '云角魔王', hp: 520, speed: 54, damage: 19, attackRange: 300, preferredRange: 185, attackCooldown: 1.35, attackDuration: 0.68, impactAt: 0.26, ranged: true, projectileColor: '#f2b33d', scale: 1.46, boss: true },
};
const WAVES = [
  { name: '巡山妖兵', enemies: [{ type: 'mountain-scout', x: 850 }, { type: 'mountain-scout', x: 1050 }] },
  { name: '岩关阻路', enemies: [{ type: 'mountain-scout', x: 790 }, { type: 'stone-brute', x: 970 }, { type: 'mountain-scout', x: 1120 }] },
  { name: '妖火精锐', enemies: [{ type: 'ember-shaman', x: 820 }, { type: 'stone-brute', x: 1010, elite: true }, { type: 'mountain-scout', x: 1130 }] },
  { name: '云角魔王', enemies: [{ type: 'cloud-horn-king', x: 990, boss: true }] },
];
const rooms = new Map();

const httpServer = createServer((request, response) => {
  response.setHeader('Access-Control-Allow-Origin', '*');
  response.setHeader('Cache-Control', 'no-store');

  if (request.url === '/health') {
    response.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    response.end(JSON.stringify({ ok: true, rooms: rooms.size, players: countPlayers() }));
    return;
  }

  proxyToFrontend(request, response);
});

const wss = new WebSocketServer({
  server: httpServer,
  maxPayload: 8 * 1024,
  perMessageDeflate: false,
});

wss.on('connection', (socket) => {
  socket.isAlive = true;
  socket.playerId = null;
  socket.roomCode = null;

  socket.on('pong', () => {
    socket.isAlive = true;
  });

  socket.on('message', (raw) => {
    let message;
    try {
      message = JSON.parse(raw.toString());
    } catch {
      send(socket, { type: 'error', code: 'BAD_MESSAGE', message: '消息格式无效' });
      return;
    }

    if (!message || typeof message.type !== 'string') {
      send(socket, { type: 'error', code: 'BAD_MESSAGE', message: '缺少消息类型' });
      return;
    }

    if (message.type === 'create_room') {
      leaveCurrentRoom(socket);
      const password = cleanPassword(message.password);
      if (password.length < 4) {
        send(socket, { type: 'error', code: 'PASSWORD_REQUIRED', message: '房间口令至少需要四个字符' });
        return;
      }
      const code = createRoomCode();
      const room = createRoom(code, password);
      rooms.set(code, room);
      joinRoom(socket, room, message);
      return;
    }

    if (message.type === 'join_room') {
      leaveCurrentRoom(socket);
      const code = cleanRoomCode(message.roomCode);
      const room = rooms.get(code);
      if (!room) {
        send(socket, { type: 'error', code: 'ROOM_NOT_FOUND', message: '未找到该房间' });
        return;
      }
      if (room.players.size >= MAX_PLAYERS) {
        send(socket, { type: 'error', code: 'ROOM_FULL', message: '房间已经满员' });
        return;
      }
      if (!verifyRoomPassword(room, cleanPassword(message.password))) {
        send(socket, { type: 'error', code: 'WRONG_PASSWORD', message: '房间口令不正确' });
        return;
      }
      joinRoom(socket, room, message);
      return;
    }

    if (message.type === 'input') {
      applyInput(socket, message);
      return;
    }

    if (message.type === 'cast_skill') {
      castSkill(socket, message.skillId);
      return;
    }

    if (message.type === 'restart_stage') {
      restartStage(socket);
      return;
    }

    if (message.type === 'set_pause') {
      setRoomPause(socket, message.paused === true);
      return;
    }

    if (message.type === 'equip_item') {
      equipItem(socket, message.itemId);
      return;
    }

    if (message.type === 'use_item') {
      useItem(socket, message.itemId);
      return;
    }

    if (message.type === 'ping') {
      send(socket, { type: 'pong', at: Date.now(), echo: Number(message.at) || 0 });
    }
  });

  socket.on('close', () => leaveCurrentRoom(socket));
  socket.on('error', () => leaveCurrentRoom(socket));
});

function createRoom(code, password) {
  const passwordSalt = randomBytes(16);
  return {
    code,
    createdAt: Date.now(),
    players: new Map(),
    sockets: new Map(),
    drops: [],
    enemies: [],
    projectiles: [],
    combatEffects: [],
    pauseOwners: new Set(),
    stage: {
      state: 'waiting',
      wave: 0,
      maxWaves: WAVES.length,
      waveName: '',
      intermission: 0,
      defeated: 0,
      rewardGranted: false,
    },
    passwordSalt,
    passwordHash: scryptSync(password, passwordSalt, 32),
    serverTick: 0,
  };
}

function proxyToFrontend(clientRequest, clientResponse) {
  const target = new URL(clientRequest.url || '/', FRONTEND_PROXY_URL);
  const upstream = createProxyRequest({
    hostname: target.hostname,
    port: target.port || 80,
    path: `${target.pathname}${target.search}`,
    method: clientRequest.method,
    headers: {
      ...clientRequest.headers,
      host: target.host,
      'x-forwarded-host': clientRequest.headers.host || '',
      'x-forwarded-proto': clientRequest.headers['x-forwarded-proto'] || 'http',
    },
  }, (upstreamResponse) => {
    clientResponse.writeHead(upstreamResponse.statusCode || 502, upstreamResponse.headers);
    upstreamResponse.pipe(clientResponse);
  });

  upstream.on('error', () => {
    if (!clientResponse.headersSent) {
      clientResponse.writeHead(502, { 'Content-Type': 'text/plain; charset=utf-8' });
    }
    clientResponse.end('Frontend server is not available');
  });
  clientRequest.pipe(upstream);
}

function joinRoom(socket, room, message) {
  const slot = firstOpenSlot(room);
  const playerId = randomUUID();
  const hero = HEROES.has(message.hero) ? message.hero : 'vanguard';
  const player = {
    id: playerId,
    slot,
    name: cleanName(message.name),
    hero,
    color: PLAYER_COLORS[slot],
    x: 120 + slot * 72,
    y: 440,
    vx: 0,
    vy: 0,
    facing: 1,
    hp: 100,
    maxHp: 100,
    mp: 60,
    maxMp: 60,
    inventory: new Map(),
    equipment: { weapon: null, armor: null, trinket: null },
    combatStats: { attack: 0, defense: 0, crit: 0 },
    onGround: true,
    attacking: 0,
    attackDuration: 0,
    attackImpactAt: 0,
    attackStart: 0,
    attackReach: 0,
    attackCooldown: 0,
    attackHit: false,
    comboStep: 0,
    comboWindow: 0,
    hitStun: 0,
    invulnerable: 0,
    skill: null,
    skillTimer: 0,
    skillDuration: 0,
    skillHit: false,
    skillCooldowns: Object.fromEntries(Object.keys(SKILLS).map((skillId) => [skillId, 0])),
    respawnTimer: 0,
    jumpBuffer: 0,
    attackBuffer: 0,
    lastInputSequence: 0,
    input: { left: false, right: false, jump: false, attack: false },
  };

  restorePlayerProfile(player, message.profile);
  refreshPlayerStats(player, true);

  socket.playerId = playerId;
  socket.roomCode = room.code;
  room.players.set(playerId, player);
  room.sockets.set(playerId, socket);
  if (room.stage.state === 'waiting') spawnWave(room, 1);

  send(socket, {
    type: 'joined',
    playerId,
    roomCode: room.code,
    maxPlayers: MAX_PLAYERS,
    simulationRate: SIMULATION_RATE,
    state: serializeRoom(room),
  });

  broadcast(room, {
    type: 'system',
    message: `${player.name} 加入了队伍`,
  }, playerId);
}

function applyInput(socket, message) {
  if (!socket.roomCode || !socket.playerId) return;
  const room = rooms.get(socket.roomCode);
  const player = room?.players.get(socket.playerId);
  if (!player) return;

  if (room.pauseOwners.size > 0) {
    player.input = { left: false, right: false, jump: false, attack: false };
    player.jumpBuffer = 0;
    player.attackBuffer = 0;
    return;
  }

  const sequence = Math.max(0, Math.floor(Number(message.sequence) || 0));
  if (sequence < player.lastInputSequence) return;
  player.lastInputSequence = sequence;
  if (message.jump === true && !player.input.jump) player.jumpBuffer = 0.18;
  if (message.attack === true && !player.input.attack) player.attackBuffer = 0.2;
  player.input.left = message.left === true;
  player.input.right = message.right === true;
  player.input.jump = message.jump === true;
  player.input.attack = message.attack === true;
}

function castSkill(socket, skillIdValue) {
  const context = getSocketPlayer(socket);
  if (!context) return;
  const skillId = String(skillIdValue || '');
  const skill = SKILLS[skillId];
  const player = context.player;
  if (context.room.pauseOwners.size > 0) return;
  if (!skill || player.hero !== 'vanguard') return;
  if (player.respawnTimer > 0 || player.hitStun > 0 || player.skill || player.attacking > 0) return;
  if ((player.skillCooldowns[skillId] || 0) > 0) return;
  if (player.mp < skill.cost) {
    send(socket, { type: 'error', code: 'SKILL_MANA', message: '法力不足' });
    return;
  }

  player.mp -= skill.cost;
  player.skill = skillId;
  player.skillTimer = skill.duration;
  player.skillDuration = skill.duration;
  player.skillHit = false;
  player.skillCooldowns[skillId] = skill.cooldown;
  player.comboWindow = 0;
  player.comboStep = 0;
}

function setRoomPause(socket, paused) {
  const context = getSocketPlayer(socket);
  if (!context) return;
  const { room, player } = context;
  const wasPaused = room.pauseOwners.size > 0;
  if (paused) room.pauseOwners.add(player.id);
  else room.pauseOwners.delete(player.id);

  player.input = { left: false, right: false, jump: false, attack: false };
  player.jumpBuffer = 0;
  player.attackBuffer = 0;

  const isPaused = room.pauseOwners.size > 0;
  if (!wasPaused && isPaused) broadcast(room, { type: 'system', message: `${player.name} 暂停了游戏` });
  if (wasPaused && !isPaused) broadcast(room, { type: 'system', message: '游戏继续' });
}

function restartStage(socket) {
  const context = getSocketPlayer(socket);
  if (!context || context.room.stage.state !== 'victory') return;
  const room = context.room;
  room.enemies = [];
  room.projectiles = [];
  room.combatEffects = [];
  room.drops = [];
  room.stage = {
    state: 'waiting',
    wave: 0,
    maxWaves: WAVES.length,
    waveName: '',
    intermission: 0,
    defeated: 0,
    rewardGranted: false,
  };
  for (const player of room.players.values()) respawnPlayer(player);
  spawnWave(room, 1);
  broadcast(room, { type: 'system', message: '小队重新踏上了云栈古道' });
}

function equipItem(socket, itemIdValue) {
  const context = getSocketPlayer(socket);
  if (!context) return;
  const itemId = String(itemIdValue || '');
  const item = ITEM_BY_ID.get(itemId);
  if (!item || !EQUIPMENT_SLOTS.has(item.slot) || (context.player.inventory.get(itemId) || 0) < 1) {
    send(socket, { type: 'error', code: 'ITEM_NOT_OWNED', message: '无法装备该道具' });
    return;
  }

  context.player.equipment[item.slot] = itemId;
  refreshPlayerStats(context.player);
  send(socket, { type: 'system', message: `已装备 ${item.name}` });
}

function useItem(socket, itemIdValue) {
  const context = getSocketPlayer(socket);
  if (!context) return;
  const itemId = String(itemIdValue || '');
  const item = ITEM_BY_ID.get(itemId);
  const quantity = context.player.inventory.get(itemId) || 0;
  if (!item || item.slot !== 'consumable' || quantity < 1) {
    send(socket, { type: 'error', code: 'ITEM_NOT_USABLE', message: '无法使用该道具' });
    return;
  }

  const healthGain = Math.max(0, Number(item.effect?.health) || 0);
  const manaGain = Math.max(0, Number(item.effect?.mana) || 0);
  const nextHp = Math.min(context.player.maxHp, context.player.hp + healthGain);
  const nextMp = Math.min(context.player.maxMp, context.player.mp + manaGain);
  if (nextHp === context.player.hp && nextMp === context.player.mp) {
    send(socket, { type: 'error', code: 'ITEM_NOT_NEEDED', message: '当前状态无需使用该道具' });
    return;
  }

  context.player.hp = nextHp;
  context.player.mp = nextMp;
  setInventoryQuantity(context.player, itemId, quantity - 1);
  send(socket, { type: 'system', message: `使用了 ${item.name}` });
}

function getSocketPlayer(socket) {
  if (!socket.roomCode || !socket.playerId) return null;
  const room = rooms.get(socket.roomCode);
  const player = room?.players.get(socket.playerId);
  return room && player ? { room, player } : null;
}

function leaveCurrentRoom(socket) {
  if (!socket.roomCode || !socket.playerId) return;
  const room = rooms.get(socket.roomCode);
  const player = room?.players.get(socket.playerId);

  if (room) {
    const wasPaused = room.pauseOwners.size > 0;
    room.pauseOwners.delete(socket.playerId);
    room.players.delete(socket.playerId);
    room.sockets.delete(socket.playerId);
    if (player) {
      broadcast(room, { type: 'system', message: `${player.name} 离开了队伍` });
    }
    if (wasPaused && room.pauseOwners.size === 0 && room.players.size > 0) {
      broadcast(room, { type: 'system', message: '游戏继续' });
    }
    if (room.players.size === 0) rooms.delete(room.code);
  }

  socket.playerId = null;
  socket.roomCode = null;
}

function simulateRoom(room, delta) {
  room.serverTick += 1;
  if (room.pauseOwners.size > 0) return;
  const groundY = 440;
  const now = Date.now();
  room.combatEffects = room.combatEffects.filter((effect) => now - effect.createdAt < 1100);

  if (room.stage.state === 'intermission') {
    room.stage.intermission = Math.max(0, room.stage.intermission - delta);
    if (room.stage.intermission === 0) spawnWave(room, room.stage.wave + 1);
  }

  for (const player of room.players.values()) {
    if (player.respawnTimer > 0) {
      player.respawnTimer = Math.max(0, player.respawnTimer - delta);
      if (player.respawnTimer === 0) respawnPlayer(player);
      continue;
    }

    player.attackCooldown = Math.max(0, player.attackCooldown - delta);
    player.attacking = Math.max(0, player.attacking - delta);
    player.comboWindow = Math.max(0, player.comboWindow - delta);
    player.jumpBuffer = Math.max(0, player.jumpBuffer - delta);
    player.attackBuffer = Math.max(0, player.attackBuffer - delta);
    player.hitStun = Math.max(0, player.hitStun - delta);
    player.invulnerable = Math.max(0, player.invulnerable - delta);
    player.mp = Math.min(player.maxMp, player.mp + delta * 3.5);
    for (const skillId of Object.keys(SKILLS)) {
      player.skillCooldowns[skillId] = Math.max(0, player.skillCooldowns[skillId] - delta);
    }

    const movement = player.hitStun > 0 || player.skill ? 0 : Number(player.input.right) - Number(player.input.left);
    const targetVelocity = movement * 255;
    const movementResponse = player.hitStun > 0 ? 3 : 14;
    player.vx += (targetVelocity - player.vx) * Math.min(1, delta * movementResponse);
    if (movement !== 0) player.facing = Math.sign(movement);

    if ((player.input.jump || player.jumpBuffer > 0) && player.onGround && player.hitStun <= 0 && !player.skill) {
      player.vy = -620;
      player.onGround = false;
      player.jumpBuffer = 0;
    }

    if ((player.input.attack || player.attackBuffer > 0) && player.attackCooldown <= 0 && player.hitStun <= 0 && !player.skill) {
      player.comboStep = player.comboWindow > 0 ? player.comboStep % 3 + 1 : 1;
      player.comboWindow = 0.82;
      const attack = basicAttackProfile(player.hero, player.comboStep);
      player.attacking = attack.duration;
      player.attackDuration = attack.duration;
      player.attackImpactAt = attack.impactAt;
      player.attackStart = attack.start;
      player.attackReach = attack.reach;
      player.attackCooldown = heroAttackCooldown(player.hero);
      player.attackHit = false;
      player.attackBuffer = 0;
    }

    if (player.skill) {
      const skill = SKILLS[player.skill];
      player.skillTimer = Math.max(0, player.skillTimer - delta);
      if (player.skill === 'blazing-rush' && player.skillTimer > 0.18) {
        player.vx = player.facing * 420;
      }
      if (!player.skillHit && player.skillTimer <= skill.impactAt) {
        const damage = skill.damage + player.combatStats.attack;
        hitEnemies(room, player, damage, skill.range, skill.knockback, 0.32, skill.maxTargets, false, 10);
        player.skillHit = true;
      }
      if (player.skillTimer === 0) {
        player.skill = null;
        player.skillDuration = 0;
        player.skillHit = false;
      }
    }

    player.vy += 1500 * delta;
    player.x = clamp(player.x + player.vx * delta, 36, 1164);
    player.y += player.vy * delta;

    if (player.y >= groundY) {
      player.y = groundY;
      player.vy = 0;
      player.onGround = true;
    }

    if (player.attacking > 0 && !player.attackHit && player.attacking <= player.attackImpactAt) {
      const comboDamage = [1, 1, 1.18, 1.48][player.comboStep] || 1;
      const critical = Math.random() * 100 < player.combatStats.crit;
      const damage = Math.round((heroDamage(player.hero) + player.combatStats.attack) * comboDamage * (critical ? 1.5 : 1));
      const comboKnockback = player.comboStep === 3 ? 380 : player.comboStep === 2 ? 230 : 155;
      hitEnemies(room, player, damage, player.attackReach, comboKnockback, player.comboStep === 3 ? 0.26 : 0.14, 1, critical, player.attackStart);
      player.attackHit = true;
    }
  }

  simulateEnemies(room, delta);
  simulateProjectiles(room, delta);
  processGroundDrops(room);
  updateStage(room);
}

function simulateEnemies(room, delta) {
  const targets = [...room.players.values()].filter((player) => player.respawnTimer <= 0);
  for (const enemy of room.enemies) {
    if (enemy.dead) {
      enemy.deathTimer = Math.max(0, enemy.deathTimer - delta);
      enemy.vx *= Math.max(0, 1 - delta * 7);
      enemy.x = clamp(enemy.x + enemy.vx * delta, 55, 1145);
      continue;
    }

    enemy.attackCooldown = Math.max(0, enemy.attackCooldown - delta);
    enemy.attackTimer = Math.max(0, enemy.attackTimer - delta);
    enemy.hitStun = Math.max(0, enemy.hitStun - delta);
    if (targets.length === 0) continue;
    const target = targets.reduce((closest, player) =>
      Math.abs(player.x - enemy.x) < Math.abs(closest.x - enemy.x) ? player : closest,
    );
    const distance = target.x - enemy.x;
    enemy.facing = distance === 0 ? enemy.facing : Math.sign(distance);

    if (enemy.hitStun > 0) {
      enemy.vx *= Math.max(0, 1 - delta * 5);
      enemy.x = clamp(enemy.x + enemy.vx * delta, 55, 1145);
      continue;
    }

    if (enemy.attackTimer > 0) {
      enemy.vx *= Math.max(0, 1 - delta * 14);
      if (!enemy.attackHit && enemy.attackTimer <= enemy.impactAt) {
        enemy.attackHit = true;
        if (enemy.ranged) {
          spawnProjectile(room, enemy, target);
        } else if (Math.abs(distance) <= enemy.attackRange + 18) {
          applyPlayerDamage(room, target, enemy.damage, enemy.facing, enemy.x);
        }
      }
      continue;
    }

    const absoluteDistance = Math.abs(distance);
    let movementDirection = 0;
    if (enemy.ranged) {
      if (absoluteDistance > enemy.preferredRange + 35) movementDirection = enemy.facing;
      else if (absoluteDistance < enemy.preferredRange - 45) movementDirection = -enemy.facing;
    } else if (absoluteDistance > enemy.attackRange - 4) {
      movementDirection = enemy.facing;
    }

    if (movementDirection !== 0) {
      enemy.vx += (movementDirection * enemy.speed - enemy.vx) * Math.min(1, delta * 8);
      enemy.x = clamp(enemy.x + enemy.vx * delta, 55, 1145);
    } else {
      enemy.vx *= Math.max(0, 1 - delta * 12);
      if (enemy.attackCooldown <= 0) {
        enemy.attackTimer = enemy.attackDuration;
        enemy.attackHit = false;
        enemy.attackCooldown = enemy.attackCooldownDuration;
      }
    }
  }

  const livingEnemies = room.enemies.filter((enemy) => !enemy.dead).sort((left, right) => left.x - right.x);
  for (let index = 0; index < livingEnemies.length - 1; index += 1) {
    const left = livingEnemies[index];
    const right = livingEnemies[index + 1];
    const minimumSpacing = 54 * Math.min(1.45, (left.scale + right.scale) / 2);
    const overlap = minimumSpacing - (right.x - left.x);
    if (overlap <= 0) continue;
    left.x = clamp(left.x - overlap / 2, 55, 1145);
    right.x = clamp(right.x + overlap / 2, 55, 1145);
  }

  room.enemies = room.enemies.filter((enemy) => !enemy.dead || enemy.deathTimer > 0);
}

function simulateProjectiles(room, delta) {
  for (const projectile of room.projectiles) {
    projectile.life -= delta;
    projectile.x += projectile.vx * delta;
    projectile.y += projectile.vy * delta;
    projectile.vy += projectile.gravity * delta;
    if (projectile.life <= 0 || projectile.x < -40 || projectile.x > 1240 || projectile.y > 520) continue;
    for (const player of room.players.values()) {
      if (player.respawnTimer > 0 || player.invulnerable > 0) continue;
      if (Math.hypot(projectile.x - player.x, projectile.y - (player.y - 70)) <= projectile.radius + 25) {
        applyPlayerDamage(room, player, projectile.damage, Math.sign(projectile.vx) || 1, projectile.x);
        projectile.life = 0;
        break;
      }
    }
  }
  room.projectiles = room.projectiles.filter((projectile) => projectile.life > 0 && projectile.x >= -40 && projectile.x <= 1240 && projectile.y <= 520);
}

function spawnProjectile(room, enemy, target) {
  const sourceY = enemy.y - (enemy.isBoss ? 125 : 88);
  const targetY = target.y - 70;
  const dx = target.x - enemy.x;
  const dy = targetY - sourceY;
  const distance = Math.max(1, Math.hypot(dx, dy));
  const speed = enemy.isBoss ? 360 : 285;
  room.projectiles.push({
    id: randomUUID(),
    x: enemy.x + enemy.facing * 44,
    y: sourceY,
    vx: dx / distance * speed,
    vy: dy / distance * speed - (enemy.isBoss ? 35 : 0),
    gravity: enemy.isBoss ? 55 : 0,
    radius: enemy.isBoss ? 20 : 13,
    damage: enemy.damage,
    color: enemy.projectileColor,
    boss: enemy.isBoss,
    life: 3.2,
  });
}

function applyPlayerDamage(room, player, rawDamage, direction, sourceX) {
  if (player.invulnerable > 0 || player.respawnTimer > 0) return false;
  const incomingDamage = Math.max(1, Math.round(rawDamage - player.combatStats.defense));
  player.hp = Math.max(0, player.hp - incomingDamage);
  player.vx = direction * 270;
  player.hitStun = 0.3;
  player.invulnerable = 0.8;
  player.attacking = 0;
  player.attackDuration = 0;
  player.attackImpactAt = 0;
  player.attackStart = 0;
  player.attackReach = 0;
  player.skill = null;
  player.skillTimer = 0;
  addCombatEffect(room, 'damage-player', player.x, player.y - 105, incomingDamage, '#ff7b5a');
  addCombatEffect(room, 'impact', sourceX, player.y - 72, 0, '#ff9a5d');
  if (player.hp === 0) player.respawnTimer = 3;
  return true;
}

function hitEnemies(room, player, damage, range, knockback, hitStun, maxTargets = 1, critical = false, forwardStart = 24) {
  const candidates = room.enemies
    .filter((enemy) => {
      if (enemy.dead || Math.abs(enemy.y - player.y) >= 100) return false;
      const forwardDistance = (enemy.x - player.x) * player.facing;
      const enemyHurtRadius = 28 * enemy.scale;
      return forwardDistance + enemyHurtRadius >= forwardStart && forwardDistance - enemyHurtRadius <= range;
    })
    .sort((left, right) => Math.abs(left.x - player.x) - Math.abs(right.x - player.x))
    .slice(0, maxTargets);

  for (const enemy of candidates) {
    const resistance = enemy.isBoss ? 0.92 : enemy.isElite ? 0.96 : 1;
    const actualDamage = Math.max(1, Math.round(damage * resistance));
    enemy.hp = Math.max(0, enemy.hp - actualDamage);
    const knockbackResistance = enemy.isBoss ? 0.12 : enemy.isElite ? 0.36 : 1;
    enemy.vx = player.facing * knockback * knockbackResistance;
    enemy.hitStun = Math.max(enemy.hitStun, hitStun * (enemy.isBoss ? 0.45 : enemy.isElite ? 0.7 : 1));
    enemy.attackTimer = 0;
    enemy.attackHit = false;
    addCombatEffect(room, 'damage-enemy', enemy.x, enemy.y - 135 * enemy.scale, actualDamage, critical ? '#ffd85d' : '#fff0c0', critical);
    addCombatEffect(room, 'impact', enemy.x - player.facing * 16, enemy.y - 78 * enemy.scale, 0, critical ? '#ffd85d' : '#ff9a3c');
    if (enemy.hp === 0) defeatEnemy(room, player, enemy);
  }
  return candidates.length > 0;
}

function defeatEnemy(room, player, enemy) {
  if (enemy.dead) return;
  enemy.dead = true;
  enemy.deathTimer = enemy.isBoss ? 1.4 : 0.72;
  enemy.attackTimer = 0;
  enemy.vx *= 0.35;
  room.stage.defeated += 1;
  spawnEnemyLoot(room, player, enemy);
  if (enemy.isBoss) broadcast(room, { type: 'system', message: `${player.name} 击败了云角魔王！` });
}

function addCombatEffect(room, type, x, y, value, color, critical = false) {
  room.combatEffects.push({ id: randomUUID(), type, x, y, value, color, critical, createdAt: Date.now() });
}

function createEnemy(room, spec) {
  const definition = ENEMY_TYPES[spec.type] || ENEMY_TYPES['mountain-scout'];
  const playerScale = 1 + Math.max(0, room.players.size - 1) * 0.25;
  const eliteScale = spec.elite ? 1.62 : 1;
  const maxHp = Math.round(definition.hp * playerScale * eliteScale);
  return {
    id: randomUUID(),
    type: spec.type,
    name: spec.elite ? '金甲石将' : definition.name,
    x: spec.x,
    y: 440,
    vx: 0,
    hp: maxHp,
    maxHp,
    facing: -1,
    speed: definition.speed * (spec.elite ? 1.08 : 1),
    damage: definition.damage * (spec.elite ? 1.25 : 1),
    attackRange: definition.attackRange,
    preferredRange: definition.preferredRange || definition.attackRange,
    ranged: definition.ranged === true,
    projectileColor: definition.projectileColor || '#ff9a3c',
    scale: definition.scale * (spec.elite ? 1.18 : 1),
    isElite: spec.elite === true,
    isBoss: spec.boss === true || definition.boss === true,
    attackCooldown: 0.45,
    attackCooldownDuration: definition.attackCooldown,
    attackDuration: definition.attackDuration,
    impactAt: definition.impactAt,
    attackTimer: 0,
    attackHit: false,
    hitStun: 0,
    dead: false,
    deathTimer: 0,
  };
}

function spawnWave(room, waveNumber) {
  const wave = WAVES[waveNumber - 1];
  if (!wave) return;
  room.enemies = wave.enemies.map((spec) => createEnemy(room, spec));
  room.projectiles = [];
  room.stage.state = 'active';
  room.stage.wave = waveNumber;
  room.stage.waveName = wave.name;
  room.stage.intermission = 0;
  for (const player of room.players.values()) {
    if (player.respawnTimer > 0) respawnPlayer(player);
    player.hp = Math.min(player.maxHp, player.hp + (waveNumber === 1 ? player.maxHp : 18));
    player.mp = Math.min(player.maxMp, player.mp + (waveNumber === 1 ? player.maxMp : 12));
  }
  broadcast(room, { type: 'system', message: `第 ${waveNumber} 波 · ${wave.name}` });
}

function updateStage(room) {
  if (room.stage.state !== 'active') return;
  if (room.enemies.some((enemy) => !enemy.dead)) return;
  if (room.stage.wave < room.stage.maxWaves) {
    room.stage.state = 'intermission';
    room.stage.intermission = 2.6;
    broadcast(room, { type: 'system', message: `第 ${room.stage.wave} 波已清除，准备迎战下一波` });
    return;
  }
  completeStage(room);
}

function completeStage(room) {
  if (room.stage.rewardGranted) return;
  room.stage.state = 'victory';
  room.stage.waveName = '古道已平定';
  room.stage.rewardGranted = true;
  room.projectiles = [];
  for (const player of room.players.values()) {
    addInventoryItem(player, 'mountain-demon-fragment', 12);
    addInventoryItem(player, 'vital-brew', 2);
    if ((player.inventory.get('sunfire-cudgel') || 0) < 1) addInventoryItem(player, 'sunfire-cudgel', 1);
    else addInventoryItem(player, 'mountain-demon-fragment', 8);
  }
  addCombatEffect(room, 'victory', 600, 190, 0, '#ffd567');
  broadcast(room, { type: 'system', message: '云栈古道通关！奖励已放入全队行囊' });
}

function respawnPlayer(player) {
  player.hp = player.maxHp;
  player.mp = player.maxMp;
  player.x = 120 + player.slot * 72;
  player.y = 440;
  player.vx = 0;
  player.vy = 0;
  player.onGround = true;
  player.attacking = 0;
  player.attackDuration = 0;
  player.attackImpactAt = 0;
  player.attackStart = 0;
  player.attackReach = 0;
  player.comboStep = 0;
  player.comboWindow = 0;
  player.hitStun = 0;
  player.invulnerable = 1;
  player.skill = null;
  player.skillTimer = 0;
  player.jumpBuffer = 0;
  player.attackBuffer = 0;
}

function serializeRoom(room) {
  return {
    roomCode: room.code,
    serverTick: room.serverTick,
    sentAt: Date.now(),
    paused: room.pauseOwners.size > 0,
    pausedBy: [...room.pauseOwners].map((playerId) => ({ id: playerId, name: room.players.get(playerId)?.name || '队友' })),
    stage: {
      state: room.stage.state,
      wave: room.stage.wave,
      maxWaves: room.stage.maxWaves,
      waveName: room.stage.waveName,
      intermission: round(room.stage.intermission),
      remainingEnemies: room.enemies.filter((enemy) => !enemy.dead).length,
      defeated: room.stage.defeated,
    },
    players: [...room.players.values()].map((player) => ({
      id: player.id,
      slot: player.slot,
      name: player.name,
      hero: player.hero,
      color: player.color,
      x: round(player.x),
      y: round(player.y),
      vx: round(player.vx),
      vy: round(player.vy),
      facing: player.facing,
      hp: player.hp,
      maxHp: player.maxHp,
      mp: round(player.mp),
      maxMp: player.maxMp,
      inventory: [...player.inventory].map(([itemId, quantity]) => ({ itemId, quantity })),
      equipment: { ...player.equipment },
      combatStats: { ...player.combatStats },
      onGround: player.onGround,
      attacking: player.attacking > 0,
      attackTimer: round(player.attacking),
      attackDuration: round(player.attackDuration),
      attackImpactAt: round(player.attackImpactAt),
      attackStart: round(player.attackStart),
      attackReach: round(player.attackReach),
      comboStep: player.comboStep,
      hitStun: round(player.hitStun),
      invulnerable: round(player.invulnerable),
      skill: player.skill,
      skillTimer: round(player.skillTimer),
      skillDuration: round(player.skillDuration),
      skillCooldowns: Object.fromEntries(Object.entries(player.skillCooldowns).map(([skillId, cooldown]) => [skillId, round(cooldown)])),
      respawnTimer: round(player.respawnTimer),
      lastInputSequence: player.lastInputSequence,
    })),
    enemies: room.enemies.map((enemy) => ({
      id: enemy.id,
      type: enemy.type,
      name: enemy.name,
      x: round(enemy.x),
      y: round(enemy.y),
      vx: round(enemy.vx),
      facing: enemy.facing,
      hp: enemy.hp,
      maxHp: enemy.maxHp,
      scale: round(enemy.scale),
      elite: enemy.isElite,
      boss: enemy.isBoss,
      ranged: enemy.ranged,
      attacking: enemy.attackTimer > 0,
      attackTimer: round(enemy.attackTimer),
      hitStun: round(enemy.hitStun),
      dead: enemy.dead,
      deathTimer: round(enemy.deathTimer),
      respawnTimer: 0,
    })),
    projectiles: room.projectiles.map((projectile) => ({
      id: projectile.id,
      x: round(projectile.x),
      y: round(projectile.y),
      radius: projectile.radius,
      color: projectile.color,
      boss: projectile.boss,
    })),
    combatEffects: room.combatEffects.map((effect) => ({
      id: effect.id,
      type: effect.type,
      x: round(effect.x),
      y: round(effect.y),
      value: effect.value,
      color: effect.color,
      critical: effect.critical,
      life: round(Math.max(0, 1.1 - (Date.now() - effect.createdAt) / 1000)),
    })),
    drops: room.drops.map((drop) => ({
      id: drop.id,
      itemId: drop.itemId,
      x: round(drop.x),
      y: round(drop.y),
      quantity: drop.quantity,
    })),
  };
}

function broadcastStates() {
  for (const room of rooms.values()) {
    broadcast(room, { type: 'state', state: serializeRoom(room) });
  }
}

function broadcast(room, payload, exceptPlayerId = null) {
  const encoded = JSON.stringify(payload);
  for (const [playerId, socket] of room.sockets) {
    if (playerId !== exceptPlayerId && socket.readyState === WebSocket.OPEN) {
      socket.send(encoded);
    }
  }
}

function send(socket, payload) {
  if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(payload));
}

function createRoomCode() {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    let code = '';
    for (let index = 0; index < 6; index += 1) {
      code += ROOM_ALPHABET[Math.floor(Math.random() * ROOM_ALPHABET.length)];
    }
    if (!rooms.has(code)) return code;
  }
  throw new Error('Unable to allocate a room code');
}

function firstOpenSlot(room) {
  const used = new Set([...room.players.values()].map((player) => player.slot));
  for (let slot = 0; slot < MAX_PLAYERS; slot += 1) if (!used.has(slot)) return slot;
  return 0;
}

function cleanRoomCode(value) {
  return String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
}

function cleanName(value) {
  const name = String(value || '').trim().replace(/[<>]/g, '').slice(0, 12);
  return name || `旅人${Math.floor(Math.random() * 90 + 10)}`;
}

function cleanPassword(value) {
  return String(value || '').trim().slice(0, 24);
}

function verifyRoomPassword(room, password) {
  const candidate = scryptSync(password, room.passwordSalt, 32);
  return candidate.length === room.passwordHash.length && timingSafeEqual(candidate, room.passwordHash);
}

function restorePlayerProfile(player, profile) {
  const inventory = new Map([
    ['redwood-staff', 1],
    ['vital-brew', 2],
    ['spirit-dew', 1],
  ]);
  const equipment = { weapon: 'redwood-staff', armor: null, trinket: null };

  if (profile && typeof profile === 'object' && Array.isArray(profile.inventory)) {
    inventory.clear();
    for (const entry of profile.inventory.slice(0, 60)) {
      const itemId = String(entry?.itemId || '');
      const item = ITEM_BY_ID.get(itemId);
      if (!item) continue;
      const quantity = clamp(Math.floor(Number(entry.quantity) || 0), 0, item.maxStack);
      if (quantity > 0) inventory.set(itemId, quantity);
    }

    for (const slot of EQUIPMENT_SLOTS) {
      const itemId = String(profile.equipment?.[slot] || '');
      const item = ITEM_BY_ID.get(itemId);
      equipment[slot] = item?.slot === slot && inventory.has(itemId) ? itemId : null;
    }
  }

  player.inventory = inventory;
  player.equipment = equipment;
}

function refreshPlayerStats(player, refill = false) {
  const oldMaxHp = player.maxHp || 100;
  const oldMaxMp = player.maxMp || 60;
  const next = { attack: 0, defense: 0, crit: 0, health: 0, mana: 0 };

  for (const itemId of Object.values(player.equipment)) {
    const item = ITEM_BY_ID.get(itemId);
    if (!item) continue;
    next.attack += Number(item.stats.attack) || 0;
    next.defense += Number(item.stats.defense) || 0;
    next.crit += Number(item.stats.crit) || 0;
    next.health += Number(item.stats.health) || 0;
    next.mana += Number(item.stats.mana) || 0;
  }

  player.combatStats = { attack: next.attack, defense: next.defense, crit: next.crit };
  player.maxHp = 100 + next.health;
  player.maxMp = 60 + next.mana;
  if (refill) {
    player.hp = player.maxHp;
    player.mp = player.maxMp;
  } else {
    player.hp = clamp(player.hp + Math.max(0, player.maxHp - oldMaxHp), 0, player.maxHp);
    player.mp = clamp(player.mp + Math.max(0, player.maxMp - oldMaxMp), 0, player.maxMp);
  }
}

function setInventoryQuantity(player, itemId, requestedQuantity) {
  const item = ITEM_BY_ID.get(itemId);
  if (!item) return 0;
  const quantity = clamp(Math.floor(requestedQuantity), 0, item.maxStack);
  if (quantity > 0) player.inventory.set(itemId, quantity);
  else player.inventory.delete(itemId);
  return quantity;
}

function addInventoryItem(player, itemId, quantity) {
  const item = ITEM_BY_ID.get(itemId);
  if (!item) return 0;
  const current = player.inventory.get(itemId) || 0;
  const next = setInventoryQuantity(player, itemId, current + quantity);
  return next - current;
}

function spawnEnemyLoot(room, player, enemy) {
  const dropCount = enemy.isBoss ? 3 : enemy.isElite ? 2 : Math.random() < 0.24 ? 2 : 1;
  for (let index = 0; index < dropCount; index += 1) {
    const item = enemy.isBoss && index === 0 ? ITEM_BY_ID.get('mountain-demon-fragment') : rollLootItem();
    if (!item) continue;
    room.drops.push({
      id: randomUUID(),
      itemId: item.id,
      quantity: item.slot === 'material' ? (enemy.isBoss ? 8 : 1 + Math.floor(Math.random() * 3)) : 1,
      x: clamp(enemy.x + (index - (dropCount - 1) / 2) * 38, 40, 1160),
      y: 420,
      ownerId: player.id,
      createdAt: Date.now(),
    });
  }
}

function rollLootItem() {
  const totalWeight = ITEM_CATALOG.reduce((sum, item) => sum + Math.max(0, item.dropWeight), 0);
  let roll = Math.random() * totalWeight;
  for (const item of ITEM_CATALOG) {
    roll -= Math.max(0, item.dropWeight);
    if (roll <= 0) return item;
  }
  return ITEM_CATALOG[0];
}

function processGroundDrops(room) {
  const now = Date.now();
  room.drops = room.drops.filter((drop) => {
    if (now - drop.createdAt > 30_000) return false;
    for (const player of room.players.values()) {
      const ownerLockActive = now - drop.createdAt < 2_000 && player.id !== drop.ownerId;
      if (ownerLockActive || player.respawnTimer > 0 || Math.abs(player.x - drop.x) > PICKUP_RADIUS) continue;
      const item = ITEM_BY_ID.get(drop.itemId);
      const added = addInventoryItem(player, drop.itemId, drop.quantity);
      if (added > 0) {
        broadcast(room, { type: 'system', message: `${player.name} 拾取了 ${item.name}${added > 1 ? ` ×${added}` : ''}` });
        return false;
      }

      const salvageQuantity = EQUIPMENT_SLOTS.has(item.slot) ? Math.max(1, item.rarity === 'legendary' ? 5 : item.rarity === 'epic' ? 3 : 1) : 1;
      const salvaged = drop.itemId === 'mountain-demon-fragment' ? 0 : addInventoryItem(player, 'mountain-demon-fragment', salvageQuantity);
      if (salvaged > 0) {
        broadcast(room, { type: 'system', message: `${player.name} 的 ${item.name} 已满，自动化为山妖残晶 ×${salvaged}` });
      } else {
        broadcast(room, { type: 'system', message: `${player.name} 的 ${item.name} 已满，溢出的战利品消散了` });
      }
      return false;
    }
    return true;
  });
}

function heroAttackCooldown(hero) {
  return hero === 'ranger' ? 0.3 : hero === 'guardian' ? 0.6 : 0.42;
}

function heroDamage(hero) {
  return hero === 'vanguard' ? 18 : hero === 'guardian' ? 16 : hero === 'sage' ? 13 : 11;
}

function basicAttackProfile(hero, comboStep) {
  const attacks = BASIC_ATTACKS[hero] || BASIC_ATTACKS.default;
  return attacks[clamp(comboStep - 1, 0, attacks.length - 1)];
}

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

function round(value) {
  return Math.round(value * 10) / 10;
}

function countPlayers() {
  let count = 0;
  for (const room of rooms.values()) count += room.players.size;
  return count;
}

setInterval(() => {
  const delta = 1 / SIMULATION_RATE;
  for (const room of rooms.values()) simulateRoom(room, delta);
}, 1000 / SIMULATION_RATE).unref();

setInterval(broadcastStates, 1000 / BROADCAST_RATE).unref();

setInterval(() => {
  for (const socket of wss.clients) {
    if (socket.isAlive === false) {
      socket.terminate();
      continue;
    }
    socket.isAlive = false;
    socket.ping();
  }
}, 30_000).unref();

httpServer.listen(PORT, HOST, () => {
  console.log(`Dream Journey game server listening on ws://${HOST}:${PORT}`);
});
