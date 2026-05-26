// ============================================================
// src/moderation.js
// Модерация: мут, бан, кик, предупреждения, антифлуд.
// ВАЖНО: перед любым наказанием идёт проверка isUserAdmin.
// ============================================================

const db = require('./db');
const { isUserAdmin, isBotAdmin, isProtected, formatName, formatNameLink, formatDuration, deleteAfter } = require('./utils');

// ── Антифлуд: хранит timestamp последних сообщений ───────────
// Map<chatId_userId, number[]>
const floodMap = new Map();
const FLOOD_LIMIT   = 5;   // сообщений
const FLOOD_WINDOW  = 5;   // секунд
const FLOOD_MUTE    = 60;  // секунд мута за флуд

// ── Лимит предупреждений ──────────────────────────────────────
const MAX_WARNINGS = 3;

// ─────────────────────────────────────────────────────────────
// Вспомогательные функции DB
// ─────────────────────────────────────────────────────────────

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

function addWarning(userId, chatId, reason, issuedBy) {
  db.prepare(
    'INSERT INTO warnings (user_id, chat_id, reason, issued_by) VALUES (?, ?, ?, ?)'
  ).run(userId, chatId, reason || 'нарушение правил', issuedBy);

  db.prepare(
    'UPDATE users SET warnings = warnings + 1 WHERE id = ? AND chat_id = ?'
  ).run(userId, chatId);

  const row = db.prepare(
    'SELECT warnings FROM users WHERE id = ? AND chat_id = ?'
  ).get(userId, chatId);

  return row ? row.warnings : 1;
}

function getWarnings(userId, chatId) {
  const row = db.prepare(
    'SELECT warnings FROM users WHERE id = ? AND chat_id = ?'
  ).get(userId, chatId);
  return row ? row.warnings : 0;
}

function resetWarnings(userId, chatId) {
  db.prepare(
    'UPDATE users SET warnings = 0 WHERE id = ? AND chat_id = ?'
  ).run(userId, chatId);
  db.prepare(
    'DELETE FROM warnings WHERE user_id = ? AND chat_id = ?'
  ).run(userId, chatId);
}

function logAction(chatId, userId, action, reason, byUserId) {
  db.prepare(
    'INSERT INTO mod_log (chat_id, user_id, action, reason, by_user_id) VALUES (?, ?, ?, ?, ?)'
  ).run(chatId, userId, action, reason || null, byUserId || null);
}

// ─────────────────────────────────────────────────────────────
// Получить цель команды (реплай или @username/ID в аргументе)
// ─────────────────────────────────────────────────────────────
async function resolveTarget(ctx) {
  // 1. Реплай на сообщение
  if (ctx.message.reply_to_message) {
    return ctx.message.reply_to_message.from;
  }

  // 2. Аргумент: @username или числовой ID
  const args = ctx.message.text.split(' ').slice(1);
  if (args.length > 0) {
    const arg = args[0];
    try {
      const member = arg.startsWith('@')
        ? await ctx.telegram.getChatMember(ctx.chat.id, arg)
        : await ctx.telegram.getChatMember(ctx.chat.id, parseInt(arg));
      return member.user;
    } catch {
      return null;
    }
  }

  return null;
}

// ─────────────────────────────────────────────────────────────
// Парсить длительность из строки: "10m", "1h", "2d"
// ─────────────────────────────────────────────────────────────
function parseDuration(str) {
  if (!str) return null;
  const match = str.match(/^(\d+)([smhd]?)$/i);
  if (!match) return null;
  const val = parseInt(match[1]);
  const unit = (match[2] || 'm').toLowerCase();
  const multipliers = { s: 1, m: 60, h: 3600, d: 86400 };
  return val * (multipliers[unit] || 60);
}

// ─────────────────────────────────────────────────────────────
// Регистрация всех команд модерации
// ─────────────────────────────────────────────────────────────
function register(bot) {

  // ── /mute [@user|reply] [duration] [reason] ──────────────────
  bot.command(['mute', 'мут'], async (ctx) => {
    if (ctx.chat.type === 'private') return;

    // Проверяем права вызывающего
    if (!await isUserAdmin(ctx, ctx.from.id)) {
      return ctx.reply('⛔ Только администраторы могут мутить участников.');
    }

    const target = await resolveTarget(ctx);
    if (!target) {
      return ctx.reply('⚠️ Укажи пользователя — ответь на его сообщение или напиши @username.');
    }

    // *** ЗАЩИТА: администраторы, владелец чата, владелец бота ***
    const guard = await isProtected(ctx, target.id);
    if (guard.protected) return ctx.reply(guard.reason);

    // Парсим аргументы: /mute [@user] [10m] [причина]
    const args = ctx.message.text.split(' ').slice(1);
    const durStr   = args.find(a => /^\d+[smhd]?$/i.test(a)) || '10m';
    const duration = parseDuration(durStr) || 600;
    const until    = Math.floor(Date.now() / 1000) + duration;

    try {
      await ctx.telegram.restrictChatMember(ctx.chat.id, target.id, {
        permissions: { can_send_messages: false },
        until_date: until,
      });

      upsertUser(target, ctx.chat.id);
      logAction(ctx.chat.id, target.id, 'mute', `${formatDuration(duration)}`, ctx.from.id);

      await ctx.reply(
        `🔇 <b>${formatName(target)}</b> замучен на <b>${formatDuration(duration)}</b>.`,
        { parse_mode: 'HTML' }
      );
    } catch (err) {
      console.error('[mute]', err.message);
      await ctx.reply('❌ Не удалось замутить. Убедись, что у бота есть права администратора.');
    }
  });

  // ── /unmute [@user|reply] ─────────────────────────────────────
  bot.command(['unmute', 'размут'], async (ctx) => {
    if (ctx.chat.type === 'private') return;
    if (!await isUserAdmin(ctx, ctx.from.id)) {
      return ctx.reply('⛔ Только администраторы могут снимать мут.');
    }

    const target = await resolveTarget(ctx);
    if (!target) return ctx.reply('⚠️ Укажи пользователя.');

    try {
      await ctx.telegram.restrictChatMember(ctx.chat.id, target.id, {
        permissions: {
          can_send_messages: true,
          can_send_media_messages: true,
          can_send_polls: true,
          can_send_other_messages: true,
          can_add_web_page_previews: true,
        },
      });

      logAction(ctx.chat.id, target.id, 'unmute', null, ctx.from.id);
      await ctx.reply(`🔊 Мут снят с <b>${formatName(target)}</b>.`, { parse_mode: 'HTML' });
    } catch (err) {
      console.error('[unmute]', err.message);
      await ctx.reply('❌ Не удалось снять мут.');
    }
  });

  // ── /ban [@user|reply] [reason] ──────────────────────────────
  bot.command(['ban', 'бан'], async (ctx) => {
    if (ctx.chat.type === 'private') return;
    if (!await isUserAdmin(ctx, ctx.from.id)) {
      return ctx.reply('⛔ Только администраторы могут банить.');
    }

    const target = await resolveTarget(ctx);
    if (!target) return ctx.reply('⚠️ Укажи пользователя.');

    // *** ЗАЩИТА: администраторы, владелец чата, владелец бота ***
    const guard = await isProtected(ctx, target.id);
    if (guard.protected) return ctx.reply(guard.reason);

    try {
      await ctx.telegram.banChatMember(ctx.chat.id, target.id);
      upsertUser(target, ctx.chat.id);
      logAction(ctx.chat.id, target.id, 'ban', null, ctx.from.id);
      await ctx.reply(`🔨 <b>${formatName(target)}</b> забанен.`, { parse_mode: 'HTML' });
    } catch (err) {
      console.error('[ban]', err.message);
      await ctx.reply('❌ Не удалось забанить. Проверь права бота.');
    }
  });

  // ── /unban [@user|reply] ──────────────────────────────────────
  bot.command(['unban', 'разбан'], async (ctx) => {
    if (ctx.chat.type === 'private') return;
    if (!await isUserAdmin(ctx, ctx.from.id)) {
      return ctx.reply('⛔ Только администраторы могут разбанивать.');
    }

    const target = await resolveTarget(ctx);
    if (!target) return ctx.reply('⚠️ Укажи пользователя.');

    try {
      await ctx.telegram.unbanChatMember(ctx.chat.id, target.id);
      logAction(ctx.chat.id, target.id, 'unban', null, ctx.from.id);
      await ctx.reply(`✅ <b>${formatName(target)}</b> разбанен.`, { parse_mode: 'HTML' });
    } catch (err) {
      console.error('[unban]', err.message);
      await ctx.reply('❌ Не удалось разбанить.');
    }
  });

  // ── /kick [@user|reply] ───────────────────────────────────────
  bot.command(['kick', 'кик'], async (ctx) => {
    if (ctx.chat.type === 'private') return;
    if (!await isUserAdmin(ctx, ctx.from.id)) {
      return ctx.reply('⛔ Только администраторы могут кикать.');
    }

    const target = await resolveTarget(ctx);
    if (!target) return ctx.reply('⚠️ Укажи пользователя.');

    // *** ЗАЩИТА: администраторы, владелец чата, владелец бота ***
    const guard = await isProtected(ctx, target.id);
    if (guard.protected) return ctx.reply(guard.reason);

    try {
      // Кик = бан + немедленный разбан
      await ctx.telegram.banChatMember(ctx.chat.id, target.id);
      await ctx.telegram.unbanChatMember(ctx.chat.id, target.id);
      logAction(ctx.chat.id, target.id, 'kick', null, ctx.from.id);
      await ctx.reply(`👢 <b>${formatName(target)}</b> выгнан из чата.`, { parse_mode: 'HTML' });
    } catch (err) {
      console.error('[kick]', err.message);
      await ctx.reply('❌ Не удалось кикнуть. Проверь права бота.');
    }
  });

  // ── /warn [@user|reply] [reason] ─────────────────────────────
  bot.command(['warn', 'варн', 'предупреждение'], async (ctx) => {
    if (ctx.chat.type === 'private') return;
    if (!await isUserAdmin(ctx, ctx.from.id)) {
      return ctx.reply('⛔ Только администраторы могут выдавать предупреждения.');
    }

    const target = await resolveTarget(ctx);
    if (!target) return ctx.reply('⚠️ Укажи пользователя.');

    // *** ЗАЩИТА: администраторы, владелец чата, владелец бота ***
    const guard = await isProtected(ctx, target.id);
    if (guard.protected) return ctx.reply(guard.reason);

    const args   = ctx.message.text.split(' ').slice(1);
    const reason = args.filter(a => !a.startsWith('@')).join(' ') || 'нарушение правил';

    upsertUser(target, ctx.chat.id);
    const count = addWarning(target.id, ctx.chat.id, reason, ctx.from.id);

    if (count >= MAX_WARNINGS) {
      // Автобан при достижении лимита
      try {
        await ctx.telegram.banChatMember(ctx.chat.id, target.id);
        resetWarnings(target.id, ctx.chat.id);
        logAction(ctx.chat.id, target.id, 'autoban', `${MAX_WARNINGS} предупреждений`, ctx.from.id);
        return ctx.reply(
          `🔨 <b>${formatName(target)}</b> получил ${count}/${MAX_WARNINGS} предупреждений и автоматически забанен.\n📌 Причина: ${reason}`,
          { parse_mode: 'HTML' }
        );
      } catch { /* если не смогли забанить — сообщаем */ }
    }

    logAction(ctx.chat.id, target.id, 'warn', reason, ctx.from.id);
    await ctx.reply(
      `⚠️ <b>${formatName(target)}</b> получает предупреждение ${count}/${MAX_WARNINGS}.\n📌 Причина: ${reason}`,
      { parse_mode: 'HTML' }
    );
  });

  // ── /warnings [@user|reply] ───────────────────────────────────
  bot.command(['warnings', 'варны'], async (ctx) => {
    if (ctx.chat.type === 'private') return;

    const target = await resolveTarget(ctx) || ctx.from;
    upsertUser(target, ctx.chat.id);
    const count = getWarnings(target.id, ctx.chat.id);

    await ctx.reply(
      `📋 <b>${formatName(target)}</b> — предупреждений: <b>${count}/${MAX_WARNINGS}</b>`,
      { parse_mode: 'HTML' }
    );
  });

  // ── /clearwarns [@user|reply] ─────────────────────────────────
  bot.command(['clearwarns', 'сброс'], async (ctx) => {
    if (ctx.chat.type === 'private') return;
    if (!await isUserAdmin(ctx, ctx.from.id)) {
      return ctx.reply('⛔ Только администраторы могут сбрасывать предупреждения.');
    }

    const target = await resolveTarget(ctx);
    if (!target) return ctx.reply('⚠️ Укажи пользователя.');

    resetWarnings(target.id, ctx.chat.id);
    logAction(ctx.chat.id, target.id, 'clearwarns', null, ctx.from.id);
    await ctx.reply(`✅ Предупреждения <b>${formatName(target)}</b> сброшены.`, { parse_mode: 'HTML' });
  });

  // ── /del — удалить сообщение (реплай) ────────────────────────
  bot.command('del', async (ctx) => {
    if (ctx.chat.type === 'private') return;
    if (!await isUserAdmin(ctx, ctx.from.id)) return;

    // Удаляем команду
    try { await ctx.deleteMessage(); } catch {}

    if (!ctx.message.reply_to_message) return;

    try {
      await ctx.telegram.deleteMessage(ctx.chat.id, ctx.message.reply_to_message.message_id);
    } catch (err) {
      console.error('[del]', err.message);
    }
  });

  // ── /modlog — последние действия ─────────────────────────────
  bot.command('modlog', async (ctx) => {
    if (ctx.chat.type === 'private') return;
    if (!await isUserAdmin(ctx, ctx.from.id)) return;

    const rows = db.prepare(
      'SELECT * FROM mod_log WHERE chat_id = ? ORDER BY created_at DESC LIMIT 10'
    ).all(ctx.chat.id);

    if (!rows.length) return ctx.reply('📋 Лог действий пуст.');

    const lines = rows.map(r =>
      `• <b>${r.action}</b> — user ${r.user_id}${r.reason ? ` (${r.reason})` : ''} — ${r.created_at.slice(0, 16)}`
    );

    await ctx.reply(`📋 <b>Последние действия:</b>\n\n${lines.join('\n')}`, { parse_mode: 'HTML' });
  });

  // ── Антифлуд middleware ───────────────────────────────────────
  bot.on('message', async (ctx, next) => {
    // Только группы
    if (ctx.chat.type === 'private') return next();

    const userId = ctx.from?.id;
    const chatId = ctx.chat?.id;
    if (!userId || !chatId) return next();

    // Не трогаем администраторов
    if (await isUserAdmin(ctx, userId)) return next();

    const key = `${chatId}_${userId}`;
    const now = Date.now();
    const window = FLOOD_WINDOW * 1000;

    const timestamps = (floodMap.get(key) || []).filter(t => now - t < window);
    timestamps.push(now);
    floodMap.set(key, timestamps);

    if (timestamps.length > FLOOD_LIMIT) {
      // Флуд — мутим
      try {
        await ctx.telegram.restrictChatMember(chatId, userId, {
          permissions: { can_send_messages: false },
          until_date: Math.floor(Date.now() / 1000) + FLOOD_MUTE,
        });

        floodMap.delete(key);
        logAction(chatId, userId, 'mute_flood', `Антифлуд ${FLOOD_MUTE}с`, null);

        const msg = await ctx.reply(
          `⚠️ ${formatNameLink(ctx.from)} замучен на ${formatDuration(FLOOD_MUTE)} за флуд.`,
          { parse_mode: 'HTML' }
        );
        // Удалить уведомление через 15 секунд
        deleteAfter(ctx, msg.message_id, 15000);
      } catch (err) {
        console.error('[antiflood]', err.message);
      }
      return; // не передаём дальше
    }

    return next();
  });

  console.log('✅ Модуль moderation подключён');
}

module.exports = { register };
