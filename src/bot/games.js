// ============================================================
// src/bot/games.js
// Мини-игры: казино/слоты, дуэль, рулетка, угадай число
// ============================================================

const { Markup } = require('telegraf');
const db = require('../db');
const { formatName } = require('../utils');

// ── Кулдауны ─────────────────────────────────────────────────
const casinoCooldown   = new Map();
const rouletteCooldown = new Map();
const CASINO_CD   = 30 * 1000;
const ROULETTE_CD = 30 * 1000;

// Активные дуэли: Map<chatId, duelData>
const activeDuels = new Map();
// Активные игры "угадай число": Map<key, gameData>
const guessGames  = new Map();

// ── Вспомогательные ──────────────────────────────────────────
function getUser(userId, chatId) {
  return db.prepare('SELECT * FROM users WHERE id = ? AND chat_id = ?').get(userId, chatId);
}

function upsertUser(user, chatId) {
  db.prepare(`
    INSERT INTO users (id, username, first_name, chat_id)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      username = excluded.username,
      first_name = excluded.first_name
  `).run(user.id, user.username || null, user.first_name || null, chatId);
}

function addCoins(userId, chatId, amount) {
  db.prepare('UPDATE users SET coins = coins + ? WHERE id = ? AND chat_id = ?')
    .run(amount, userId, chatId);
}

function removeCoins(userId, chatId, amount) {
  db.prepare('UPDATE users SET coins = MAX(0, coins - ?) WHERE id = ? AND chat_id = ?')
    .run(amount, userId, chatId);
}

function cdLeft(map, key, ms) {
  const last = map.get(key) || 0;
  const left = ms - (Date.now() - last);
  return left > 0 ? Math.ceil(left / 1000) : 0;
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

function buildCasinoText(user, reels, bet, win, multiplier) {
  const diff    = win - bet;
  const diffStr = diff >= 0 ? `+${diff}` : `${diff}`;
  const result  = multiplier === 0
    ? '😔 Не повезло! Ставка сгорела.'
    : multiplier === 1
      ? '😐 Ставка вернулась.'
      : `🎉 Выигрыш x${multiplier}!`;

  return (
    `🎰 <b>${formatName(user)}</b> крутит слоты...\n\n` +
    `┌─────────────┐\n` +
    `│  ${reels.join('  ')}  │\n` +
    `└─────────────┘\n\n` +
    `${result}\n` +
    `💰 Ставка: <b>${bet}</b> → Выигрыш: <b>${win}</b> (<b>${diffStr}</b>)\n` +
    `💼 Баланс: <b>${getUser(user.id, user._chatId)?.coins ?? 0}</b>`
  );
}

// ── 🎡 РУЛЕТКА ───────────────────────────────────────────────
const ROULETTE_RED = [1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36];

function rouletteResult() {
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

  // ── /casino [ставка] ─────────────────────────────────────────
  bot.command(['casino', 'слоты', 'slots'], async (ctx) => {
    try {
      const userId = ctx.from.id;
      const chatId = ctx.chat.type === 'private' ? userId : ctx.chat.id;
      upsertUser(ctx.from, chatId);

      const cd = cdLeft(casinoCooldown, `${chatId}_${userId}`, CASINO_CD);
      if (cd > 0) {
        return ctx.reply(`⏳ Подожди ещё <b>${cd} сек.</b> перед следующей игрой.`, { parse_mode: 'HTML' });
      }

      const args = ctx.message.text.split(' ').slice(1);
      const bet  = parseInt(args[0]);
      const user = getUser(userId, chatId);

      if (!bet || bet <= 0) {
        return ctx.reply(
          '🎰 <b>Казино — Слоты</b>\n\nУкажи ставку: /casino 50\n\nМинимум: 10 монет\n\n' +
          '<b>Выплаты:</b>\n💎💎💎 — x10\n7️⃣7️⃣7️⃣ — x8\n⭐⭐⭐ — x5\n🍇🍇🍇 — x4\n🍊🍊🍊 — x3\n🍋🍋🍋 — x2.5\n🍒🍒🍒 — x2\nДва одинаковых — x1',
          { parse_mode: 'HTML' }
        );
      }
      if (bet < 10) return ctx.reply('🎰 Минимальная ставка — <b>10 монет</b>.', { parse_mode: 'HTML' });
      if (!user || user.coins < bet) {
        return ctx.reply(`❌ Недостаточно монет. У тебя: <b>${user?.coins || 0}</b>`, { parse_mode: 'HTML' });
      }

      casinoCooldown.set(`${chatId}_${userId}`, Date.now());
      removeCoins(userId, chatId, bet);

      const reels      = spinSlots();
      const multiplier = getSlotMultiplier(reels);
      const win        = Math.floor(bet * multiplier);
      if (win > 0) addCoins(userId, chatId, win);

      const updated = getUser(userId, chatId);
      const diff    = win - bet;
      const diffStr = diff >= 0 ? `+${diff}` : `${diff}`;
      const result  = multiplier === 0
        ? '😔 Не повезло! Ставка сгорела.'
        : multiplier === 1 ? '😐 Ставка вернулась.' : `🎉 Выигрыш x${multiplier}!`;

      await ctx.reply(
        `🎰 <b>${formatName(ctx.from)}</b> крутит слоты...\n\n` +
        `┌─────────────┐\n│  ${reels.join('  ')}  │\n└─────────────┘\n\n` +
        `${result}\n` +
        `💰 Ставка: <b>${bet}</b> → Выигрыш: <b>${win}</b> (<b>${diffStr}</b>)\n` +
        `💼 Баланс: <b>${updated?.coins || 0}</b>`,
        {
          parse_mode: 'HTML',
          ...Markup.inlineKeyboard([
            [Markup.button.callback(`🔄 Ещё раз (${bet} монет)`, `ca_${chatId}_${bet}`)],
          ]),
        }
      );
    } catch (err) {
      console.error('[casino]', err.message);
      await ctx.reply('❌ Ошибка в казино. Попробуй ещё раз.');
    }
  });

  // Кнопка "Ещё раз" — chatId и bet закодированы в callback_data
  bot.action(/^ca_(-?\d+)_(\d+)$/, async (ctx) => {
    try {
      await ctx.answerCbQuery();
      const chatId = parseInt(ctx.match[1]);
      const bet    = parseInt(ctx.match[2]);
      const userId = ctx.from.id;
      upsertUser(ctx.from, chatId);

      const cd = cdLeft(casinoCooldown, `${chatId}_${userId}`, CASINO_CD);
      if (cd > 0) return ctx.answerCbQuery(`⏳ Подожди ${cd} сек.`, { show_alert: true });

      const user = getUser(userId, chatId);
      if (!user || user.coins < bet) {
        return ctx.answerCbQuery(`❌ Недостаточно монет (${user?.coins || 0})`, { show_alert: true });
      }

      casinoCooldown.set(`${chatId}_${userId}`, Date.now());
      removeCoins(userId, chatId, bet);

      const reels      = spinSlots();
      const multiplier = getSlotMultiplier(reels);
      const win        = Math.floor(bet * multiplier);
      if (win > 0) addCoins(userId, chatId, win);

      const updated = getUser(userId, chatId);
      const diff    = win - bet;
      const diffStr = diff >= 0 ? `+${diff}` : `${diff}`;
      const result  = multiplier === 0 ? '😔 Не повезло!' : multiplier === 1 ? '😐 Ставка вернулась.' : `🎉 Выигрыш x${multiplier}!`;

      await ctx.editMessageText(
        `🎰 <b>${formatName(ctx.from)}</b> крутит слоты...\n\n` +
        `┌─────────────┐\n│  ${reels.join('  ')}  │\n└─────────────┘\n\n` +
        `${result}\n` +
        `💰 Ставка: <b>${bet}</b> → Выигрыш: <b>${win}</b> (<b>${diffStr}</b>)\n` +
        `💼 Баланс: <b>${updated?.coins || 0}</b>`,
        {
          parse_mode: 'HTML',
          ...Markup.inlineKeyboard([[Markup.button.callback(`🔄 Ещё раз (${bet} монет)`, `ca_${chatId}_${bet}`)]]),
        }
      );
    } catch (err) {
      console.error('[casino_again]', err.message);
      await ctx.answerCbQuery('Ошибка. Попробуй ещё раз.', { show_alert: true });
    }
  });

  // ── /roulette [ставка] [выбор] ────────────────────────────────
  bot.command(['roulette', 'рулетка'], async (ctx) => {
    try {
      const userId = ctx.from.id;
      const chatId = ctx.chat.type === 'private' ? userId : ctx.chat.id;
      upsertUser(ctx.from, chatId);

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

      const user = getUser(userId, chatId);
      if (!user || user.coins < bet) {
        return ctx.reply(`❌ Недостаточно монет. У тебя: <b>${user?.coins || 0}</b>`, { parse_mode: 'HTML' });
      }

      rouletteCooldown.set(`${chatId}_${userId}`, Date.now());
      removeCoins(userId, chatId, bet);

      const result     = rouletteResult();
      const multiplier = rouletteMultiplier(pick, result);
      const win        = Math.floor(bet * multiplier);
      if (win > 0) addCoins(userId, chatId, win);

      const updated = getUser(userId, chatId);
      const diff    = win - bet;
      const diffStr = diff >= 0 ? `+${diff}` : `${diff}`;
      const outcome = multiplier > 0 ? `🎉 Выигрыш x${multiplier}!` : '😔 Не угадал!';

      await ctx.reply(
        `🎡 <b>Рулетка</b>\n\n` +
        `Шарик упал на: ${result.emoji} <b>${result.num}</b>\n\n` +
        `Твоя ставка: <b>${pick}</b>\n` +
        `${outcome}\n` +
        `💰 Ставка: <b>${bet}</b> → Выигрыш: <b>${win}</b> (<b>${diffStr}</b>)\n` +
        `💼 Баланс: <b>${updated?.coins || 0}</b>`,
        { parse_mode: 'HTML' }
      );
    } catch (err) {
      console.error('[roulette]', err.message);
      await ctx.reply('❌ Ошибка в рулетке. Попробуй ещё раз.');
    }
  });

  // ── /duel [сумма] — ответом на сообщение ─────────────────────
  bot.command(['duel', 'дуэль'], async (ctx) => {
    if (ctx.chat.type === 'private') {
      return ctx.reply('⚔️ Дуэль работает только в группах — нужен соперник!');
    }

    try {
      const chatId     = ctx.chat.id;
      const challenger = ctx.from;
      upsertUser(challenger, chatId);

      const target = ctx.message.reply_to_message?.from;
      if (!target || target.is_bot) {
        return ctx.reply(
          '⚔️ Ответь на сообщение соперника командой /duel [сумма]\n\n' +
          'Пример: ответь на сообщение и напиши /duel 100'
        );
      }

      if (target.id === challenger.id) return ctx.reply('😅 Нельзя вызвать самого себя.');

      const args = ctx.message.text.split(' ').slice(1);
      const bet  = parseInt(args[0]);
      if (!bet || bet < 10) {
        return ctx.reply('⚔️ Укажи ставку (минимум 10 монет): /duel 100');
      }

      const cUser = getUser(challenger.id, chatId);
      if (!cUser || cUser.coins < bet) {
        return ctx.reply(`❌ Недостаточно монет. У тебя: <b>${cUser?.coins || 0}</b>`, { parse_mode: 'HTML' });
      }

      upsertUser(target, chatId);
      const tUser = getUser(target.id, chatId);
      if (!tUser || tUser.coins < bet) {
        return ctx.reply(
          `❌ У <b>${formatName(target)}</b> недостаточно монет для дуэли.`,
          { parse_mode: 'HTML' }
        );
      }

      // Сохраняем дуэль
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
          ...Markup.inlineKeyboard([
            [
              Markup.button.callback('⚔️ Принять', 'duel_accept'),
              Markup.button.callback('❌ Отказать', 'duel_decline'),
            ],
          ]),
        }
      );

      // Автоотмена через 61 сек
      setTimeout(async () => {
        const duel = activeDuels.get(chatId);
        if (duel && Date.now() >= duel.expires) {
          activeDuels.delete(chatId);
          try {
            await ctx.telegram.editMessageText(
              chatId, msg.message_id, null,
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
      if (ctx.from.id !== duel.target.id) {
        return ctx.answerCbQuery('Это не твоя дуэль!', { show_alert: true });
      }

      activeDuels.delete(chatId);

      const cUser = getUser(duel.challenger.id, chatId);
      const tUser = getUser(duel.target.id, chatId);

      if (!cUser || cUser.coins < duel.bet || !tUser || tUser.coins < duel.bet) {
        return ctx.editMessageText('❌ У одного из участников не хватает монет. Дуэль отменена.');
      }

      removeCoins(duel.challenger.id, chatId, duel.bet);
      removeCoins(duel.target.id,     chatId, duel.bet);

      const winner = Math.random() < 0.5 ? duel.challenger : duel.target;
      const loser  = winner.id === duel.challenger.id ? duel.target : duel.challenger;
      const prize  = duel.bet * 2;
      addCoins(winner.id, chatId, prize);

      const PHRASES = [
        'Молниеносный удар решил всё!',
        'Точный выстрел — победа!',
        'Хитрость и ловкость взяли верх!',
        'Удача улыбнулась сильнейшему!',
        'Один удар — и всё кончено!',
      ];

      await ctx.editMessageText(
        `⚔️ <b>Дуэль завершена!</b>\n\n` +
        `${PHRASES[Math.floor(Math.random() * PHRASES.length)]}\n\n` +
        `🏆 Победитель: <b>${formatName(winner)}</b>\n` +
        `💀 Проигравший: <b>${formatName(loser)}</b>\n\n` +
        `💰 Приз: <b>${prize} монет</b>`,
        { parse_mode: 'HTML' }
      );
    } catch (err) {
      console.error('[duel_accept]', err.message);
      await ctx.answerCbQuery('Ошибка.', { show_alert: true });
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
      await ctx.editMessageText(
        `❌ <b>${formatName(duel.target)}</b> отказался от дуэли.`,
        { parse_mode: 'HTML' }
      );
    } catch (err) {
      console.error('[duel_decline]', err.message);
    }
  });

  // ── /guess — угадай число ─────────────────────────────────────
  bot.command(['guess', 'угадай'], async (ctx) => {
    try {
      const userId = ctx.from.id;
      const chatId = ctx.chat.type === 'private' ? userId : ctx.chat.id;
      const key    = `${chatId}_${userId}`;

      const args = ctx.message.text.split(' ').slice(1);
      const num  = parseInt(args[0]);

      // Начать новую игру (без числа)
      if (!args[0] || isNaN(num)) {
        const secret = Math.floor(Math.random() * 100) + 1;
        guessGames.set(key, { number: secret, attempts: 5, chatId });
        return ctx.reply(
          `🔢 <b>Угадай число!</b>\n\n` +
          `Я загадал число от <b>1 до 100</b>.\n` +
          `У тебя <b>5 попыток</b>.\n\n` +
          `Напиши: /guess [число]\nПример: /guess 42`,
          { parse_mode: 'HTML' }
        );
      }

      const game = guessGames.get(key);
      if (!game) {
        return ctx.reply('🔢 Сначала начни игру: /guess (без числа)');
      }

      if (num < 1 || num > 100) {
        return ctx.reply('❌ Число должно быть от 1 до 100.');
      }

      game.attempts--;

      if (num === game.number) {
        guessGames.delete(key);
        const reward = (game.attempts + 1) * 10;
        upsertUser(ctx.from, chatId);
        addCoins(userId, chatId, reward);
        return ctx.reply(
          `🎉 <b>Правильно!</b> Загаданное число: <b>${game.number}</b>\n\n` +
          `🏆 Угадал с ${6 - game.attempts}-й попытки!\n` +
          `💰 Награда: <b>+${reward} монет</b>`,
          { parse_mode: 'HTML' }
        );
      }

      if (game.attempts <= 0) {
        guessGames.delete(key);
        return ctx.reply(
          `😔 Попытки закончились!\nЗагаданное число было: <b>${game.number}</b>\n\nНачни заново: /guess`,
          { parse_mode: 'HTML' }
        );
      }

      const hint = num < game.number ? '📈 Больше!' : '📉 Меньше!';
      await ctx.reply(
        `${hint}\n\nОсталось попыток: <b>${game.attempts}</b>`,
        { parse_mode: 'HTML' }
      );
    } catch (err) {
      console.error('[guess]', err.message);
      await ctx.reply('❌ Ошибка в игре. Попробуй ещё раз.');
    }
  });

  console.log('✅ Модуль games подключён');
}

module.exports = { registerGames };
