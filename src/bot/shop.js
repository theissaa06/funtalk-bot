// ============================================================
// src/bot/shop.js
// Магазин: покупка титулов за монеты + инвентарь
// ============================================================

const { Markup } = require('telegraf');
const db = require('../db');
const { formatName } = require('../utils');

// ── Товары магазина ───────────────────────────────────────────
const SHOP_ITEMS = [
  { id: 'title_vip',      name: '⭐ VIP',           price: 500,  type: 'title', desc: 'Титул VIP в профиле' },
  { id: 'title_pro',      name: '🔥 Про игрок',     price: 800,  type: 'title', desc: 'Титул Про игрок' },
  { id: 'title_legend',   name: '👑 Легенда',        price: 2000, type: 'title', desc: 'Легендарный титул' },
  { id: 'title_rich',     name: '💎 Богач',          price: 1500, type: 'title', desc: 'Титул Богач' },
  { id: 'title_shadow',   name: '🌑 Тень',           price: 1000, type: 'title', desc: 'Таинственный титул' },
  { id: 'title_star',     name: '🌟 Звезда чата',    price: 1200, type: 'title', desc: 'Звезда этого чата' },
  { id: 'title_ghost',    name: '👻 Призрак',        price: 700,  type: 'title', desc: 'Тихий, но заметный' },
  { id: 'title_king',     name: '🤴 Король',         price: 3000, type: 'title', desc: 'Король чата' },
  { id: 'title_queen',    name: '👸 Королева',       price: 3000, type: 'title', desc: 'Королева чата' },
  { id: 'title_hacker',   name: '💻 Хакер',          price: 900,  type: 'title', desc: 'Технарь и хакер' },
  { id: 'xp_boost',       name: '⚡ XP x2 (1 час)',  price: 300,  type: 'boost', desc: 'Двойной XP на 1 час' },
  { id: 'daily_boost',    name: '🎁 Бонус x2 (1 раз)', price: 200, type: 'boost', desc: 'Следующий /daily x2' },
];

// ── Вспомогательные ──────────────────────────────────────────
function getUser(userId, chatId) {
  return db.prepare('SELECT * FROM users WHERE id = ? AND chat_id = ?').get(userId, chatId);
}

function upsertUser(user, chatId) {
  db.prepare(`
    INSERT INTO users (id, username, first_name, chat_id)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET username = excluded.username, first_name = excluded.first_name
  `).run(user.id, user.username || null, user.first_name || null, chatId);
}

function removeCoins(userId, chatId, amount) {
  db.prepare('UPDATE users SET coins = MAX(0, coins - ?) WHERE id = ? AND chat_id = ?').run(amount, userId, chatId);
}

// Инвентарь хранится в JSON-поле inventory в таблице users
// Поскольку наша база JSON, добавляем поле напрямую
function getInventory(userId, chatId) {
  const data = require('fs').existsSync('./data/bot_data.json')
    ? JSON.parse(require('fs').readFileSync('./data/bot_data.json', 'utf8'))
    : { users: [] };
  const user = (data.users || []).find(u => u.id === userId && String(u.chat_id) === String(chatId));
  return user?.inventory || [];
}

function addToInventory(userId, chatId, itemId) {
  const fs   = require('fs');
  const path = require('path');
  const dbPath = process.env.DB_PATH || './data/bot_data.json';
  const data = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
  const user = (data.users || []).find(u => u.id === userId && String(u.chat_id) === String(chatId));
  if (!user) return;
  if (!user.inventory) user.inventory = [];
  if (!user.inventory.includes(itemId)) user.inventory.push(itemId);
  fs.writeFileSync(dbPath, JSON.stringify(data, null, 2), 'utf8');
}

function setActiveTitle(userId, chatId, itemId) {
  const fs   = require('fs');
  const dbPath = process.env.DB_PATH || './data/bot_data.json';
  const data = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
  const user = (data.users || []).find(u => u.id === userId && String(u.chat_id) === String(chatId));
  if (!user) return;
  user.active_title = itemId;
  fs.writeFileSync(dbPath, JSON.stringify(data, null, 2), 'utf8');
}

function getActiveTitle(userId, chatId) {
  const fs   = require('fs');
  const dbPath = process.env.DB_PATH || './data/bot_data.json';
  try {
    const data = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
    const user = (data.users || []).find(u => u.id === userId && String(u.chat_id) === String(chatId));
    return user?.active_title || null;
  } catch { return null; }
}

// Публичная функция для получения титула (используется в /rank)
function getUserTitle(userId, chatId) {
  const titleId = getActiveTitle(userId, chatId);
  if (!titleId) return null;
  const item = SHOP_ITEMS.find(i => i.id === titleId);
  return item ? item.name : null;
}

// ── Клавиатура магазина ───────────────────────────────────────
function shopKeyboard(page = 0) {
  const perPage = 5;
  const start   = page * perPage;
  const items   = SHOP_ITEMS.slice(start, start + perPage);

  const buttons = items.map(item =>
    [Markup.button.callback(`${item.name} — ${item.price}💰`, `shop_buy_${item.id}`)]
  );

  const nav = [];
  if (page > 0) nav.push(Markup.button.callback('⬅️', `shop_page_${page - 1}`));
  if (start + perPage < SHOP_ITEMS.length) nav.push(Markup.button.callback('➡️', `shop_page_${page + 1}`));
  if (nav.length) buttons.push(nav);

  return Markup.inlineKeyboard(buttons);
}

function shopText(page = 0) {
  const perPage = 5;
  const start   = page * perPage;
  const items   = SHOP_ITEMS.slice(start, start + perPage);
  const total   = Math.ceil(SHOP_ITEMS.length / perPage);

  const lines = items.map(item =>
    `${item.name}\n  💰 ${item.price} монет — ${item.desc}`
  ).join('\n\n');

  return `🏪 <b>Магазин FunTalk</b> (стр. ${page + 1}/${total})\n\n${lines}\n\nНажми на товар чтобы купить.`;
}

// ── Регистрация ───────────────────────────────────────────────
function registerShop(bot) {

  // /shop — открыть магазин
  bot.command(['shop', 'магазин'], async (ctx) => {
    const chatId = ctx.chat.type === 'private' ? ctx.from.id : ctx.chat.id;
    upsertUser(ctx.from, chatId);
    const user = getUser(ctx.from.id, chatId);

    await ctx.reply(
      shopText(0) + `\n\n💼 Твой баланс: <b>${user?.coins || 0} монет</b>`,
      { parse_mode: 'HTML', ...shopKeyboard(0) }
    );
  });

  // Пагинация магазина
  bot.action(/^shop_page_(\d+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    const page   = parseInt(ctx.match[1]);
    const chatId = ctx.chat.type === 'private' ? ctx.from.id : ctx.chat.id;
    const user   = getUser(ctx.from.id, chatId);

    await ctx.editMessageText(
      shopText(page) + `\n\n💼 Твой баланс: <b>${user?.coins || 0} монет</b>`,
      { parse_mode: 'HTML', ...shopKeyboard(page) }
    );
  });

  // Покупка товара
  bot.action(/^shop_buy_(.+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    const itemId = ctx.match[1];
    const item   = SHOP_ITEMS.find(i => i.id === itemId);
    if (!item) return ctx.answerCbQuery('Товар не найден.', { show_alert: true });

    const chatId = ctx.chat.type === 'private' ? ctx.from.id : ctx.chat.id;
    upsertUser(ctx.from, chatId);
    const user = getUser(ctx.from.id, chatId);

    if (!user || user.coins < item.price) {
      return ctx.answerCbQuery(`❌ Недостаточно монет (нужно ${item.price}, у тебя ${user?.coins || 0})`, { show_alert: true });
    }

    const inv = getInventory(ctx.from.id, chatId);
    if (inv.includes(itemId) && item.type === 'title') {
      return ctx.answerCbQuery('У тебя уже есть этот титул!', { show_alert: true });
    }

    removeCoins(ctx.from.id, chatId, item.price);
    addToInventory(ctx.from.id, chatId, itemId);

    // Для буста — применяем сразу
    if (item.type === 'boost') {
      // Буст обрабатывается в economy.js и levels.js через флаги
      const fs = require('fs');
      const dbPath = process.env.DB_PATH || './data/bot_data.json';
      const data = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
      const u = (data.users || []).find(u => u.id === ctx.from.id && String(u.chat_id) === String(chatId));
      if (u) {
        if (itemId === 'xp_boost')    u.xp_boost_until  = Date.now() + 3600000;
        if (itemId === 'daily_boost') u.daily_boost_next = true;
        fs.writeFileSync(dbPath, JSON.stringify(data, null, 2), 'utf8');
      }
    }

    const updated = getUser(ctx.from.id, chatId);
    await ctx.editMessageText(
      `✅ <b>Куплено: ${item.name}</b>\n\n` +
      `${item.desc}\n\n` +
      `💼 Остаток: <b>${updated.coins} монет</b>\n\n` +
      (item.type === 'title' ? `Активируй титул командой /usetitle ${itemId}` : ''),
      {
        parse_mode: 'HTML',
        ...Markup.inlineKeyboard([[Markup.button.callback('🏪 Назад в магазин', 'shop_page_0')]]),
      }
    );
  });

  // /inventory — инвентарь
  bot.command(['inventory', 'инвентарь', 'inv'], async (ctx) => {
    const chatId = ctx.chat.type === 'private' ? ctx.from.id : ctx.chat.id;
    upsertUser(ctx.from, chatId);

    const inv         = getInventory(ctx.from.id, chatId);
    const activeTitle = getActiveTitle(ctx.from.id, chatId);

    if (!inv.length) {
      return ctx.reply(
        `🎒 <b>Инвентарь пуст</b>\n\nКупи что-нибудь в /shop!`,
        { parse_mode: 'HTML' }
      );
    }

    const lines = inv.map(id => {
      const item = SHOP_ITEMS.find(i => i.id === id);
      if (!item) return null;
      const active = id === activeTitle ? ' ✅ (активен)' : '';
      return `• ${item.name}${active}`;
    }).filter(Boolean);

    const buttons = inv
      .filter(id => SHOP_ITEMS.find(i => i.id === id && i.type === 'title'))
      .map(id => {
        const item = SHOP_ITEMS.find(i => i.id === id);
        return [Markup.button.callback(`Надеть: ${item.name}`, `inv_use_${id}`)];
      });

    await ctx.reply(
      `🎒 <b>Инвентарь ${formatName(ctx.from)}:</b>\n\n${lines.join('\n')}`,
      { parse_mode: 'HTML', ...Markup.inlineKeyboard(buttons) }
    );
  });

  // Надеть титул из инвентаря
  bot.action(/^inv_use_(.+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    const itemId = ctx.match[1];
    const item   = SHOP_ITEMS.find(i => i.id === itemId);
    if (!item) return;

    const chatId = ctx.chat.type === 'private' ? ctx.from.id : ctx.chat.id;
    const inv    = getInventory(ctx.from.id, chatId);

    if (!inv.includes(itemId)) {
      return ctx.answerCbQuery('У тебя нет этого предмета!', { show_alert: true });
    }

    setActiveTitle(ctx.from.id, chatId, itemId);
    await ctx.editMessageText(
      `✅ Титул <b>${item.name}</b> активирован!\n\nОн будет отображаться в твоём профиле /rank`,
      { parse_mode: 'HTML' }
    );
  });

  // /usetitle [id] — активировать титул по ID
  bot.command(['usetitle', 'титул'], async (ctx) => {
    const chatId = ctx.chat.type === 'private' ? ctx.from.id : ctx.chat.id;
    const args   = ctx.message.text.split(' ').slice(1);
    const itemId = args[0];

    if (!itemId) {
      return ctx.reply('Укажи ID титула: /usetitle title_vip\nСписок твоих предметов: /inventory');
    }

    const inv  = getInventory(ctx.from.id, chatId);
    const item = SHOP_ITEMS.find(i => i.id === itemId);

    if (!item || !inv.includes(itemId)) {
      return ctx.reply('❌ У тебя нет этого предмета. Купи его в /shop');
    }

    setActiveTitle(ctx.from.id, chatId, itemId);
    await ctx.reply(
      `✅ Титул <b>${item.name}</b> активирован! Виден в /rank`,
      { parse_mode: 'HTML' }
    );
  });

  console.log('✅ Модуль shop подключён');
}

module.exports = { registerShop, getUserTitle, SHOP_ITEMS };
