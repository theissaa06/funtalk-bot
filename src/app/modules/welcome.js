const { Markup } = require('telegraf');
const { safeReply } = require('../safeTelegram');
const { displayName, escapeHtml, randomInt } = require('../format');

const captchaAnswers = new Map();

const GREETING_TEMPLATES = [
  'Добро пожаловать, {username}! Ты участник #{member_count} в {chat_title}. Держи стартовые 25 FunMoney.',
  '{username}, залетай поудобнее. В {chat_title} тебе начислено 25 FunMoney.',
  'Привет, {username}! Рады видеть в {chat_title}. Стартовый бонус: 25 FunMoney.',
];

function renderTemplate(template, member, ctx) {
  const chatTitle = ctx.chat?.title || ctx.chat?.username || 'чате';
  const row = ctx.app.repos.moderation.getMember(ctx.chat.id, member.id);
  return template
    .replaceAll('{username}', displayName(member))
    .replaceAll('{chat_title}', chatTitle)
    .replaceAll('{member_count}', String(row?.id || '?'));
}

function registerWelcome(app) {
  app.bot.on('new_chat_members', async ctx => {
    if (!ctx.chat || ctx.chat.type === 'private') return;
    const settings = app.repos.chats.getSettings(ctx.chat.id);
    let botInfo = null;
    try {
      botInfo = await ctx.telegram.getMe();
    } catch {}

    for (const member of ctx.message.new_chat_members || []) {
      if (member.is_bot && botInfo && member.id === botInfo.id) {
        const brandName = escapeHtml(app.config.brandName || 'Somnia');
        await safeReply(ctx, [
          `<b>${brandName} подключена</b>`,
          '',
          'Я умею модерировать чат, вести экономику, магазин, ачивки, мини-игры, поддержку и ИИ-помощника.',
          'Открой меню кнопкой ниже.',
        ].join('\n'), {
          parse_mode: 'HTML',
          ...Markup.inlineKeyboard([[Markup.button.callback('Меню', 'menu:home')]]),
        });
        continue;
      }
      if (member.is_bot) continue;
      app.repos.users.upsertTelegramUser(member);
      app.repos.moderation.upsertMember(ctx.chat.id, member);
      app.repos.economy.addCoins(member.id, 25, {
        type: 'welcome_bonus',
        chatId: ctx.chat.id,
        reason: 'new member',
      });

      if (settings.greetingsEnabled) {
        const template = GREETING_TEMPLATES[randomInt(0, GREETING_TEMPLATES.length - 1)];
        await safeReply(ctx, renderTemplate(template, member, ctx));
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
