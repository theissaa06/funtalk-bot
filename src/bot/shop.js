// ============================================================
// src/bot/shop.js
// Магазин: покупка титулов и бустов за монеты + инвентарь
// ============================================================

const { Markup } = require('telegraf');
const fs   = require('fs');
const path = require('path');

const DB_PATH = process.env.DB_PATH
  ? path.resolve(process.env.DB_PATH)
  : path.join(process.cwd(), 'data', 'bot_data.json');

// ── Товары магазина ───────────────────────────────────────────
const SHOP_ITEMS = [
  { id: 'vip',    name: '⭐ VIP',              price: 500,  type: 'title', desc: 'Титул VIP в профиле' },
  { id: 'pro',    name: '🔥 Про игрок',        price: 800,  type: 'title', desc: 'Титул Про игрок' },
  { id: 'legend', name: '👑 Легенда',          price: 2000, type: 'title', desc: 'Легендарный титул' },
  { id: 'rich',   name: '💎 Богач',            price: 1500, type: 'title', desc: 'Титул Богач' },
  { id: 'shadow', name: '🌑 Тень',             price: 1000, type: 'title', desc: 'Таинственный титул' },
  { id: 'star',   name: '🌟 Звезда чата',      price: 1200, type: 'title', desc: 'Звезда этого чата' },
  { id: 'ghost',  name: '👻 Призрак',          price: 700,  type: 'title', desc: 'Тихий, но заметный' },
  { id: 'king',   name: '🤴 Король',           price: 3000, type: 'title', desc: 'Король чата' },
  { id: 'queen',  name: '👸 Королева',         price: 3000, type: 'title', desc: 'Королева чата' },
  { id: 'hacker', name: '💻 Хакер',            price: 900,  type: 'title', desc: 'Технарь и хакер' },
  { id: 'xpx2',   name: '⚡ XP x2 (1 час)',    price: 300,  type: 'boost', desc: 'Двойной XP на 1 час' },
  { id: 'bonusx2',name: '🎁 Бонус x2 (1 раз)', price: 200,  type: 'boost', desc: 'Следующий /daily x2' },
];

// ── Работа с базой ────────────────────────────────────────────
function loadData() {
  try {
    if (!fs.existsSync(DB_PATH)) return { users: [] };
    return JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
  } catch { return { users: [] }; }
}

function saveData(data) {
  try { fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2), 'utf8'); }
  catch (e) { console.error('[shop] saveData:', e.message); }
}

function getCoins(telegramId, chatId) {
  const data = loadData();
  const row  = chatId
    ? (data.users || []).find(u => u.id === telegramId && String(u.chat_id) === String(chatId))
    : (data.users || []).find(u => u.id === telegramId);
  return row?.coins || 0;
}

function removeCoins(telegramId, chatId, amount) {
  const data = loadData();
  const rows = (data.users || []).filter(
    u => u.id === telegramId && (!chatId || String(u.chat_id) === String(chatId))
  );
  for (const row of rows) row.coins = Math.max(0, (row.coins || 0) - amount);
  saveData(data);
}

function getInventory(telegramId) {
  const data = loadData();
  const row  = (data.users || []).find(u => u.id === telegramId);
  return Array.isArray(row?.inventory) ? row.inventory : [];
}

function addToInventory(telegramId, itemId) {
  const data = loadData();
  let saved  = false;
  for (const row of (data.users || [])) {
    if (row.id === telegramId) {
      if (!Array.isArray(row.inventory)) row.inventory = [];
      if (!row.inventory.includes(itemId)) row.inventory.push(itemId);
      saved = true;
    }
  }
  if (saved) saveData(data);
}

function getActiveTitle(telegramId) {
  const data = loadData();
  const row  = (data.users || []).find(u => u.id === telegramId);
  return row?.active_title || null;
}

function setActiveTitle(telegramId, itemId) {
  const data = loadData();
  let saved  = false;
  for (const row of (data.users || [])) {
    if (row.id === telegramId) { row.active_title = itemId; saved = true; }
  }
  if (saved) saveData(data);
}

function applyBoost(telegramId, itemId) {
  const data = loadData();
  for (const row of (data.users || [])) {
    if (row.id === telegramId) {
      if (itemId === 'xpx2')    row.xp_boost_until  = Date.now() + 3600000;
      if (itemId === 'bonusx2') row.daily_boost_next = true;
    }
  }
  saveData(data);
}

// ── Построить текст и клавиатуру магазина ─────────────────────
const PER_PAGE = 4;

function buildShopPage(page, coins) {
  const start = page * PER_PAGE;
  const items = SHOP_ITEMS.slice(start, start + PER_PAGE);
  const total = Math.ceil(SHOP_ITEMS.length / PER_PAGE);

  const lines = items.map(i =>
    `${i.name} — <b>${i.price}💰</b>\n  └ ${i.desc}`
  ).join('\n\n');

  const text = (
    `🏪 <b>Магазин FunTalk</b> (стр. ${page + 1}/${total})\n\n` +
    `${lines}\n\n` +
    `💼 Твой баланс: <b>${coins} монет</b>`
  );

  // Кнопки товаров — короткие ID без префикса title_
  const buttons = items.map(i => [
    Markup.button.callback(`${i.name} — ${i.price}💰`, `sb${i.id}`),
  ]);

  // Навигация
  const nav = [];
  if (page > 0)                              nav.push(Markup.button.callback('⬅️', `sp${page - 1}`));
  if (start + PER_PAGE < SHOP_ITEMS.length)  nav.push(Markup.button.callback('➡️', `sp${page + 1}`));
  if (nav.length) buttons.push(nav);
  buttons.push([Markup.button.callback('🎒 Инвентарь', 'sinv')]);

  return { text, keyboard: Markup.inlineKeyboard(buttons) };
}

// ── Регистрация ───────────────────────────────────────────────
function registerShop(bot) {

  // /shop — открыть магазин
  bot.command(['shop', 'магазин'], async (ctx) => {
    try {
      const chatId = ctx.chat.type === 'private' ? ctx.from.id : ctx.chat.id;
      const coins  = getCoins(ctx.from.id, chatId);
      const { text, keyboard } = buildShopPage(0, coins);
      await ctx.reply(text, { parse_mode: 'HTML', ...keyboard });
    } catch (err) {
      console.error('[shop /shop]', err.message);
      await ctx.reply('❌ Ошибка при открытии магазина.');
    }
  });

  // Пагинация: sp0, sp1, sp2...
  bot.action(/^sp(\d+)$/, async (ctx) => {
    try {
      await ctx.answerCbQuery();
      const page   = parseInt(ctx.match[1]);
      const chatId = ctx.chat.type === 'private' ? ctx.from.id : ctx.chat.id;
      const coins  = getCoins(ctx.from.id, chatId);
      const { text, keyboard } = buildShopPage(page, coins);
      await ctx.editMessageText(text, { parse_mode: 'HTML', ...keyboard });
    } catch (err) {
      console.error('[shop pagination]', err.message);
      await ctx.answerCbQuery('Ошибка.', { show_alert: true });
    }
  });

  // Покупка: sbvip, sbpro, sblegend...
  bot.action(/^sb(.+)$/, async (ctx) => {
    try {
      await ctx.answerCbQuery();
      const itemId = ctx.match[1];
      const item   = SHOP_ITEMS.find(i => i.id === itemId);

      if (!item) {
        return ctx.answerCbQuery('❌ Товар не найден.', { show_alert: true });
      }

      const chatId    = ctx.chat.type === 'private' ? ctx.from.id : ctx.chat.id;
      const coins     = getCoins(ctx.from.id, chatId);
      const inventory = getInventory(ctx.from.id);

      if (coins < item.price) {
        return ctx.answerCbQuery(
          `❌ Недостаточно монет!\nНужно: ${item.price}💰\nУ тебя: ${coins}💰`,
          { show_alert: true }
        );
      }

      if (item.type === 'title' && inventory.includes(itemId)) {
        return ctx.answerCbQuery('У тебя уже есть этот титул!', { show_alert: true });
      }

      removeCoins(ctx.from.id, chatId, item.price);
      addToInventory(ctx.from.id, itemId);

      if (item.type === 'boost') applyBoost(ctx.from.id, itemId);

      const newCoins = getCoins(ctx.from.id, chatId);

      let extra = '';
      if (item.type === 'title')      extra = `\n\n💡 Активируй: /usetitle ${itemId}`;
      else if (itemId === 'xpx2')     extra = '\n\n⚡ Буст активирован! XP x2 на 1 час.';
      else if (itemId === 'bonusx2')  extra = '\n\n🎁 Буст активирован! Следующий /daily даст x2 монет.';

      await ctx.editMessageText(
        `✅ <b>Куплено: ${item.name}</b>\n\n${item.desc}${extra}\n\n💼 Остаток: <b>${newCoins} монет</b>`,
        {
          parse_mode: 'HTML',
          ...Markup.inlineKeyboard([
            [Markup.button.callback('🏪 Назад в магазин', 'sp0')],
            [Markup.button.callback('🎒 Инвентарь', 'sinv')],
          ]),
        }
      );
    } catch (err) {
      console.error('[shop purchase]', err.message);
      await ctx.answerCbQuery('❌ Ошибка при покупке.', { show_alert: true });
    }
  });

  // Инвентарь через кнопку
  bot.action('sinv', async (ctx) => {
    try {
      await ctx.answerCbQuery();
      const { text, keyboard } = buildInventoryMessage(ctx.from);
      await ctx.editMessageText(text, { parse_mode: 'HTML', ...keyboard });
    } catch (err) {
      console.error('[shop sinv]', err.message);
      await ctx.answerCbQuery('Ошибка.', { show_alert: true });
    }
  });

  // /inventory — инвентарь командой
  bot.command(['inventory', 'инвентарь', 'inv'], async (ctx) => {
    try {
      const { text, keyboard } = buildInventoryMessage(ctx.from);
      await ctx.reply(text, { parse_mode: 'HTML', ...keyboard });
    } catch (err) {
      console.error('[shop inventory]', err.message);
      await ctx.reply('❌ Ошибка при открытии инвентаря.');
    }
  });

  // Надеть титул: siuvip, siupro...
  bot.action(/^siu(.+)$/, async (ctx) => {
    try {
      await ctx.answerCbQuery();
      const itemId    = ctx.match[1];
      const item      = SHOP_ITEMS.find(i => i.id === itemId);
      const inventory = getInventory(ctx.from.id);

      if (!item)                       return ctx.answerCbQuery('Товар не найден.', { show_alert: true });
      if (!inventory.includes(itemId)) return ctx.answerCbQuery('У тебя нет этого предмета!', { show_alert: true });

      setActiveTitle(ctx.from.id, itemId);

      await ctx.editMessageText(
        `✅ Титул <b>${item.name}</b> активирован!\n\nОн отображается в /rank`,
        {
          parse_mode: 'HTML',
          ...Markup.inlineKeyboard([
            [Markup.button.callback('🎒 Инвентарь', 'sinv')],
            [Markup.button.callback('🏪 Магазин', 'sp0')],
          ]),
        }
      );
    } catch (err) {
      console.error('[shop siu]', err.message);
      await ctx.answerCbQuery('Ошибка.', { show_alert: true });
    }
  });

  // /usetitle [id]
  bot.command(['usetitle', 'титул'], async (ctx) => {
    try {
      const args   = ctx.message.text.split(' ').slice(1);
      const itemId = args[0];

      if (!itemId) return ctx.reply('Укажи ID: /usetitle vip\nСписок: /inventory');

      const item      = SHOP_ITEMS.find(i => i.id === itemId);
      const inventory = getInventory(ctx.from.id);

      if (!item)                       return ctx.reply('❌ Такого титула не существует.');
      if (!inventory.includes(itemId)) return ctx.reply('❌ У тебя нет этого предмета. Купи в /shop');

      setActiveTitle(ctx.from.id, itemId);
      await ctx.reply(`✅ Титул <b>${item.name}</b> активирован! Виден в /rank`, { parse_mode: 'HTML' });
    } catch (err) {
      console.error('[shop usetitle]', err.message);
      await ctx.reply('❌ Ошибка.');
    }
  });

  console.log('✅ Модуль shop подключён');
}

// ── Построить сообщение инвентаря ─────────────────────────────
function buildInventoryMessage(from) {
  const inventory   = getInventory(from.id);
  const activeTitle = getActiveTitle(from.id);
  const name        = from.first_name || from.username || 'Участник';

  if (!inventory.length) {
    return {
      text: `🎒 <b>Инвентарь пуст</b>\n\nКупи что-нибудь в /shop!`,
      keyboard: Markup.inlineKeyboard([[Markup.button.callback('🏪 В магазин', 'sp0')]]),
    };
  }

  const lines = inventory.map(id => {
    const item = SHOP_ITEMS.find(i => i.id === id);
    if (!item) return null;
    const active = id === activeTitle ? ' ✅' : '';
    return `• ${item.name}${active}`;
  }).filter(Boolean).join('\n');

  const titleButtons = inventory
    .filter(id => SHOP_ITEMS.find(i => i.id === id && i.type === 'title'))
    .map(id => {
      const item   = SHOP_ITEMS.find(i => i.id === id);
      const active = id === activeTitle ? ' ✅' : '';
      return [Markup.button.callback(`Надеть: ${item.name}${active}`, `siu${id}`)];
    });

  titleButtons.push([Markup.button.callback('🏪 В магазин', 'sp0')]);

  return {
    text: `🎒 <b>Инвентарь ${name}:</b>\n\n${lines}`,
    keyboard: Markup.inlineKeyboard(titleButtons),
  };
}

// Публичная функция — получить активный титул
function getUserTitle(telegramId) {
  const titleId = getActiveTitle(telegramId);
  if (!titleId) return null;
  const item = SHOP_ITEMS.find(i => i.id === titleId);
  return item ? item.name : null;
}

module.exports = { registerShop, getUserTitle, SHOP_ITEMS };
