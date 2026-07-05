const { Markup } = require('telegraf');
const { safeEditOrReply, safeReply } = require('../safeTelegram');
const { escapeHtml } = require('../format');
const { requireOwner } = require('../access');

const SUPPORT_RATE_LIMIT_COUNT = 3;
const SUPPORT_RATE_LIMIT_WINDOW_MS = 30 * 60 * 1000;

function supportText(app) {
  const destination = supportDestination(app);
  const hint = destination
    ? 'Нажми «Написать обращение», затем отправь одним сообщением вопрос или описание проблемы.'
    : 'Поддержка пока принимает обращения в историю бота, но SUPPORT_CHAT_ID/OWNER_ID для пересылки не настроен.';
  return `<b>Поддержка</b>\n\n${hint}`;
}

function supportKeyboard(app) {
  const rows = [];
  rows.push([Markup.button.callback('Написать обращение', 'support:write')]);
  const actions = [Markup.button.callback('Мои обращения', 'support:mine')];
  if (app.config.supportInboxBotUsername) {
    actions.push(Markup.button.url('Внешний inbox', `https://t.me/${app.config.supportInboxBotUsername}`));
  }
  rows.push(actions);
  rows.push([Markup.button.callback('Меню', 'menu:home')]);
  return Markup.inlineKeyboard(rows);
}

function mySupportText(app, telegramId) {
  const tickets = app.repos.support.listByTelegramId(telegramId, 5);
  if (!tickets.length) return '<b>Мои обращения</b>\n\nУ тебя пока нет обращений.';
  const lines = tickets.map(ticket => {
    const status = ticket.status === 'closed' ? 'отвечено' : 'открыто';
    return `#${ticket.id} · ${status} · ${ticket.createdAt.slice(0, 16)}\n${escapeHtml(ticket.text).slice(0, 180)}`;
  });
  return `<b>Мои обращения</b>\n\n${lines.join('\n\n')}`;
}

function supportDestination(app) {
  const storedChatId = app.repos.settings.getSupportChatId();
  if (storedChatId) return storedChatId;
  if (app.config.supportChatId) return app.config.supportChatId;
  return app.config.ownerIds[0] || null;
}

function supportDestinationSource(app) {
  const stored = app.repos.settings.getSupportChat();
  if (stored?.chatId) return { source: 'stored', chatId: stored.chatId, title: stored.title };
  if (app.config.supportChatId) return { source: 'env', chatId: app.config.supportChatId, title: null };
  const ownerId = app.config.ownerIds[0] || null;
  return ownerId ? { source: 'owner', chatId: ownerId, title: null } : null;
}

async function forwardTicketToSupport(app, ticket) {
  const destination = supportDestination(app);
  if (!destination) return null;

  const from = ticket.username ? `@${ticket.username}` : `ID ${ticket.telegramId}`;
  const text = [
    `<b>Новое обращение #${ticket.id}</b>`,
    '',
    `От: ${escapeHtml(from)}`,
    `User ID: <code>${ticket.telegramId}</code>`,
    ticket.sourceChatId ? `Источник: <code>${ticket.sourceChatId}</code>` : null,
    '',
    escapeHtml(ticket.text),
    '',
    'Ответь реплаем на это сообщение, и Somnia отправит ответ пользователю.',
  ].filter(Boolean).join('\n');

  try {
    const relayBot = app.supportInboxBot || app.bot;
    const sent = await relayBot.telegram.sendMessage(destination, text, { parse_mode: 'HTML' });
    app.repos.support.bindForwardedMessage(ticket.id, destination, sent.message_id);
    return sent;
  } catch (error) {
    app.logger.warn('support forward failed:', error.message);
    return null;
  }
}

async function createSupportTicket(ctx, text) {
  const trimmed = String(text || '').trim();
  if (!trimmed) {
    await safeReply(ctx, 'Сообщение пустое. Напиши вопрос одним текстом или отправь /cancel.');
    return;
  }
  if (trimmed.length > 3000) {
    await safeReply(ctx, 'Сообщение слишком длинное. Сократи его до 3000 символов и отправь ещё раз.');
    return;
  }

  const recentTickets = ctx.app.repos.support.countRecentByTelegramId(ctx.from.id, SUPPORT_RATE_LIMIT_WINDOW_MS);
  if (recentTickets >= SUPPORT_RATE_LIMIT_COUNT) {
    ctx.app.repos.users.setSupportMode(ctx.from.id, false);
    await safeReply(ctx, 'Слишком много обращений за короткое время. Попробуй ещё раз позже.');
    return;
  }

  const ticket = ctx.app.repos.support.createTicket(ctx.from, ctx.chat?.id, trimmed);
  ctx.app.repos.users.setSupportMode(ctx.from.id, false);
  const forwarded = await forwardTicketToSupport(ctx.app, ticket);
  const suffix = forwarded
    ? 'Я передал его разработчику. Ответ придёт сюда.'
    : 'Я сохранил его, но сейчас не смог переслать разработчику. Он останется в истории обращений.';
  await safeReply(ctx, `Обращение #${ticket.id} создано. ${suffix}`);
}

async function beginSupportFlow(ctx, useEdit = false) {
  ctx.app.repos.users.setSupportMode(ctx.from.id, true);
  const text = 'Напишите ваше сообщение, я передам его разработчику.\n\nЧтобы отменить, отправьте /cancel.';
  const sender = useEdit ? safeEditOrReply : safeReply;
  return sender(ctx, text, { parse_mode: 'HTML' });
}

function registerSupport(app) {
  const { bot, callbackRouter } = app;

  app.renderers.support = async ctx => {
    await safeEditOrReply(ctx, supportText(app), { parse_mode: 'HTML', ...supportKeyboard(app) });
  };

  bot.command('support', async ctx => {
    await beginSupportFlow(ctx);
  });

  bot.command('mysupport', async ctx => {
    await safeReply(ctx, mySupportText(app, ctx.from.id), { parse_mode: 'HTML', ...supportKeyboard(app) });
  });

  bot.command('setsupport', async ctx => {
    if (!(await requireOwner(ctx))) return;
    if (!ctx.chat || ctx.chat.type === 'private') {
      await safeReply(ctx, 'Добавь бота в нужную Support-группу и напиши /setsupport там.');
      return;
    }

    const saved = app.repos.settings.setSupportChat(ctx.chat, ctx.from.id);
    await safeReply(ctx, [
      '<b>Support-чат сохранён</b>',
      '',
      `Теперь обращения будут уходить сюда: <code>${saved.chatId}</code>`,
      saved.title ? `Название: ${escapeHtml(saved.title)}` : null,
      '',
      'Railway менять не нужно. Если захочешь сменить чат, напиши /setsupport в новой группе.',
    ].filter(Boolean).join('\n'), { parse_mode: 'HTML' });
  });

  bot.command('supportstatus', async ctx => {
    if (!(await requireOwner(ctx))) return;
    const destination = supportDestinationSource(app);
    if (!destination) {
      await safeReply(ctx, 'Support-чат не настроен.');
      return;
    }
    await safeReply(ctx, [
      '<b>Текущий Support destination</b>',
      '',
      `ID: <code>${destination.chatId}</code>`,
      destination.title ? `Название: ${escapeHtml(destination.title)}` : null,
      `Источник: <code>${destination.source}</code>`,
    ].filter(Boolean).join('\n'), { parse_mode: 'HTML' });
  });

  bot.command('cancel', async ctx => {
    const user = app.repos.users.getByTelegramId(ctx.from.id);
    if (!user?.supportMode) return;
    app.repos.users.setSupportMode(ctx.from.id, false);
    await safeReply(ctx, 'Ок, обращение отменено.');
  });

  bot.on('text', async (ctx, next) => {
    const replyMessageId = ctx.message?.reply_to_message?.message_id;
    if (replyMessageId && app.config.ownerIds.includes(Number(ctx.from?.id))) {
      const ticket = app.repos.support.findBySupportReply(ctx.chat?.id, replyMessageId);
      if (ticket) {
        try {
          await ctx.telegram.sendMessage(ticket.telegramId, `<b>Ответ по обращению #${ticket.id}</b>\n\n${escapeHtml(ctx.message.text)}`, { parse_mode: 'HTML' });
          app.repos.support.close(ticket.id);
          await safeReply(ctx, `Ответ по обращению #${ticket.id} отправлен.`);
        } catch (error) {
          app.logger.warn('support reply delivery failed:', error.message);
          await safeReply(ctx, 'Не удалось доставить ответ пользователю. Проверь, что он запускал бота в личке.');
        }
        return;
      }
    }

    const text = ctx.message?.text || '';
    if (text.startsWith('/')) return next();
    const user = app.repos.users.getByTelegramId(ctx.from.id);
    if (!user?.supportMode) return next();
    await createSupportTicket(ctx, text);
  });

  callbackRouter.on('support', async (ctx, route) => {
    if (route.action === 'write') {
      return beginSupportFlow(ctx, true);
    }
    if (route.action === 'mine') {
      return safeEditOrReply(ctx, mySupportText(app, ctx.from.id), { parse_mode: 'HTML', ...supportKeyboard(app) });
    }
    return app.renderers.support(ctx);
  });
}

module.exports = {
  registerSupport,
  supportDestination,
  supportDestinationSource,
};
