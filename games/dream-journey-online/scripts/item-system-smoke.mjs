import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const catalogUrl = new URL('../data/item-catalog.json', import.meta.url);
const catalog = JSON.parse(readFileSync(catalogUrl, 'utf8'));
const expectedSlots = new Set(['weapon', 'armor', 'trinket', 'consumable', 'material']);
const expectedRarities = new Set(['common', 'uncommon', 'rare', 'epic', 'legendary']);
const statNames = new Set(['attack', 'defense', 'health', 'mana', 'crit']);

assert.equal(catalog.length, 15, 'The first item set should contain exactly 15 items.');
assert.equal(new Set(catalog.map((item) => item.id)).size, catalog.length, 'Item ids must be unique.');

for (const item of catalog) {
  assert.match(item.id, /^[a-z0-9]+(?:-[a-z0-9]+)*$/, `${item.id} must use an English kebab-case id.`);
  assert.ok(item.name && item.description && item.mark, `${item.id} is missing display text.`);
  assert.match(item.icon, /^\/assets\/items\/[a-z0-9-]+\.png$/, `${item.id} has an invalid icon path.`);
  assert.ok(existsSync(new URL(`../public${item.icon}`, import.meta.url)), `${item.id} icon file is missing.`);
  assert.ok(expectedSlots.has(item.slot), `${item.id} has an invalid slot.`);
  assert.ok(expectedRarities.has(item.rarity), `${item.id} has an invalid rarity.`);
  assert.ok(Number.isInteger(item.maxStack) && item.maxStack > 0, `${item.id} has an invalid stack limit.`);
  assert.ok(Number(item.dropWeight) > 0, `${item.id} has an invalid drop weight.`);
  for (const [stat, value] of Object.entries(item.stats)) {
    assert.ok(statNames.has(stat), `${item.id} has an unknown stat.`);
    assert.ok(Number(value) > 0, `${item.id} has a non-positive stat.`);
  }
}

for (const rarity of expectedRarities) {
  assert.ok(catalog.some((item) => item.rarity === rarity), `Missing ${rarity} rarity.`);
}

for (const slot of expectedSlots) {
  assert.ok(catalog.some((item) => item.slot === slot), `Missing ${slot} item type.`);
}

console.log(`Validated ${catalog.length} original items across ${expectedSlots.size} types and ${expectedRarities.size} rarities.`);
