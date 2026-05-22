// ============================================================
// src/bot/greetings.js
// Раздел "👋 Приветствия"
// ============================================================

const { Markup } = require('telegraf');
const { getGreeting } = require('../data/greetings');

// Категории и их ключи
const categories = {
  '😄 Дружеское': 'friendly',
  '💕 Милое': 'cute',
  '😂 Мемное': 'meme',
  '😎 Дерзкое': 'bold',
  '❤️ Приветствие для знакомства': 'dating',
  '👥 Для группы': 'group',
  '⚡ Короткое': 'short',
};

// Клавиатура раздела
const greetingsKeyboard = Markup.keyboard([
  ['😄 Дружеское', '💕 Милое'],
  ['😂 Мемное', '😎 Дерзкое'],
  ['❤️ Приветствие для знакомства', '👥 Для группы'],
  ['⚡ Короткое'],
  ['⬅️ Назад'],
]).resize();

function registerGreetings(bot) {
  // Вход в раздел
  bot.hears('👋 Приветствия', async (ctx) => {
    await ctx.reply(
      '👋 *Раздел Приветствия*\n\nВыбери стиль приветствия 👇',
      { parse_mode: 'Markdown', ...greetingsKeyboard }
    );
  });

  // Обработчики каждой категории
  Object.entries(categories).forEach(([buttonText, key]) => {
    bot.hears(buttonText, async (ctx) => {
      const greeting = getGreeting(key);
      const label = buttonText.split(' ').slice(1).join(' '); // убираем эмодзи
      await ctx.reply(
        `${buttonText.split(' ')[0]} *${label} приветствие:*\n\n_${greeting}_\n\nСкопируй и отправь! 😄`,
        {
          parse_mode: 'Markdown',
          ...Markup.inlineKeyboard([
            [Markup.button.callback('🔄 Другое', `new_greeting_${key}`)],
          ]),
        }
      );
    });

    bot.action(`new_greeting_${key}`, async (ctx) => {
      await ctx.answerCbQuery();
      const greeting = getGreeting(key);
      const label = buttonText.split(' ').slice(1).join(' ');
      await ctx.editMessageText(
        `${buttonText.split(' ')[0]} *${label} приветствие:*\n\n_${greeting}_\n\nСкопируй и отправь! 😄`,
        {
          parse_mode: 'Markdown',
          ...Markup.inlineKeyboard([
            [Markup.button.callback('🔄 Другое', `new_greeting_${key}`)],
          ]),
        }
      );
    });
  });

  // Команда /hello
  bot.command('hello', async (ctx) => {
    const greeting = getGreeting('friendly');
    await ctx.reply(`👋 *Прикольное приветствие:*\n\n_${greeting}_`, { parse_mode: 'Markdown' });
  });
}

module.exports = { registerGreetings };
