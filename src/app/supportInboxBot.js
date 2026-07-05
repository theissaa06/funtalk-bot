const { Telegraf } = require('telegraf');
const { escapeHtml, displayName } = require('./format');

function ownerDestination(app) {
  return app.config.supportChatId || app.config.ownerIds?.[0] || null;
}

function isOwner(app, userId) {
  return app.config.ownerIds.includes(Number(userId));
}

function messagePreview(message = {}) {
  if (message.text) return message.text;
  if (message.caption) return message.caption;
  if (message.photo) return '[фото]';
  if (message.video) return '[видео]';
  if (message.document) return `[файл] ${message.document.file_name || ''}`.trim();
  if (message.voice) return '[голосовое]';
  if (message.sticker) return `[стикер] ${message.sticker.emoji || ''}`.trim();
  return '[сообщение]';
}

async function replySafe(ctx, text, extra = {}) {
  try {
    return await ctx.reply(text, extra);
  } catch {
    return null;
  }
}

function createSupportInboxBot(app) {
  const token = app.config.supportInboxBotToken;
  if (!token || app.config.isTest) return null;

  const inboxBot = new Telegraf(token);
  const destinationChatId = ownerDestination(app);

  inboxBot.start(async ctx => {
    if (isOwner(app, ctx.from?.id)) {
      return replySafe(ctx, 'Support-бот подключён. Сюда будут приходить обращения пользователей. Отвечай реплаем на обращение.');
    }
    return replySafe(ctx, 'Привет. Напиши сюда свою проблему одним сообщением, я передам её разработчику.');
  });

  inboxBot.command('help', async ctx => {
    await replySafe(ctx, 'Пользователь пишет проблему сюда. Разработчик отвечает реплаем на обращение.');
  });

  inboxBot.on('message', async ctx => {
    if (!ctx.from || ctx.from.is_bot) return;

    if (destinationChatId && String(ctx.chat?.id) === String(destinationChatId) && ctx.message?.reply_to_message) {
      const ticket = app.repos.support.findBySupportReply(destinationChatId, ctx.message.reply_to_message.message_id);
      if (!ticket) return;
      try {
        await ctx.telegram.sendMessage(ticket.telegramId, `Ответ поддержки:\n\n${messagePreview(ctx.message)}`);
        app.repos.support.close(ticket.id);
        return replySafe(ctx, `Ответ отправлен пользователю ${ticket.telegramId}.`);
      } catch (error) {
        app.logger.warn('support inbox reply failed:', error.message);
        return replySafe(ctx, 'Не удалось отправить ответ пользователю.');
      }
    }

    if (isOwner(app, ctx.from.id)) {
      return replySafe(ctx, 'Чтобы ответить пользователю, сделай reply на его обращение.');
    }

    if (!destinationChatId) {
      return replySafe(ctx, 'Поддержка пока не настроена.');
    }

    const preview = messagePreview(ctx.message);
    const ticket = app.repos.support.createTicket(ctx.from, ctx.chat?.id, preview);
    const text = [
      `<b>Новое обращение #${ticket.id}</b>`,
      `Источник: support-бот`,
      `Пользователь: ${escapeHtml(displayName(ctx.from))}`,
      `ID: <code>${ctx.from.id}</code>`,
      '',
      escapeHtml(preview),
      '',
      'Ответь реплаем на это сообщение, чтобы отправить ответ пользователю.',
    ].join('\n');

    try {
      const sent = await ctx.telegram.sendMessage(destinationChatId, text, { parse_mode: 'HTML' });
      app.repos.support.bindForwardedMessage(ticket.id, destinationChatId, sent.message_id);
      return replySafe(ctx, `Обращение #${ticket.id} отправлено. Ответ придёт сюда.`);
    } catch (error) {
      app.logger.warn('support inbox forward failed:', error.message);
      return replySafe(ctx, 'Не удалось отправить обращение. Попробуй позже.');
    }
  });

  inboxBot.catch(error => {
    app.logger.warn('support inbox update failed:', error.message);
  });

  return inboxBot;
}

module.exports = {
  createSupportInboxBot,
};
