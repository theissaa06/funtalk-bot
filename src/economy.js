// ============================================================
// src/economy.js
// FunMoney, ежедневный бонус, перевод FunMoney.
// ============================================================

const {
  upsertUser,
  getCoins,
  addCoins,
  removeCoins,
  hasInventoryItem,
  loadDb,
  saveDb,
  now
} = require('./database/db');

const OWNER_ID = parseInt(process.env.OWNER_ID || '0', 10);

function formatCurrency(amount) {
  return `${amount} FunMoney`;
}

const DAILY_MIN    = 50;
const DAILY_MAX    = 200;
const DAILY_HOURS  = 24;

// Вспомогательные функции
function formatName(user) {
  return user.first_name ? `*${user.first_name}*` : `[${user.id}]`;
}

// Хранит время последнего /daily: Map<userId, timestamp>
const dailyCooldown = new Map();

function register(bot) {

  // ── /daily — ежедневный бонус ─────────────────────────────────
  bot.command(['daily', 'ежедневный', 'бонус'], async (ctx) => {
    try {
      const userId = ctx.from.id;

      upsertUser(userId, ctx.from.username, ctx.from.first_name);

      const key     = String(userId);
      const nowTime = Date.now();
      const last    = dailyCooldown.get(key) || 0;
      const elapsed = nowTime - last;
      const cooldownMs = DAILY_HOURS * 3600 * 1000;

      if (elapsed < cooldownMs) {
        const remaining = cooldownMs - elapsed;
        const h = Math.floor(remaining / 3600000);
        const m = Math.floor((remaining % 3600000) / 60000);
        return ctx.reply(
          `⏳ Ежедневный бонус уже получен.\n\nПриходи через: <b>${h}ч ${m}м</b>`,
          { parse_mode: 'HTML' }
        );
      }

      const bonus = Math.floor(Math.random() * (DAILY_MAX - DAILY_MIN + 1)) + DAILY_MIN;

      // Проверяем наличие буста bonx2 в инвентаре
      let finalBonus = bonus;
      if (hasInventoryItem(userId, 'bonx2')) {
        finalBonus = bonus * 2;
        // Удаляем буст из инвентаря после использования
        const data = loadDb();
        const user = data.users.find(u => u.telegram_id === userId);
        if (user && user.inventory) {
          user.inventory = user.inventory.filter(id => id !== 'bonx2');
          saveDb(data);
        }
      }

      addCoins(userId, finalBonus);
      dailyCooldown.set(key, nowTime);

      const updatedCoins = getCoins(userId);
      await ctx.reply(
        `💰 <b>${formatName(ctx.from)}</b>, ты получаешь <b>+${formatCurrency(finalBonus)}</b>!` +
        (finalBonus > bonus ? ` (x2 буст!)` : '') + `\n\n` +
        `💼 Всего: <b>${formatCurrency(updatedCoins)}</b>`,
        { parse_mode: 'HTML' }
      );
    } catch (err) {
      console.error('[economy daily]', err.message);
      await ctx.reply('❌ Ошибка при получении бонуса.');
    }
  });

  // ── /coins — баланс ──────────────────────────────────────────
  bot.command(['coins', 'монеты', 'баланс', 'balance'], async (ctx) => {
    try {
      upsertUser(ctx.from.id, ctx.from.username, ctx.from.first_name);
      const coins = getCoins(ctx.from.id);

      await ctx.reply(
        `💼 <b>${formatName(ctx.from)}</b>\n\n💰 FunMoney: <b>${coins}</b>`,
        { parse_mode: 'HTML' }
      );
    } catch (err) {
      console.error('[economy coins]', err.message);
      await ctx.reply('❌ Ошибка.');
    }
  });

  // ── /give [@user|reply] [сумма] — перевод FunMoney ──────────────
  bot.command(['give', 'перевести', 'transfer'], async (ctx) => {
    try {
      // Цель
      let target = ctx.message.reply_to_message?.from;

      if (!target) {
        return ctx.reply('⚠️ Ответь на сообщение человека, которому хочешь перевести FunMoney.');
      }

      if (target.id === ctx.from.id) {
        return ctx.reply('😅 Нельзя переводить монеты самому себе.');
      }

      const args = ctx.message.text.split(' ').slice(1).filter(Boolean);
      const amount = parseInt(args[0]);

      if (!amount || amount <= 0) {
        return ctx.reply('⚠️ Укажи сумму: ответь на сообщение и напиши /give 100');
      }

      upsertUser(ctx.from.id, ctx.from.username, ctx.from.first_name);
      upsertUser(target.id, target.username, target.first_name);

      const senderCoins = getCoins(ctx.from.id);

      if (senderCoins < amount) {
        return ctx.reply(`❌ Недостаточно FunMoney. У тебя: <b>${senderCoins}</b>`, { parse_mode: 'HTML' });
      }

      removeCoins(ctx.from.id, amount);
      addCoins(target.id, amount);

      await ctx.reply(
        `✅ <b>${formatName(ctx.from)}</b> перевёл <b>${formatCurrency(amount)}</b> → <b>${formatName(target)}</b>`,
        { parse_mode: 'HTML' }
      );
    } catch (err) {
      console.error('[economy give]', err.message);
      await ctx.reply('❌ Ошибка при переводе.');
    }
  });

  // ── /richest — топ по монетам ─────────────────────────────────
  bot.command(['richest', 'богатые'], async (ctx) => {
    try {
      const data = loadDb();
      const users = (data.users || [])
        .filter(u => u.coins > 0)
        .sort((a, b) => (b.coins || 0) - (a.coins || 0))
        .slice(0, 10);

      if (!users.length) return ctx.reply('💼 Пока нет данных.');

      const medals = ['🥇', '🥈', '🥉'];
      const lines = users.map((u, i) => {
        const medal = medals[i] || `${i + 1}.`;
        const name  = u.username ? `@${u.username}` : (u.first_name || `User${u.id}`);
        return `${medal} ${name} — ${formatCurrency(u.coins || 0)}`;
      });

      await ctx.reply(`💰 <b>Топ по FunMoney:</b>\n\n${lines.join('\n')}`, { parse_mode: 'HTML' });
    } catch (err) {
      console.error('[economy richest]', err.message);
      await ctx.reply('❌ Ошибка.');
    }
  });

  // ── /grant [@user|reply] [сумма] — выдать FunMoney разработчиком ──
  bot.command(['grant', 'givecoins', 'addcoins'], async (ctx) => {
    try {
      if (ctx.from.id !== OWNER_ID) {
        return ctx.reply('❌ Только разработчик может использовать эту команду.');
      }

      const target = ctx.message.reply_to_message?.from;
      const args = ctx.message.text.split(' ').slice(1).filter(Boolean);
      const amount = parseInt(args[0], 10);

      if (!target || !amount || amount <= 0) {
        return ctx.reply('⚠️ Использование: ответь на сообщение пользователя и напиши /grant 100');
      }

      upsertUser(target.id, target.username, target.first_name);
      addCoins(target.id, amount);

      await ctx.reply(
        `✅ <b>${formatName(target)}</b> получил <b>${formatCurrency(amount)}</b> от разработчика.`,
        { parse_mode: 'HTML' }
      );
    } catch (err) {
      console.error('[economy grant]', err.message);
      await ctx.reply('❌ Ошибка при выдаче FunMoney.');
    }
  });

  console.log('✅ Модуль economy подключён');
}

module.exports = { register };
