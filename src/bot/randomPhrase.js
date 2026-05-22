// ============================================================
// src/bot/randomPhrase.js
// Раздел "🎲 Случайная фраза"
// ============================================================

const { Markup } = require('telegraf');
const {
  getRandomPhrase,
  getChatQuestion,
  getDatingPhrase,
  getMemeQuestion,
} = require('../data/phrases');

// Клавиатура раздела
const phraseKeyboard = Markup.keyboard([
  ['🎲 Дай фразу', '💬 Вопрос для общения'],
  ['❤️ Фраза для знакомства', '😂 Мемный вопрос'],
  ['⬅️ Назад'],
]).resize();

function registerRandomPhrase(bot) {
  // Вход в раздел
  bot.hears('🎲 Случайная фраза', async (ctx) => {
    const phrase = getRandomPhrase();
    await ctx.reply(
      `🎲 *Случайная фраза:*\n\n_${phrase}_\n\nИли выбери тип 👇`,
      { parse_mode: 'Markdown', ...phraseKeyboard }
    );
  });

  // Просто дай фразу
  bot.hears('🎲 Дай фразу', async (ctx) => {
    const phrase = getRandomPhrase();
    await ctx.reply(
      `🎲 *Фраза для разговора:*\n\n_${phrase}_`,
      {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
          [Markup.button.callback('🔄 Другую', 'new_random_phrase')],
        ]),
      }
    );
  });

  bot.action('new_random_phrase', async (ctx) => {
    await ctx.answerCbQuery();
    const phrase = getRandomPhrase();
    await ctx.editMessageText(
      `🎲 *Фраза для разговора:*\n\n_${phrase}_`,
      {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
          [Markup.button.callback('🔄 Другую', 'new_random_phrase')],
        ]),
      }
    );
  });

  // Вопрос для общения
  bot.hears('💬 Вопрос для общения', async (ctx) => {
    const question = getChatQuestion();
    await ctx.reply(
      `💬 *Вопрос для общения:*\n\n_${question}_`,
      {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
          [Markup.button.callback('🔄 Другой вопрос', 'new_chat_question')],
        ]),
      }
    );
  });

  bot.action('new_chat_question', async (ctx) => {
    await ctx.answerCbQuery();
    const question = getChatQuestion();
    await ctx.editMessageText(
      `💬 *Вопрос для общения:*\n\n_${question}_`,
      {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
          [Markup.button.callback('🔄 Другой вопрос', 'new_chat_question')],
        ]),
      }
    );
  });

  // Для знакомства
  bot.hears('❤️ Фраза для знакомства', async (ctx) => {
    // Проверяем, не находимся ли мы в другом разделе — этот handler самый общий
    const phrase = getDatingPhrase();
    await ctx.reply(
      `❤️ *Фраза для знакомства:*\n\n${phrase}`,
      {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
          [Markup.button.callback('🔄 Другая фраза', 'new_dating_phrase_random')],
        ]),
      }
    );
  });

  bot.action('new_dating_phrase_random', async (ctx) => {
    await ctx.answerCbQuery();
    const phrase = getDatingPhrase();
    await ctx.editMessageText(
      `❤️ *Фраза для знакомства:*\n\n${phrase}`,
      {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
          [Markup.button.callback('🔄 Другая фраза', 'new_dating_phrase_random')],
        ]),
      }
    );
  });

  // Мемный вопрос
  bot.hears('😂 Мемный вопрос', async (ctx) => {
    const question = getMemeQuestion();
    await ctx.reply(
      `😂 *Мемный вопрос:*\n\n_${question}_`,
      {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
          [Markup.button.callback('🔄 Другой', 'new_meme_question')],
        ]),
      }
    );
  });

  bot.action('new_meme_question', async (ctx) => {
    await ctx.answerCbQuery();
    const question = getMemeQuestion();
    await ctx.editMessageText(
      `😂 *Мемный вопрос:*\n\n_${question}_`,
      {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
          [Markup.button.callback('🔄 Другой', 'new_meme_question')],
        ]),
      }
    );
  });

  // Команда /random
  bot.command('random', async (ctx) => {
    const phrase = getRandomPhrase();
    await ctx.reply(`🎲 *Случайная фраза:*\n\n_${phrase}_`, { parse_mode: 'Markdown' });
  });
}

module.exports = { registerRandomPhrase };
