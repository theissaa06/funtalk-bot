function createContextMiddleware(app) {
  return async (ctx, next) => {
    ctx.app = app;

    if (ctx.from && !ctx.from.is_bot) {
      ctx.app.repos.users.upsertTelegramUser(ctx.from);
      if (ctx.chat) ctx.app.repos.chats.upsertChat(ctx.chat);
      if (ctx.chat && ctx.chat.type !== 'private') {
        ctx.app.repos.moderation.upsertMember(ctx.chat.id, ctx.from);
      }
    }

    return next();
  };
}

module.exports = {
  createContextMiddleware,
};
