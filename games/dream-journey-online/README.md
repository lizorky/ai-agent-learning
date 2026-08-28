# Dream Journey Online

An original four-player online co-op side-scrolling action-game framework inspired by the structure of classic browser action games.

This repository does not contain decompiled game code or copyrighted assets from the original 4399 game. Replace the placeholder CSS/canvas art only with assets you own or are authorized to use.

## Included in the framework

- Six-character room codes plus per-room passphrases
- Up to four players per room
- Server-authoritative movement, jumping, attacks, health, enemy AI, damage, death, and respawn
- Eight-frame Monkey King fighter and mountain-demon animation sheets covering idle, movement, jump/charge, attack, hurt, and defeat
- A buffered three-hit staff combo with escalating damage, range, knockback, hit-stun, and player invulnerability frames
- Forward-only staff hitboxes that resolve on the visible impact frame instead of from the hero body
- Three Vanguard skills with authoritative mana costs and cooldowns: `U` Staff Sweep, `O` Sky Breaker, and `P` Blazing Rush
- Fifteen original items across weapons, armor, trinkets, consumables, and materials
- Server-authoritative equipment bonuses, consumable use, weighted monster drops, and proximity pickup
- A complete four-wave Cloud Road mini-stage with inter-wave transitions, victory rewards, and instant replay
- Three normal enemy classes: Mountain Scout, Stone Brute, and ranged Ember Shaman
- An elite Stone Brute encounter and the Cloud-Horn Demon King boss with ranged crescent projectiles
- Server-authoritative wave progression, enemy projectiles, boss rewards, combat effects, damage numbers, camera shake, and hit audio
- An in-game inventory and item catalog opened with `I`, with browser-local profile persistence
- Imported PNG artwork for the current stage background, hero portraits, enemy portrait, item cards, and ground drops
- Four expandable hero archetypes
- Browser-native WebSocket client with a Node.js `ws` server
- Keyboard and touch controls
- Room-wide pause from `Esc` or the inventory; player movement, enemies, projectiles, cooldowns, and stage timers freeze together
- A multiplayer smoke test that rejects a wrong passphrase, fills a four-player room, verifies synchronized movement, and rejects a fifth player
- A combat smoke test covering skill mana, damage, enemy hit-stun, and cooldown state
- Item catalog validation covering ids, item types, rarities, stats, stack limits, and drop weights

## Run locally

```powershell
npm install
npm run dev:all
```

Open `http://localhost:3000`. The game server listens on port `8787`.

Run the automated multiplayer check in a second terminal:

```powershell
npm run smoke:multiplayer
```

Run the authoritative skill check while the servers are active:

```powershell
npm run smoke:combat
```

Run the room-pause freeze and resume check while the servers are active:

```powershell
npm run smoke:pause
```

Run the item catalog validation without starting any servers:

```powershell
npm run smoke:items
```

Run the automated full-stage check while the servers are active:

```powershell
npm run smoke:stage
```

The stage smoke test clears all four waves and verifies all enemy classes, the elite encounter, the boss, and the final rewards. To drive an existing browser room, pass its room code and passphrase after the script name.

## Temporary Internet play

Start the local frontend and game server, then open an encrypted SSH reverse tunnel in a second terminal:

```powershell
npm run dev:all
npm run share
```

Send friends the generated `https://...serveousercontent.com` link. One URL carries both the web page and WebSocket traffic. The link remains available only while this computer, both local servers, and the tunnel are running. Each room also requires the passphrase chosen by its creator. The share command uses the operating system's OpenSSH client and does not install a global service.

The browser client still reads `NEXT_PUBLIC_GAME_SERVER_URL` when provided. A permanent always-on deployment should use a persistent WebSocket-capable game host or a named tunnel rather than a temporary reverse tunnel.

The framework is intentionally small. Item progress currently lives in each browser, while the server validates all item ids, quantities, equipment effects, consumable use, drops, pickups, enemies, projectiles, combat, and stage progression. Accounts, durable server-side persistence, matchmaking, anti-cheat hardening, additional stages and fully animated heroes, skill trees, forging, and production deployment remain future layers.
