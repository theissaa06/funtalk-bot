const { Markup } = require('telegraf');
const { safeEditOrReply, safeReply } = require('../safeTelegram');
const { askAI, getAiProviderConfig } = require('../../services/ai');

const activeUsers = new Set();
const historyByUser = new Map();

function aiKeyboard() {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback('Обычный', 'ai:mode:general'),
      Markup.button.callback('Текст', 'ai:mode:text'),
    ],
    [
      Markup.button.callback('Мемы', 'ai:mode:meme'),
      Markup.button.callback('Объяснить', 'ai:mode:explain'),
    ],
    [
      Markup.button.callback('Сбросить', 'ai:clear'),
      Markup.button.callback('Меню', 'menu:home'),
    ],
  ]);
}

function modeFor(app, telegramId) {
  const user = app.repos.users.getByTelegramId(telegramId);
  return user?.aiMode || 'general';
}

function statusText() {
  const config = getAiProviderConfig();
  if (config.unknown) return `Неизвестный AI_PROVIDER: ${config.provider}. Используй gemini, openai, claude или auto.`;
  if (!config.configured) return `ИИ включается, но API-ключ не настроен. Нужна переменная ${config.keyEnv}. Провайдер: ${config.label}, модель: ${config.model}.`;
  return `Провайдер: ${config.label}. Модель: ${config.model}.`;
}

function renderAiText(app, ctx) {
  activeUsers.add(ctx.from.id);
  return [
    '<b>ИИ-помощник</b>',
    '',
    statusText(),
    '',
    `Режим: <b>${modeFor(app, ctx.from.id)}</b>`,
    'Напиши вопрос следующим сообщением.',
  ].join('\n');
}

function registerAi(app) {
  const { bot, callbackRouter, repos } = app;

  app.renderers.ai = async ctx => {
    await safeEditOrReply(ctx, renderAiText(app, ctx), { parse_mode: 'HTML', ...aiKeyboard() });
  };

  bot.command('ai', async ctx => {
    await safeReply(ctx, renderAiText(app, ctx), { parse_mode: 'HTML', ...aiKeyboard() });
  });

  callbackRouter.on('ai', async (ctx, route) => {
    if (route.action === 'mode') {
      const mode = route.args[0] || 'general';
      repos.users.store.mutate(data => {
        const user = data.users.find(item => String(item.telegramId) === String(ctx.from.id));
        if (user) user.aiMode = mode;
        return user;
      });
      activeUsers.add(ctx.from.id);
      return safeEditOrReply(ctx, `Режим ИИ: <b>${mode}</b>\nТеперь напиши вопрос.`, { parse_mode: 'HTML', ...aiKeyboard() });
    }
    if (route.action === 'clear') {
      historyByUser.delete(ctx.from.id);
      activeUsers.add(ctx.from.id);
      return safeEditOrReply(ctx, 'История ИИ очищена. Напиши новый вопрос.', { ...aiKeyboard() });
    }
    return app.renderers.ai(ctx);
  });

  bot.on('text', async (ctx, next) => {
    if (!activeUsers.has(ctx.from?.id)) return next();
    const text = ctx.message?.text?.trim();
    if (!text || text.startsWith('/')) return next();

    const provider = getAiProviderConfig();
    if (!provider.configured) {
      await safeReply(ctx, statusText());
      return;
    }

    try {
      await ctx.sendChatAction('typing');
    } catch {}

    try {
      const history = historyByUser.get(ctx.from.id) || [];
      const response = await askAI(history, text, modeFor(app, ctx.from.id));
      const updated = [...history, { role: 'user', message: text }, { role: 'assistant', message: response }].slice(-10);
      historyByUser.set(ctx.from.id, updated);
      await safeReply(ctx, response, { ...aiKeyboard() });
    } catch (error) {
      app.logger.warn('ai failed:', error.message);
      await safeReply(ctx, 'ИИ временно не смог ответить. Попробуй позже или проверь API-ключ/модель.');
    }
  });
}

module.exports = {
  registerAi,
  activeUsers,
};
