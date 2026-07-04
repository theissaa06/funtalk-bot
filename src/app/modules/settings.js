const { Markup } = require('telegraf');
const { safeEditOrReply, safeReply } = require('../safeTelegram');
const { requireChatAdmin } = require('../access');

const SETTINGS = [
  ['greetingsEnabled', 'Приветствия'],
  ['captchaEnabled', 'Лёгкая капча'],
  ['fridayMemesEnabled', 'Мемы по пятницам'],
  ['activityRewardsEnabled', 'Монеты за активность'],
];

function settingsText(app, chatId) {
  const settings = app.repos.chats.getSettings(chatId);
  const lines = SETTINGS.map(([key, label]) => `${settings[key] ? 'ON ' : 'OFF'} ${label}`);
  return `<b>Настройки чата</b>\n\n${lines.join('\n')}`;
}

function settingsKeyboard(app, chatId) {
  const settings = app.repos.chats.getSettings(chatId);
  return Markup.inlineKeyboard([
    ...SETTINGS.map(([key, label]) => [Markup.button.callback(`${settings[key] ? 'Выключить' : 'Включить'}: ${label}`, `settings:toggle:${key}`)]),
    [Markup.button.callback('Меню', 'menu:home')],
  ]);
}

function registerSettings(app) {
  app.bot.command('settings', async ctx => {
    if (!ctx.chat || ctx.chat.type === 'private') return safeReply(ctx, 'Настройки чата доступны в группе.');
    if (!(await requireChatAdmin(ctx))) return;
    await safeReply(ctx, settingsText(app, ctx.chat.id), { parse_mode: 'HTML', ...settingsKeyboard(app, ctx.chat.id) });
  });

  app.callbackRouter.on('settings', async (ctx, route) => {
    if (!ctx.chat || ctx.chat.type === 'private') return;
    if (!(await requireChatAdmin(ctx))) return;
    if (route.action === 'toggle') {
      const key = route.args[0];
      const current = app.repos.chats.getSettings(ctx.chat.id)[key];
      app.repos.chats.updateSetting(ctx.chat.id, key, !current);
    }
    return safeEditOrReply(ctx, settingsText(app, ctx.chat.id), { parse_mode: 'HTML', ...settingsKeyboard(app, ctx.chat.id) });
  });
}

module.exports = {
  registerSettings,
};
