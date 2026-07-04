const { Markup } = require('telegraf');
const { safeEditOrReply, safeReply } = require('../safeTelegram');

function mainKeyboard() {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback('Профиль', 'menu:profile'),
      Markup.button.callback('Магазин', 'menu:shop'),
    ],
    [
      Markup.button.callback('Топы', 'menu:leaderboard'),
      Markup.button.callback('Игры', 'menu:games'),
    ],
    [
      Markup.button.callback('Поддержка', 'menu:support'),
      Markup.button.callback('ИИ', 'menu:ai'),
    ],
  ]);
}

function menuText() {
  return [
    '<b>FunTalk</b>',
    '',
    'Я помогу с модерацией, активностью, магазином, мини-играми, топами, поддержкой и ИИ-помощником.',
    '',
    'Выбери раздел кнопками ниже или используй команды: /profile, /shop, /daily, /top, /support, /ai.',
  ].join('\n');
}

function registerMenu(app) {
  const { bot, callbackRouter } = app;

  bot.start(async ctx => {
    await safeReply(ctx, menuText(), { parse_mode: 'HTML', ...mainKeyboard() });
  });

  bot.command(['menu', 'help'], async ctx => {
    await safeReply(ctx, menuText(), { parse_mode: 'HTML', ...mainKeyboard() });
  });

  callbackRouter.on('menu', async (ctx, route) => {
    if (route.action === 'home') {
      return safeEditOrReply(ctx, menuText(), { parse_mode: 'HTML', ...mainKeyboard() });
    }
    if (route.action === 'profile') return app.renderers.profile(ctx);
    if (route.action === 'shop') return app.renderers.shop(ctx, 0);
    if (route.action === 'leaderboard') return app.renderers.leaderboard(ctx);
    if (route.action === 'games') return app.renderers.games(ctx);
    if (route.action === 'support') return app.renderers.support(ctx);
    if (route.action === 'ai') return app.renderers.ai(ctx);
    return safeEditOrReply(ctx, menuText(), { parse_mode: 'HTML', ...mainKeyboard() });
  });
}

module.exports = {
  registerMenu,
  mainKeyboard,
};
