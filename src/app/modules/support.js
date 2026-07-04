const { Markup } = require('telegraf');
const { safeEditOrReply, safeReply } = require('../safeTelegram');
const { displayName } = require('../format');

function supportText(app) {
  if (!app.config.supportChatId) {
    return '<b>Поддержка</b>\n\nЧат поддержки пока не настроен. Добавь SUPPORT_CHAT_ID в переменные окружения.';
  }
  return '<b>Поддержка</b>\n\nНажми кнопку ниже и следующим сообщением опиши проблему. Бот передаст обращение разработчику.';
}

function supportKeyboard() {
  return Markup.inlineKeyboard([
    [Markup.button.callback('Написать в поддержку', 'support:start')],
    [Markup.button.callback('Меню', 'menu:home')],
  ]);
}

function registerSupport(app) {
  const { bot, repos, callbackRouter, config } = app;

  app.renderers.support = async ctx => {
    await safeEditOrReply(ctx, supportText(app), { parse_mode: 'HTML', ...supportKeyboard() });
  };

  bot.command('support', async ctx => {
    await safeReply(ctx, supportText(app), { parse_mode: 'HTML', ...supportKeyboard() });
  });

  callbackRouter.on('support', async (ctx, route) => {
    if (route.action === 'start') {
      if (!config.supportChatId) {
        return safeEditOrReply(ctx, supportText(app), { parse_mode: 'HTML', ...supportKeyboard() });
      }
      repos.users.setSupportMode(ctx.from.id, true);
      return safeEditOrReply(ctx, 'Напиши следующим сообщением, что случилось. Я передам это разработчику.', { ...supportKeyboard() });
    }
    return app.renderers.support(ctx);
  });

  bot.on('text', async (ctx, next) => {
    if (!ctx.from || ctx.from.is_bot) return next();

    if (config.supportChatId && String(ctx.chat?.id) === String(config.supportChatId) && ctx.message?.reply_to_message) {
      const ticket = repos.support.findBySupportReply(config.supportChatId, ctx.message.reply_to_message.message_id);
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

    if (!config.supportChatId) {
      return safeReply(ctx, 'Поддержка пока не настроена.');
    }

    const ticket = repos.support.createTicket(ctx.from, ctx.chat?.id, ctx.message.text);
    const text = [
      `<b>Новое обращение #${ticket.id}</b>`,
      `Пользователь: ${displayName(ctx.from)}`,
      `ID: <code>${ctx.from.id}</code>`,
      ctx.chat?.id ? `Контекст чата: <code>${ctx.chat.id}</code>` : null,
      '',
      ctx.message.text,
      '',
      'Ответь реплаем на это сообщение, чтобы отправить ответ пользователю.',
    ].filter(Boolean).join('\n');

    try {
      const sent = await ctx.telegram.sendMessage(config.supportChatId, text, { parse_mode: 'HTML' });
      repos.support.bindForwardedMessage(ticket.id, config.supportChatId, sent.message_id);
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
