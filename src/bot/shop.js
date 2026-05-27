// ============================================================
// src/bot/shop.js
// Магазин: покупка титулов и бустов за монеты + инвентарь
// ============================================================

const { Markup } = require('telegraf');
const {
  upsertUser,
  getCoins,
  removeCoins,
  addToInventory,
  getInventory,
  setActiveTitle,
  getActiveTitle,
  hasInventoryItem,
} = require('../database/db');

// ── Товары магазина ───────────────────────────────────────────
const SHOP_ITEMS = [
  { id: 'title_vip',      name: '⭐ VIP',            price: 500,  type: 'title', desc: 'Титул VIP в профиле' },
  { id: 'title_pro',      name: '🔥 Про игрок',      price: 800,  type: 'title', desc: 'Титул Про игрок' },
  { id: 'title_legend',   name: '👑 Легенда',        price: 2000, type: 'title', desc: 'Легендарный титул' },
  { id: 'title_rich',     name: '💎 Богач',          price: 1500, type: 'title', desc: 'Титул Богач' },
  { id: 'title_shadow',   name: '🌑 Тень',           price: 1000, type: 'title', desc: 'Таинственный титул' },
  { id: 'title_star',     name: '🌟 Звезда чата',    price: 1200, type: 'title', desc: 'Звезда этого чата' },
  { id: 'title_ghost',    name: '👻 Призрак',        price: 700,  type: 'title', desc: 'Тихий, но заметный' },
  { id: 'title_king',     name: '🤴 Король',         price: 3000, type: 'title', desc: 'Король чата' },
  { id: 'title_queen',    name: '👸 Королева',       price: 3000, type: 'title', desc: 'Королева чата' },
  { id: 'title_hacker',   name: '💻 Хакер',          price: 900,  type: 'title', desc: 'Технарь и хакер' },
  { id: 'xp_boost',       name: '⚡ XP x2 (1 час)',   price: 300,  type: 'boost', desc: 'Двойной XP на 1 час' },
  { id: 'daily_boost',    name: '🎁 Бонус x2 (1 раз)', price: 200, type: 'boost', desc: 'Следующий /daily x2' },
];

// ── Вспомогательные функции ───────────────────────────────
function formatName(user) {
  return user.first_name ? `*${user.first_name}*` : `[${user.id}]`;
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
    try {
      upsertUser(ctx.from.id, ctx.from.username, ctx.from.first_name);
      const coins = getCoins(ctx.from.id);

      await ctx.reply(
        shopText(0) + `\n\n💼 Твой баланс: <b>${coins} монет</b>`,
        { parse_mode: 'HTML', ...shopKeyboard(0) }
      );
    } catch (err) {
      console.error('[shop /shop]', err.message);
      await ctx.reply('❌ Ошибка при открытии магазина.');
    }
  });

  // Пагинация магазина
  bot.action(/^shop_page_(\d+)$/, async (ctx) => {
    try {
      await ctx.answerCbQuery();
      const page   = parseInt(ctx.match[1]);
      const coins  = getCoins(ctx.from.id);

      await ctx.editMessageText(
        shopText(page) + `\n\n💼 Твой баланс: <b>${coins} монет</b>`,
        { parse_mode: 'HTML', ...shopKeyboard(page) }
      );
    } catch (err) {
      console.error('[shop pagination]', err.message);
    }
  });

  // Покупка товара
  bot.action(/^shop_buy_(.+)$/, async (ctx) => {
    try {
      await ctx.answerCbQuery();
      const itemId = ctx.match[1];
      const item   = SHOP_ITEMS.find(i => i.id === itemId);

      if (!item) {
        return ctx.answerCbQuery('Товар не найден.', { show_alert: true });
      }

      upsertUser(ctx.from.id, ctx.from.username, ctx.from.first_name);
      const coins = getCoins(ctx.from.id);
      const inventory = getInventory(ctx.from.id);

      // Проверка баланса
      if (coins < item.price) {
        return ctx.answerCbQuery(
          `❌ Недостаточно монет\nНужно: ${item.price}\nУ тебя: ${coins}`,
          { show_alert: true }
        );
      }

      // Проверка наличия в инвентаре (для титулов)
      if (item.type === 'title' && inventory.includes(itemId)) {
        return ctx.answerCbQuery('У тебя уже есть этот титул!', { show_alert: true });
      }

      // Применяем покупку
      removeCoins(ctx.from.id, item.price);
      addToInventory(ctx.from.id, itemId);

      // Если это буст, применяем флаг
      if (item.type === 'boost') {
        // Флаги обрабатываются в других модулях через getCoins и инвентарь
        if (itemId === 'xp_boost') {
          // XP буст обрабатывается в levels.js
        } else if (itemId === 'daily_boost') {
          // Бонус бует обрабатывается в economy.js
        }
      }

      const newCoins = getCoins(ctx.from.id);

      await ctx.editMessageText(
        `✅ <b>Куплено: ${item.name}</b>\n\n${item.desc}\n\n💼 Остаток: <b>${newCoins} монет</b>` +
        (item.type === 'title' ? `\n\n💡 Активируй: /usetitle ${itemId}` : ''),
        {
          parse_mode: 'HTML',
          ...Markup.inlineKeyboard([[Markup.button.callback('🏪 Вернуться', 'shop_page_0')]]),
        }
      );
    } catch (err) {
      console.error('[shop purchase]', err.message);
      await ctx.answerCbQuery('❌ Ошибка при покупке.', { show_alert: true });
    }
  });

  // /inventory — инвентарь
  bot.command(['inventory', 'инвентарь', 'inv'], async (ctx) => {
    try {
      upsertUser(ctx.from.id, ctx.from.username, ctx.from.first_name);
      const inventory  = getInventory(ctx.from.id);
      const activeTitle = getActiveTitle(ctx.from.id);

      if (!inventory.length) {
        return ctx.reply(
          `🎒 <b>Инвентарь пуст</b>\n\nКупи что-нибудь в /shop!`,
          { parse_mode: 'HTML' }
        );
      }

      // Список всех предметов
      const lines = inventory.map(id => {
        const item = SHOP_ITEMS.find(i => i.id === id);
        if (!item) return null;
        const active = id === activeTitle ? ' ✅' : '';
        return `• ${item.name}${active}`;
      }).filter(Boolean).join('\n');

      // Кнопки для титулов
      const buttons = inventory
        .filter(id => SHOP_ITEMS.find(i => i.id === id && i.type === 'title'))
        .map(id => {
          const item = SHOP_ITEMS.find(i => i.id === id);
          return [Markup.button.callback(`Надеть: ${item.name}`, `inv_use_${id}`)];
        });

      await ctx.reply(
        `🎒 <b>Инвентарь ${formatName(ctx.from)}:</b>\n\n${lines}`,
        { parse_mode: 'HTML', ...Markup.inlineKeyboard(buttons) }
      );
    } catch (err) {
      console.error('[shop inventory]', err.message);
      await ctx.reply('❌ Ошибка при открытии инвентаря.');
    }
  });

  // Надеть титул из инвентаря (кнопка)
  bot.action(/^inv_use_(.+)$/, async (ctx) => {
    try {
      await ctx.answerCbQuery();
      const itemId = ctx.match[1];
      const item   = SHOP_ITEMS.find(i => i.id === itemId);

      if (!item) {
        return ctx.answerCbQuery('Товар не найден.', { show_alert: true });
      }

      const inventory = getInventory(ctx.from.id);
      if (!inventory.includes(itemId)) {
        return ctx.answerCbQuery('У тебя нет этого предмета!', { show_alert: true });
      }

      setActiveTitle(ctx.from.id, itemId);
      await ctx.editMessageText(
        `✅ Титул <b>${item.name}</b> активирован!\n\nОн будет отображаться в /rank`,
        { parse_mode: 'HTML' }
      );
    } catch (err) {
      console.error('[shop use title]', err.message);
    }
  });

  // /usetitle [id] — активировать титул по ID
  bot.command(['usetitle', 'титул'], async (ctx) => {
    try {
      upsertUser(ctx.from.id, ctx.from.username, ctx.from.first_name);
      const args   = ctx.message.text.split(' ').slice(1);
      const itemId = args[0];

      if (!itemId) {
        return ctx.reply('Укажи ID титула: /usetitle title_vip\nСписок твоих предметов: /inventory');
      }

      const inventory = getInventory(ctx.from.id);
      const item = SHOP_ITEMS.find(i => i.id === itemId);

      if (!item) {
        return ctx.reply('❌ Такого титула не существует.');
      }

      if (!inventory.includes(itemId)) {
        return ctx.reply(`❌ У тебя нет этого предмета. Купи его в /shop`);
      }

      setActiveTitle(ctx.from.id, itemId);
      await ctx.reply(
        `✅ Титул <b>${item.name}</b> активирован! Виден в /rank`,
        { parse_mode: 'HTML' }
      );
    } catch (err) {
      console.error('[shop usetitle]', err.message);
      await ctx.reply('❌ Ошибка при активировании титула.');
    }
  });

  console.log('✅ Модуль shop подключён');
}

// Публичная функция для получения титула (используется в других модулях)
function getUserTitle(telegramId) {
  const titleId = getActiveTitle(telegramId);
  if (!titleId) return null;
  const item = SHOP_ITEMS.find(i => i.id === titleId);
  return item ? item.name : null;
}

module.exports = { registerShop, getUserTitle, SHOP_ITEMS };
