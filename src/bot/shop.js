const { Markup } = require('telegraf');
const {
  getInventory,
  addToInventory,
  removeFromInventory,
  getCoins,
  addCoins,
  removeCoins,
  getActiveTitle,
  setActiveTitle,
  loadDb,
  saveDb,
  now,
  setShield
} = require('../database/db');
const { removeWarning } = require('../moderation');
const { resetDailyCooldown } = require('../economy');

// ── Товары магазина ───────────────────────────────────────────
const SHOP_ITEMS = [
  { id: 'vip',     name: '⭐ VIP',              price: 500,  type: 'title', desc: 'Титул VIP в профиле', minLevel: null, unlockType: 'purchase', sellPrice: null },
  { id: 'pro',     name: '🔥 Про игрок',        price: 800,  type: 'title', desc: 'Титул Про игрок', minLevel: null, unlockType: 'purchase', sellPrice: null },
  { id: 'legend',  name: '👑 Легенда',          price: 2000, type: 'title', desc: 'Легендарный титул', minLevel: null, unlockType: 'purchase', sellPrice: null },
  { id: 'rich',    name: '💎 Богач',            price: 1500, type: 'title', desc: 'Титул Богач', minLevel: null, unlockType: 'purchase', sellPrice: null },
  { id: 'shadow',  name: '🌑 Тень',             price: 1000, type: 'title', desc: 'Таинственный титул', minLevel: null, unlockType: 'purchase', sellPrice: null },
  { id: 'star',    name: '🌟 Звезда чата',      price: 1200, type: 'title', desc: 'Звезда этого чата', minLevel: null, unlockType: 'purchase', sellPrice: null },
  { id: 'ghost',   name: '👻 Призрак',          price: 700,  type: 'title', desc: 'Тихий, но заметный', minLevel: null, unlockType: 'purchase', sellPrice: null },
  { id: 'king',    name: '🤴 Король',           price: 3000, type: 'title', desc: 'Король чата', minLevel: null, unlockType: 'purchase', sellPrice: null },
  { id: 'queen',   name: '👸 Королева',         price: 3000, type: 'title', desc: 'Королева чата', minLevel: null, unlockType: 'purchase', sellPrice: null },
  { id: 'hacker',  name: '💻 Хакер',            price: 900,  type: 'title', desc: 'Технарь и хакер', minLevel: null, unlockType: 'purchase', sellPrice: null },
  { id: 'xpx2',    name: '⚡ XP x2 (1 час)',    price: 300,  type: 'boost', desc: 'Двойной XP на 1 час', minLevel: null, unlockType: 'purchase', sellPrice: null },
  { id: 'bonusx2', name: '🎁 Бонус x2 (1 раз)', price: 200,  type: 'boost', desc: 'Следующий /daily x2', minLevel: null, unlockType: 'purchase', sellPrice: null },
  // Consumable товары
  { id: 'warn_shield',   name: '🛡️ Иммунитет от варна', price: 150, type: 'consumable', desc: 'Блокирует следующий варн', minLevel: null, unlockType: 'purchase', sellPrice: null },
  { id: 'warn_remove',   name: '🧹 Снятие варна',        price: 250, type: 'consumable', desc: 'Снимает 1 варн сразу', minLevel: null, unlockType: 'purchase', sellPrice: null },
  { id: 'streak_freeze', name: '⏳ Заморозка стрика',     price: 100, type: 'consumable', desc: 'Сохраняет стрик при пропуске дня', minLevel: null, unlockType: 'purchase', sellPrice: null },
  { id: 'custom_title',  name: '🎭 Кастомный титул 24ч',  price: 300, type: 'consumable', desc: 'Свой текст в /rank на 24 часа', minLevel: null, unlockType: 'purchase', sellPrice: null },
  { id: 'mute_shield',   name: '🚫 Анти-мут',             price: 400, type: 'consumable', desc: 'Блокирует следующий мут', minLevel: null, unlockType: 'purchase', sellPrice: null },
  { id: 'daily_reroll',  name: '🎲 Реролл /daily',        price: 120, type: 'consumable', desc: 'Повторный /daily сегодня', minLevel: null, unlockType: 'purchase', sellPrice: null },
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
    // Если буст уже активен, продлеваем вместо перезаписи
    const currentUntil = user.xp_boost_until || 0;
    user.xp_boost_until = Math.max(currentUntil, Date.now()) + 3600000;
  }
  if (itemId === 'bonusx2') {
    user.daily_boost_next = 1;
  }
  user.updated_at = now();
  saveDb(data);
}

// ── Использование consumable предметов ───────────────────────
function useConsumable(ctx, itemId) {
  const telegramId = ctx.from.id;
  const item = SHOP_ITEMS.find(i => i.id === itemId);
  
  if (!item || item.type !== 'consumable') {
    return { ok: false, error: 'Это не consumable-предмет' };
  }
  
  const inventory = getInventory(telegramId);
  const invItem = inventory.find(i => (typeof i === 'string' ? i === itemId : i.id === itemId));
  if (!invItem) {
    return { ok: false, error: 'У тебя нет этого предмета. Купи в /shop' };
  }
  
  let result = { ok: true, effect: null };
  
  switch (itemId) {
    case 'warn_shield':
      setShield(telegramId, 'warn', true);
      result.effect = '🛡️ Иммунитет от варна активирован!';
      break;
      
    case 'mute_shield':
      setShield(telegramId, 'mute', true);
      result.effect = '🚫 Анти-мут активирован!';
      break;
      
    case 'warn_remove':
      if (ctx.chat.type === 'private') {
        return { ok: false, error: '❌ Эту команду нужно использовать в групповом чате.' };
      }
      const newCount = removeWarning(telegramId, ctx.chat.id);
      result.effect = `🧹 Варн снят. Текущее количество: ${newCount}`;
      break;
      
    case 'daily_reroll':
      resetDailyCooldown(telegramId);
      result.effect = '🎲 Кулдаун /daily сброшен! Можешь получить бонус снова.';
      break;
      
    case 'streak_freeze':
      const data = loadDb();
      const user = data.users.find(u => String(u.telegram_id) === String(telegramId));
      if (user) {
        user.streakFreezes = (user.streakFreezes || 0) + 1;
        user.updated_at = now();
        saveDb(data);
        result.effect = `⏳ Заморозка стрика добавлена. У тебя: ${user.streakFreezes}`;
      }
      break;
      
    case 'custom_title':
      // Сохраняем состояние ожидания текста
      const customData = loadDb();
      const customUser = customData.users.find(u => String(u.telegram_id) === String(telegramId));
      if (customUser) {
        customUser.awaitingCustomTitle = true;
        customUser.updated_at = now();
        saveDb(customData);
        result.effect = '🎭 Введи текст для титула (максимум 20 символов) в следующем сообщении.';
      }
      break;
      
    default:
      return { ok: false, error: 'Неизвестный consumable-предмет' };
  }
  
  // Удаляем один экземпляр предмета из инвентаря
  removeFromInventory(telegramId, itemId, 1);
  
  return result;
}

// ── Проверка возможности покупки ───────────────────────────────
function canPurchase(item, user) {
  if (item.unlockType === 'achievement') {
    return { ok: false, reason: 'Этот товар можно получить только через достижения' };
  }
  
  if (item.minLevel && user.level < item.minLevel) {
    return { ok: false, reason: `Требуется уровень ${item.minLevel}` };
  }
  
  const inventory = getInventory(user.telegram_id);
  const hasItem = inventory.some(i => (typeof i === 'string' ? i === item.id : i.id === item.id));
  if (item.type === 'title' && hasItem) {
    return { ok: false, reason: 'У тебя уже есть этот титул' };
  }
  
  const coins = getCoins(user.telegram_id);
  if (coins < item.price) {
    return { ok: false, reason: `Недостаточно монет. Нужно: ${item.price}` };
  }
  
  return { ok: true };
}

// ── Продажа предмета ───────────────────────────────────────────
function sellItem(telegramId, itemId) {
  const item = SHOP_ITEMS.find(i => i.id === itemId);
  if (!item) return { ok: false, error: 'Товар не найден' };
  
  if (item.type === 'boost' || item.type === 'consumable') {
    return { ok: false, error: 'Этот тип предметов нельзя продать' };
  }
  
  const inventory = getInventory(telegramId);
  const hasItem = inventory.some(i => (typeof i === 'string' ? i === itemId : i.id === itemId));
  if (!hasItem) {
    return { ok: false, error: 'У тебя нет этого предмета' };
  }
  
  const sellPrice = item.sellPrice || Math.floor(item.price * 0.4);
  
  // Удаляем из инвентаря
  removeFromInventory(telegramId, itemId, 1);
  
  // Если продали активный титул, снимаем его
  const activeTitle = getActiveTitle(telegramId);
  if (activeTitle === itemId) {
    setActiveTitle(telegramId, null);
  }
  
  // Начисляем монеты
  addCoins(telegramId, sellPrice);
  
  return { ok: true, refund: sellPrice };
}

// ── Подарок предмета ───────────────────────────────────────────
function giftItem(fromId, toUsername, itemId) {
  const item = SHOP_ITEMS.find(i => i.id === itemId);
  if (!item) return { ok: false, error: 'Товар не найден' };
  
  const fromInventory = getInventory(fromId);
  const hasItem = fromInventory.some(i => (typeof i === 'string' ? i === itemId : i.id === itemId));
  if (!hasItem) {
    return { ok: false, error: 'У тебя нет этого предмета' };
  }
  
  // Находим получателя по username (упрощённая реализация)
  const data = loadDb();
  const toUser = data.users.find(u => u.username === toUsername.replace('@', ''));
  if (!toUser) {
    return { ok: false, error: 'Пользователь не найден' };
  }
  
  const toInventory = getInventory(toUser.telegram_id);
  const toHasItem = toInventory.some(i => (typeof i === 'string' ? i === itemId : i.id === itemId));
  if (toHasItem) {
    return { ok: false, error: 'У получателя уже есть этот предмет' };
  }
  
  // Списываем у отправителя
  removeFromInventory(fromId, itemId, 1);
  
  // Добавляем получателю
  addToInventory(toUser.telegram_id, itemId);
  
  return { ok: true };
}

// ── Товар дня ─────────────────────────────────────────────────
function getDailyDeal() {
  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  const hash = today.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
  const index = hash % SHOP_ITEMS.length;
  const discountPercent = 30;
  
  return {
    itemId: SHOP_ITEMS[index].id,
    discountPercent
  };
}

// ══════════════════════════════════════════════════════════════
// ПОСТРОЕНИЕ СТРАНИЦ МАГАЗИНА
// ══════════════════════════════════════════════════════════════

const PER_PAGE = 4;

function pageText(page, coins) {
  const start = page * PER_PAGE;
  const items = SHOP_ITEMS.slice(start, start + PER_PAGE);
  const total = Math.ceil(SHOP_ITEMS.length / PER_PAGE);
  const dailyDeal = getDailyDeal();

  const lines = items.map(i => {
    const isDaily = i.id === dailyDeal.itemId;
    const price = isDaily ? Math.floor(i.price * (1 - dailyDeal.discountPercent / 100)) : i.price;
    const priceText = isDaily 
      ? `<s>${i.price}💰</s> <b>${price}💰</b> ⚡` 
      : `<b>${price}💰</b>`;
    return `${i.name} — ${priceText}\n  └ ${i.desc}`;
  }).join('\n\n');

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
      
      // Проверяем возможность покупки через canPurchase
      const data = loadDb();
      const user = data.users.find(u => String(u.telegram_id) === String(ctx.from.id));
      const purchaseCheck = canPurchase(item, user || { telegram_id: ctx.from.id, level: 1 });
      
      if (!purchaseCheck.ok) {
        await ctx.answerCbQuery(purchaseCheck.reason, { show_alert: true });
        return;
      }

      // Закрываем spinner — один раз, без alert
      await ctx.answerCbQuery();

      // Применяем скидку товара дня
      const dailyDeal = getDailyDeal();
      const finalPrice = item.id === dailyDeal.itemId 
        ? Math.floor(item.price * (1 - dailyDeal.discountPercent / 100))
        : item.price;

      // Выполняем транзакцию
      removeCoins(ctx.from.id, finalPrice);
      addToInventory(ctx.from.id, itemId);
      if (item.type === 'boost') applyBoost(ctx.from.id, itemId);

      // Читаем НОВЫЙ баланс из БД после списания
      const newCoins = getCurrentCoins(ctx.from.id);

      let extra = '';
      if (item.type === 'title')     extra = `\n\n💡 Активируй: /usetitle ${itemId}`;
      else if (itemId === 'xpx2')    extra = '\n\n⚡ Буст активирован! XP x2 на 1 час.';
      else if (itemId === 'bonusx2') extra = '\n\n🎁 Буст активирован! Следующий /daily даст x2 монет.';
      else if (item.type === 'consumable') extra = '\n\n💡 Используй: /use ' + itemId;

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

  // ── /use <id> — использовать consumable ───────────────────────
  bot.command(['use', 'использовать'], async (ctx) => {
    try {
      const itemId = ctx.message.text.split(' ').slice(1)[0];
      if (!itemId) return ctx.reply('Укажи ID предмета: /use warn_shield\nСписок: /inventory');
      
      const result = useConsumable(ctx, itemId);
      
      if (!result.ok) {
        return ctx.reply(result.error);
      }
      
      await ctx.reply(`✅ ${result.effect}`, { parse_mode: 'HTML' });
    } catch (err) {
      console.error('[shop use]', err.message);
      await ctx.reply('❌ Ошибка при использовании предмета.');
    }
  });

  // ── /sell <id> — продать предмет ───────────────────────────────
  bot.command(['sell', 'продать'], async (ctx) => {
    try {
      const itemId = ctx.message.text.split(' ').slice(1)[0];
      if (!itemId) return ctx.reply('Укажи ID предмета: /sell vip\nСписок: /inventory');
      
      const result = sellItem(ctx.from.id, itemId);
      
      if (!result.ok) {
        return ctx.reply(result.error);
      }
      
      const newCoins = getCurrentCoins(ctx.from.id);
      await ctx.reply(`✅ Предмет продан за <b>${result.refund} монет</b>.\n💼 Твой баланс: <b>${newCoins} монет</b>`, { parse_mode: 'HTML' });
    } catch (err) {
      console.error('[shop sell]', err.message);
      await ctx.reply('❌ Ошибка при продаже.');
    }
  });

  // ── /gift @username <id> — подарить предмет ───────────────────────
  bot.command(['gift', 'подарить'], async (ctx) => {
    try {
      const args = ctx.message.text.split(' ').slice(1);
      if (args.length < 2) return ctx.reply('Использование: /gift @username item_id\nПример: /gift @user vip');
      
      const toUsername = args[0];
      const itemId = args[1];
      
      const result = giftItem(ctx.from.id, toUsername, itemId);
      
      if (!result.ok) {
        return ctx.reply(result.error);
      }
      
      await ctx.reply(`✅ Предмет подарен пользователю ${toUsername}!`);
    } catch (err) {
      console.error('[shop gift]', err.message);
      await ctx.reply('❌ Ошибка при передаче подарка.');
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

  // Разделяем на категории
  const titles = [];
  const consumables = [];
  const boosts = [];
  
  for (const invItem of inventory) {
    const itemId = typeof invItem === 'string' ? invItem : invItem.id;
    const qty = typeof invItem === 'string' ? 1 : invItem.qty;
    const item = SHOP_ITEMS.find(i => i.id === itemId);
    if (!item) continue;
    
    if (item.type === 'title') {
      titles.push({ item, qty, isTitle: itemId === activeTitle });
    } else if (item.type === 'consumable') {
      consumables.push({ item, qty });
    } else if (item.type === 'boost') {
      boosts.push({ item, qty });
    }
  }
  
  let lines = [];
  
  if (titles.length) {
    lines.push('👑 <b>Титулы:</b>');
    lines.push(...titles.map(t => `• ${t.item.name}${t.isTitle ? ' ✅' : ''}`));
  }
  
  if (consumables.length) {
    lines.push('\n🧪 <b>Consumable:</b>');
    lines.push(...consumables.map(c => `• ${c.item.name} x${c.qty}`));
  }
  
  if (boosts.length) {
    lines.push('\n⚡ <b>Бусты:</b>');
    lines.push(...boosts.map(b => `• ${b.item.name} x${b.qty}`));
  }

  const titleButtons = titles
    .map(t => {
      return [Markup.button.callback(
        `Надеть: ${t.item.name}${t.isTitle ? ' ✅' : ''}`,
        `siu${t.item.id}`
      )];
    });

  titleButtons.push([Markup.button.callback('🏪 В магазин', 'sp0')]);

  return {
    text:     `🎒 <b>Инвентарь ${name}:</b>\n\n${lines.join('\n')}`,
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
  // Новые функции
  canPurchase,
  sellItem,
  giftItem,
  getDailyDeal,
  useConsumable,
};