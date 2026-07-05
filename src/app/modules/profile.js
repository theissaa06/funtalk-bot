const { Markup } = require('telegraf');
const { safeEditOrReply, safeReply } = require('../safeTelegram');
const { displayName, formatMoney } = require('../format');
const { getShopItem } = require('../catalog');

function buildProfile(app, ctx) {
  const economy = app.repos.economy.getUser(ctx.from.id);
  const member = ctx.chat?.type !== 'private'
    ? app.repos.moderation.getMember(ctx.chat.id, ctx.from.id)
    : null;

  const inventory = economy.inventory || [];
  const activeTitle = economy.activeTitle ? getShopItem(economy.activeTitle)?.name : null;
  const activeBadge = economy.activeBadge ? getShopItem(economy.activeBadge)?.name : null;

  return [
    `<b>Профиль ${displayName(ctx.from)}</b>`,
    '',
    `Баланс: <b>${formatMoney(economy.coins)}</b>`,
    `Уровень: <b>${economy.level}</b> · XP: <b>${economy.xp}</b>`,
    member ? `В этом чате: <b>${member.messageCount}</b> сообщений · <b>${member.warnings}</b> варнов` : null,
    activeTitle ? `Титул: <b>${activeTitle}</b>` : null,
    activeBadge ? `Бейдж: <b>${activeBadge}</b>` : null,
    `Инвентарь: <b>${inventory.reduce((sum, item) => sum + item.qty, 0)}</b> предметов`,
  ].filter(Boolean).join('\n');
}

function profileKeyboard() {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback('Инвентарь', 'shop:inventory'),
      Markup.button.callback('Магазин', 'shop:page:0'),
    ],
    [
      Markup.button.callback('Ачивки', 'achievements:main'),
      Markup.button.callback('ИИ', 'ai:main'),
    ],
    [
      Markup.button.callback('Топы', 'leaderboard:main'),
      Markup.button.callback('Меню', 'menu:home'),
    ],
  ]);
}

function registerProfile(app) {
  app.renderers.profile = async ctx => {
    await safeEditOrReply(ctx, buildProfile(app, ctx), { parse_mode: 'HTML', ...profileKeyboard() });
  };

  app.bot.command(['profile', 'me', 'rank'], async ctx => {
    await safeReply(ctx, buildProfile(app, ctx), { parse_mode: 'HTML', ...profileKeyboard() });
  });

  app.callbackRouter.on('profile', async ctx => {
    await app.renderers.profile(ctx);
  });
}

module.exports = {
  registerProfile,
  buildProfile,
};
