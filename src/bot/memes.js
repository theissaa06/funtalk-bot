// ============================================================
// src/bot/memes.js
// Раздел "😂 Мемы"
// ============================================================

const { Markup } = require('telegraf');
const { getRandomMeme, getRandomReaction, getRandomMemeAnswer } = require('../data/memes');

// Клавиатура раздела
const memesKeyboard = Markup.keyboard([
  ['😂 Случайный мем', '🔥 Мемная фраза'],
  ['💬 Ответ для переписки', '🎭 Реакция на ситуацию'],
  ['⬅️ Назад'],
]).resize();

function registerMemes(bot) {
  // Вход в раздел
  bot.hears('😂 Мемы', async (ctx) => {
    await ctx.reply(
      '😂 *Раздел Мемы*\n\nЗдесь найдёшь мемные фразы, реакции и прикольные ответы для переписки 🔥\n\nВыбирай 👇',
      { parse_mode: 'Markdown', ...memesKeyboard }
    );
  });

  // Случайный мем
  bot.hears('😂 Случайный мем', async (ctx) => {
    const meme = getRandomMeme();
    await ctx.reply(
      `😂 *Мем дня:*\n\n_${meme}_`,
      {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
          [Markup.button.callback('🔄 Ещё мем', 'new_random_meme')],
        ]),
      }
    );
  });

  bot.action('new_random_meme', async (ctx) => {
    await ctx.answerCbQuery();
    const meme = getRandomMeme();
    await ctx.editMessageText(
      `😂 *Мем дня:*\n\n_${meme}_`,
      {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
          [Markup.button.callback('🔄 Ещё мем', 'new_random_meme')],
        ]),
      }
    );
  });

  // Мемная фраза (синоним кнопки)
  bot.hears('🔥 Мемная фраза', async (ctx) => {
    const meme = getRandomMeme();
    await ctx.reply(
      `🔥 *Мемная фраза:*\n\n_${meme}_\n\nСкопируй и отправь кому надо 😄`,
      {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
          [Markup.button.callback('🔄 Другая фраза', 'new_meme_phrase')],
        ]),
      }
    );
  });

  bot.action('new_meme_phrase', async (ctx) => {
    await ctx.answerCbQuery();
    const meme = getRandomMeme();
    await ctx.editMessageText(
      `🔥 *Мемная фраза:*\n\n_${meme}_\n\nСкопируй и отправь кому надо 😄`,
      {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
          [Markup.button.callback('🔄 Другая фраза', 'new_meme_phrase')],
        ]),
      }
    );
  });

  // Ответ для переписки
  bot.hears('💬 Ответ для переписки', async (ctx) => {
    const answer = getRandomMemeAnswer();
    await ctx.reply(
      `💬 *Мемный ответ для переписки:*\n\n${answer}`,
      {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
          [Markup.button.callback('🔄 Другой ответ', 'new_meme_answer')],
        ]),
      }
    );
  });

  bot.action('new_meme_answer', async (ctx) => {
    await ctx.answerCbQuery();
    const answer = getRandomMemeAnswer();
    await ctx.editMessageText(
      `💬 *Мемный ответ для переписки:*\n\n${answer}`,
      {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
          [Markup.button.callback('🔄 Другой ответ', 'new_meme_answer')],
        ]),
      }
    );
  });

  // Реакция на ситуацию
  bot.hears('🎭 Реакция на ситуацию', async (ctx) => {
    const reaction = getRandomReaction();
    await ctx.reply(
      `🎭 *Мемная реакция:*\n\n_${reaction}_`,
      {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
          [Markup.button.callback('🔄 Другая реакция', 'new_meme_reaction')],
        ]),
      }
    );
  });

  bot.action('new_meme_reaction', async (ctx) => {
    await ctx.answerCbQuery();
    const reaction = getRandomReaction();
    await ctx.editMessageText(
      `🎭 *Мемная реакция:*\n\n_${reaction}_`,
      {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
          [Markup.button.callback('🔄 Другая реакция', 'new_meme_reaction')],
        ]),
      }
    );
  });

  // Команда /meme
  bot.command('meme', async (ctx) => {
    const meme = getRandomMeme();
    await ctx.reply(`😂 *Случайный мем:*\n\n_${meme}_`, { parse_mode: 'Markdown' });
  });
}

module.exports = { registerMemes };
