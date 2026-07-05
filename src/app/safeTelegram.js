function shouldRetryWithoutParseMode(error, extra) {
  return extra?.parse_mode && /can't parse entities|Unsupported start tag|can't find end tag/i.test(String(error?.message || ''));
}

function withoutParseMode(extra = {}) {
  const next = { ...extra };
  delete next.parse_mode;
  return next;
}

async function safeReply(ctx, text, extra = {}) {
  try {
    return await ctx.reply(text, extra);
  } catch (error) {
    if (shouldRetryWithoutParseMode(error, extra)) {
      try {
        return await ctx.reply(text, withoutParseMode(extra));
      } catch (retryError) {
        ctx.app?.logger?.warn('reply retry without parse_mode failed:', retryError.message);
      }
    }
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
    if (shouldRetryWithoutParseMode(error, extra)) {
      try {
        return await ctx.editMessageText(text, withoutParseMode(extra));
      } catch (retryError) {
        ctx.app?.logger?.warn('edit retry without parse_mode failed:', retryError.message);
      }
    }
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
