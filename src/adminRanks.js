// ============================================================
// src/adminRanks.js
// Ранги и заголовки для администраторов чата.
// ============================================================

const { isUserAdmin, formatName } = require('./utils');

// Список кастомных рангов (chatId → Map<userId, rank>)
// В боевом проекте лучше хранить в SQLite
const rankStore = new Map();

// ── Система уровней рангов ───────────────────────────────────
const RANKS = {
  100: { emoji: '👑', name: 'Владелец',                note: 'Полный доступ',            muteLimit: Infinity },
  95:  { emoji: '🛡', name: 'Заместитель владельца',   note: 'Всё кроме смены владельца', muteLimit: Infinity },
  90:  { emoji: '💎', name: 'Главный администратор',   note: 'Бан, мут, ранги до 80',     muteLimit: Infinity },
  80:  { emoji: '🔥', name: 'Куратор администрации',   note: 'Ранги до 70, бан, мут',     muteLimit: Infinity },
  70:  { emoji: '⚡', name: 'Старший администратор',   note: 'Ранги до 60, бан, мут',     muteLimit: Infinity },
  60:  { emoji: '🧩', name: 'Администратор',           note: 'Ранги до 50, мут, кик',     muteLimit: 1440 },
  50:  { emoji: '🛠', name: 'Младший администратор',   note: 'Мут до 2ч, предупреждения', muteLimit: 120 },
  40:  { emoji: '👮', name: 'Старший модератор',       note: 'Мут до 60мин',              muteLimit: 60 },
  30:  { emoji: '🧹', name: 'Модератор',               note: 'Мут до 30мин, удаление',    muteLimit: 30 },
  20:  { emoji: '🤝', name: 'Помощник',                note: 'Просмотр, удаление',        muteLimit: 0 },
  10:  { emoji: '🌱', name: 'Стажёр',                  note: 'Просмотр команд',           muteLimit: 0 },
  0:   { emoji: '👤', name: 'Пользователь',            note: 'Базовые команды',           muteLimit: 0 }
};

function getRankInfo(rank) {
  const keys = Object.keys(RANKS).map(Number).sort((a,b) => b - a);
  for (const k of keys) if (rank >= k) return { level: k, ...RANKS[k] };
  return { level: 0, ...RANKS[0] };
}

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

  // ── /ranks — список всех рангов с описанием ───────────────────
  bot.command(['ranks', 'ранги'], async (ctx) => {
    let text = '👑 <b>Система рангов администраторов</b>\n\n';
    text += '📋 <b>Как выдать ранг:</b> /setrank [ответ на пользователя] [уровень ранга]\n';
    text += '📋 <b>Как снять ранг:</b> /delrank [ответ на пользователя]\n\n';
    text += '━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n';
    
    Object.entries(RANKS).sort((a,b)=>Number(b[0])-Number(a[0])).forEach(([lvl,r]) => {
      text += `${r.emoji} <b>${r.name}</b> — уровень ${lvl}\n`;
      text += `   ${r.note}\n`;
      
      // Добавляем подробное описание возможностей
      const permissions = [];
      if (lvl >= 100) {
        permissions.push('🔹 Полный доступ ко всем командам');
        permissions.push('🔹 Выдача любых рангов');
        permissions.push('🔹 Передача прав владельца');
        permissions.push('🔹 Глобальные ранги');
      } else if (lvl >= 95) {
        permissions.push('🔹 Все команды кроме смены владельца');
        permissions.push('🔹 Выдача рангов до 90');
        permissions.push('🔹 Бан, мут без ограничений');
      } else if (lvl >= 90) {
        permissions.push('🔹 Бан, мут без ограничений');
        permissions.push('🔹 Выдача рангов до 80');
        permissions.push('🔹 Настройки защиты чата');
      } else if (lvl >= 80) {
        permissions.push('🔹 Бан, мут без ограничений');
        permissions.push('🔹 Выдача рангов до 70');
        permissions.push('🔹 Управление закрепами');
      } else if (lvl >= 70) {
        permissions.push('🔹 Бан, мут без ограничений');
        permissions.push('🔹 Выдача рангов до 60');
        permissions.push('🔹 Кик участников');
      } else if (lvl >= 60) {
        permissions.push('🔹 Мут до 24 часов');
        permissions.push('🔹 Кик участников');
        permissions.push('🔹 Выдача рангов до 50');
        permissions.push('🔹 Предупреждения');
      } else if (lvl >= 50) {
        permissions.push('🔹 Мут до 2 часов');
        permissions.push('🔹 Выдача предупреждений');
        permissions.push('🔹 Удаление сообщений');
      } else if (lvl >= 40) {
        permissions.push('🔹 Мут до 60 минут');
        permissions.push('🔹 Удаление сообщений');
        permissions.push('🔹 Просмотр статистики');
      } else if (lvl >= 30) {
        permissions.push('🔹 Мут до 30 минут');
        permissions.push('🔹 Удаление сообщений');
      } else if (lvl >= 20) {
        permissions.push('🔹 Просмотр логов');
        permissions.push('🔹 Удаление сообщений');
      } else if (lvl >= 10) {
        permissions.push('🔹 Просмотр команд');
        permissions.push('🔹 Информация о чате');
      }
      
      if (permissions.length > 0) {
        text += '   ' + permissions.join('\n   ') + '\n';
      }
      text += '\n';
    });
    
    await ctx.reply(text, { parse_mode: 'HTML' });
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

module.exports = { register, getRankInfo, RANKS };
