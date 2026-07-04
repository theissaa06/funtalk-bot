// ============================================================
// src/bot/aiAssistant.js
// Раздел "🤖 ИИ-помощник"
// ============================================================

const { Markup } = require('telegraf');
const { askAI, getAiProviderConfig } = require('../services/ai');
const {
  saveAiMessage,
  getAiHistory,
  clearAiHistory,
  updateSetting,
} = require('../database/db');

// Максимальная длина сообщения пользователя
const MAX_USER_MSG_LENGTH = 1500;

// Режимы ИИ
const AI_MODES = {
  general: { label: '💬 Обычный помощник', emoji: '💬' },
  dating: { label: '❤️ Помощник для знакомств', emoji: '❤️' },
  meme: { label: '😂 Мемный помощник', emoji: '😂' },
  explain: { label: '🧠 Объясни простыми словами', emoji: '🧠' },
  text: { label: '✍️ Помощник для текста', emoji: '✍️' },
};

// Состояния — пользователь в режиме ИИ
const aiActiveUsers = new Set();

// Клавиатура раздела ИИ
const aiKeyboard = Markup.keyboard([
  ['💬 Обычный', '❤️ ИИ-знакомства'],
  ['😂 Мемный', '🧠 Объяснить'],
  ['✍️ Текст', '🔄 Сбросить диалог'],
  ['🔴 Выйти из ИИ', '⬅️ Назад'],
]).resize();

function getUserId(ctx) {
  return ctx.state?.dbUser?.id || ctx.from?.id;
}

function getSettings(ctx) {
  ctx.state = ctx.state || {};
  ctx.state.settings = ctx.state.settings || { ai_mode: 'general' };
  return ctx.state.settings;
}

function getMode(ctx) {
  return getSettings(ctx).ai_mode || 'general';
}

function markAiActive(ctx) {
  const userId = getUserId(ctx);
  if (userId) aiActiveUsers.add(userId);
  return userId;
}

function setupStatusText() {
  const config = getAiProviderConfig();
  if (config.unknown) {
    return `\n\n⚠️ Неизвестный AI_PROVIDER: \`${config.provider}\`.\nИспользуй \`gemini\`, \`openai\`, \`claude\` или \`auto\`.`;
  }
  if (config.configured) {
    return `\n\n✅ Подключён провайдер: *${config.label}*\nМодель: \`${config.model}\``;
  }
  return `\n\n⚠️ ИИ пока не подключён к API.\nЧтобы ответы заработали, добавь переменную \`${config.keyEnv}\` в Railway или .env.`;
}

async function showAiEntry(ctx) {
  markAiActive(ctx);

  const mode = getMode(ctx);
  const modeInfo = AI_MODES[mode] || AI_MODES.general;

  await ctx.reply(
    `🤖 *ИИ-помощник включён*\n\nТекущий режим: ${modeInfo.label}${setupStatusText()}\n\nНапиши любой вопрос или идею, а я помогу.\n\n*Например:*\n— что написать девушке?\n— придумай мемную фразу\n— объясни простыми словами что такое ИИ\n— помоги начать знакомство\n— придумай описание для анкеты\n\n_Для выхода из ИИ-режима нажми "🔴 Выйти из ИИ"_`,
    { parse_mode: 'Markdown', ...aiKeyboard }
  );
}

function missingKeyText() {
  const config = getAiProviderConfig();
  if (config.unknown) {
    return `🤖 Указан неизвестный AI_PROVIDER: ${config.provider}\n\nИспользуй: gemini, openai, claude или auto.`;
  }
  return (
    `🤖 ИИ-помощник включается, но ответы пока не настроены.\n\n` +
    `Нужно добавить API-ключ: ${config.keyEnv}\n` +
    `Провайдер: ${config.label}\n` +
    `Модель: ${config.model}\n\n` +
    `Если хочешь Gemini, добавь GEMINI_API_KEY и поставь AI_PROVIDER=gemini.`
  );
}

function registerAiAssistant(bot) {
  // Вход в раздел ИИ
  bot.hears('🤖 ИИ-помощник', async (ctx) => {
    await showAiEntry(ctx);
  });

  // Выбор режима ИИ
  bot.hears('💬 Обычный', async (ctx) => {
    await setAiMode(ctx, 'general');
  });
  bot.hears('❤️ ИИ-знакомства', async (ctx) => {
    await setAiMode(ctx, 'dating');
  });
  bot.hears('😂 Мемный', async (ctx) => {
    await setAiMode(ctx, 'meme');
  });
  bot.hears('🧠 Объяснить', async (ctx) => {
    await setAiMode(ctx, 'explain');
  });
  bot.hears('✍️ Текст', async (ctx) => {
    await setAiMode(ctx, 'text');
  });

  async function setAiMode(ctx, mode) {
    const userId = markAiActive(ctx);
    if (userId) {
      try {
        updateSetting(userId, 'ai_mode', mode);
      } catch (error) {
        console.error('[AI settings]', error.message);
      }
    }
    getSettings(ctx).ai_mode = mode;

    const modeInfo = AI_MODES[mode] || AI_MODES.general;
    await ctx.reply(
      `✅ Режим переключён: *${modeInfo.label}*\n\nТеперь пиши свой вопрос 👇`,
      { parse_mode: 'Markdown', ...aiKeyboard }
    );
  }

  // Сбросить диалог ИИ
  bot.hears('🔄 Сбросить диалог', async (ctx) => {
    const userId = getUserId(ctx);
    if (userId) clearAiHistory(userId);
    await ctx.reply('🔄 Диалог сброшен. Начинаем с чистого листа!', aiKeyboard);
  });

  // Выйти из ИИ-режима
  bot.hears('🔴 Выйти из ИИ', async (ctx) => {
    const userId = getUserId(ctx);
    if (userId) aiActiveUsers.delete(userId);
    const { mainMenuKeyboard } = require('./menu');
    await ctx.reply('🤖 ИИ-помощник выключен. Возвращаемся в меню 👇', mainMenuKeyboard);
  });


  // Кнопка назад в ИИ должна выключать ИИ-режим, иначе следующий обычный текст снова уйдёт в AI.
  bot.hears('⬅️ Назад', async (ctx, next) => {
    const userId = getUserId(ctx);
    if (!aiActiveUsers.has(userId)) return next();

    aiActiveUsers.delete(userId);
    const { mainMenuKeyboard } = require('./menu');
    await ctx.reply('Главное меню 👇', mainMenuKeyboard);
  });

  // Команда /ai
  bot.command('ai', async (ctx) => {
    await showAiEntry(ctx);
  });

  // ============================================================
  // Обработка текстовых сообщений в режиме ИИ
  // ============================================================
  bot.on('text', async (ctx, next) => {
    const userId = getUserId(ctx);

    // Если пользователь не в режиме ИИ — пропускаем
    if (!aiActiveUsers.has(userId)) return next();

    const text = ctx.message.text.trim();

    // Пропускаем команды и кнопки меню
    if (text.startsWith('/') || text.startsWith('⬅️') || text.startsWith('🔴')) {
      return next();
    }

    // Кнопки управления режимом тоже пропускаем
    const modeButtons = ['💬 Обычный', '❤️ ИИ-знакомства', '😂 Мемный', '🧠 Объяснить', '✍️ Текст', '🔄 Сбросить диалог'];
    if (modeButtons.includes(text)) return next();

    // Проверка длины
    if (text.length > MAX_USER_MSG_LENGTH) {
      await ctx.reply(
        `Сообщение слишком длинное 😅\n\nПопробуй сократить вопрос и отправить ещё раз.\n_(Максимум ${MAX_USER_MSG_LENGTH} символов)_`,
        { parse_mode: 'Markdown' }
      );
      return;
    }

    const providerConfig = getAiProviderConfig();
    if (!providerConfig.configured) {
      await ctx.reply(missingKeyText());
      return;
    }

    // Получаем режим ИИ
    const mode = getMode(ctx);

    // Индикатор печатания
    try { await ctx.sendChatAction('typing'); } catch {}

    try {
      // Получаем историю диалога
      const history = getAiHistory(userId);

      // Запрос к ИИ
      const response = await askAI(history, text, mode);

      // Сохраняем сообщения в историю
      saveAiMessage(userId, 'user', text);
      saveAiMessage(userId, 'assistant', response);

      const modeInfo = AI_MODES[mode] || AI_MODES.general;
      await ctx.reply(
        `${modeInfo.emoji} ${response}`,
        {
          ...Markup.inlineKeyboard([
            [Markup.button.callback('🔄 Сбросить диалог', 'ai_clear_history')],
          ]),
        }
      );
    } catch (error) {
      console.error('[AI Handler Error]', error.message);

      if (error.code === 'NO_API_KEY' || error.message === 'NO_API_KEY') {
        await ctx.reply(missingKeyText());
      } else if (error.code === 'AI_BLOCKED') {
        await ctx.reply('🤖 Я не могу ответить на такой запрос. Попробуй переформулировать его безопаснее.');
      } else if (error.code === 'UNKNOWN_AI_PROVIDER') {
        await ctx.reply('🤖 Указан неизвестный AI_PROVIDER. Используй: gemini, openai или claude.');
      } else {
        await ctx.reply(
          '🤖 ИИ-помощник временно недоступен.\n\nПопробуй ещё раз чуть позже или выбери другой раздел в меню.'
        );
      }
    }
  });

  // Inline-кнопка сброса истории
  bot.action('ai_clear_history', async (ctx) => {
    await ctx.answerCbQuery('Диалог сброшен ✅');
    const userId = getUserId(ctx);
    if (userId) clearAiHistory(userId);
  });
}

module.exports = { registerAiAssistant, aiActiveUsers };
