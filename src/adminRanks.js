// ============================================================
// src/adminRanks.js
// Ранги и заголовки для администраторов чата.
// ============================================================

const { isUserAdmin, formatName } = require('./utils');

// Список кастомных рангов (chatId → Map<userId, rank>)
// В боевом проекте лучше хранить в SQLite
const rankStore = new Map();

function getChatRanks(chatId) {
  if (!rankStore.has(chatId)) rankStore.set(chatId, new Map());
  return rankStore.get(chatId);
}

function register(bot) {

  // ── /setrank [@user|reply] [ранг] ────────────────────────────
  bot.command(['setrank', 'сетранк'], async (ctx) => {
    if (ctx.chat.type === 'private') return;
    if (!await isUserAdmin(ctx, ctx.from.id)) {
      return ctx.reply('⛔ Только администраторы могут устанавливать ранги.');
    }

    const target = ctx.message.reply_to_message?.from;
    if (!target) return ctx.reply('⚠️ Ответь на сообщение пользователя.');

    const args = ctx.message.text.split(' ').slice(1).join(' ').trim();
    if (!args) return ctx.reply('⚠️ Укажи ранг: /setrank [ответ на сообщение] [Название ранга]');

    const ranks = getChatRanks(ctx.chat.id);
    ranks.set(target.id, args);

    await ctx.reply(
      `✅ <b>${formatName(target)}</b> получает ранг: <b>${args}</b>`,
      { parse_mode: 'HTML' }
    );
  });

  // ── /rank — отображение ранга ─────────────────────────────────
  // Дополняет команду /rank из levels.js кастомным рангом
  bot.on('message', async (ctx, next) => {
    // Этот модуль не перехватывает — только добавляет данные
    return next();
  });

  // ── /admins — список администраторов ─────────────────────────
  bot.command(['admins', 'админы', 'administration'], async (ctx) => {
    if (ctx.chat.type === 'private') {
      return ctx.reply('ℹ️ Эта команда работает только в группах.');
    }

    try {
      const admins = await ctx.telegram.getChatAdministrators(ctx.chat.id);
      const ranks  = getChatRanks(ctx.chat.id);

      const lines = admins.map(a => {
        const name    = a.user.username ? `@${a.user.username}` : (a.user.first_name || 'Участник');
        const isOwner = a.status === 'creator';
        const rank    = ranks.get(a.user.id) || a.custom_title || (isOwner ? 'Владелец' : 'Администратор');
        const icon    = isOwner ? '👑' : '🛡';
        return `${icon} ${name} — <i>${rank}</i>`;
      });

      await ctx.reply(
        `🛡 <b>Администраторы чата:</b>\n\n${lines.join('\n')}`,
        { parse_mode: 'HTML' }
      );
    } catch (err) {
      console.error('[admins]', err.message);
      await ctx.reply('❌ Не удалось получить список администраторов.');
    }
  });

  console.log('✅ Модуль adminRanks подключён');
}

module.exports = { register };
