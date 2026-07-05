const { Markup } = require('telegraf');
const { safeEditOrReply, safeReply } = require('../safeTelegram');
const { formatMoney } = require('../format');
const { requireChatAdmin } = require('../access');

const updateDebounce = new Map();

function activityText(app, ctx) {
  if (!ctx.chat || ctx.chat.type === 'private') return 'Топ активности доступен в группе.';
  const top = app.repos.moderation.topActivity(ctx.chat.id, 10);
  if (!top.length) return '<b>Топ активности чата</b>\n\nИсточник: БД\n\nПока нет данных по активности.';
  const lines = top.map((member, index) => {
    const name = member.username ? `@${member.username}` : (member.firstName || `ID ${member.telegramId}`);
    return `${index + 1}. ${name} — ${member.messageCount} сообщений`;
  });
  return `<b>Топ активности чата</b>\nИсточник: БД\n\n${lines.join('\n')}`;
}

function coinsText(app) {
  const top = app.repos.economy.topByCoins(10);
  if (!top.length) return '<b>Топ по FunMoney</b>\n\nИсточник: БД\n\nПока нет данных по монетам.';
  const lines = top.map((user, index) => {
    const name = user.username ? `@${user.username}` : `ID ${user.telegramId}`;
    return `${index + 1}. ${name} — ${formatMoney(user.coins)}`;
  });
  return `<b>Топ по FunMoney</b>\nИсточник: БД\n\n${lines.join('\n')}`;
}

function keyboard() {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback('Активность', 'leaderboard:activity'),
      Markup.button.callback('Монеты', 'leaderboard:coins'),
    ],
    [Markup.button.callback('Обновить', 'leaderboard:refresh')],
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
    if (!(await requireChatAdmin(ctx))) return;
    const sent = await ctx.reply(activityText(app, ctx), { parse_mode: 'HTML', ...keyboard() });
    try {
      await ctx.pinChatMessage(sent.message_id, { disable_notification: true });
      app.repos.moderation.setPinnedLeaderboard(ctx.chat.id, sent.message_id, 'activity');
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

  app.eventBus.on('chat.message', payload => {
    const chatId = payload.chatId;
    if (!chatId || updateDebounce.has(chatId)) return;
    const timer = setTimeout(async () => {
      updateDebounce.delete(chatId);
      const pinned = app.repos.moderation.getPinnedLeaderboard(chatId, 'activity');
      if (!pinned) return;
      try {
        await app.bot.telegram.editMessageText(chatId, pinned.messageId, undefined, activityText(app, { chat: { id: chatId, type: 'group' } }), {
          parse_mode: 'HTML',
          ...keyboard(),
        });
      } catch (error) {
        app.logger.warn('auto leaderboard update failed:', error.message);
      }
    }, 5 * 60 * 1000);
    if (typeof timer.unref === 'function') timer.unref();
    updateDebounce.set(chatId, timer);
  });
}

module.exports = {
  registerLeaderboard,
};
