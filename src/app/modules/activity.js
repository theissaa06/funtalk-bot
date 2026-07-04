function registerActivity(app) {
  const rewardCooldown = new Map();

  app.bot.on('message', async (ctx, next) => {
    if (!ctx.from || ctx.from.is_bot || !ctx.chat || ctx.chat.type === 'private') return next();
    if (!ctx.message?.text && !ctx.message?.sticker && !ctx.message?.photo && !ctx.message?.video) return next();

    const member = app.repos.moderation.recordMessage(ctx.chat.id, ctx.from, 2);
    const key = `${ctx.chat.id}:${ctx.from.id}`;
    const last = rewardCooldown.get(key) || 0;
    if (Date.now() - last > 60 * 1000) {
      rewardCooldown.set(key, Date.now());
      app.repos.economy.addCoins(ctx.from.id, 1, {
        type: 'activity',
        chatId: ctx.chat.id,
        reason: 'message activity',
      });
      app.repos.economy.addXp(ctx.from.id, 2);
    }

    app.eventBus.emit('chat.message', {
      chatId: ctx.chat.id,
      telegramId: ctx.from.id,
      messageCount: member?.messageCount || 0,
    });

    return next();
  });
}

module.exports = {
  registerActivity,
};
