// ============================================================
// src/bot/settings.js
// Раздел "⚙️ Настройки"
// ============================================================

const { Markup } = require('telegraf');
const { updateSetting, upsertSettings } = require('../database/db');

// Клавиатура раздела
const settingsKeyboard = Markup.keyboard([
  ['🎭 Стиль общения', '😂 Тематика мемов'],
  ['🤖 Режим ИИ'],
  ['⬅️ Назад'],
]).resize();

// Стили общения
const styles = {
  friendly: '😎 Дружеский',
  fun: '😄 Весёлый',
  cute: '💕 Милый',
  calm: '🧠 Спокойный',
  meme: '🔥 Мемный',
};

// Режимы ИИ
const aiModes = {
  general: '💬 Обычный помощник',
  dating: '❤️ Помощник для знакомств',
  meme: '😂 Мемный помощник',
  explain: '🧠 Объясни просто',
  text: '✍️ Помощник для текста',
};

function registerSettings(bot) {
  // Вход в настройки
  bot.hears('⚙️ Настройки', async (ctx) => {
    const s = ctx.state.settings;
    await ctx.reply(
      `⚙️ *Настройки*\n\n` +
      `🎭 Стиль: ${styles[s.style] || styles.friendly}\n` +
      `🤖 Режим ИИ: ${aiModes[s.ai_mode] || aiModes.general}\n\n` +
      `Выбери, что изменить 👇`,
      { parse_mode: 'Markdown', ...settingsKeyboard }
    );
  });

  // Команда /settings
  bot.command('settings', async (ctx) => {
    const s = ctx.state.settings;
    await ctx.reply(
      `⚙️ *Настройки*\n\n` +
      `🎭 Стиль: ${styles[s.style] || styles.friendly}\n` +
      `🤖 Режим ИИ: ${aiModes[s.ai_mode] || aiModes.general}`,
      { parse_mode: 'Markdown', ...settingsKeyboard }
    );
  });

  // Выбор стиля общения
  bot.hears('🎭 Стиль общения', async (ctx) => {
    const buttons = Object.entries(styles).map(([key, label]) => [
      Markup.button.callback(label, `set_style_${key}`),
    ]);
    await ctx.reply(
      '🎭 *Выбери стиль общения:*',
      { parse_mode: 'Markdown', ...Markup.inlineKeyboard(buttons) }
    );
  });

  Object.keys(styles).forEach((key) => {
    bot.action(`set_style_${key}`, async (ctx) => {
      await ctx.answerCbQuery();
      const userId = ctx.state.dbUser.id;
      updateSetting(userId, 'style', key);
      ctx.state.settings.style = key;
      await ctx.editMessageText(
        `✅ Стиль изменён: *${styles[key]}*`,
        { parse_mode: 'Markdown' }
      );
    });
  });

  // Выбор режима ИИ
  bot.hears('🤖 Режим ИИ', async (ctx) => {
    const buttons = Object.entries(aiModes).map(([key, label]) => [
      Markup.button.callback(label, `set_ai_mode_${key}`),
    ]);
    await ctx.reply(
      '🤖 *Выбери режим ИИ-помощника:*',
      { parse_mode: 'Markdown', ...Markup.inlineKeyboard(buttons) }
    );
  });

  Object.keys(aiModes).forEach((key) => {
    bot.action(`set_ai_mode_${key}`, async (ctx) => {
      await ctx.answerCbQuery();
      const userId = ctx.state.dbUser.id;
      updateSetting(userId, 'ai_mode', key);
      ctx.state.settings.ai_mode = key;
      await ctx.editMessageText(
        `✅ Режим ИИ изменён: *${aiModes[key]}*`,
        { parse_mode: 'Markdown' }
      );
    });
  });

  // Тематика мемов (заглушка для будущей версии)
  bot.hears('😂 Тематика мемов', async (ctx) => {
    await ctx.reply(
      '😂 *Тематика мемов*\n\nПока доступны все темы сразу. В следующей версии можно будет выбрать конкретную категорию! 🔧',
      { parse_mode: 'Markdown' }
    );
  });
}

module.exports = { registerSettings };
