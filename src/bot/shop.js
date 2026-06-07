// ============================================================
// src/bot/shop.js  —  Магазин FunTalk
// Команды: /shop, /inventory, /usetitle
// Кнопки:  sb<id> (купить), sp<n> (страница), sinv (инвентарь), su<id> (надеть)
// ============================================================

'use strict';

const { Markup } = require('telegraf');
const fs   = require('fs');
const path = require('path');

// ── Путь к основной базе (bot_data.json) ─────────────────────
const DB_PATH = process.env.DB_PATH
  ? path.resolve(process.env.DB_PATH)
  : path.join(process.cwd(), 'data', 'bot_data.json');

// ── Товары ────────────────────────────────────────────────────
// id должны быть короткими (нет пробелов, нет спецсимволов)
const ITEMS = [
  { id: 'vip',     name: '⭐ VIP',           price: 500,  type: 'title', desc: 'Титул VIP в профиле' },
  { id: 'pro',     name: '🔥 Про игрок',     price: 800,  type: 'title', desc: 'Титул Про игрок' },
  { id: 'legend',  name: '👑 Легенда',       price: 2000, type: 'title', desc: 'Легендарный титул' },
  { id: 'rich',    name: '💎 Богач',         price: 1500, type: 'title', desc: 'Титул Богач' },
  { id: 'shadow',  name: '🌑 Тень',          price: 1000, type: 'title', desc: 'Таинственный титул' },
  { id: 'star',    name: '🌟 Звезда чата',   price: 1200, type: 'title', desc: 'Звезда этого чата' },
  { id: 'ghost',   name: '👻 Призрак',       price: 700,  type: 'title', desc: 'Тихий, но заметный' },
  { id: 'king',    name: '🤴 Король',        price: 3000, type: 'title', desc: 'Король чата' },
  { id: 'queen',   name: '👸 Королева',      price: 3000, type: 'title', desc: 'Королева чата' },
  { id: 'hacker',  name: '💻 Хакер',         price: 900,  type: 'title', desc: 'Технарь и хакер' },
  { id: 'xpx2',    name: '⚡ XP x2 (1ч)',    price: 300,  type: 'boost', desc: 'Двойной XP на 1 час' },
  { id: 'bonx2',   name: '🎁 Бонус x2',      price: 200,  type: 'boost', desc: 'Следующий /daily x2' },
];

const PER_PAGE = 4;

// ── Чтение / запись JSON-базы ─────────────────────────────────
function load() {
  try {
    if (!fs.existsSync(DB_PATH)) return { users: [] };
    return JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
  } catch {
    return { users: [] };
  }
}

function save(data) {
  try {
    fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2), 'utf8');
  } catch (e) {
    console.error('[shop save]', e.message);
  }
}

// ── Хелперы базы ──────────────────────────────────────────────

/** Получить монеты пользователя (берём первую запись с этим telegram id) */
function getCoins(tgId, chatId) {
  const data = load();
  // Ищем запись с совпадением chat_id если передан, иначе первую
  const row = chatId
    ? data.users.find(u => u.id === tgId && String(u.chat_id) === String(chatId))
    : data.users.find(u => u.id === tgId);
  return row ? (row.coins || 0) : 0;
}

/** Списать монеты во ВСЕХ записях пользователя (он может быть в нескольких чатах) */
function deductCoins(tgId, chatId, amount) {
  const data = load();
  let changed = false;
  for (const row of data.users) {
    if (row.id === tgId && (!chatId || String(row.chat_id) === String(chatId))) {
      row.coins = Math.max(0, (row.coins || 0) - amount);
      changed = true;
    }
  }
  if (changed) save(data);
}

/** Инвентарь (глобальный — не привязан к чату) */
function getInv(tgId) {
  const data = load();
  const row  = data.users.find(u => u.id === tgId);
  return Array.isArray(row?.inventory) ? [...row.inventory] : [];
}

function addInv(tgId, itemId) {
  const data = load();
  let changed = false;
  for (const row of data.users) {
    if (row.id === tgId) {
      if (!Array.isArray(row.inventory)) row.inventory = [];
      if (!row.inventory.includes(itemId)) {
        row.inventory.push(itemId);
        changed = true;
      }
    }
  }
  if (changed) save(data);
}

/** Активный титул */
function getTitle(tgId) {
  const data = load();
  return data.users.find(u => u.id === tgId)?.active_title || null;
}

function setTitle(tgId, itemId) {
  const data = load();
  let changed = false;
  for (const row of data.users) {
    if (row.id === tgId) {
      row.active_title = itemId;
      changed = true;
    }
  }
  if (changed) save(data);
}

/** Применить буст */
function applyBoost(tgId, itemId) {
  const data = load();
  for (const row of data.users) {
    if (row.id === tgId) {
      if (itemId === 'xpx2')  row.xp_boost_until  = Date.now() + 3600000; // 1 час
      if (itemId === 'bonx2') row.daily_boost_next = true;
    }
  }
  save(data);
}

// ── Построители сообщений ─────────────────────────────────────

function pageText(page, coins) {
  const start = page * PER_PAGE;
  const items = ITEMS.slice(start, start + PER_PAGE);
  const total = Math.ceil(ITEMS.length / PER_PAGE);

  const list = items
    .map(i => `${i.name} — <b>${i.price}</b> FunMoney\n  └ ${i.desc}`)
    .join('\n\n');

  return `🏪 <b>Магазин FunTalk</b> (стр. ${page + 1}/${total})\n\n${list}\n\n💼 Баланс: <b>${coins}</b> FunMoney`;
}

function pageKeyboard(page) {
  const start   = page * PER_PAGE;
  const items   = ITEMS.slice(start, start + PER_PAGE);
  const total   = Math.ceil(ITEMS.length / PER_PAGE);

  // Кнопки товаров
  const rows = items.map(i => [Markup.button.callback(`${i.name} — ${i.price} FunMoney`, `sb_${i.id}`)]);

  // Навигация
  const nav = [];
  if (page > 0)        nav.push(Markup.button.callback('◀️ Назад', `sp_${page - 1}`));
  if (page < total - 1) nav.push(Markup.button.callback('Вперёд ▶️', `sp_${page + 1}`));
  if (nav.length)      rows.push(nav);

  // Инвентарь
  rows.push([Markup.button.callback('🎒 Мой инвентарь', 'sinv')]);

  return Markup.inlineKeyboard(rows);
}

function invText(tgId, firstName) {
  const inv    = getInv(tgId);
  const active = getTitle(tgId);
  const name   = firstName || 'Участник';

  if (!inv.length) {
    return { text: `🎒 <b>Инвентарь ${name} пуст</b>\n\nКупи что-нибудь в /shop!`, empty: true };
  }

  const lines = inv
    .map(id => {
      const item = ITEMS.find(i => i.id === id);
      return item ? `• ${item.name}${id === active ? '  ✅' : ''}` : null;
    })
    .filter(Boolean)
    .join('\n');

  return { text: `🎒 <b>Инвентарь ${name}:</b>\n\n${lines}`, empty: false };
}

function invKeyboard(tgId) {
  const inv    = getInv(tgId);
  const active = getTitle(tgId);

  const titleButtons = inv
    .filter(id => ITEMS.find(i => i.id === id && i.type === 'title'))
    .map(id => {
      const item = ITEMS.find(i => i.id === id);
      const mark = id === active ? ' ✅' : '';
      return [Markup.button.callback(`Надеть: ${item.name}${mark}`, `su_${id}`)];
    });

  titleButtons.push([Markup.button.callback('🏪 В магазин', 'sp_0')]);
  return Markup.inlineKeyboard(titleButtons);
}

function getChatId(ctx) {
  const chat = ctx.chat || ctx.callbackQuery?.message?.chat;
  if (!chat) return null;
  return chat.type === 'private' ? ctx.from.id : chat.id;
}

// ── Регистрация ───────────────────────────────────────────────
function registerShop(bot) {

  // ── /shop — открыть магазин ───────────────────────────────────
  bot.command(['shop', 'магазин'], async (ctx) => {
    try {
      const chatId = getChatId(ctx);
      if (!chatId) throw new Error('Не удалось определить чат');
      const coins  = getCoins(ctx.from.id, chatId);
      await ctx.reply(pageText(0, coins), {
        parse_mode: 'HTML',
        ...pageKeyboard(0),
      });
    } catch (e) {
      console.error('[shop cmd]', e.message);
      await ctx.reply('❌ Не удалось открыть магазин, попробуй ещё раз.');
    }
  });

  // ── Пагинация: sp_0, sp_1, sp_2 ... ──────────────────────────
  bot.action(/^sp_(\d+)$/, async (ctx) => {
    try {
      await ctx.answerCbQuery();
      const page   = parseInt(ctx.match[1], 10);
      const chatId = getChatId(ctx);
      if (!chatId) throw new Error('Не удалось определить чат');
      const coins  = getCoins(ctx.from.id, chatId);
      await ctx.editMessageText(pageText(page, coins), {
        parse_mode: 'HTML',
        ...pageKeyboard(page),
      });
    } catch (e) {
      console.error('[shop page]', e.message);
      await ctx.answerCbQuery('Ошибка обновления страницы.', { show_alert: true });
    }
  });

  // ── Покупка: sb_vip, sb_pro, sb_xpx2 ... ─────────────────────
  bot.action(/^sb_(.+)$/, async (ctx) => {
    try {
      await ctx.answerCbQuery();

      const itemId = ctx.match[1];
      const item   = ITEMS.find(i => i.id === itemId);
      if (!item) return ctx.answerCbQuery('❌ Товар не найден.', { show_alert: true });

      const chatId = getChatId(ctx);
      if (!chatId) throw new Error('Не удалось определить чат');
      const coins  = getCoins(ctx.from.id, chatId);
      const inv    = getInv(ctx.from.id);

      // Проверка баланса
      if (coins < item.price) {
          return ctx.answerCbQuery(
            `У вас, к сожалению, недостаточно средств на покупку: ${item.name}`,
            { show_alert: true }
          );
      }

      // Титул уже куплен?
      if (item.type === 'title' && inv.includes(itemId)) {
        return ctx.answerCbQuery('Этот титул у тебя уже есть!', { show_alert: true });
      }

      // Списываем и добавляем в инвентарь
      deductCoins(ctx.from.id, chatId, item.price);
      addInv(ctx.from.id, itemId);

      // Применяем буст сразу
      if (item.type === 'boost') applyBoost(ctx.from.id, itemId);

      const newCoins = getCoins(ctx.from.id, chatId);

      // Сообщение о покупке
      let note = '';
      if (item.type === 'title')     note = `\n\n💡 Надень командой /usetitle ${itemId} или через инвентарь.`;
      else if (itemId === 'xpx2')    note = '\n\n⚡ XP x2 активирован на 1 час!';
      else if (itemId === 'bonx2')   note = '\n\n🎁 Буст активирован! Следующий /daily даст x2 монет.';

      await ctx.editMessageText(
        `✅ <b>Куплено: ${item.name}</b>\n\n` +
        `${item.desc}${note}\n\n` +
        `💼 Остаток: <b>${newCoins}</b> FunMoney`,
        {
          parse_mode: 'HTML',
          ...Markup.inlineKeyboard([
            [Markup.button.callback('🏪 Назад в магазин', 'sp_0')],
            [Markup.button.callback('🎒 Мой инвентарь',  'sinv')],
          ]),
        }
      );
    } catch (e) {
      console.error('[shop buy]', e.message);
      await ctx.answerCbQuery('❌ Ошибка при покупке.', { show_alert: true });
    }
  });

  // ── Инвентарь (кнопка) ───────────────────────────────────────
  bot.action('sinv', async (ctx) => {
    try {
      await ctx.answerCbQuery();
      const { text, empty } = invText(ctx.from.id, ctx.from.first_name);
      if (empty) {
        await ctx.editMessageText(text, {
          parse_mode: 'HTML',
          ...Markup.inlineKeyboard([[Markup.button.callback('🏪 В магазин', 'sp_0')]]),
        });
      } else {
        await ctx.editMessageText(text, {
          parse_mode: 'HTML',
          ...invKeyboard(ctx.from.id),
        });
      }
    } catch (e) {
      console.error('[shop sinv]', e.message);
      await ctx.answerCbQuery('Ошибка.', { show_alert: true });
    }
  });

  // ── /inventory ────────────────────────────────────────────────
  bot.command(['inventory', 'инвентарь', 'inv'], async (ctx) => {
    try {
      const { text, empty } = invText(ctx.from.id, ctx.from.first_name);
      if (empty) {
        await ctx.reply(text, {
          parse_mode: 'HTML',
          ...Markup.inlineKeyboard([[Markup.button.callback('🏪 В магазин', 'sp_0')]]),
        });
      } else {
        await ctx.reply(text, {
          parse_mode: 'HTML',
          ...invKeyboard(ctx.from.id),
        });
      }
    } catch (e) {
      console.error('[shop inv cmd]', e.message);
      await ctx.reply('❌ Не удалось открыть инвентарь.');
    }
  });

  // ── Надеть титул (кнопка): su_vip, su_pro ... ────────────────
  bot.action(/^su_(.+)$/, async (ctx) => {
    try {
      await ctx.answerCbQuery();
      const itemId = ctx.match[1];
      const item   = ITEMS.find(i => i.id === itemId);
      const inv    = getInv(ctx.from.id);

      if (!item)                    return ctx.answerCbQuery('Товар не найден.',    { show_alert: true });
      if (!inv.includes(itemId))    return ctx.answerCbQuery('Нет в инвентаре.',    { show_alert: true });
      if (item.type !== 'title')    return ctx.answerCbQuery('Это не титул.',        { show_alert: true });

      setTitle(ctx.from.id, itemId);

      await ctx.editMessageText(
        `✅ Титул <b>${item.name}</b> надет!\n\nОн отображается в /rank`,
        {
          parse_mode: 'HTML',
          ...Markup.inlineKeyboard([
            [Markup.button.callback('🎒 Инвентарь', 'sinv')],
            [Markup.button.callback('🏪 Магазин',   'sp_0')],
          ]),
        }
      );
    } catch (e) {
      console.error('[shop su]', e.message);
      await ctx.answerCbQuery('Ошибка.', { show_alert: true });
    }
  });

  bot.on('callback_query', async (ctx, next) => {
    const data = ctx.callbackQuery?.data;
    if (!data) return next();
    if (!/^sp_\d+$/.test(data) && !/^sb_.+$/.test(data) && data !== 'sinv' && !/^su_.+$/.test(data)) return next();

    try {
      await ctx.answerCbQuery();
      const chatId = getChatId(ctx);
      if (!chatId) return ctx.answerCbQuery('Не удалось определить чат.', { show_alert: true });

      if (data === 'sinv') {
        const { text, empty } = invText(ctx.from.id, ctx.from.first_name);
        if (empty) {
          await ctx.editMessageText(text, {
            parse_mode: 'HTML',
            ...Markup.inlineKeyboard([[Markup.button.callback('🏪 В магазин', 'sp_0')]]),
          });
        } else {
          await ctx.editMessageText(text, {
            parse_mode: 'HTML',
            ...invKeyboard(ctx.from.id),
          });
        }
        return;
      }

      const [type, arg] = data.split('_');
      if (type === 'sp') {
        const page = parseInt(arg, 10);
        const coins = getCoins(ctx.from.id, chatId);
        await ctx.editMessageText(pageText(page, coins), {
          parse_mode: 'HTML',
          ...pageKeyboard(page),
        });
        return;
      }

      if (type === 'sb') {
        const itemId = arg;
        const item = ITEMS.find(i => i.id === itemId);
        if (!item) return ctx.answerCbQuery('❌ Товар не найден.', { show_alert: true });

        const coins = getCoins(ctx.from.id, chatId);
        const inv   = getInv(ctx.from.id);
        if (coins < item.price) {
            return ctx.answerCbQuery(
              `У вас, к сожалению, недостаточно средств на покупку: ${item.name}`,
              { show_alert: true }
            );
        }
        if (item.type === 'title' && inv.includes(itemId)) {
          return ctx.answerCbQuery('Этот титул у тебя уже есть!', { show_alert: true });
        }

        deductCoins(ctx.from.id, chatId, item.price);
        addInv(ctx.from.id, itemId);
        if (item.type === 'boost') applyBoost(ctx.from.id, itemId);
        const newCoins = getCoins(ctx.from.id, chatId);
        let note = '';
        if (item.type === 'title') note = `\n\n💡 Надень командой /usetitle ${itemId} или через инвентарь.`;
        else if (itemId === 'xpx2') note = '\n\n⚡ XP x2 активирован на 1 час!';
        else if (itemId === 'bonx2') note = '\n\n🎁 Буст активирован! Следующий /daily даст x2 монет.';

        await ctx.editMessageText(
          `✅ <b>Куплено: ${item.name}</b>\n\n` +
          `${item.desc}${note}\n\n` +
          `💼 Остаток: <b>${newCoins}</b> FunMoney`,
          {
            parse_mode: 'HTML',
            ...Markup.inlineKeyboard([
              [Markup.button.callback('🏪 Назад в магазин', 'sp_0')],
              [Markup.button.callback('🎒 Мой инвентарь', 'sinv')],
            ]),
          }
        );
        try {
          await ctx.reply(`✅ Вы успешно купили ${item.name}. Остаток: ${newCoins} FunMoney`);
        } catch (e) { /* игнорируем ошибки отправки личного сообщения */ }
          try {
            await ctx.reply(`✅ Вы успешно купили ${item.name}. Остаток: ${newCoins} FunMoney`);
          } catch (e) { /* игнорируем ошибки отправки личного сообщения */ }
        return;
      }

      if (type === 'su') {
        const itemId = arg;
        const item = ITEMS.find(i => i.id === itemId);
        const inv  = getInv(ctx.from.id);
        if (!item) return ctx.answerCbQuery('Товар не найден.', { show_alert: true });
        if (!inv.includes(itemId)) return ctx.answerCbQuery('Нет в инвентаре.', { show_alert: true });
        if (item.type !== 'title') return ctx.answerCbQuery('Это не титул.', { show_alert: true });

        setTitle(ctx.from.id, itemId);
        await ctx.editMessageText(
          `✅ Титул <b>${item.name}</b> надет!\n\nОн отображается в /rank`,
          {
            parse_mode: 'HTML',
            ...Markup.inlineKeyboard([
              [Markup.button.callback('🎒 Инвентарь', 'sinv')],
              [Markup.button.callback('🏪 Магазин',   'sp_0')],
            ]),
          }
        );
        return;
      }
    } catch (err) {
      console.error('[shop callback]', err.message);
      await ctx.answerCbQuery('Ошибка обработки кнопки.', { show_alert: true });
    }
  });

  // ── /usetitle <id> ────────────────────────────────────────────
  bot.command(['usetitle', 'титул'], async (ctx) => {
    try {
      const [, itemId] = ctx.message.text.trim().split(/\s+/);
      if (!itemId) {
        return ctx.reply(
          'Укажи ID титула: /usetitle vip\n\nДоступные ID: ' +
          ITEMS.filter(i => i.type === 'title').map(i => i.id).join(', ')
        );
      }
      const item = ITEMS.find(i => i.id === itemId);
      const inv  = getInv(ctx.from.id);

      if (!item)                 return ctx.reply('❌ Такого титула не существует.');
      if (!inv.includes(itemId)) return ctx.reply('❌ У тебя нет этого предмета. Купи в /shop');

      setTitle(ctx.from.id, itemId);
      await ctx.reply(`✅ Титул <b>${item.name}</b> надет! Виден в /rank`, { parse_mode: 'HTML' });
    } catch (e) {
      console.error('[shop usetitle]', e.message);
      await ctx.reply('❌ Ошибка.');
    }
  });

  console.log('✅ Модуль shop подключён');
}

// ── Публичная функция: получить активный титул ────────────────
function getUserTitle(tgId) {
  const id   = getTitle(tgId);
  const item = ITEMS.find(i => i.id === id);
  return item ? item.name : null;
}

module.exports = { registerShop, getUserTitle, SHOP_ITEMS: ITEMS };
