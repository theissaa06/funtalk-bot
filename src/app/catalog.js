const SHOP_ITEMS = [
  {
    id: 'vip_badge',
    name: 'VIP бейдж',
    type: 'badge',
    rarity: 'rare',
    price: 500,
    sellPrice: 200,
    description: 'Статусный бейдж для профиля и топов.',
  },
  {
    id: 'pro_title',
    name: 'Про игрок',
    type: 'title',
    rarity: 'rare',
    price: 800,
    sellPrice: 320,
    description: 'Титул для профиля.',
  },
  {
    id: 'legend_title',
    name: 'Легенда',
    type: 'title',
    rarity: 'epic',
    price: 2000,
    sellPrice: 800,
    description: 'Редкий титул для активных участников.',
  },
  {
    id: 'xp_boost_1h',
    name: 'XP x2 на 1 час',
    type: 'consumable',
    rarity: 'uncommon',
    price: 300,
    sellPrice: 90,
    effect: 'xp_boost',
    description: 'Удваивает опыт за активность на 1 час.',
  },
  {
    id: 'daily_reroll',
    name: 'Повтор daily',
    type: 'consumable',
    rarity: 'uncommon',
    price: 120,
    sellPrice: 35,
    effect: 'daily_reroll',
    description: 'Позволяет получить ежедневный бонус ещё раз.',
  },
  {
    id: 'warn_shield',
    name: 'Щит от варна',
    type: 'consumable',
    rarity: 'rare',
    price: 150,
    sellPrice: 45,
    effect: 'warn_shield',
    description: 'Блокирует следующее предупреждение.',
  },
  {
    id: 'warn_remove',
    name: 'Снять 1 варн',
    type: 'consumable',
    rarity: 'rare',
    price: 250,
    sellPrice: 75,
    effect: 'warn_remove',
    description: 'Снимает одно активное предупреждение в текущем чате.',
  },
  {
    id: 'mute_shield',
    name: 'Анти-мут',
    type: 'consumable',
    rarity: 'epic',
    price: 400,
    sellPrice: 120,
    effect: 'mute_shield',
    description: 'Блокирует следующий мут.',
  },
  {
    id: 'lootbox_basic',
    name: 'Лутбокс',
    type: 'lootbox',
    rarity: 'common',
    price: 350,
    sellPrice: 100,
    description: 'Случайный предмет из магазина.',
  },
];

const RARITY_LABELS = {
  common: 'обычный',
  uncommon: 'необычный',
  rare: 'редкий',
  epic: 'эпический',
  legendary: 'легендарный',
};

function getShopItem(itemId) {
  return SHOP_ITEMS.find(item => item.id === itemId) || null;
}

function getDailyDeal(date = new Date()) {
  const day = date.toISOString().slice(0, 10);
  const hash = day.split('').reduce((sum, char) => sum + char.charCodeAt(0), 0);
  const items = SHOP_ITEMS.filter(item => item.type !== 'lootbox');
  const item = items[hash % items.length];
  return {
    itemId: item.id,
    discountPercent: 25,
    day,
  };
}

function priceFor(item, deal = getDailyDeal()) {
  if (!item) return 0;
  if (deal.itemId !== item.id) return item.price;
  return Math.max(1, Math.floor(item.price * (1 - deal.discountPercent / 100)));
}

function pickLootboxReward() {
  const pool = [
    { id: 'daily_reroll', weight: 35 },
    { id: 'xp_boost_1h', weight: 25 },
    { id: 'warn_shield', weight: 18 },
    { id: 'vip_badge', weight: 12 },
    { id: 'mute_shield', weight: 7 },
    { id: 'legend_title', weight: 3 },
  ];
  const total = pool.reduce((sum, item) => sum + item.weight, 0);
  let roll = Math.random() * total;
  for (const entry of pool) {
    roll -= entry.weight;
    if (roll <= 0) return getShopItem(entry.id);
  }
  return getShopItem(pool[0].id);
}

module.exports = {
  SHOP_ITEMS,
  RARITY_LABELS,
  getShopItem,
  getDailyDeal,
  priceFor,
  pickLootboxReward,
};
