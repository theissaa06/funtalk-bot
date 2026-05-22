// ============================================================
// src/bot/aiAssistant.js
// Раздел "🤖 ИИ-помощник"
// ============================================================

const { Markup } = require('telegraf');
const { askAI } = require('../services/ai');
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

function registerAiAssistant(bot) {
  // Вход в раздел ИИ
  bot.hears('🤖 ИИ-помощник', async (ctx) => {
    const userId = ctx.state.dbUser.id;
    aiActiveUsers.add(userId);

    const mode = ctx.state.settings?.ai_mode || 'general';
    const modeInfo = AI_MODES[mode] || AI_MODES.general;

    await ctx.reply(
      `🤖 *ИИ-помощник включён*\n\nТекущий режим: ${modeInfo.label}\n\nНапиши любой вопрос или идею, а я помогу.\n\n*Например:*\n— что написать девушке?\n— придумай мемную фразу\n— объясни простыми словами что такое ИИ\n— помоги начать знакомство\n— придумай описание для анкеты\n\n_Для выхода из ИИ-режима нажми "🔴 Выйти из ИИ"_`,
      { parse_mode: 'Markdown', ...aiKeyboard }
    );
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
    const userId = ctx.state.dbUser.id;
    aiActiveUsers.add(userId);
    updateSetting(userId, 'ai_mode', mode);
    ctx.state.settings.ai_mode = mode;

    const modeInfo = AI_MODES[mode] || AI_MODES.general;
    await ctx.reply(
      `✅ Режим переключён: *${modeInfo.label}*\n\nТеперь пиши свой вопрос 👇`,
      { parse_mode: 'Markdown', ...aiKeyboard }
    );
  }

  // Сбросить диалог ИИ
  bot.hears('🔄 Сбросить диалог', async (ctx) => {
    const userId = ctx.state.dbUser.id;
    clearAiHistory(userId);
    await ctx.reply('🔄 Диалог сброшен. Начинаем с чистого листа!', aiKeyboard);
  });

  // Выйти из ИИ-режима
  bot.hears('🔴 Выйти из ИИ', async (ctx) => {
    const userId = ctx.state.dbUser.id;
    aiActiveUsers.delete(userId);
    const { mainMenuKeyboard } = require('./menu');
    await ctx.reply('🤖 ИИ-помощник выключен. Возвращаемся в меню 👇', mainMenuKeyboard);
  });


  // Кнопка назад в ИИ должна выключать ИИ-режим, иначе следующий обычный текст снова уйдёт в AI.
  bot.hears('⬅️ Назад', async (ctx, next) => {
    const userId = ctx.state.dbUser.id;
    if (!aiActiveUsers.has(userId)) return next();

    aiActiveUsers.delete(userId);
    const { mainMenuKeyboard } = require('./menu');
    await ctx.reply('Главное меню 👇', mainMenuKeyboard);
  });

  // Команда /ai
  bot.command('ai', async (ctx) => {
    const userId = ctx.state.dbUser.id;
    aiActiveUsers.add(userId);
    await ctx.reply(
      '🤖 *ИИ-помощник включён*\n\nПиши свой вопрос!',
      { parse_mode: 'Markdown', ...aiKeyboard }
    );
  });

  // ============================================================
  // Обработка текстовых сообщений в режиме ИИ
  // ============================================================
  bot.on('text', async (ctx, next) => {
    const userId = ctx.state.dbUser.id;

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

    // Проверка наличия API-ключа
    const provider = process.env.AI_PROVIDER || 'openai';
    const keyMap = {
      openai: process.env.OPENAI_API_KEY,
      claude: process.env.CLAUDE_API_KEY,
      gemini: process.env.GEMINI_API_KEY,
    };
    const apiKey = keyMap[provider];
    if (!apiKey || apiKey.startsWith('ВАШ_')) {
      await ctx.reply(
        `ИИ-помощник пока не настроен.\n\nДобавьте API-ключ в файл *.env* и перезапустите бота.\n\nПровайдер: \`${provider}\``,
        { parse_mode: 'Markdown' }
      );
      return;
    }

    // Получаем режим ИИ
    const mode = ctx.state.settings?.ai_mode || 'general';

    // Индикатор печатания
    await ctx.sendChatAction('typing');

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

      if (error.message === 'NO_API_KEY') {
        await ctx.reply('ИИ-помощник пока не настроен.\nДобавьте API-ключ в .env файл.');
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
    clearAiHistory(ctx.state.dbUser.id);
  });
}

module.exports = { registerAiAssistant, aiActiveUsers };
