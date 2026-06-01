// ============================================================
// src/bot/safety.js
// Безопасность: жалобы и простая фильтрация опасных запросов
// ============================================================

const { Markup } = require('telegraf');
const { saveReport } = require('../database/db');

const reportStates = new Set();

// Список ключевых слов-триггеров. Это базовая защита, не полноценная модерация.
const DANGEROUS_PATTERNS = [
  /взлом|взломать|хакнуть|hack/i,
  /спам|рассылка|массовая отправка/i,
  /адрес.*чужой|номер.*телефона.*чужой|личные данные.*найти/i,
  /угроза|убить|избить|напугать/i,
  /травля|буллинг|преследование/i,
];

function isDangerous(text = '') {
  return DANGEROUS_PATTERNS.some((pattern) => pattern.test(text));
}

function registerSafety(bot) {
  bot.hears('🚩 Пожаловаться', async (ctx) => {
    reportStates.add(ctx.state.dbUser.id);
    await ctx.reply(
      '🚩 *Подача жалобы*\n\nОпиши причину коротко: спам, оскорбления, нарушение правил и т.д.\n\nДля отмены напиши /menu',
      { parse_mode: 'Markdown' }
    );
  });

  bot.action('report_user', async (ctx) => {
    await ctx.answerCbQuery();
    reportStates.add(ctx.state.dbUser.id);
    await ctx.reply('🚩 Опиши причину жалобы одним сообщением:', Markup.forceReply());
  });

  bot.on('text', async (ctx, next) => {
    const userId = ctx.state.dbUser.id;
    if (!reportStates.has(userId)) return next();

    const text = ctx.message.text.trim();
    if (text.startsWith('/')) {
      reportStates.delete(userId);
      return next();
    }

    if (text.length < 3) {
      await ctx.reply('Напиши причину жалобы чуть подробнее, минимум 3 символа.');
      return;
    }

    saveReport(userId, text);
    reportStates.delete(userId);
    await ctx.reply('✅ Жалоба сохранена. Спасибо, что помогаешь делать бота безопаснее.');
  });
}

async function safetyMiddleware(ctx, next) {
  // Пропускаем callback_query (нажатия кнопок)
  if (ctx.callbackQuery) return next();

  if (ctx.message?.text) {
    const text = ctx.message.text;

    if (isDangerous(text)) {
      await ctx.reply(
        '🚫 Я не могу помочь с этим запросом, потому что это может нарушать безопасность или личные границы других людей.\n\nМогу помочь сделать безопасную альтернативу — просто спроси! 😊'
      );
      return;
    }
  }

  return next();
}

module.exports = { registerSafety, safetyMiddleware, isDangerous, reportStates };
