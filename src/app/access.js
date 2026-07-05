const { safeReply } = require('./safeTelegram');

function isOwner(config, userId) {
  return config.ownerIds.includes(Number(userId));
}

async function isChatAdmin(ctx, userId) {
  if (!ctx.chat || ctx.chat.type === 'private') return false;
  try {
    const member = await ctx.telegram.getChatMember(ctx.chat.id, userId);
    return ['creator', 'administrator'].includes(member.status);
  } catch (error) {
    ctx.app?.logger?.warn('admin check failed:', error.message);
    return false;
  }
}

async function requireOwner(ctx) {
  if (isOwner(ctx.app.config, ctx.from?.id)) return true;
  await safeReply(ctx, 'Команда доступна только разработчику.');
  return false;
}

async function requireChatAdmin(ctx) {
  if (isOwner(ctx.app.config, ctx.from?.id)) return true;
  if (await isChatAdmin(ctx, ctx.from?.id)) return true;
  await safeReply(ctx, 'Команда доступна только администраторам чата.');
  return false;
}

module.exports = {
  isOwner,
  isChatAdmin,
  requireOwner,
  requireChatAdmin,
};
