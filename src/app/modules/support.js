const { Markup } = require('telegraf');
const { safeEditOrReply, safeReply } = require('../safeTelegram');
const { displayName, escapeHtml } = require('../format');

const supportCooldown = new Map();
const SUPPORT_COOLDOWN_MS = 5 * 60 * 1000;

function supportDestinationChatId(app) {
  return app.config.supportChatId || app.config.ownerIds?.[0] || null;
}

function supportText(app) {
  if (!supportDestinationChatId(app)) {
    return '<b>Поддержка</b>\n\nПоддержка пока не настроена: добавь SUPPORT_CHAT_ID или OWNER_ID.';
  }
  return '<b>Поддержка</b>\n\nНажми кнопку ниже и следующим сообщением опиши проблему. Бот передаст обращение разработчику.';
}

function supportKeyboard() {
  return Markup.inlineKeyboard([
    [Markup.button.callback('Написать в поддержку', 'support:start')],
    [Markup.button.callback('Мои обращения', 'support:mine')],
    [Markup.button.callback('Меню', 'menu:home')],
  ]);
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

function registerSupport(app) {
  const { bot, repos, callbackRouter } = app;

  app.renderers.support = async ctx => {
    await safeEditOrReply(ctx, supportText(app), { parse_mode: 'HTML', ...supportKeyboard() });
  };

  bot.command('support', async ctx => {
    await safeReply(ctx, supportText(app), { parse_mode: 'HTML', ...supportKeyboard() });
  });

  bot.command('mysupport', async ctx => {
    await safeReply(ctx, mySupportText(app, ctx.from.id), { parse_mode: 'HTML', ...supportKeyboard() });
  });

  callbackRouter.on('support', async (ctx, route) => {
    if (route.action === 'mine') {
      return safeEditOrReply(ctx, mySupportText(app, ctx.from.id), { parse_mode: 'HTML', ...supportKeyboard() });
    }
    if (route.action === 'start') {
      if (!supportDestinationChatId(app)) {
        return safeEditOrReply(ctx, supportText(app), { parse_mode: 'HTML', ...supportKeyboard() });
      }
      repos.users.setSupportMode(ctx.from.id, true);
      return safeEditOrReply(ctx, 'Напиши следующим сообщением, что случилось. Я передам это разработчику.', { ...supportKeyboard() });
    }
    return app.renderers.support(ctx);
  });

  bot.on('text', async (ctx, next) => {
    if (!ctx.from || ctx.from.is_bot) return next();
    const destinationChatId = supportDestinationChatId(app);

    if (destinationChatId && String(ctx.chat?.id) === String(destinationChatId) && ctx.message?.reply_to_message) {
      const ticket = repos.support.findBySupportReply(destinationChatId, ctx.message.reply_to_message.message_id);
      if (!ticket) return next();
      try {
        await ctx.telegram.sendMessage(ticket.telegramId, `Ответ поддержки:\n\n${ctx.message.text}`);
        repos.support.close(ticket.id);
        return safeReply(ctx, `Ответ отправлен пользователю ${ticket.telegramId}.`);
      } catch (error) {
        app.logger.warn('support reply failed:', error.message);
        return safeReply(ctx, 'Не удалось отправить ответ пользователю.');
      }
    }

    const user = repos.users.getByTelegramId(ctx.from.id);
    if (!user?.supportMode) return next();
    repos.users.setSupportMode(ctx.from.id, false);

    const lastTicketAt = supportCooldown.get(ctx.from.id) || 0;
    const leftMs = SUPPORT_COOLDOWN_MS - (Date.now() - lastTicketAt);
    if (leftMs > 0) {
      return safeReply(ctx, `Поддержка приняла прошлое обращение недавно. Подожди ${Math.ceil(leftMs / 60000)} мин.`);
    }

    if (!destinationChatId) {
      return safeReply(ctx, 'Поддержка пока не настроена.');
    }

    const ticket = repos.support.createTicket(ctx.from, ctx.chat?.id, ctx.message.text);
    supportCooldown.set(ctx.from.id, Date.now());
    const text = [
      `<b>Новое обращение #${ticket.id}</b>`,
      `Пользователь: ${escapeHtml(displayName(ctx.from))}`,
      `ID: <code>${ctx.from.id}</code>`,
      ctx.chat?.id ? `Контекст чата: <code>${ctx.chat.id}</code>` : null,
      '',
      escapeHtml(ctx.message.text),
      '',
      'Ответь реплаем на это сообщение, чтобы отправить ответ пользователю.',
    ].filter(Boolean).join('\n');

    try {
      const sent = await ctx.telegram.sendMessage(destinationChatId, text, { parse_mode: 'HTML' });
      repos.support.bindForwardedMessage(ticket.id, destinationChatId, sent.message_id);
      return safeReply(ctx, `Обращение #${ticket.id} отправлено. Ответ придёт сюда.`);
    } catch (error) {
      app.logger.warn('support forward failed:', error.message);
      return safeReply(ctx, 'Не удалось отправить обращение. Попробуй позже.');
    }
  });
}

module.exports = {
  registerSupport,
};
