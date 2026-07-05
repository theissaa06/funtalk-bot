async function removeReplyKeyboard(ctx, options = {}) {
  const chatId = ctx.chat?.id;
  if (!chatId || ctx.callbackQuery) return;

  const telegramId = ctx.chat?.type === 'private' ? ctx.from?.id : null;
  const force = Boolean(options.force);
  if (!force && ctx.app.repos.ui.isReplyKeyboardClean(chatId, telegramId)) return;

  try {
    // Отправляем невидимое сообщение с удалением клавиатуры (без текста-заглушки)
    const sent = await ctx.reply('\u200b', {
      reply_markup: { remove_keyboard: true },
      disable_notification: true,
    });
    ctx.app.repos.ui.markReplyKeyboardClean(chatId, telegramId);

    // Удаляем сразу
    setTimeout(() => {
      ctx.telegram.deleteMessage(chatId, sent.message_id).catch(() => {});
    }, 300).unref?.();
  } catch (error) {
    ctx.app?.logger?.warn('reply keyboard cleanup failed:', error.message);
  }
}

function registerUiCleanup(app) {
  app.bot.use(async (ctx, next) => {
    return next();
  });
}

module.exports = {
  registerUiCleanup,
  removeReplyKeyboard,
};
