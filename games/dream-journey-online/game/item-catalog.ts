import rawItemCatalog from '@/data/item-catalog.json';

export type ItemRarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';
export type ItemSlot = 'weapon' | 'armor' | 'trinket' | 'consumable' | 'material';

export type ItemStats = {
  attack?: number;
  defense?: number;
  health?: number;
  mana?: number;
  crit?: number;
};

export type ItemDefinition = {
  id: string;
  name: string;
  mark: string;
  icon: string;
  slot: ItemSlot;
  rarity: ItemRarity;
  description: string;
  stats: ItemStats;
  effect?: { health?: number; mana?: number };
  maxStack: number;
  dropWeight: number;
};

export const itemCatalog = rawItemCatalog as ItemDefinition[];
export const itemById = new Map(itemCatalog.map((item) => [item.id, item]));

export const rarityMeta: Record<ItemRarity, { name: string; color: string }> = {
  common: { name: '普通', color: '#9b927e' },
  uncommon: { name: '精良', color: '#4f9462' },
  rare: { name: '稀有', color: '#4e7eb7' },
  epic: { name: '史诗', color: '#8a5eb1' },
  legendary: { name: '传说', color: '#d8912f' },
};

export const equipmentSlotLabels: Record<'weapon' | 'armor' | 'trinket', string> = {
  weapon: '兵器',
  armor: '防具',
  trinket: '饰品',
};

export function getItemDefinition(itemId: string | null | undefined) {
  return itemId ? itemById.get(itemId) : undefined;
}

export function formatItemStats(stats: ItemStats) {
  const labels: Array<[keyof ItemStats, string]> = [
    ['attack', '攻击'],
    ['defense', '防御'],
    ['health', '生命'],
    ['mana', '法力'],
    ['crit', '暴击'],
  ];
  return labels
    .filter(([key]) => stats[key])
    .map(([key, label]) => `${label} +${stats[key]}${key === 'crit' ? '%' : ''}`);
}
