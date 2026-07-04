// ============================================================
// src/bot/games.js
// Мини-игры: казино/слоты, дуэль, рулетка, угадай число
// + /addcoins — выдача монет разработчиком
// ============================================================

const { Markup } = require('telegraf');
const db = require('../database/db');
const { formatName } = require('../utils');

const OWNER_ID = parseInt(process.env.OWNER_ID || '0', 10);

// ── Кулдауны ─────────────────────────────────────────────────
const casinoCooldown   = new Map();
const rouletteCooldown = new Map();
const CASINO_CD   = 30 * 1000;
const ROULETTE_CD = 30 * 1000;

// Фиксированные результаты рулетки от разработчика
const riggedRoulette = new Map();

// Активные дуэли: Map<chatId, duelData>
const activeDuels = new Map();
// Активные игры "угадай число": Map<key, gameData>
const guessGames  = new Map();

// ── Вспомогательные ──────────────────────────────────────────
function cdLeft(map, key, ms) {
  const last = map.get(key) || 0;
  const left = ms - (Date.now() - last);
  return left > 0 ? Math.ceil(left / 1000) : 0;
}

function getCoins(userId) {
  return db.getCoins(userId);
}

function addCoins(userId, amount) {
  db.upsertUser && db.upsertUser(userId, null, null);
  db.addCoins(userId, amount);
}

function removeCoins(userId, amount) {
  db.addCoins(userId, -amount);
}

// ── 🎰 СЛОТЫ ─────────────────────────────────────────────────
const SLOT_SYMBOLS = ['🍒', '🍋', '🍊', '🍇', '⭐', '💎', '7️⃣'];

const SLOT_PAYOUTS = {
  '💎💎💎': 10,
  '7️⃣7️⃣7️⃣': 8,
  '⭐⭐⭐': 5,
  '🍇🍇🍇': 4,
  '🍊🍊🍊': 3,
  '🍋🍋🍋': 2.5,
  '🍒🍒🍒': 2,
};

function spinSlots() {
  return [0, 1, 2].map(() => SLOT_SYMBOLS[Math.floor(Math.random() * SLOT_SYMBOLS.length)]);
}

function getSlotMultiplier(reels) {
  const key = reels.join('');
  if (SLOT_PAYOUTS[key]) return SLOT_PAYOUTS[key];
  if (reels[0] === reels[1] || reels[1] === reels[2] || reels[0] === reels[2]) return 1;
  return 0;
}

// ── 🎡 РУЛЕТКА ───────────────────────────────────────────────
const ROULETTE_RED = [1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36];

function rouletteResult(userId, chatId) {
  // Проверяем, есть ли фиксированный результат от разработчика
  const key = `${chatId}_${userId}`;
  const rigged = riggedRoulette.get(key);
  
  if (rigged && Date.now() < rigged.expires) {
    riggedRoulette.delete(key); // Удаляем после использования
    
    // Генерируем результат на основе фиксированного значения
    const result = rigged.result.toLowerCase();
    let num;
    
    if (result === 'red') {
      // Случайное красное число
      const redNumbers = [1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36];
      num = redNumbers[Math.floor(Math.random() * redNumbers.length)];
    } else if (result === 'black') {
      // Случайное чёрное число
      const blackNumbers = [2,4,6,8,10,11,13,15,17,20,22,24,26,28,29,31,33,35];
      num = blackNumbers[Math.floor(Math.random() * blackNumbers.length)];
    } else if (result === 'green') {
      num = 0;
    } else if (result === 'even') {
      const evenNumbers = [2,4,6,8,10,12,14,16,18,20,22,24,26,28,30,32,34,36];
      num = evenNumbers[Math.floor(Math.random() * evenNumbers.length)];
    } else if (result === 'odd') {
      const oddNumbers = [1,3,5,7,9,11,13,15,17,19,21,23,25,27,29,31,33,35];
      num = oddNumbers[Math.floor(Math.random() * oddNumbers.length)];
    } else {
      // Конкретное число
      num = parseInt(result);
    }
    
    if (num === 0) return { num, color: 'green', emoji: '🟢' };
    const color = ROULETTE_RED.includes(num) ? 'red' : 'black';
    return { num, color, emoji: color === 'red' ? '🔴' : '⚫' };
  }
  
  // Обычный случайный результат
  const num = Math.floor(Math.random() * 37);
  if (num === 0) return { num, color: 'green', emoji: '🟢' };
  const color = ROULETTE_RED.includes(num) ? 'red' : 'black';
  return { num, color, emoji: color === 'red' ? '🔴' : '⚫' };
}

function rouletteMultiplier(bet, result) {
  if (bet === 'red'   && result.color === 'red')                    return 2;
  if (bet === 'black' && result.color === 'black')                  return 2;
  if (bet === 'green' && result.color === 'green')                  return 14;
  if (bet === 'even'  && result.num > 0 && result.num % 2 === 0)   return 2;
  if (bet === 'odd'   && result.num % 2 === 1)                      return 2;
  if (!isNaN(parseInt(bet)) && parseInt(bet) === result.num)        return 35;
  return 0;
}

// ── Регистрация ───────────────────────────────────────────────
function registerGames(bot) {

  // ── /addcoins — выдача монет для рулетки (лимит 100-20,000) ─────
  bot.command(['addcoins', 'выдатьфонеты'], async (ctx) => {
    try {
      if (ctx.from.id !== OWNER_ID) {
        return ctx.reply('❌ Только разработчик может использовать эту команду.');
      }

      const target = ctx.message.reply_to_message?.from;
      const args   = ctx.message.text.split(' ').slice(1).filter(Boolean);
      const amount = parseInt(args[0], 10);

      if (!target || isNaN(amount) || amount === 0) {
        return ctx.reply(
          '💰 <b>Выдача монет для рулетки</b>\n\n' +
          'Ответь на сообщение пользователя и напиши:\n' +
          '/addcoins 1000 — выдать монеты\n' +
          '/addcoins -500 — снять монеты\n\n' +
          '⚠️ Лимит: 100 - 20,000 монет',
          { parse_mode: 'HTML' }
        );
      }

      // Проверка лимита для положительных сумм
      if (amount > 0 && (amount < 100 || amount > 20000)) {
        return ctx.reply('❌ Лимит выдачи: от 100 до 20,000 монет за раз.');
      }

      db.upsertUser(target.id, target.username, target.first_name);
      db.addCoins(target.id, amount);
      const newBalance = db.getCoins(target.id);

      const action = amount > 0 ? `+${amount} выдано` : `${amount} снято`;
      await ctx.reply(
        `✅ <b>${formatName(target)}</b>\n` +
        `💰 ${action}\n` +
        `💼 Новый баланс: <b>${newBalance} монет</b>`,
        { parse_mode: 'HTML' }
      );
    } catch (err) {
      console.error('[addcoins]', err.message);
      await ctx.reply('❌ Ошибка при выдаче монет.');
    }
  });

  // ── /rigroulette — манипуляция рулеткой от разработчика ───────
  bot.command(['rigroulette', 'фиксрулетка'], async (ctx) => {
    try {
      if (ctx.from.id !== OWNER_ID) {
        return ctx.reply('❌ Только разработчик может использовать эту команду.');
      }

      const args = ctx.message.text.split(' ').slice(1).filter(Boolean);
      const result = args[0] ? args[0].toLowerCase() : null;

      if (!result) {
        return ctx.reply(
          '🎡 <b>Манипуляция рулеткой</b>\n\n' +
          'Использование: /rigroulette [результат]\n\n' +
          '<b>Возможные результаты:</b>\n🔴 red — красное\n⚫ black — чёрное\n🟢 green — зеро\n' +
          'even — чётное\nodd — нечётное\n0–36 — конкретное число\n\n' +
          'Пример: /rigroulette red\n' +
          'Следующий спин рулетки даст этот результат.',
          { parse_mode: 'HTML' }
        );
      }

      const validPicks = ['red', 'black', 'green', 'even', 'odd'];
      const isNumber   = !isNaN(parseInt(result)) && parseInt(result) >= 0 && parseInt(result) <= 36;
      if (!validPicks.includes(result) && !isNumber) {
        return ctx.reply('❌ Неверный результат. Используй: red, black, green, even, odd или число 0–36');
      }

      // Сохраняем фиксированный результат для следующего спина
      const userId = ctx.from.id;
      const chatId = ctx.chat.type === 'private' ? userId : ctx.chat.id;
      const key = `${chatId}_${userId}`;
      
      riggedRoulette.set(key, { result, expires: Date.now() + 300000 }); // 5 минут

      await ctx.reply(
        `🎡 <b>Фиксирован результат:</b> <b>${result}</b>\n\n` +
        `Следующий спин рулетки даст этот результат.\n` +
        `⏰ Действует 5 минут.`,
        { parse_mode: 'HTML' }
      );
    } catch (err) {
      console.error('[rigroulette]', err.message);
      await ctx.reply('❌ Ошибка при манипуляции рулеткой.');
    }
  });

  // ── /casino [ставка] ─────────────────────────────────────────
  bot.command(['casino', 'слоты', 'slots'], async (ctx) => {
    try {
      const userId = ctx.from.id;
      const chatId = ctx.chat.type === 'private' ? userId : ctx.chat.id;
      db.upsertUser(userId, ctx.from.username, ctx.from.first_name);

      const cd = cdLeft(casinoCooldown, `${chatId}_${userId}`, CASINO_CD);
      if (cd > 0) return ctx.reply(`⏳ Подожди ещё <b>${cd} сек.</b>`, { parse_mode: 'HTML' });

      const args = ctx.message.text.split(' ').slice(1);
      const bet  = parseInt(args[0]);
      const coins = getCoins(userId);

      if (!bet || bet <= 0) {
        return ctx.reply(
          '🎰 <b>Казино — Слоты</b>\n\nУкажи ставку: /casino 50\n\nМинимум: 10 монет\n\n' +
          '<b>Выплаты:</b>\n💎💎💎 — x10\n7️⃣7️⃣7️⃣ — x8\n⭐⭐⭐ — x5\n🍇🍇🍇 — x4\n🍊🍊🍊 — x3\n🍋🍋🍋 — x2.5\n🍒🍒🍒 — x2\nДва одинаковых — x1',
          { parse_mode: 'HTML' }
        );
      }
      if (bet < 10) return ctx.reply('🎰 Минимальная ставка — <b>10 монет</b>.', { parse_mode: 'HTML' });
      if (coins < bet) return ctx.reply(`❌ Недостаточно монет. У тебя: <b>${coins}</b>`, { parse_mode: 'HTML' });

      casinoCooldown.set(`${chatId}_${userId}`, Date.now());
      removeCoins(userId, bet);

      const reels      = spinSlots();
      const multiplier = getSlotMultiplier(reels);
      const win        = Math.floor(bet * multiplier);
      if (win > 0) addCoins(userId, win);

      const newCoins = getCoins(userId);
      const diff     = win - bet;
      const diffStr  = diff >= 0 ? `+${diff}` : `${diff}`;
      const result   = multiplier === 0 ? '😔 Не повезло! Ставка сгорела.'
        : multiplier === 1 ? '😐 Ставка вернулась.' : `🎉 Выигрыш x${multiplier}!`;

      await ctx.reply(
        `🎰 <b>${formatName(ctx.from)}</b> крутит слоты...\n\n` +
        `┌─────────────┐\n│  ${reels.join('  ')}  │\n└─────────────┘\n\n` +
        `${result}\n` +
        `💰 Ставка: <b>${bet}</b> → Выигрыш: <b>${win}</b> (<b>${diffStr}</b>)\n` +
        `💼 Баланс: <b>${newCoins}</b>`,
        {
          parse_mode: 'HTML',
          ...Markup.inlineKeyboard([[Markup.button.callback(`🔄 Ещё раз (${bet} монет)`, `ca_${chatId}_${bet}`)]]),
        }
      );
    } catch (err) {
      console.error('[casino]', err.message);
      await ctx.reply('❌ Ошибка в казино.');
    }
  });

  // Кнопка "Ещё раз"
  bot.action(/^ca_(-?\d+)_(\d+)$/, async (ctx) => {
    try {
      await ctx.answerCbQuery();
      const chatId = parseInt(ctx.match[1]);
      const bet    = parseInt(ctx.match[2]);
      const userId = ctx.from.id;

      const cd = cdLeft(casinoCooldown, `${chatId}_${userId}`, CASINO_CD);
      if (cd > 0) return ctx.answerCbQuery(`⏳ Подожди ${cd} сек.`, { show_alert: true });

      const coins = getCoins(userId);
      if (coins < bet) return ctx.answerCbQuery(`❌ Недостаточно монет (${coins})`, { show_alert: true });

      casinoCooldown.set(`${chatId}_${userId}`, Date.now());
      removeCoins(userId, bet);

      const reels      = spinSlots();
      const multiplier = getSlotMultiplier(reels);
      const win        = Math.floor(bet * multiplier);
      if (win > 0) addCoins(userId, win);

      const newCoins = getCoins(userId);
      const diff     = win - bet;
      const diffStr  = diff >= 0 ? `+${diff}` : `${diff}`;
      const result   = multiplier === 0 ? '😔 Не повезло!' : multiplier === 1 ? '😐 Ставка вернулась.' : `🎉 Выигрыш x${multiplier}!`;

      await ctx.editMessageText(
        `🎰 <b>${formatName(ctx.from)}</b> крутит слоты...\n\n` +
        `┌─────────────┐\n│  ${reels.join('  ')}  │\n└─────────────┘\n\n` +
        `${result}\n` +
        `💰 Ставка: <b>${bet}</b> → Выигрыш: <b>${win}</b> (<b>${diffStr}</b>)\n` +
        `💼 Баланс: <b>${newCoins}</b>`,
        { parse_mode: 'HTML', ...Markup.inlineKeyboard([[Markup.button.callback(`🔄 Ещё раз (${bet} монет)`, `ca_${chatId}_${bet}`)]]) }
      );
    } catch (err) {
      console.error('[casino_again]', err.message);
      try { await ctx.answerCbQuery('Ошибка.', { show_alert: true }); } catch {}
    }
  });

  // ── /roulette [ставка] [выбор] ────────────────────────────────
  bot.command(['roulette', 'рулетка'], async (ctx) => {
    try {
      const userId = ctx.from.id;
      const chatId = ctx.chat.type === 'private' ? userId : ctx.chat.id;
      db.upsertUser(userId, ctx.from.username, ctx.from.first_name);

      const args = ctx.message.text.split(' ').slice(1);
      const bet  = parseInt(args[0]);
      const pick = (args[1] || '').toLowerCase();

      if (!bet || bet <= 0 || !pick) {
        return ctx.reply(
          '🎡 <b>Рулетка</b>\n\nИспользование: /roulette [ставка] [выбор]\n\n' +
          '<b>Варианты:</b>\n🔴 red — красное (x2)\n⚫ black — чёрное (x2)\n🟢 green — зеро (x14)\n' +
          'even — чётное (x2)\nodd — нечётное (x2)\n0–36 — число (x35)\n\n' +
          'Пример: /roulette 100 red',
          { parse_mode: 'HTML' }
        );
      }

      const cd = cdLeft(rouletteCooldown, `${chatId}_${userId}`, ROULETTE_CD);
      if (cd > 0) return ctx.reply(`⏳ Подожди ещё <b>${cd} сек.</b>`, { parse_mode: 'HTML' });

      const validPicks = ['red', 'black', 'green', 'even', 'odd'];
      const isNumber   = !isNaN(parseInt(pick)) && parseInt(pick) >= 0 && parseInt(pick) <= 36;
      if (!validPicks.includes(pick) && !isNumber) {
        return ctx.reply('❌ Неверный выбор. Используй: red, black, green, even, odd или число 0–36');
      }
      if (bet < 10) return ctx.reply('🎡 Минимальная ставка — <b>10 монет</b>.', { parse_mode: 'HTML' });

      const coins = getCoins(userId);
      if (coins < bet) return ctx.reply(`❌ Недостаточно монет. У тебя: <b>${coins}</b>`, { parse_mode: 'HTML' });

      rouletteCooldown.set(`${chatId}_${userId}`, Date.now());
      removeCoins(userId, bet);

      const result     = rouletteResult(userId, chatId);
      const multiplier = rouletteMultiplier(pick, result);
      const win        = Math.floor(bet * multiplier);
      if (win > 0) addCoins(userId, win);

      const newCoins = getCoins(userId);
      const diff     = win - bet;
      const diffStr  = diff >= 0 ? `+${diff}` : `${diff}`;
      const outcome  = multiplier > 0 ? `🎉 Выигрыш x${multiplier}!` : '😔 Не угадал!';

      await ctx.reply(
        `🎡 <b>Рулетка</b>\n\n` +
        `Шарик упал на: ${result.emoji} <b>${result.num}</b>\n\n` +
        `Твоя ставка: <b>${pick}</b>\n` +
        `${outcome}\n` +
        `💰 Ставка: <b>${bet}</b> → Выигрыш: <b>${win}</b> (<b>${diffStr}</b>)\n` +
        `💼 Баланс: <b>${newCoins}</b>`,
        { parse_mode: 'HTML' }
      );
    } catch (err) {
      console.error('[roulette]', err.message);
      await ctx.reply('❌ Ошибка в рулетке.');
    }
  });

  // ── /duel [сумма] — ответом на сообщение ─────────────────────
  bot.command(['duel', 'дуэль'], async (ctx) => {
    if (ctx.chat.type === 'private') return ctx.reply('⚔️ Дуэль работает только в группах!');
    try {
      const chatId     = ctx.chat.id;
      const challenger = ctx.from;
      db.upsertUser(challenger.id, challenger.username, challenger.first_name);

      const target = ctx.message.reply_to_message?.from;
      if (!target || target.is_bot) {
        return ctx.reply('⚔️ Ответь на сообщение соперника командой /duel [сумма]\nПример: /duel 100');
      }
      if (target.id === challenger.id) return ctx.reply('😅 Нельзя вызвать самого себя.');

      const args = ctx.message.text.split(' ').slice(1);
      const bet  = parseInt(args[0]);
      if (!bet || bet < 10) return ctx.reply('⚔️ Укажи ставку (минимум 10 монет): /duel 100');

      const cCoins = getCoins(challenger.id);
      if (cCoins < bet) return ctx.reply(`❌ Недостаточно монет. У тебя: <b>${cCoins}</b>`, { parse_mode: 'HTML' });

      db.upsertUser(target.id, target.username, target.first_name);
      const tCoins = getCoins(target.id);
      if (tCoins < bet) {
        return ctx.reply(`❌ У <b>${formatName(target)}</b> недостаточно монет для дуэли.`, { parse_mode: 'HTML' });
      }

      activeDuels.set(chatId, {
        challenger: { id: challenger.id, username: challenger.username, first_name: challenger.first_name },
        target:     { id: target.id,     username: target.username,     first_name: target.first_name },
        bet,
        expires: Date.now() + 60000,
      });

      const msg = await ctx.reply(
        `⚔️ <b>${formatName(challenger)}</b> вызывает <b>${formatName(target)}</b> на дуэль!\n\n` +
        `💰 Ставка: <b>${bet} монет</b>\n\n` +
        `<b>${formatName(target)}</b>, принимаешь вызов? (60 сек)`,
        {
          parse_mode: 'HTML',
          ...Markup.inlineKeyboard([[
            Markup.button.callback('⚔️ Принять', 'duel_accept'),
            Markup.button.callback('❌ Отказать', 'duel_decline'),
          ]]),
        }
      );

      setTimeout(async () => {
        const duel = activeDuels.get(chatId);
        if (duel && Date.now() >= duel.expires) {
          activeDuels.delete(chatId);
          try {
            await ctx.telegram.editMessageText(chatId, msg.message_id, null,
              `⚔️ Дуэль отменена — <b>${formatName(target)}</b> не ответил вовремя.`,
              { parse_mode: 'HTML' }
            );
          } catch {}
        }
      }, 61000);
    } catch (err) {
      console.error('[duel]', err.message);
      await ctx.reply('❌ Ошибка при создании дуэли.');
    }
  });

  bot.action('duel_accept', async (ctx) => {
    try {
      await ctx.answerCbQuery();
      const chatId = ctx.chat.id;
      const duel   = activeDuels.get(chatId);

      if (!duel) return ctx.answerCbQuery('Дуэль уже завершена.', { show_alert: true });
      if (ctx.from.id !== duel.target.id) return ctx.answerCbQuery('Это не твоя дуэль!', { show_alert: true });

      activeDuels.delete(chatId);

      const cCoins = getCoins(duel.challenger.id);
      const tCoins = getCoins(duel.target.id);
      if (cCoins < duel.bet || tCoins < duel.bet) {
        return ctx.editMessageText('❌ У одного из участников не хватает монет. Дуэль отменена.');
      }

      removeCoins(duel.challenger.id, duel.bet);
      removeCoins(duel.target.id, duel.bet);

      const winner = Math.random() < 0.5 ? duel.challenger : duel.target;
      const loser  = winner.id === duel.challenger.id ? duel.target : duel.challenger;
      addCoins(winner.id, duel.bet * 2);

      const PHRASES = [
        'Молниеносный удар решил всё!', 'Точный выстрел — победа!',
        'Хитрость и ловкость взяли верх!', 'Удача улыбнулась сильнейшему!',
        'Один удар — и всё кончено!',
      ];
      await ctx.editMessageText(
        `⚔️ <b>Дуэль завершена!</b>\n\n` +
        `${PHRASES[Math.floor(Math.random() * PHRASES.length)]}\n\n` +
        `🏆 Победитель: <b>${formatName(winner)}</b>\n` +
        `💀 Проигравший: <b>${formatName(loser)}</b>\n\n` +
        `💰 Приз: <b>${duel.bet * 2} монет</b>`,
        { parse_mode: 'HTML' }
      );
    } catch (err) {
      console.error('[duel_accept]', err.message);
      try { await ctx.answerCbQuery('Ошибка.', { show_alert: true }); } catch {}
    }
  });

  bot.action('duel_decline', async (ctx) => {
    try {
      await ctx.answerCbQuery();
      const chatId = ctx.chat.id;
      const duel   = activeDuels.get(chatId);
      if (!duel) return ctx.answerCbQuery('Дуэль уже завершена.', { show_alert: true });
      if (ctx.from.id !== duel.target.id && ctx.from.id !== duel.challenger.id) {
        return ctx.answerCbQuery('Это не твоя дуэль!', { show_alert: true });
      }
      activeDuels.delete(chatId);
      await ctx.editMessageText(`❌ <b>${formatName(duel.target)}</b> отказался от дуэли.`, { parse_mode: 'HTML' });
    } catch (err) { console.error('[duel_decline]', err.message); }
  });

  // ── /guess — угадай число ─────────────────────────────────────
  bot.command(['guess', 'угадай'], async (ctx) => {
    try {
      const userId = ctx.from.id;
      const chatId = ctx.chat.type === 'private' ? userId : ctx.chat.id;
      const key    = `${chatId}_${userId}`;
      const args   = ctx.message.text.split(' ').slice(1);
      const num    = parseInt(args[0]);

      if (!args[0] || isNaN(num)) {
        const secret = Math.floor(Math.random() * 100) + 1;
        guessGames.set(key, { number: secret, attempts: 5, chatId });
        return ctx.reply(
          `🔢 <b>Угадай число!</b>\n\nЯ загадал число от <b>1 до 100</b>.\nУ тебя <b>5 попыток</b>.\n\nНапиши: /guess [число]`,
          { parse_mode: 'HTML' }
        );
      }

      const game = guessGames.get(key);
      if (!game) return ctx.reply('🔢 Сначала начни игру: /guess (без числа)');
      if (num < 1 || num > 100) return ctx.reply('❌ Число должно быть от 1 до 100.');

      game.attempts--;

      if (num === game.number) {
        guessGames.delete(key);
        const reward = (game.attempts + 1) * 10;
        db.upsertUser(userId, ctx.from.username, ctx.from.first_name);
        addCoins(userId, reward);
        return ctx.reply(
          `🎉 <b>Правильно!</b> Загаданное число: <b>${game.number}</b>\n\n` +
          `🏆 Угадал с ${6 - game.attempts}-й попытки!\n💰 Награда: <b>+${reward} монет</b>`,
          { parse_mode: 'HTML' }
        );
      }

      if (game.attempts <= 0) {
        guessGames.delete(key);
        return ctx.reply(`😔 Попытки закончились!\nЗагаданное число было: <b>${game.number}</b>\n\nНачни заново: /guess`, { parse_mode: 'HTML' });
      }

      const hint = num < game.number ? '📈 Больше!' : '📉 Меньше!';
      await ctx.reply(`${hint}\n\nОсталось попыток: <b>${game.attempts}</b>`, { parse_mode: 'HTML' });
    } catch (err) {
      console.error('[guess]', err.message);
      await ctx.reply('❌ Ошибка в игре.');
    }
  });

  console.log('✅ Модуль games подключён');
}

module.exports = { registerGames };
