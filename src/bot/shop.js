const { Markup } = require('telegraf');
const {
  getInventory,
  addToInventory,
  getCoins,
  addCoins,
  removeCoins,
  getActiveTitle,
  setActiveTitle,
  loadDb,
  saveDb,
  now
} = require('../database/db');

// ── Товары магазина ───────────────────────────────────────────
const SHOP_ITEMS = [
  { id: 'vip',     name: '⭐ VIP',              price: 500,  type: 'title', desc: 'Титул VIP в профиле' },
  { id: 'pro',     name: '🔥 Про игрок',        price: 800,  type: 'title', desc: 'Титул Про игрок' },
  { id: 'legend',  name: '👑 Легенда',          price: 2000, type: 'title', desc: 'Легендарный титул' },
  { id: 'rich',    name: '💎 Богач',            price: 1500, type: 'title', desc: 'Титул Богач' },
  { id: 'shadow',  name: '🌑 Тень',             price: 1000, type: 'title', desc: 'Таинственный титул' },
  { id: 'star',    name: '🌟 Звезда чата',      price: 1200, type: 'title', desc: 'Звезда этого чата' },
  { id: 'ghost',   name: '👻 Призрак',          price: 700,  type: 'title', desc: 'Тихий, но заметный' },
  { id: 'king',    name: '🤴 Король',           price: 3000, type: 'title', desc: 'Король чата' },
  { id: 'queen',   name: '👸 Королева',         price: 3000, type: 'title', desc: 'Королева чата' },
  { id: 'hacker',  name: '💻 Хакер',            price: 900,  type: 'title', desc: 'Технарь и хакер' },
  { id: 'xpx2',    name: '⚡ XP x2 (1 час)',    price: 300,  type: 'boost', desc: 'Двойной XP на 1 час' },
  { id: 'bonusx2', name: '🎁 Бонус x2 (1 раз)', price: 200,  type: 'boost', desc: 'Следующий /daily x2' },
];

// ══════════════════════════════════════════════════════════════
// МОНЕТЫ — читаем и пишем ТОЛЬКО через db.js
// ══════════════════════════════════════════════════════════════

/**
 * Получить АКТУАЛЬНЫЙ баланс сразу после изменения.
 * Всегда берёт самое свежее значение из БД.
 */
function getCurrentCoins(telegramId) {
  return getCoins(telegramId);
}

// ══════════════════════════════════════════════════════════════
// ИНВЕНТАРЬ И ТИТУЛЫ — через db.js
// ══════════════════════════════════════════════════════════════
// Функции уже импортированы из db.js

function applyBoost(telegramId, itemId) {
  const data = loadDb();
  const user = data.users.find((u) => String(u.telegram_id) === String(telegramId));
  if (!user) return;
  
  if (itemId === 'xpx2') {
    user.xp_boost_until = Date.now() + 3600000;
  }
  if (itemId === 'bonusx2') {
    user.daily_boost_next = 1;
  }
  user.updated_at = now();
  saveDb(data);
}

// ══════════════════════════════════════════════════════════════
// ПОСТРОЕНИЕ СТРАНИЦ МАГАЗИНА
// ══════════════════════════════════════════════════════════════

const PER_PAGE = 4;

function pageText(page, coins) {
  const start = page * PER_PAGE;
  const items = SHOP_ITEMS.slice(start, start + PER_PAGE);
  const total = Math.ceil(SHOP_ITEMS.length / PER_PAGE);

  const lines = items.map(i =>
    `${i.name} — <b>${i.price}💰</b>\n  └ ${i.desc}`
  ).join('\n\n');

  return (
    `🏪 <b>Магазин FunTalk</b> (стр. ${page + 1}/${total})\n\n` +
    `${lines}\n\n` +
    `💼 Твой баланс: <b>${coins} монет</b>`
  );
}

function pageKeyboard(page) {
  const start = page * PER_PAGE;
  const items = SHOP_ITEMS.slice(start, start + PER_PAGE);

  const buttons = items.map(i => [
    Markup.button.callback(`${i.name} — ${i.price}💰`, `sb${i.id}`),
  ]);

  const nav = [];
  if (page > 0)                             nav.push(Markup.button.callback('⬅️', `sp${page - 1}`));
  if (start + PER_PAGE < SHOP_ITEMS.length) nav.push(Markup.button.callback('➡️', `sp${page + 1}`));
  if (nav.length) buttons.push(nav);
  buttons.push([Markup.button.callback('🎒 Инвентарь', 'sinv')]);

  return Markup.inlineKeyboard(buttons);
}

// ══════════════════════════════════════════════════════════════
// РЕГИСТРАЦИЯ ОБРАБОТЧИКОВ
// ══════════════════════════════════════════════════════════════

function registerShop(bot) {

  bot.command(['shop', 'магазин'], async (ctx) => {
    try {
      const coins = getCoins(ctx.from.id);
      await ctx.reply(pageText(0, coins), { parse_mode: 'HTML', ...pageKeyboard(0) });
    } catch (err) {
      console.error('[shop /shop]', err.message);
      await ctx.reply('❌ Ошибка при открытии магазина.');
    }
  });

  // Пагинация
  bot.action(/^sp(\d+)$/, async (ctx) => {
    try {
      await ctx.answerCbQuery();
      const page = parseInt(ctx.match[1]);
      // Всегда читаем актуальный баланс при переходе между страницами
      const coins = getCurrentCoins(ctx.from.id);
      await ctx.editMessageText(
        pageText(page, coins),
        { parse_mode: 'HTML', ...pageKeyboard(page) }
      );
    } catch (err) {
      console.error('[shop pagination]', err.message);
    }
  });

  // Покупка — answerCbQuery вызывается РОВНО ОДИН РАЗ в каждой ветке
  bot.action(/^sb(.+)$/, async (ctx) => {
    try {
      const itemId    = ctx.match[1];
      const item      = SHOP_ITEMS.find(i => i.id === itemId);

      if (!item) {
        await ctx.answerCbQuery('❌ Товар не найден.', { show_alert: true });
        return;
      }

      // Читаем актуальный баланс прямо перед покупкой
      const coins     = getCurrentCoins(ctx.from.id);
      const inventory = getInventory(ctx.from.id);

      if (coins < item.price) {
        await ctx.answerCbQuery(
          `❌ Недостаточно монет!\nНужно: ${item.price}💰\nУ тебя: ${coins}💰`,
          { show_alert: true }
        );
        return;
      }

      if (item.type === 'title' && inventory.includes(itemId)) {
        await ctx.answerCbQuery('У тебя уже есть этот титул!', { show_alert: true });
        return;
      }

      // Закрываем spinner — один раз, без alert
      await ctx.answerCbQuery();

      // Выполняем транзакцию
      removeCoins(ctx.from.id, item.price);
      addToInventory(ctx.from.id, itemId);
      if (item.type === 'boost') applyBoost(ctx.from.id, itemId);

      // Читаем НОВЫЙ баланс из БД после списания
      const newCoins = getCurrentCoins(ctx.from.id);

      let extra = '';
      if (item.type === 'title')     extra = `\n\n💡 Активируй: /usetitle ${itemId}`;
      else if (itemId === 'xpx2')    extra = '\n\n⚡ Буст активирован! XP x2 на 1 час.';
      else if (itemId === 'bonusx2') extra = '\n\n🎁 Буст активирован! Следующий /daily даст x2 монет.';

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
      try {
        await ctx.answerCbQuery('❌ Ошибка при покупке.', { show_alert: true });
      } catch (_) { /* уже отвечали */ }
    }
  });

  // Инвентарь
  bot.action('sinv', async (ctx) => {
    try {
      await ctx.answerCbQuery();
      const { text, keyboard } = buildInventoryMessage(ctx.from);
      await ctx.editMessageText(text, { parse_mode: 'HTML', ...keyboard });
    } catch (err) {
      console.error('[shop sinv]', err.message);
      try { await ctx.answerCbQuery('Ошибка.', { show_alert: true }); } catch (_) {}
    }
  });

  bot.command(['inventory', 'инвентарь', 'inv'], async (ctx) => {
    try {
      const { text, keyboard } = buildInventoryMessage(ctx.from);
      await ctx.reply(text, { parse_mode: 'HTML', ...keyboard });
    } catch (err) {
      console.error('[shop inventory]', err.message);
      await ctx.reply('❌ Ошибка при открытии инвентаря.');
    }
  });

  // Надеть титул
  bot.action(/^siu(.+)$/, async (ctx) => {
    try {
      await ctx.answerCbQuery();
      const itemId    = ctx.match[1];
      const item      = SHOP_ITEMS.find(i => i.id === itemId);
      const inventory = getInventory(ctx.from.id);

      if (!item)                       { await ctx.reply('❌ Товар не найден.');           return; }
      if (!inventory.includes(itemId)) { await ctx.reply('❌ У тебя нет этого предмета!'); return; }

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
      try { await ctx.answerCbQuery('Ошибка.', { show_alert: true }); } catch (_) {}
    }
  });

  bot.command(['usetitle', 'титул'], async (ctx) => {
    try {
      const itemId    = ctx.message.text.split(' ').slice(1)[0];
      if (!itemId)     return ctx.reply('Укажи ID: /usetitle vip\nСписок: /inventory');
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

// ── Инвентарь (сообщение) ─────────────────────────────────────
function buildInventoryMessage(from) {
  const inventory   = getInventory(from.id);
  const activeTitle = getActiveTitle(from.id);
  const name        = from.first_name || from.username || 'Участник';

  if (!inventory.length) {
    return {
      text:     `🎒 <b>Инвентарь пуст</b>\n\nКупи что-нибудь в /shop!`,
      keyboard: Markup.inlineKeyboard([[Markup.button.callback('🏪 В магазин', 'sp0')]]),
    };
  }

  const lines = inventory.map(id => {
    const item = SHOP_ITEMS.find(i => i.id === id);
    if (!item) return null;
    return `• ${item.name}${id === activeTitle ? ' ✅' : ''}`;
  }).filter(Boolean).join('\n');

  const titleButtons = inventory
    .filter(id => SHOP_ITEMS.find(i => i.id === id && i.type === 'title'))
    .map(id => {
      const item = SHOP_ITEMS.find(i => i.id === id);
      return [Markup.button.callback(
        `Надеть: ${item.name}${id === activeTitle ? ' ✅' : ''}`,
        `siu${id}`
      )];
    });

  titleButtons.push([Markup.button.callback('🏪 В магазин', 'sp0')]);

  return {
    text:     `🎒 <b>Инвентарь ${name}:</b>\n\n${lines}`,
    keyboard: Markup.inlineKeyboard(titleButtons),
  };
}

function getUserTitle(telegramId) {
  const titleId = getActiveTitle(telegramId);
  if (!titleId) return null;
  const item = SHOP_ITEMS.find(i => i.id === titleId);
  return item ? item.name : null;
}

module.exports = {
  registerShop,
  getUserTitle,
  SHOP_ITEMS,
  // Для menu.js (кнопка 🏪 Магазин)
  pageText,
  pageKeyboard,
  getCoins: getCurrentCoins,
};