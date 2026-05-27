// ============================================================
// src/removeUser.js
// Бан / кик / разбан с запоминанием участников.
//
// Ключевые улучшения:
// - Бот запоминает КАЖДОГО участника при любом сообщении
// - Пользователи НИКОГДА не удаляются из базы (только статус)
// - Разбан работает по @username, ID или ответом на сообщение
// - Разбан работает даже если человека нет в чате
// ============================================================

const db = require('./db');
const { isProtected } = require('./utils');

// ── Вспомогательные функции ───────────────────────────────────

async function isChatAdmin(ctx, userId) {
  try {
    const member = await ctx.telegram.getChatMember(ctx.chat.id, userId);
    return member.status === 'creator' || member.status === 'administrator';
  } catch {
    return false;
  }
}

async function canBotRestrict(ctx) {
  try {
    const botInfo = await ctx.telegram.getMe();
    const m = await ctx.telegram.getChatMember(ctx.chat.id, botInfo.id);
    return m.status === 'creator' || (m.status === 'administrator' && m.can_restrict_members === true);
  } catch {
    return false;
  }
}

function formatUser(user) {
  if (!user) return 'пользователь';
  if (user.username)   return `@${user.username}`;
  if (user.first_name) return user.first_name;
  return `ID ${user.id}`;
}

function logModAction(chatId, userId, action, reason, byUserId) {
  try {
    db.prepare(
      `INSERT INTO mod_log (chat_id, user_id, action, reason, by_user_id) VALUES (?, ?, ?, ?, ?)`
    ).run(chatId, userId, action, reason, byUserId);
  } catch (err) {
    console.error('[removeUser:log]', err.message);
  }
}

// ── Разобрать аргументы команды ───────────────────────────────
function parseArgs(ctx) {
  const text  = ctx.message?.text || '';
  const parts = text.trim().split(/\s+/);
  const args  = parts.slice(1); // всё после команды
  return args;
}

// ── Найти цель команды ────────────────────────────────────────
// Приоритет: reply → @username/ID в аргументах → ничего
async function resolveTarget(ctx, args) {
  // 1. Ответ на сообщение
  const replyFrom = ctx.message?.reply_to_message?.from;
  if (replyFrom && replyFrom.id) {
    // Запоминаем пользователя из reply
    db.rememberUser(replyFrom, ctx.chat.id);
    return {
      id:         replyFrom.id,
      username:   replyFrom.username   || null,
      first_name: replyFrom.first_name || null,
      fromReply:  true,
    };
  }

  // 2. Первый аргумент — @username или числовой ID
  const raw = args[0];
  if (!raw) return null;

  const query = raw.replace(/^@/, '');

  // Сначала ищем в нашей базе (работает даже для забаненных)
  const fromDb = db.findUser(ctx.chat.id, query);
  if (fromDb) {
    return {
      id:         fromDb.id,
      username:   fromDb.username   || null,
      first_name: fromDb.first_name || null,
      fromReply:  false,
    };
  }

  // Если не нашли в базе — пробуем через Telegram API
  try {
    const member = /^\d+$/.test(query)
      ? await ctx.telegram.getChatMember(ctx.chat.id, parseInt(query))
      : await ctx.telegram.getChatMember(ctx.chat.id, raw); // @username

    if (member?.user) {
      db.rememberUser(member.user, ctx.chat.id);
      return {
        id:         member.user.id,
        username:   member.user.username   || null,
        first_name: member.user.first_name || null,
        fromReply:  false,
      };
    }
  } catch {
    // Пользователь не найден через API — возможно уже забанен
  }

  // Если числовой ID — возвращаем как есть (для разбана)
  if (/^\d+$/.test(query)) {
    return { id: parseInt(query), username: null, first_name: null, fromReply: false };
  }

  return null;
}

function getReason(args, fromReply) {
  // Если цель из reply — вся строка аргументов = причина
  // Если цель из аргументов — причина начинается со второго аргумента
  const start = fromReply ? 0 : 1;
  return args.slice(start).join(' ').trim() || 'Без причины';
}

// ── Базовые проверки ──────────────────────────────────────────
async function baseChecks(ctx) {
  if (!ctx.chat || ctx.chat.type === 'private') {
    await ctx.reply('🛡 Эта команда работает только в группах.');
    return false;
  }
  if (!await isChatAdmin(ctx, ctx.from.id)) {
    await ctx.reply('⛔ Команду могут использовать только администраторы чата.');
    return false;
  }
  if (!await canBotRestrict(ctx)) {
    await ctx.reply('⚠️ У меня нет прав банить/кикать.\nСделай меня админом с правом «Блокировать пользователей».');
    return false;
  }
  return true;
}

// ── /ban ──────────────────────────────────────────────────────
async function banUser(ctx) {
  if (!await baseChecks(ctx)) return;

  const args   = parseArgs(ctx);
  const target = await resolveTarget(ctx, args);

  if (!target) {
    return ctx.reply(
      '� Как забанить:\n\n' +
      '• Ответь на сообщение: /ban причина\n' +
      '• По @username: /ban @username причина\n' +
      '• По ID: /ban 123456789 причина'
    );
  }

  if (target.id === ctx.from.id) return ctx.reply('🤨 Самого себя банить не надо.');

  const guard = await isProtected(ctx, target.id);
  if (guard.protected) return ctx.reply(guard.reason);

  const reason = getReason(args, target.fromReply);

  try {
    await ctx.telegram.banChatMember(ctx.chat.id, target.id);

    // Помечаем статус в базе (НЕ удаляем запись)
    db.setUserStatus(target.id, ctx.chat.id, 'banned');
    logModAction(ctx.chat.id, target.id, 'ban', reason, ctx.from.id);

    return ctx.reply(
      `🔨 <b>${formatUser(target)}</b> забанен.\n📝 Причина: ${reason}`,
      { parse_mode: 'HTML' }
    );
  } catch (err) {
    console.error('[ban]', err.message);
    return ctx.reply('❌ Не получилось забанить. Проверь права бота.');
  }
}

// ── /kick ─────────────────────────────────────────────────────
async function kickUser(ctx) {
  if (!await baseChecks(ctx)) return;

  const args   = parseArgs(ctx);
  const target = await resolveTarget(ctx, args);

  if (!target) {
    return ctx.reply(
      '👢 Как кикнуть:\n\n' +
      '• Ответь на сообщение: /kick причина\n' +
      '• По @username: /kick @username причина\n' +
      '• По ID: /kick 123456789 причина'
    );
  }

  if (target.id === ctx.from.id) return ctx.reply('🤨 Самого себя кикать не надо.');

  const guard = await isProtected(ctx, target.id);
  if (guard.protected) return ctx.reply(guard.reason);

  const reason = getReason(args, target.fromReply);

  try {
    // Кик = бан + немедленный разбан (пользователь удаляется, но может вернуться)
    await ctx.telegram.banChatMember(ctx.chat.id, target.id);
    await ctx.telegram.unbanChatMember(ctx.chat.id, target.id, { only_if_banned: true });

    // Статус остаётся active — человек может вернуться
    logModAction(ctx.chat.id, target.id, 'kick', reason, ctx.from.id);

    return ctx.reply(
      `👢 <b>${formatUser(target)}</b> кикнут из группы.\n📝 Причина: ${reason}`,
      { parse_mode: 'HTML' }
    );
  } catch (err) {
    console.error('[kick]', err.message);
    return ctx.reply('❌ Не получилось кикнуть. Проверь права бота.');
  }
}

// ── /unban ────────────────────────────────────────────────────
async function unbanUser(ctx) {
  if (!await baseChecks(ctx)) return;

  const args   = parseArgs(ctx);
  const target = await resolveTarget(ctx, args);

  if (!target) {
    return ctx.reply(
      '🔓 Как разбанить:\n\n' +
      '• По @username: /unban @username\n' +
      '• По ID: /unban 123456789\n' +
      '• Ответом на сообщение: /unban\n\n' +
      '💡 Работает даже если человека нет в чате — бот помнит всех участников.'
    );
  }

  try {
    await ctx.telegram.unbanChatMember(ctx.chat.id, target.id, { only_if_banned: true });

    // Восстанавливаем статус в базе
    db.setUserStatus(target.id, ctx.chat.id, 'active');
    logModAction(ctx.chat.id, target.id, 'unban', 'Разбан', ctx.from.id);

    return ctx.reply(
      `✅ <b>${formatUser(target)}</b> разбанен. Теперь может вернуться в чат.`,
      { parse_mode: 'HTML' }
    );
  } catch (err) {
    console.error('[unban]', err.message);
    return ctx.reply(
      `❌ Не получилось разбанить.\n\n` +
      `Проверь:\n` +
      `• Бот является администратором\n` +
      `• У бота есть право «Блокировать пользователей»\n` +
      `• Пользователь действительно был забанен`
    );
  }
}

// ── Регистрация ───────────────────────────────────────────────
function register(bot) {

  // Запоминаем каждого участника при любом сообщении
  bot.on('message', async (ctx, next) => {
    try {
      if (ctx.from && !ctx.from.is_bot && ctx.chat?.type !== 'private') {
        db.rememberUser(ctx.from, ctx.chat.id);
      }
    } catch {}
    return next();
  });

  bot.command(['ban',   'бан'],   banUser);
  bot.command(['kick',  'кик'],   kickUser);
  bot.command(['unban', 'разбан'], unbanUser);

  // Дополнительно через hears — на случай если Telegram не распознаёт кириллицу как команду
  bot.hears(/^\/(бан)(@\w+)?(\s|$)/i,    banUser);
  bot.hears(/^\/(кик)(@\w+)?(\s|$)/i,    kickUser);
  bot.hears(/^\/(разбан)(@\w+)?(\s|$)/i, unbanUser);

  console.log('✅ Модуль removeUser подключён');
}

module.exports = { register };
