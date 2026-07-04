async function safeReply(ctx, text, extra = {}) {
  try {
    return await ctx.reply(text, extra);
  } catch (error) {
    ctx.app?.logger?.warn('reply failed:', error.message);
    return null;
  }
}

async function safeEditOrReply(ctx, text, extra = {}) {
  try {
    if (ctx.callbackQuery) {
      return await ctx.editMessageText(text, extra);
    }
  } catch (error) {
    ctx.app?.logger?.warn('edit failed, falling back to reply:', error.message);
  }
  return safeReply(ctx, text, extra);
}

async function safeAnswerCb(ctx, text, extra = {}) {
  try {
    if (ctx.callbackQuery) return await ctx.answerCbQuery(text, extra);
  } catch (error) {
    ctx.app?.logger?.warn('answerCbQuery failed:', error.message);
  }
  return null;
}

module.exports = {
  safeReply,
  safeEditOrReply,
  safeAnswerCb,
};
