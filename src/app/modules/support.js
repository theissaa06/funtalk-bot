const { Markup } = require('telegraf');
const { safeEditOrReply, safeReply } = require('../safeTelegram');
const { escapeHtml } = require('../format');

function supportText(app) {
  if (!app.config.supportInboxBotUsername) {
    return '<b>Поддержка</b>\n\nSupport-бот пока не настроен. Добавь SUPPORT_INBOX_BOT_USERNAME и SUPPORT_INBOX_BOT_TOKEN.';
  }
  return `<b>Поддержка</b>\n\nВсе обращения принимаются только в отдельном support-боте: @${app.config.supportInboxBotUsername}.`;
}

function supportKeyboard(app) {
  const rows = [];
  if (app.config.supportInboxBotUsername) {
    rows.push([Markup.button.url('Открыть support-бота', `https://t.me/${app.config.supportInboxBotUsername}`)]);
  }
  rows.push([Markup.button.callback('Мои обращения', 'support:mine')]);
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

function registerSupport(app) {
  const { bot, callbackRouter } = app;

  app.renderers.support = async ctx => {
    await safeEditOrReply(ctx, supportText(app), { parse_mode: 'HTML', ...supportKeyboard(app) });
  };

  bot.command('support', async ctx => {
    await safeReply(ctx, supportText(app), { parse_mode: 'HTML', ...supportKeyboard(app) });
  });

  bot.command('mysupport', async ctx => {
    await safeReply(ctx, mySupportText(app, ctx.from.id), { parse_mode: 'HTML', ...supportKeyboard(app) });
  });

  callbackRouter.on('support', async (ctx, route) => {
    if (route.action === 'mine') {
      return safeEditOrReply(ctx, mySupportText(app, ctx.from.id), { parse_mode: 'HTML', ...supportKeyboard(app) });
    }
    return app.renderers.support(ctx);
  });
}

module.exports = {
  registerSupport,
};
