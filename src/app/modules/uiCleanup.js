async function removeReplyKeyboard(ctx, options = {}) {
  const chatId = ctx.chat?.id;
  if (!chatId || ctx.callbackQuery) return;

  const telegramId = ctx.chat?.type === 'private' ? ctx.from?.id : null;
  const force = Boolean(options.force);
  if (!force && ctx.app.repos.ui.isReplyKeyboardClean(chatId, telegramId)) return;

  try {
    const sent = await ctx.reply('Обновляю меню...', {
      reply_markup: { remove_keyboard: true },
      disable_notification: true,
    });
    ctx.app.repos.ui.markReplyKeyboardClean(chatId, telegramId);

    setTimeout(() => {
      ctx.telegram.deleteMessage(chatId, sent.message_id).catch(() => {});
    }, 1500).unref?.();
  } catch (error) {
    ctx.app?.logger?.warn('reply keyboard cleanup failed:', error.message);
  }
}

function registerUiCleanup(app) {
  app.bot.use(async (ctx, next) => {
    if (ctx.message && ctx.chat && ctx.from && !ctx.from.is_bot) {
      const text = ctx.message.text || '';
      const force = /^\/(start|menu|help|profile|shop|games|ai)(@\w+)?(?:\s|$)/i.test(text);
      await removeReplyKeyboard(ctx, { force });
    }
    return next();
  });
}

module.exports = {
  registerUiCleanup,
  removeReplyKeyboard,
};
