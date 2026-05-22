// ============================================================
// src/bot/menu.js
// Главное меню и команда /start
// ============================================================

const { Markup } = require('telegraf');

// Клавиатура главного меню
const mainMenuKeyboard = Markup.keyboard([
  ['💬 Общение', '❤️ Знакомства'],
  ['😂 Мемы', '👋 Приветствия'],
  ['🎲 Случайная фраза', '🤖 ИИ-помощник'],
  ['⚙️ Настройки'],
]).resize();

/**
 * Показать главное меню
 */
async function showMainMenu(ctx) {
  await ctx.reply(
    `Йоу! 👋\n\nЯ *FunTalk AI Bot* — бот для общения, знакомств, мемов и прикольных приветствий.\n\nЯ могу:\n💬 помочь начать разговор;\n❤️ помочь с анкетой для знакомства;\n😂 отправить мемную фразу;\n👋 придумать необычное приветствие;\n🤖 ответить на вопросы через ИИ-помощника.\n\nВыбери действие ниже 👇`,
    {
      parse_mode: 'Markdown',
      ...mainMenuKeyboard,
    }
  );
}

/**
 * Регистрация обработчиков главного меню
 */
function registerMenu(bot) {
  // Команда /start
  bot.start(async (ctx) => {
    await showMainMenu(ctx);
  });

  // Команда /menu
  bot.command('menu', async (ctx) => {
    await showMainMenu(ctx);
  });

  // Команда /help
  bot.command('help', async (ctx) => {
    await ctx.reply(
      `🤖 *Команды FunTalk AI Bot:*\n\n` +
      `/start — запустить бота\n` +
      `/menu — главное меню\n` +
      `/profile — моя анкета\n` +
      `/meme — случайный мем\n` +
      `/hello — прикольное приветствие\n` +
      `/random — случайная фраза\n` +
      `/ai — ИИ-помощник\n` +
      `/settings — настройки\n` +
      `/help — эта справка`,
      { parse_mode: 'Markdown' }
    );
  });
}

module.exports = { registerMenu, showMainMenu, mainMenuKeyboard };
