// ============================================================
// src/levels.js
// Система уровней, XP и рангов.
// ============================================================

const db = require('./db');
const { formatName } = require('./utils');

// XP за сообщение (диапазон)
const XP_MIN = 1;
const XP_MAX = 5;
// Cooldown между начислением XP (секунды)
const XP_COOLDOWN = 30;

// Кулдаун: Map<chatId_userId, timestamp>
const xpCooldown = new Map();

/** XP для достижения уровня N */
function xpForLevel(level) {
  return Math.floor(100 * Math.pow(level, 1.5));
}

/** Рассчитать уровень по XP */
function calcLevel(xp) {
  let level = 1;
  while (xp >= xpForLevel(level + 1)) level++;
  return level;
}

/** Ранг по уровню */
function getRank(level) {
  if (level >= 50) return '👑 Легенда';
  if (level >= 30) return '💎 Эксперт';
  if (level >= 20) return '🥇 Про';
  if (level >= 10) return '🥈 Опытный';
  if (level >= 5)  return '🥉 Участник';
  return '🌱 Новичок';
}

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
      first_name = excluded.first_name,
      last_active = CURRENT_TIMESTAMP
  `).run(user.id, user.username || null, user.first_name || null, chatId);
}

function addXP(userId, chatId, amount) {
  db.prepare(
    'UPDATE users SET xp = xp + ? WHERE id = ? AND chat_id = ?'
  ).run(amount, userId, chatId);
  return db.prepare(
    'SELECT xp, level FROM users WHERE id = ? AND chat_id = ?'
  ).get(userId, chatId);
}

function setLevel(userId, chatId, level) {
  db.prepare(
    'UPDATE users SET level = ? WHERE id = ? AND chat_id = ?'
  ).run(level, userId, chatId);
}

function register(bot) {

  // ── Начисление XP за каждое сообщение ────────────────────────
  bot.on('message', async (ctx, next) => {
    if (ctx.chat.type === 'private') return next();
    if (!ctx.from || ctx.from.is_bot) return next();

    const userId = ctx.from.id;
    const chatId = ctx.chat.id;
    const key    = `${chatId}_${userId}`;
    const now    = Date.now();

    // Кулдаун XP
    const last = xpCooldown.get(key) || 0;
    if (now - last < XP_COOLDOWN * 1000) return next();
    xpCooldown.set(key, now);

    // Сохраняем пользователя
    upsertUser(ctx.from, chatId);

    // Случайный XP
    const xpGain = Math.floor(Math.random() * (XP_MAX - XP_MIN + 1)) + XP_MIN;
    const updated = addXP(userId, chatId, xpGain);

    if (!updated) return next();

    // Проверяем повышение уровня
    const newLevel = calcLevel(updated.xp);
    if (newLevel > updated.level) {
      setLevel(userId, chatId, newLevel);
      await ctx.reply(
        `🎉 <b>${formatName(ctx.from)}</b> достиг <b>${newLevel} уровня</b>!\nРанг: ${getRank(newLevel)}`,
        { parse_mode: 'HTML' }
      );
    }

    return next();
  });

  // ── /rank ─────────────────────────────────────────────────────
  bot.command(['rank', 'уровень', 'level'], async (ctx) => {
    const userId = ctx.from.id;
    const chatId = ctx.chat.type === 'private' ? userId : ctx.chat.id;

    upsertUser(ctx.from, chatId);
    const user = getUser(userId, chatId);
    if (!user) return ctx.reply('📊 Пока нет данных. Напиши что-нибудь в чате!');

    const level   = calcLevel(user.xp);
    const nextXP  = xpForLevel(level + 1);
    const prog    = Math.round((user.xp / nextXP) * 100);
    const bar     = '█'.repeat(Math.floor(prog / 10)) + '░'.repeat(10 - Math.floor(prog / 10));

    await ctx.reply(
      `📊 <b>${formatName(ctx.from)}</b>\n\n` +
      `🏅 Уровень: <b>${level}</b> (${getRank(level)})\n` +
      `⭐ XP: <b>${user.xp}</b> / ${nextXP}\n` +
      `[${bar}] ${prog}%\n` +
      `💰 Монеты: <b>${user.coins || 0}</b>`,
      { parse_mode: 'HTML' }
    );
  });

  // ── /top ──────────────────────────────────────────────────────
  bot.command(['top', 'топ', 'leaderboard'], async (ctx) => {
    const chatId = ctx.chat.type === 'private'
      ? ctx.from.id
      : ctx.chat.id;

    const rows = db.prepare(
      'SELECT * FROM users WHERE chat_id = ? ORDER BY xp DESC LIMIT 10'
    ).all(chatId);

    if (!rows.length) return ctx.reply('📋 Таблица лидеров пуста.');

    const medals = ['🥇', '🥈', '🥉'];
    const lines = rows.map((u, i) => {
      const medal = medals[i] || `${i + 1}.`;
      const name  = u.username ? `@${u.username}` : (u.first_name || `User${u.id}`);
      const level = calcLevel(u.xp);
      return `${medal} ${name} — ур. ${level} (${u.xp} XP)`;
    });

    await ctx.reply(`🏆 <b>Топ чата:</b>\n\n${lines.join('\n')}`, { parse_mode: 'HTML' });
  });

  console.log('✅ Модуль levels подключён');
}

module.exports = { register, calcLevel, getRank, xpForLevel };
