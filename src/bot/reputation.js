// ============================================================
// src/bot/reputation.js
// Полноценная система репутации: +реп / -реп / топ
// ============================================================

const { Markup } = require('telegraf');
const db = require('../db');
const { formatName, isProtected } = require('../utils');

// Кулдаун: один пользователь может давать репутацию раз в 12 часов
const REP_COOLDOWN_MS = 12 * 3600 * 1000;
const repCooldown = new Map(); // Map<chatId_fromId_toId, timestamp>

function getUser(userId, chatId) {
  return db.prepare('SELECT * FROM users WHERE id = ? AND chat_id = ?').get(userId, chatId);
}

function upsertUser(user, chatId) {
  db.prepare(`
    INSERT INTO users (id, username, first_name, chat_id)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET username = excluded.username, first_name = excluded.first_name
  `).run(user.id, user.username || null, user.first_name || null, chatId);
}

function changeRep(userId, chatId, delta) {
  db.prepare('UPDATE users SET reputation = reputation + ? WHERE id = ? AND chat_id = ?')
    .run(delta, userId, chatId);
}

function getRep(userId, chatId) {
  const row = db.prepare('SELECT reputation FROM users WHERE id = ? AND chat_id = ?').get(userId, chatId);
  return row?.reputation || 0;
}

// ── Общая функция изменения репутации ────────────────────────
async function handleRep(ctx, delta) {
  if (ctx.chat.type === 'private') return ctx.reply('⭐ Репутация работает только в группах!');

  const from   = ctx.from;
  const target = ctx.message.reply_to_message?.from;

  if (!target || target.is_bot) {
    return ctx.reply(
      delta > 0
        ? '⭐ Ответь на сообщение человека командой +реп или /rep'
        : '💔 Ответь на сообщение человека командой -реп или /unrep'
    );
  }

  if (target.id === from.id) {
    return ctx.reply('😅 Нельзя менять репутацию самому себе.');
  }

  // Защита администраторов от -реп
  if (delta < 0) {
    const guard = await isProtected(ctx, target.id);
    if (guard.protected) return ctx.reply(guard.reason);
  }

  const chatId = ctx.chat.id;
  const key    = `${chatId}_${from.id}_${target.id}`;
  const now    = Date.now();
  const last   = repCooldown.get(key) || 0;

  if (now - last < REP_COOLDOWN_MS) {
    const left = REP_COOLDOWN_MS - (now - last);
    const h    = Math.floor(left / 3600000);
    const m    = Math.floor((left % 3600000) / 60000);
    return ctx.reply(
      `⏳ Ты уже менял репутацию <b>${formatName(target)}</b>.\nПодожди ещё <b>${h}ч ${m}м</b>.`,
      { parse_mode: 'HTML' }
    );
  }

  repCooldown.set(key, now);
  upsertUser(from,   chatId);
  upsertUser(target, chatId);
  changeRep(target.id, chatId, delta);

  const newRep = getRep(target.id, chatId);
  const emoji  = delta > 0 ? '⭐' : '💔';
  const action = delta > 0 ? 'повысил репутацию' : 'понизил репутацию';

  await ctx.reply(
    `${emoji} <b>${formatName(from)}</b> ${action} <b>${formatName(target)}</b>\n\n` +
    `Репутация: <b>${newRep > 0 ? '+' : ''}${newRep}</b>`,
    { parse_mode: 'HTML' }
  );
}

function registerReputation(bot) {

  // +реп / +rep — повысить репутацию
  bot.hears(/^\+\s*(реп|rep|репутация)$/i, (ctx) => handleRep(ctx, +1));
  bot.command(['rep', 'плюсреп', 'plusrep'], (ctx) => handleRep(ctx, +1));

  // -реп / -rep — понизить репутацию
  bot.hears(/^-\s*(реп|rep|репутация)$/i, (ctx) => handleRep(ctx, -1));
  bot.command(['unrep', 'минусреп', 'minusrep'], (ctx) => handleRep(ctx, -1));

  // /toprep — топ по репутации
  bot.command(['toprep', 'топреп', 'reputationtop'], async (ctx) => {
    const chatId = ctx.chat.type === 'private' ? ctx.from.id : ctx.chat.id;

    const rows = db.prepare(
      'SELECT * FROM users WHERE chat_id = ? ORDER BY reputation DESC LIMIT 10'
    ).all(chatId);

    if (!rows.length) return ctx.reply('⭐ Пока нет данных о репутации.');

    const medals = ['🥇', '🥈', '🥉'];
    const lines  = rows.map((u, i) => {
      const medal = medals[i] || `${i + 1}.`;
      const name  = u.username ? `@${u.username}` : (u.first_name || `User${u.id}`);
      const rep   = u.reputation || 0;
      const sign  = rep > 0 ? '+' : '';
      return `${medal} ${name} — <b>${sign}${rep}</b> ⭐`;
    });

    await ctx.reply(
      `⭐ <b>Топ по репутации:</b>\n\n${lines.join('\n')}`,
      { parse_mode: 'HTML' }
    );
  });

  // /myrep — своя репутация
  bot.command(['myrep', 'моярепутация', 'репутация'], async (ctx) => {
    const chatId = ctx.chat.type === 'private' ? ctx.from.id : ctx.chat.id;
    upsertUser(ctx.from, chatId);
    const rep  = getRep(ctx.from.id, chatId);
    const sign = rep > 0 ? '+' : '';

    await ctx.reply(
      `⭐ <b>${formatName(ctx.from)}</b>\n\nРепутация: <b>${sign}${rep}</b>`,
      { parse_mode: 'HTML' }
    );
  });

  console.log('✅ Модуль reputation подключён');
}

module.exports = { registerReputation };
