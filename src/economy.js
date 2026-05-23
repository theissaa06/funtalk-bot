// ============================================================
// src/economy.js
// Монеты, ежедневный бонус, перевод монет.
// ============================================================

const db = require('./db');
const { formatName, isUserAdmin } = require('./utils');

const DAILY_MIN    = 50;
const DAILY_MAX    = 200;
const DAILY_HOURS  = 24;

function getUser(userId, chatId) {
  return db.prepare(
    'SELECT * FROM users WHERE id = ? AND chat_id = ?'
  ).get(userId, chatId);
}

function upsertUser(user, chatId) {
  db.prepare(`
    INSERT INTO users (id, username, first_name, chat_id)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      username   = excluded.username,
      first_name = excluded.first_name
  `).run(user.id, user.username || null, user.first_name || null, chatId);
}

function addCoins(userId, chatId, amount) {
  db.prepare(
    'UPDATE users SET coins = coins + ? WHERE id = ? AND chat_id = ?'
  ).run(amount, userId, chatId);
}

function removeCoins(userId, chatId, amount) {
  db.prepare(
    'UPDATE users SET coins = MAX(0, coins - ?) WHERE id = ? AND chat_id = ?'
  ).run(amount, userId, chatId);
}

// Хранит время последнего /daily: Map<chatId_userId, timestamp>
const dailyCooldown = new Map();

function register(bot) {

  // ── /daily — ежедневный бонус ─────────────────────────────────
  bot.command(['daily', 'ежедневный', 'бонус'], async (ctx) => {
    const userId = ctx.from.id;
    const chatId = ctx.chat.type === 'private' ? userId : ctx.chat.id;

    upsertUser(ctx.from, chatId);

    const key     = `${chatId}_${userId}`;
    const now     = Date.now();
    const last    = dailyCooldown.get(key) || 0;
    const elapsed = now - last;
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
    addCoins(userId, chatId, bonus);
    dailyCooldown.set(key, now);

    const user = getUser(userId, chatId);
    await ctx.reply(
      `💰 <b>${formatName(ctx.from)}</b>, ты получаешь <b>+${bonus} монет</b>!\n\n` +
      `💼 Всего монет: <b>${user.coins}</b>`,
      { parse_mode: 'HTML' }
    );
  });

  // ── /coins — баланс ──────────────────────────────────────────
  bot.command(['coins', 'монеты', 'баланс', 'balance'], async (ctx) => {
    const userId = ctx.from.id;
    const chatId = ctx.chat.type === 'private' ? userId : ctx.chat.id;

    upsertUser(ctx.from, chatId);
    const user = getUser(userId, chatId);

    await ctx.reply(
      `💼 <b>${formatName(ctx.from)}</b>\n\n💰 Монеты: <b>${user ? user.coins : 0}</b>`,
      { parse_mode: 'HTML' }
    );
  });

  // ── /give [@user|reply] [сумма] — перевод монет ──────────────
  bot.command(['give', 'перевести', 'transfer'], async (ctx) => {
    const chatId = ctx.chat.type === 'private' ? ctx.from.id : ctx.chat.id;

    // Цель
    let target = ctx.message.reply_to_message?.from;
    const args = ctx.message.text.split(' ').slice(1).filter(Boolean);

    if (!target) {
      return ctx.reply('⚠️ Ответь на сообщение человека, которому хочешь перевести монеты.');
    }

    if (target.id === ctx.from.id) {
      return ctx.reply('😅 Нельзя переводить монеты самому себе.');
    }

    const amount = parseInt(args[0]);
    if (!amount || amount <= 0) {
      return ctx.reply('⚠️ Укажи сумму: ответь на сообщение и напиши /give 100');
    }

    upsertUser(ctx.from, chatId);
    upsertUser(target, chatId);

    const sender = getUser(ctx.from.id, chatId);
    if (!sender || sender.coins < amount) {
      return ctx.reply(`❌ Недостаточно монет. У тебя: <b>${sender?.coins || 0}</b>`, { parse_mode: 'HTML' });
    }

    removeCoins(ctx.from.id, chatId, amount);
    addCoins(target.id, chatId, amount);

    await ctx.reply(
      `✅ <b>${formatName(ctx.from)}</b> перевёл <b>${amount} монет</b> → <b>${formatName(target)}</b>`,
      { parse_mode: 'HTML' }
    );
  });

  // ── /richest — топ по монетам ─────────────────────────────────
  bot.command(['richest', 'богатые'], async (ctx) => {
    const chatId = ctx.chat.type === 'private' ? ctx.from.id : ctx.chat.id;

    const rows = db.prepare(
      'SELECT * FROM users WHERE chat_id = ? ORDER BY coins DESC LIMIT 10'
    ).all(chatId);

    if (!rows.length) return ctx.reply('💼 Пока нет данных.');

    const medals = ['🥇', '🥈', '🥉'];
    const lines = rows.map((u, i) => {
      const medal = medals[i] || `${i + 1}.`;
      const name  = u.username ? `@${u.username}` : (u.first_name || `User${u.id}`);
      return `${medal} ${name} — ${u.coins} монет`;
    });

    await ctx.reply(`💰 <b>Топ по монетам:</b>\n\n${lines.join('\n')}`, { parse_mode: 'HTML' });
  });

  console.log('✅ Модуль economy подключён');
}

module.exports = { register };
