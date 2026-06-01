// ============================================================
// src/bot/shop.js
// Магазин: покупка титулов и бустов за монеты + инвентарь
// Использует src/db.js (основная база с chat_id)
// ============================================================

const { Markup } = require('telegraf');
const fs   = require('fs');
const path = require('path');

// Путь к основной базе (src/db.js)
const DB_PATH = process.env.DB_PATH
  ? path.resolve(process.env.DB_PATH)
  : path.join(process.cwd(), 'data', 'bot_data.json');

// ── Товары магазина ───────────────────────────────────────────
const SHOP_ITEMS = [
  { id: 'title_vip',    name: '⭐ VIP',              price: 500,  type: 'title', desc: 'Титул VIP в профиле' },
  { id: 'title_pro',    name: '🔥 Про игрок',        price: 800,  type: 'title', desc: 'Титул Про игрок' },
  { id: 'title_legend', name: '👑 Легенда',          price: 2000, type: 'title', desc: 'Легендарный титул' },
  { id: 'title_rich',   name: '💎 Богач',            price: 1500, type: 'title', desc: 'Титул Богач' },
  { id: 'title_shadow', name: '🌑 Тень',             price: 1000, type: 'title', desc: 'Таинственный титул' },
  { id: 'title_star',   name: '🌟 Звезда чата',      price: 1200, type: 'title', desc: 'Звезда этого чата' },
  { id: 'title_ghost',  name: '👻 Призрак',          price: 700,  type: 'title', desc: 'Тихий, но заметный' },
  { id: 'title_king',   name: '🤴 Король',           price: 3000, type: 'title', desc: 'Король чата' },
  { id: 'title_queen',  name: '👸 Королева',         price: 3000, type: 'title', desc: 'Королева чата' },
  { id: 'title_hacker', name: '💻 Хакер',            price: 900,  type: 'title', desc: 'Технарь и хакер' },
  { id: 'xp_boost',     name: '⚡ XP x2 (1 час)',    price: 300,  type: 'boost', desc: 'Двойной XP на 1 час' },
  { id: 'daily_boost',  name: '🎁 Бонус x2 (1 раз)', price: 200,  type: 'boost', desc: 'Следующий /daily x2' },
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
  catch (e) { console.error('[shop] saveData error:', e.message); }
}

// Найти запись пользователя в чате (берём первую активную запись)
function findUserRow(telegramId, chatId) {
  const data = loadData();
  // Если chatId передан — ищем точно, иначе любую запись этого пользователя
  if (chatId) {
    return (data.users || []).find(
      u => u.id === telegramId && String(u.chat_id) === String(chatId)
    );
  }
  return (data.users || []).find(u => u.id === telegramId);
}

function getCoins(telegramId, chatId) {
  const row = findUserRow(telegramId, chatId);
  return row?.coins || 0;
}

function removeCoins(telegramId, chatId, amount) {
  const data = loadData();
  const rows = (data.users || []).filter(
    u => u.id === telegramId && (!chatId || String(u.chat_id) === String(chatId))
  );
  for (const row of rows) {
    row.coins = Math.max(0, (row.coins || 0) - amount);
  }
  saveData(data);
}

function getInventory(telegramId) {
  // Инвентарь глобальный (не привязан к чату)
  const data = loadData();
  const row  = (data.users || []).find(u => u.id === telegramId);
  return row?.inventory || [];
}

function addToInventory(telegramId, itemId) {
  const data = loadData();
  // Обновляем все записи этого пользователя (во всех чатах)
  let updated = false;
  for (const row of (data.users || [])) {
    if (row.id === telegramId) {
      if (!row.inventory) row.inventory = [];
      if (!row.inventory.includes(itemId)) row.inventory.push(itemId);
      updated = true;
    }
  }
  if (updated) saveData(data);
}

function getActiveTitle(telegramId) {
  const data = loadData();
  const row  = (data.users || []).find(u => u.id === telegramId);
  return row?.active_title || null;
}

function setActiveTitle(telegramId, titleId) {
  const data = loadData();
  let updated = false;
  for (const row of (data.users || [])) {
    if (row.id === telegramId) {
      row.active_title = titleId;
      updated = true;
    }
  }
  if (updated) saveData(data);
}

function applyBoost(telegramId, boostType) {
  const data = loadData();
  for (const row of (data.users || [])) {
    if (row.id === telegramId) {
      if (boostType === 'xp_boost')    row.xp_boost_until  = Date.now() + 3600000;
      if (boostType === 'daily_boost') row.daily_boost_next = true;
    }
  }
  saveData(data);
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
  if (page > 0)                          nav.push(Markup.button.callback('⬅️', `shop_page_${page - 1}`));
  if (start + perPage < SHOP_ITEMS.length) nav.push(Markup.button.callback('➡️', `shop_page_${page + 1}`));
  if (nav.length) buttons.push(nav);
  buttons.push([Markup.button.callback('🎒 Мой инвентарь', 'shop_inventory')]);

  return Markup.inlineKeyboard(buttons);
}

function shopText(page = 0, coins = 0) {
  const perPage = 5;
  const start   = page * perPage;
  const items   = SHOP_ITEMS.slice(start, start + perPage);
  const total   = Math.ceil(SHOP_ITEMS.length / perPage);

  const lines = items.map(item =>
    `${item.name} — <b>${item.price}💰</b>\n  └ ${item.desc}`
  ).join('\n\n');

  return (
    `🏪 <b>Магазин FunTalk</b> (стр. ${page + 1}/${total})\n\n` +
    `${lines}\n\n` +
    `💼 Твой баланс: <b>${coins} монет</b>\n` +
    `Нажми на товар чтобы купить.`
  );
}

// ── Регистрация ───────────────────────────────────────────────
function registerShop(bot) {

  // /shop — открыть магазин
  bot.command(['shop', 'магазин'], async (ctx) => {
    try {
      const chatId = ctx.chat.type === 'private' ? ctx.from.id : ctx.chat.id;
      const coins  = getCoins(ctx.from.id, chatId);

      await ctx.reply(
        shopText(0, coins),
        { parse_mode: 'HTML', ...shopKeyboard(0) }
      );
    } catch (err) {
      console.error('[shop /shop]', err.message);
      await ctx.reply('❌ Ошибка при открытии магазина. Попробуй ещё раз.');
    }
  });

  // Пагинация
  bot.action(/^shop_page_(\d+)$/, async (ctx) => {
    try {
      await ctx.answerCbQuery();
      const page  = parseInt(ctx.match[1]);
      const chatId = ctx.chat.type === 'private' ? ctx.from.id : ctx.chat.id;
      const coins = getCoins(ctx.from.id, chatId);

      await ctx.editMessageText(
        shopText(page, coins),
        { parse_mode: 'HTML', ...shopKeyboard(page) }
      );
    } catch (err) {
      console.error('[shop pagination]', err.message);
      await ctx.answerCbQuery('Ошибка обновления.', { show_alert: true });
    }
  });

  // Покупка товара
  bot.action(/^shop_buy_(.+)$/, async (ctx) => {
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

      // Списываем монеты и добавляем в инвентарь
      removeCoins(ctx.from.id, chatId, item.price);
      addToInventory(ctx.from.id, itemId);

      // Применяем буст сразу
      if (item.type === 'boost') {
        applyBoost(ctx.from.id, itemId);
      }

      const newCoins = getCoins(ctx.from.id, chatId);

      let extra = '';
      if (item.type === 'title') {
        extra = `\n\n💡 Активируй командой: /usetitle ${itemId}`;
      } else if (itemId === 'xp_boost') {
        extra = '\n\n⚡ Буст активирован! XP x2 на 1 час.';
      } else if (itemId === 'daily_boost') {
        extra = '\n\n🎁 Буст активирован! Следующий /daily даст x2 монет.';
      }

      await ctx.editMessageText(
        `✅ <b>Куплено: ${item.name}</b>\n\n` +
        `${item.desc}${extra}\n\n` +
        `💼 Остаток: <b>${newCoins} монет</b>`,
        {
          parse_mode: 'HTML',
          ...Markup.inlineKeyboard([
            [Markup.button.callback('🏪 Назад в магазин', 'shop_page_0')],
            [Markup.button.callback('🎒 Мой инвентарь', 'shop_inventory')],
          ]),
        }
      );
    } catch (err) {
      console.error('[shop purchase]', err.message);
      await ctx.answerCbQuery('❌ Ошибка при покупке.', { show_alert: true });
    }
  });

  // Инвентарь через кнопку
  bot.action('shop_inventory', async (ctx) => {
    try {
      await ctx.answerCbQuery();
      await showInventory(ctx, true);
    } catch (err) {
      console.error('[shop inventory action]', err.message);
    }
  });

  // /inventory — инвентарь командой
  bot.command(['inventory', 'инвентарь', 'inv'], async (ctx) => {
    try {
      await showInventory(ctx, false);
    } catch (err) {
      console.error('[shop inventory]', err.message);
      await ctx.reply('❌ Ошибка при открытии инвентаря.');
    }
  });

  async function showInventory(ctx, isEdit = false) {
    const inventory   = getInventory(ctx.from.id);
    const activeTitle = getActiveTitle(ctx.from.id);
    const name        = ctx.from.first_name || ctx.from.username || 'Участник';

    if (!inventory.length) {
      const text    = `🎒 <b>Инвентарь пуст</b>\n\nКупи что-нибудь в /shop!`;
      const options = {
        parse_mode: 'HTML',
        ...Markup.inlineKeyboard([[Markup.button.callback('🏪 В магазин', 'shop_page_0')]]),
      };
      if (isEdit) await ctx.editMessageText(text, options);
      else        await ctx.reply(text, options);
      return;
    }

    const lines = inventory.map(id => {
      const item = SHOP_ITEMS.find(i => i.id === id);
      if (!item) return null;
      const active = id === activeTitle ? ' ✅ (активен)' : '';
      return `• ${item.name}${active}`;
    }).filter(Boolean).join('\n');

    // Кнопки для надевания титулов
    const titleButtons = inventory
      .filter(id => {
        const item = SHOP_ITEMS.find(i => i.id === id);
        return item && item.type === 'title';
      })
      .map(id => {
        const item = SHOP_ITEMS.find(i => i.id === id);
        const active = id === activeTitle ? ' ✅' : '';
        return [Markup.button.callback(`Надеть: ${item.name}${active}`, `inv_use_${id}`)];
      });

    titleButtons.push([Markup.button.callback('🏪 В магазин', 'shop_page_0')]);

    const text    = `🎒 <b>Инвентарь ${name}:</b>\n\n${lines}`;
    const options = { parse_mode: 'HTML', ...Markup.inlineKeyboard(titleButtons) };

    if (isEdit) await ctx.editMessageText(text, options);
    else        await ctx.reply(text, options);
  }

  // Надеть титул (кнопка)
  bot.action(/^inv_use_(.+)$/, async (ctx) => {
    try {
      await ctx.answerCbQuery();
      const itemId    = ctx.match[1];
      const item      = SHOP_ITEMS.find(i => i.id === itemId);
      const inventory = getInventory(ctx.from.id);

      if (!item) return ctx.answerCbQuery('Товар не найден.', { show_alert: true });
      if (!inventory.includes(itemId)) return ctx.answerCbQuery('У тебя нет этого предмета!', { show_alert: true });

      setActiveTitle(ctx.from.id, itemId);

      await ctx.editMessageText(
        `✅ Титул <b>${item.name}</b> активирован!\n\nОн отображается в /rank`,
        {
          parse_mode: 'HTML',
          ...Markup.inlineKeyboard([
            [Markup.button.callback('🎒 Инвентарь', 'shop_inventory')],
            [Markup.button.callback('🏪 Магазин', 'shop_page_0')],
          ]),
        }
      );
    } catch (err) {
      console.error('[shop use title]', err.message);
      await ctx.answerCbQuery('Ошибка.', { show_alert: true });
    }
  });

  // /usetitle [id] — активировать по команде
  bot.command(['usetitle', 'титул'], async (ctx) => {
    try {
      const args   = ctx.message.text.split(' ').slice(1);
      const itemId = args[0];

      if (!itemId) {
        return ctx.reply(
          '💡 Укажи ID титула: /usetitle title_vip\n\nСписок твоих предметов: /inventory'
        );
      }

      const item      = SHOP_ITEMS.find(i => i.id === itemId);
      const inventory = getInventory(ctx.from.id);

      if (!item)                    return ctx.reply('❌ Такого титула не существует.');
      if (!inventory.includes(itemId)) return ctx.reply('❌ У тебя нет этого предмета. Купи в /shop');

      setActiveTitle(ctx.from.id, itemId);
      await ctx.reply(`✅ Титул <b>${item.name}</b> активирован! Виден в /rank`, { parse_mode: 'HTML' });
    } catch (err) {
      console.error('[shop usetitle]', err.message);
      await ctx.reply('❌ Ошибка при активации титула.');
    }
  });

  console.log('✅ Модуль shop подключён');
}

// Публичная функция — получить активный титул пользователя
function getUserTitle(telegramId) {
  const titleId = getActiveTitle(telegramId);
  if (!titleId) return null;
  const item = SHOP_ITEMS.find(i => i.id === titleId);
  return item ? item.name : null;
}

module.exports = { registerShop, getUserTitle, SHOP_ITEMS };
