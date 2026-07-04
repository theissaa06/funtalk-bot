const { Markup } = require('telegraf');
const { safeEditOrReply, safeReply } = require('../safeTelegram');
const { formatMoney } = require('../format');

function activityText(app, ctx) {
  if (!ctx.chat || ctx.chat.type === 'private') return 'Топ активности доступен в группе.';
  const top = app.repos.moderation.topActivity(ctx.chat.id, 10);
  if (!top.length) return 'Пока нет данных по активности.';
  const lines = top.map((member, index) => {
    const name = member.username ? `@${member.username}` : (member.firstName || `ID ${member.telegramId}`);
    return `${index + 1}. ${name} — ${member.messageCount} сообщений`;
  });
  return `<b>Топ активности чата</b>\n\n${lines.join('\n')}`;
}

function coinsText(app) {
  const top = app.repos.economy.topByCoins(10);
  if (!top.length) return 'Пока нет данных по монетам.';
  const lines = top.map((user, index) => {
    const name = user.username ? `@${user.username}` : `ID ${user.telegramId}`;
    return `${index + 1}. ${name} — ${formatMoney(user.coins)}`;
  });
  return `<b>Топ по FunMoney</b>\n\n${lines.join('\n')}`;
}

function keyboard() {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback('Активность', 'leaderboard:activity'),
      Markup.button.callback('Монеты', 'leaderboard:coins'),
    ],
    [Markup.button.callback('Меню', 'menu:home')],
  ]);
}

function registerLeaderboard(app) {
  app.renderers.leaderboard = async ctx => {
    await safeEditOrReply(ctx, activityText(app, ctx), { parse_mode: 'HTML', ...keyboard() });
  };

  app.bot.command(['top', 'leaderboard'], async ctx => {
    await safeReply(ctx, activityText(app, ctx), { parse_mode: 'HTML', ...keyboard() });
  });

  app.bot.command(['rich', 'topmoney'], async ctx => {
    await safeReply(ctx, coinsText(app), { parse_mode: 'HTML', ...keyboard() });
  });

  app.bot.command('pinleaderboard', async ctx => {
    if (!ctx.chat || ctx.chat.type === 'private') return;
    const sent = await ctx.reply(activityText(app, ctx), { parse_mode: 'HTML', ...keyboard() });
    try {
      await ctx.pinChatMessage(sent.message_id, { disable_notification: true });
    } catch (error) {
      app.logger.warn('pin leaderboard failed:', error.message);
    }
  });

  app.callbackRouter.on('leaderboard', async (ctx, route) => {
    if (route.action === 'coins') {
      return safeEditOrReply(ctx, coinsText(app), { parse_mode: 'HTML', ...keyboard() });
    }
    return safeEditOrReply(ctx, activityText(app, ctx), { parse_mode: 'HTML', ...keyboard() });
  });
}

module.exports = {
  registerLeaderboard,
};
