function createContextMiddleware(app) {
  return async (ctx, next) => {
    ctx.app = app;

    if (ctx.from && !ctx.from.is_bot) {
      try {
        ctx.app.repos.users.upsertTelegramUser(ctx.from);
      } catch (error) {
        ctx.app.logger?.error('context user upsert failed:', error.message);
      }

      if (ctx.chat) {
        try {
          ctx.app.repos.chats.upsertChat(ctx.chat);
        } catch (error) {
          ctx.app.logger?.error('context chat upsert failed:', error.message);
        }
      }

      if (ctx.chat && ctx.chat.type !== 'private') {
        try {
          ctx.app.repos.moderation.upsertMember(ctx.chat.id, ctx.from);
        } catch (error) {
          ctx.app.logger?.error('context member upsert failed:', error.message);
        }
      }
    }

    return next();
  };
}

module.exports = {
  createContextMiddleware,
};
