const { parseArgs } = require('./format');

async function resolveTarget(ctx, options = {}) {
  const { allowSelf = false, allowRawId = false } = options;

  const replyUser = ctx.message?.reply_to_message?.from;
  if (replyUser && (allowSelf || replyUser.id !== ctx.from?.id)) return replyUser;

  const [firstArg] = parseArgs(ctx);
  if (!firstArg) return allowSelf ? ctx.from : null;

  const known = ctx.app?.repos?.moderation?.findMember(ctx.chat?.id, firstArg)
    || ctx.app?.repos?.users?.findByUsername(firstArg);
  if (known) {
    return {
      id: known.telegramId,
      username: known.username,
      first_name: known.firstName,
      last_name: known.lastName,
      is_bot: false,
    };
  }

  const numericId = Number(firstArg);
  if (Number.isFinite(numericId)) {
    try {
      const member = await ctx.telegram.getChatMember(ctx.chat.id, numericId);
      if (member?.user && (allowSelf || member.user.id !== ctx.from?.id)) return member.user;
    } catch {}
    if (allowRawId && (allowSelf || numericId !== ctx.from?.id)) {
      return { id: numericId, first_name: `ID ${numericId}`, is_bot: false };
    }
  }

  return null;
}

function stripTargetArgs(args) {
  return args.filter(arg => !arg.startsWith('@') && !/^-?\d+$/.test(arg));
}

module.exports = {
  resolveTarget,
  stripTargetArgs,
};
