const { safeReply } = require('../safeTelegram');
const { requireChatAdmin, isOwner, isChatAdmin } = require('../access');
const { displayName, formatDuration, parseArgs } = require('../format');
const { resolveTarget, stripTargetArgs } = require('../target');

const MAX_WARNINGS = 3;
const floodMap = new Map();

function parseDuration(input, fallback = 600) {
  const match = String(input || '').match(/^(\d+)([smhd])?$/i);
  if (!match) return fallback;
  const value = Number(match[1]);
  const unit = (match[2] || 'm').toLowerCase();
  const multipliers = { s: 1, m: 60, h: 3600, d: 86400 };
  return value * (multipliers[unit] || 60);
}

async function isProtectedTarget(ctx, target) {
  if (!target?.id) return false;
  try {
    const bot = await ctx.telegram.getMe();
    if (target.id === bot.id) {
      await safeReply(ctx, 'Нельзя применять модерацию к самому боту.');
      return true;
    }
  } catch {}
  if (isOwner(ctx.app.config, target.id)) {
    await safeReply(ctx, 'Нельзя применять модерацию к владельцу бота.');
    return true;
  }
  if (await isChatAdmin(ctx, target.id)) {
    await safeReply(ctx, 'Нельзя применять это действие к администратору чата.');
    return true;
  }
  return false;
}

function reasonFromArgs(ctx) {
  const args = stripTargetArgs(parseArgs(ctx)).filter(arg => !/^\d+[smhd]?$/i.test(arg));
  return args.join(' ').trim() || 'нарушение правил';
}

function registerModeration(app) {
  const { bot, repos } = app;

  bot.command('warn', async ctx => {
    if (ctx.chat?.type === 'private') return;
    if (!(await requireChatAdmin(ctx))) return;
    const target = await resolveTarget(ctx);
    if (!target) return safeReply(ctx, 'Ответь на сообщение участника или укажи его ID/username.');
    if (await isProtectedTarget(ctx, target)) return;

    repos.moderation.upsertMember(ctx.chat.id, target);
    const result = repos.moderation.addWarning(ctx.chat.id, target.id, reasonFromArgs(ctx), ctx.from.id);
    if (result.blocked) {
      return safeReply(ctx, `${displayName(target)} защищён щитом. Варн не засчитан.`);
    }

    if (result.warnings >= MAX_WARNINGS) {
      try {
        await ctx.telegram.banChatMember(ctx.chat.id, target.id);
        repos.moderation.markAction(ctx.chat.id, target.id, 'autoban', `${MAX_WARNINGS} варна`, ctx.from.id);
        repos.moderation.clearWarnings(ctx.chat.id, target.id, ctx.from.id);
        return safeReply(ctx, `${displayName(target)} получил ${MAX_WARNINGS}/${MAX_WARNINGS} варна и был забанен.`);
      } catch (error) {
        app.logger.warn('autoban failed:', error.message);
      }
    }

    return safeReply(ctx, `${displayName(target)} получил предупреждение ${result.warnings}/${MAX_WARNINGS}.\nПричина: ${reasonFromArgs(ctx)}`);
  });

  bot.command(['warnings', 'warns'], async ctx => {
    if (ctx.chat?.type === 'private') return;
    const target = await resolveTarget(ctx, { allowSelf: true }) || ctx.from;
    const count = repos.moderation.countWarnings(ctx.chat.id, target.id);
    return safeReply(ctx, `${displayName(target)}: ${count}/${MAX_WARNINGS} варнов.`);
  });

  bot.command('clearwarns', async ctx => {
    if (ctx.chat?.type === 'private') return;
    if (!(await requireChatAdmin(ctx))) return;
    const target = await resolveTarget(ctx);
    if (!target) return safeReply(ctx, 'Ответь на сообщение участника или укажи его ID/username.');
    const result = repos.moderation.clearWarnings(ctx.chat.id, target.id, ctx.from.id);
    return safeReply(ctx, `Варны ${displayName(target)} сброшены. Снято: ${result.removed}.`);
  });

  bot.command('mute', async ctx => {
    if (ctx.chat?.type === 'private') return;
    if (!(await requireChatAdmin(ctx))) return;
    const target = await resolveTarget(ctx);
    if (!target) return safeReply(ctx, 'Ответь на сообщение участника или укажи его ID/username.');
    if (await isProtectedTarget(ctx, target)) return;

    repos.moderation.upsertMember(ctx.chat.id, target);
    const member = repos.moderation.getMember(ctx.chat.id, target.id);
    if (member?.shields?.mute) {
      repos.moderation.setShield(ctx.chat.id, target.id, 'mute', false);
      repos.moderation.markAction(ctx.chat.id, target.id, 'mute_blocked', 'Анти-мут', ctx.from.id);
      return safeReply(ctx, `${displayName(target)} защищён анти-мутом. Мут не применён.`);
    }

    const durationArg = parseArgs(ctx).find(arg => /^\d+[smhd]?$/i.test(arg));
    const duration = parseDuration(durationArg, 600);
    try {
      await ctx.telegram.restrictChatMember(ctx.chat.id, target.id, {
        permissions: { can_send_messages: false },
        until_date: Math.floor(Date.now() / 1000) + duration,
      });
      repos.moderation.markAction(ctx.chat.id, target.id, 'mute', formatDuration(duration), ctx.from.id);
      return safeReply(ctx, `${displayName(target)} замучен на ${formatDuration(duration)}.`);
    } catch (error) {
      app.logger.warn('mute failed:', error.message);
      return safeReply(ctx, 'Не удалось замутить. Проверь права бота.');
    }
  });

  bot.command('unmute', async ctx => {
    if (ctx.chat?.type === 'private') return;
    if (!(await requireChatAdmin(ctx))) return;
    const target = await resolveTarget(ctx);
    if (!target) return safeReply(ctx, 'Ответь на сообщение участника или укажи его ID/username.');
    try {
      await ctx.telegram.restrictChatMember(ctx.chat.id, target.id, {
        permissions: {
          can_send_messages: true,
          can_send_audios: true,
          can_send_documents: true,
          can_send_photos: true,
          can_send_videos: true,
          can_send_video_notes: true,
          can_send_voice_notes: true,
          can_send_polls: true,
          can_send_other_messages: true,
          can_add_web_page_previews: true,
        },
      });
      repos.moderation.markAction(ctx.chat.id, target.id, 'unmute', null, ctx.from.id);
      return safeReply(ctx, `Мут снят с ${displayName(target)}.`);
    } catch (error) {
      app.logger.warn('unmute failed:', error.message);
      return safeReply(ctx, 'Не удалось снять мут.');
    }
  });

  bot.command('ban', async ctx => {
    if (ctx.chat?.type === 'private') return;
    if (!(await requireChatAdmin(ctx))) return;
    const target = await resolveTarget(ctx);
    if (!target) return safeReply(ctx, 'Ответь на сообщение участника или укажи его ID/username.');
    if (await isProtectedTarget(ctx, target)) return;
    try {
      await ctx.telegram.banChatMember(ctx.chat.id, target.id);
      repos.moderation.markAction(ctx.chat.id, target.id, 'ban', reasonFromArgs(ctx), ctx.from.id);
      return safeReply(ctx, `${displayName(target)} забанен.`);
    } catch (error) {
      app.logger.warn('ban failed:', error.message);
      return safeReply(ctx, 'Не удалось забанить. Проверь права бота.');
    }
  });

  bot.command('unban', async ctx => {
    if (ctx.chat?.type === 'private') return;
    if (!(await requireChatAdmin(ctx))) return;
    const target = await resolveTarget(ctx);
    if (!target) return safeReply(ctx, 'Укажи ID/username участника.');
    try {
      await ctx.telegram.unbanChatMember(ctx.chat.id, target.id);
      repos.moderation.markAction(ctx.chat.id, target.id, 'unban', null, ctx.from.id);
      return safeReply(ctx, `${displayName(target)} разбанен.`);
    } catch (error) {
      app.logger.warn('unban failed:', error.message);
      return safeReply(ctx, 'Не удалось разбанить.');
    }
  });

  bot.command('kick', async ctx => {
    if (ctx.chat?.type === 'private') return;
    if (!(await requireChatAdmin(ctx))) return;
    const target = await resolveTarget(ctx);
    if (!target) return safeReply(ctx, 'Ответь на сообщение участника или укажи его ID/username.');
    if (await isProtectedTarget(ctx, target)) return;
    try {
      await ctx.telegram.banChatMember(ctx.chat.id, target.id);
      await ctx.telegram.unbanChatMember(ctx.chat.id, target.id);
      repos.moderation.markAction(ctx.chat.id, target.id, 'kick', reasonFromArgs(ctx), ctx.from.id);
      return safeReply(ctx, `${displayName(target)} кикнут из чата.`);
    } catch (error) {
      app.logger.warn('kick failed:', error.message);
      return safeReply(ctx, 'Не удалось кикнуть. Проверь права бота.');
    }
  });

  bot.command('del', async ctx => {
    if (ctx.chat?.type === 'private') return;
    if (!(await requireChatAdmin(ctx))) return;
    try { await ctx.deleteMessage(); } catch {}
    if (ctx.message?.reply_to_message) {
      try { await ctx.telegram.deleteMessage(ctx.chat.id, ctx.message.reply_to_message.message_id); } catch {}
    }
  });

  bot.command('modlog', async ctx => {
    if (ctx.chat?.type === 'private') return;
    if (!(await requireChatAdmin(ctx))) return;
    const rows = repos.moderation.latestLogs(ctx.chat.id, 10);
    if (!rows.length) return safeReply(ctx, 'Лог модерации пуст.');
    const lines = rows.map(row => `${row.createdAt.slice(0, 16)} · ${row.action} · ${row.telegramId || '-'}${row.reason ? ` · ${row.reason}` : ''}`);
    return safeReply(ctx, `<b>Последние действия</b>\n\n${lines.join('\n')}`, { parse_mode: 'HTML' });
  });

  bot.on('message', async (ctx, next) => {
    if (!ctx.from || !ctx.chat || ctx.chat.type === 'private') return next();
    if (await isChatAdmin(ctx, ctx.from.id)) return next();

    const key = `${ctx.chat.id}:${ctx.from.id}`;
    const now = Date.now();
    const windowMs = 5000;
    const timestamps = (floodMap.get(key) || []).filter(value => now - value < windowMs);
    timestamps.push(now);
    floodMap.set(key, timestamps);

    if (timestamps.length > 6) {
      try {
        await ctx.telegram.restrictChatMember(ctx.chat.id, ctx.from.id, {
          permissions: { can_send_messages: false },
          until_date: Math.floor(Date.now() / 1000) + 60,
        });
        repos.moderation.markAction(ctx.chat.id, ctx.from.id, 'antiflood_mute', '60 сек.', null);
        floodMap.delete(key);
        await safeReply(ctx, `${displayName(ctx.from)} замучен на 60 сек. за флуд.`);
        return;
      } catch (error) {
        app.logger.warn('antiflood failed:', error.message);
      }
    }

    return next();
  });
}

module.exports = {
  registerModeration,
  parseDuration,
};
