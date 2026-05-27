// ============================================================
// src/bot/chatstats.js
// Статистика чата: счётчик сообщений, топ активности
// ============================================================

const { Markup } = require('telegraf');
const db = require('../db');
const { formatName } = require('../utils');
const fs   = require('fs');

const DB_PATH = process.env.DB_PATH || './data/bot_data.json';

// ── Вспомогательные ──────────────────────────────────────────
function loadData() {
  try { return JSON.parse(fs.readFileSync(DB_PATH, 'utf8')); }
  catch { return { users: [] }; }
}

function saveData(data) {
  fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2), 'utf8');
}

function incrementMessages(userId, chatId) {
  const data = loadData();
  const user = (data.users || []).find(u => u.id === userId && String(u.chat_id) === String(chatId));
  if (!user) return;
  user.messages_count = (user.messages_count || 0) + 1;
  // Обновляем daily_messages для топа дня
  const today = new Date().toISOString().slice(0, 10);
  if (user.daily_date !== today) {
    user.daily_date     = today;
    user.daily_messages = 0;
  }
  user.daily_messages = (user.daily_messages || 0) + 1;
  saveData(data);
}

function getChatStats(chatId) {
  const data  = loadData();
  const users = (data.users || []).filter(u => String(u.chat_id) === String(chatId));
  const total = users.reduce((sum, u) => sum + (u.messages_count || 0), 0);
  return { users, total };
}

function getTopToday(chatId) {
  const today = new Date().toISOString().slice(0, 10);
  const data  = loadData();
  return (data.users || [])
    .filter(u => String(u.chat_id) === String(chatId) && u.daily_date === today)
    .sort((a, b) => (b.daily_messages || 0) - (a.daily_messages || 0))
    .slice(0, 10);
}

// ── Регистрация ───────────────────────────────────────────────
function registerChatStats(bot) {

  // Считаем сообщения каждого участника
  bot.on('message', async (ctx, next) => {
    try {
      if (ctx.from && !ctx.from.is_bot && ctx.chat?.type !== 'private') {
        incrementMessages(ctx.from.id, ctx.chat.id);
      }
    } catch {}
    return next();
  });

  // /chatstats — общая статистика чата
  bot.command(['chatstats', 'статчата', 'статистика'], async (ctx) => {
    if (ctx.chat.type === 'private') return ctx.reply('📊 Статистика работает только в группах!');

    const { users, total } = getChatStats(ctx.chat.id);
    const today            = new Date().toISOString().slice(0, 10);
    const activeToday      = users.filter(u => u.daily_date === today).length;
    const topUser          = users.sort((a, b) => (b.messages_count || 0) - (a.messages_count || 0))[0];
    const topName          = topUser
      ? (topUser.username ? `@${topUser.username}` : topUser.first_name || 'Участник')
      : '—';

    await ctx.reply(
      `📊 <b>Статистика чата</b>\n\n` +
      `👥 Участников в базе: <b>${users.length}</b>\n` +
      `💬 Всего сообщений: <b>${total}</b>\n` +
      `🔥 Активных сегодня: <b>${activeToday}</b>\n` +
      `🏆 Самый активный: <b>${topName}</b>\n\n` +
      `Топ активности: /toptoday\nТоп всех времён: /top`,
      { parse_mode: 'HTML' }
    );
  });

  // /toptoday — топ активности за сегодня
  bot.command(['toptoday', 'топсегодня', 'today'], async (ctx) => {
    if (ctx.chat.type === 'private') return ctx.reply('📊 Работает только в группах!');

    const rows = getTopToday(ctx.chat.id);
    if (!rows.length) return ctx.reply('📊 Сегодня ещё никто не писал.');

    const medals = ['🥇', '🥈', '🥉'];
    const lines  = rows.map((u, i) => {
      const medal = medals[i] || `${i + 1}.`;
      const name  = u.username ? `@${u.username}` : (u.first_name || `User${u.id}`);
      return `${medal} ${name} — <b>${u.daily_messages || 0}</b> сообщений`;
    });

    const today = new Date().toLocaleDateString('ru-RU');
    await ctx.reply(
      `🔥 <b>Топ активности за ${today}:</b>\n\n${lines.join('\n')}`,
      { parse_mode: 'HTML' }
    );
  });

  // /mystats — личная статистика
  bot.command(['mystats', 'моястата', 'мояста'], async (ctx) => {
    const chatId = ctx.chat.type === 'private' ? ctx.from.id : ctx.chat.id;
    const data   = loadData();
    const user   = (data.users || []).find(u => u.id === ctx.from.id && String(u.chat_id) === String(chatId));

    if (!user) return ctx.reply('📊 Пока нет данных. Напиши что-нибудь в чате!');

    const today        = new Date().toISOString().slice(0, 10);
    const dailyMsgs    = user.daily_date === today ? (user.daily_messages || 0) : 0;
    const totalMsgs    = user.messages_count || 0;
    const joinedAt     = user.joined_at ? user.joined_at.slice(0, 10) : '—';

    await ctx.reply(
      `📊 <b>Статистика ${formatName(ctx.from)}</b>\n\n` +
      `💬 Всего сообщений: <b>${totalMsgs}</b>\n` +
      `🔥 Сегодня: <b>${dailyMsgs}</b>\n` +
      `📅 В чате с: <b>${joinedAt}</b>\n` +
      `⭐ Репутация: <b>${user.reputation || 0}</b>\n` +
      `💰 Монеты: <b>${user.coins || 0}</b>\n` +
      `🏅 Уровень: <b>${user.level || 1}</b>`,
      { parse_mode: 'HTML' }
    );
  });

  console.log('✅ Модуль chatstats подключён');
}

module.exports = { registerChatStats };
