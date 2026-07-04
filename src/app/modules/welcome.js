const { Markup } = require('telegraf');
const { safeReply } = require('../safeTelegram');
const { displayName, randomInt } = require('../format');

const captchaAnswers = new Map();

function registerWelcome(app) {
  app.bot.on('new_chat_members', async ctx => {
    if (!ctx.chat || ctx.chat.type === 'private') return;
    const settings = app.repos.chats.getSettings(ctx.chat.id);
    for (const member of ctx.message.new_chat_members || []) {
      if (member.is_bot) continue;
      app.repos.users.upsertTelegramUser(member);
      app.repos.moderation.upsertMember(ctx.chat.id, member);
      app.repos.economy.addCoins(member.id, 25, {
        type: 'welcome_bonus',
        chatId: ctx.chat.id,
        reason: 'new member',
      });

      if (settings.greetingsEnabled) {
        await safeReply(ctx, `Добро пожаловать, ${displayName(member)}! Держи стартовые 25 FunMoney.`);
      }

      if (settings.captchaEnabled) {
        const a = randomInt(1, 8);
        const b = randomInt(1, 8);
        const key = `${ctx.chat.id}:${member.id}`;
        captchaAnswers.set(key, a + b);
        await safeReply(ctx, `${displayName(member)}, нажми правильный ответ: ${a} + ${b}`, {
          ...Markup.inlineKeyboard([[
            Markup.button.callback(String(a + b), `captcha:answer:${member.id}:${a + b}`),
            Markup.button.callback(String(a + b + 1), `captcha:answer:${member.id}:${a + b + 1}`),
            Markup.button.callback(String(a + b - 1), `captcha:answer:${member.id}:${a + b - 1}`),
          ]]),
        });
      }
    }
  });

  app.callbackRouter.on('captcha', async (ctx, route) => {
    if (route.action !== 'answer') return;
    const [userId, answerRaw] = route.args;
    if (String(ctx.from.id) !== String(userId)) {
      return ctx.answerCbQuery('Это кнопка другого участника.', { show_alert: true });
    }
    const key = `${ctx.chat.id}:${ctx.from.id}`;
    const expected = captchaAnswers.get(key);
    if (Number(answerRaw) === expected) {
      captchaAnswers.delete(key);
      return ctx.editMessageText('Капча пройдена. Добро пожаловать!');
    }
    return ctx.answerCbQuery('Неверный ответ.', { show_alert: true });
  });
}

module.exports = {
  registerWelcome,
};
