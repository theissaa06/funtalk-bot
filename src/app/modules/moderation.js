const { Markup } = require('telegraf');
const { safeEditOrReply, safeReply } = require('../safeTelegram');
const { requireChatAdmin, isOwner, isChatAdmin } = require('../access');
const { displayName, formatDuration, parseArgs } = require('../format');
const { resolveTarget, stripTargetArgs } = require('../target');

const MAX_WARNINGS = 3;
const floodMap = new Map();
const DURATION_PRESETS = [
  { label: '5м', seconds: 5 * 60 },
  { label: '10м', seconds: 10 * 60 },
  { label: '1ч', seconds: 60 * 60 },
  { label: '1д', seconds: 24 * 60 * 60 },
  { label: '1н', seconds: 7 * 24 * 60 * 60 },
];

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

function moderationCommand(ctx) {
  return String(ctx.message?.text || '').match(/^\/([a-z_]+)/i)?.[1]?.toLowerCase() || '';
}

function durationArg(ctx) {
  return parseArgs(ctx).find(arg => /^\d+[smhd]?$/i.test(arg));
}

function durationKeyboard(kind, targetId) {
  return Markup.inlineKeyboard([
    DURATION_PRESETS.slice(0, 3).map(item => Markup.button.callback(item.label, `mod:time:${kind}:${targetId}:${item.seconds}`)),
    DURATION_PRESETS.slice(3).map(item => Markup.button.callback(item.label, `mod:time:${kind}:${targetId}:${item.seconds}`)),
    [Markup.button.callback('Отмена', 'menu:home')],
  ]);
}

function slowmodeKeyboard() {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback('0с', 'mod:slowmode:0'),
      Markup.button.callback('10с', 'mod:slowmode:10'),
      Markup.button.callback('30с', 'mod:slowmode:30'),
    ],
    [
      Markup.button.callback('1м', 'mod:slowmode:60'),
      Markup.button.callback('5м', 'mod:slowmode:300'),
    ],
    [Markup.button.callback('Меню', 'menu:home')],
  ]);
}

function targetFromMember(app, chatId, telegramId) {
  const member = app.repos.moderation.getMember(chatId, telegramId);
  return {
    id: Number(telegramId),
    username: member?.username || null,
    first_name: member?.firstName || `ID ${telegramId}`,
    last_name: member?.lastName || null,
    is_bot: false,
  };
}

async function applyMute(ctx, target, duration) {
  try {
    await ctx.telegram.restrictChatMember(ctx.chat.id, target.id, {
      permissions: { can_send_messages: false },
      until_date: Math.floor(Date.now() / 1000) + duration,
    });
    ctx.app.repos.moderation.markAction(ctx.chat.id, target.id, 'mute', formatDuration(duration), ctx.from.id);
    return safeEditOrReply(ctx, `${displayName(target)} замучен на ${formatDuration(duration)}.`);
  } catch (error) {
    ctx.app.logger.warn('mute failed:', error.message);
    return safeEditOrReply(ctx, 'Не удалось замутить. Проверь права бота.');
  }
}

async function applyTempBan(ctx, target, duration) {
  try {
    await ctx.telegram.banChatMember(ctx.chat.id, target.id, {
      until_date: Math.floor(Date.now() / 1000) + duration,
    });
    ctx.app.repos.moderation.markAction(ctx.chat.id, target.id, 'tban', formatDuration(duration), ctx.from.id);
    return safeEditOrReply(ctx, `${displayName(target)} временно забанен на ${formatDuration(duration)}.`);
  } catch (error) {
    ctx.app.logger.warn('temp ban failed:', error.message);
    return safeEditOrReply(ctx, 'Не удалось временно забанить. Проверь права бота.');
  }
}

function registerModeration(app) {
  const { bot, repos, callbackRouter } = app;

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
    const warnings = repos.moderation.listWarnings(ctx.chat.id, target.id, 10);
    if (!warnings.length) return safeReply(ctx, `${displayName(target)}: 0/${MAX_WARNINGS} варнов.`);
    const lines = warnings.map(warning => {
      const date = String(warning.createdAt || '').slice(0, 16);
      return `${date} — ${warning.reason || 'нарушение правил'}`;
    });
    return safeReply(ctx, `<b>${displayName(target)}: ${count}/${MAX_WARNINGS} варнов</b>\n\n${lines.join('\n')}`, { parse_mode: 'HTML' });
  });

  bot.command('unwarn', async ctx => {
    if (ctx.chat?.type === 'private') return;
    if (!(await requireChatAdmin(ctx))) return;
    const target = await resolveTarget(ctx);
    if (!target) return safeReply(ctx, 'Ответь на сообщение участника или укажи его ID/username.');
    const result = repos.moderation.removeWarning(ctx.chat.id, target.id, 1, ctx.from.id);
    if (!result.removed) return safeReply(ctx, `У ${displayName(target)} нет активных варнов.`);
    return safeReply(ctx, `Снят последний варн с ${displayName(target)}. Осталось: ${result.warnings}/${MAX_WARNINGS}.`);
  });

  bot.command('clearwarns', async ctx => {
    if (ctx.chat?.type === 'private') return;
    if (!(await requireChatAdmin(ctx))) return;
    const target = await resolveTarget(ctx);
    if (!target) return safeReply(ctx, 'Ответь на сообщение участника или укажи его ID/username.');
    const result = repos.moderation.clearWarnings(ctx.chat.id, target.id, ctx.from.id);
    return safeReply(ctx, `Варны ${displayName(target)} сброшены. Снято: ${result.removed}.`);
  });

  bot.command(['mute', 'tmute'], async ctx => {
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

    const rawDuration = durationArg(ctx);
    if (!rawDuration && moderationCommand(ctx) === 'tmute') {
      return safeReply(ctx, `Выбери длительность мута для ${displayName(target)}:`, durationKeyboard('tmute', target.id));
    }
    return applyMute(ctx, target, parseDuration(rawDuration, 600));
  });

  bot.command('tban', async ctx => {
    if (ctx.chat?.type === 'private') return;
    if (!(await requireChatAdmin(ctx))) return;
    const target = await resolveTarget(ctx);
    if (!target) return safeReply(ctx, 'Ответь на сообщение участника или укажи его ID/username.');
    if (await isProtectedTarget(ctx, target)) return;
    repos.moderation.upsertMember(ctx.chat.id, target);
    const rawDuration = durationArg(ctx);
    if (!rawDuration) {
      return safeReply(ctx, `Выбери длительность бана для ${displayName(target)}:`, durationKeyboard('tban', target.id));
    }
    return applyTempBan(ctx, target, parseDuration(rawDuration, 600));
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

  bot.command('slowmode', async ctx => {
    if (ctx.chat?.type === 'private') return;
    if (!(await requireChatAdmin(ctx))) return;
    const seconds = Number(parseArgs(ctx)[0]);
    if (!Number.isInteger(seconds) || seconds < 0 || seconds > 3600) {
      return safeReply(ctx, 'Выбери задержку slowmode:', slowmodeKeyboard());
    }
    try {
      await ctx.telegram.setChatSlowModeDelay(ctx.chat.id, seconds);
      repos.moderation.markAction(ctx.chat.id, null, 'slowmode', `${seconds} сек.`, ctx.from.id);
      return safeReply(ctx, `Slowmode установлен: ${seconds} сек.`);
    } catch (error) {
      app.logger.warn('slowmode failed:', error.message);
      return safeReply(ctx, 'Не удалось изменить slowmode. Проверь права бота.');
    }
  });

  callbackRouter.on('mod', async (ctx, route) => {
    if (ctx.chat?.type === 'private') return;
    if (!(await requireChatAdmin(ctx))) return;
    if (route.action === 'time') {
      const [kind, targetIdRaw, secondsRaw] = route.args;
      const targetId = Number(targetIdRaw);
      const seconds = Number(secondsRaw);
      if (!Number.isInteger(targetId) || !Number.isInteger(seconds) || seconds <= 0) {
        return safeEditOrReply(ctx, 'Некорректный выбор времени.');
      }
      const target = targetFromMember(app, ctx.chat.id, targetId);
      if (await isProtectedTarget(ctx, target)) return;
      if (kind === 'tmute') return applyMute(ctx, target, seconds);
      if (kind === 'tban') return applyTempBan(ctx, target, seconds);
      return safeEditOrReply(ctx, 'Неизвестное действие модерации.');
    }
    if (route.action === 'slowmode') {
      const seconds = Number(route.args[0]);
      if (!Number.isInteger(seconds) || seconds < 0 || seconds > 3600) {
        return safeEditOrReply(ctx, 'Некорректный slowmode.');
      }
      try {
        await ctx.telegram.setChatSlowModeDelay(ctx.chat.id, seconds);
        repos.moderation.markAction(ctx.chat.id, null, 'slowmode', `${seconds} сек.`, ctx.from.id);
        return safeEditOrReply(ctx, `Slowmode установлен: ${seconds} сек.`);
      } catch (error) {
        app.logger.warn('slowmode failed:', error.message);
        return safeEditOrReply(ctx, 'Не удалось изменить slowmode. Проверь права бота.');
      }
    }
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
