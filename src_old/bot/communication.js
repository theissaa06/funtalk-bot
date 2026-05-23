// ============================================================
// src/bot/communication.js
// Раздел "💬 Общение"
// ============================================================

const { Markup } = require('telegraf');
const { mainMenuKeyboard } = require('./menu');

// Темы для разговора
const topics = [
  'Если бы твой день был фильмом, как бы он назывался? 🎬',
  'Что лучше: работать утром или ночью? 🌙',
  'Если бы ты мог выучить один язык за ночь — какой? 🌍',
  'Что ты откладываешь уже очень долго? 😅',
  'Какой подкаст или плейлист сейчас у тебя на повторе? 🎵',
  'Что для тебя значит "идеально провести день"? ✨',
  'Если бы ты мог попасть в любой сериал, который бы выбрал? 📺',
  'Что тебя последний раз по-настоящему удивило? 😲',
];

// Идеи для первого сообщения
const firstMessages = [
  '"Привет 😄 У тебя такое настроение на фото, будто ты знаешь секрет хорошего дня."',
  '"Хей 👋 Не хочу начинать с банального — поэтому сразу: что тебя сегодня радует?"',
  `"Привет! Вместо скучного 'как дела' — расскажи что-нибудь интересное о своём дне 😊"`,
  '"Хей! Ты выглядишь как человек, с которым интересно поговорить. Или я ошибаюсь? 😄"',
  '"Привет 🌟 Что у тебя сегодня хорошего?"',
];

// Ответы без кринжа
const noCringeReplies = [
  '"Ха, это интересно. Расскажи больше 😊"',
  '"Окей, ты меня удивил. Продолжай 😄"',
  '"Звучит круто. Как вообще к этому пришёл?"',
  '"Это неожиданно, но мне нравится 😏"',
  '"Серьёзно? Хочу знать детали 👀"',
];

function getRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

// Клавиатура раздела
const communicationKeyboard = Markup.keyboard([
  ['💬 Тема для разговора', '✍️ Что написать?'],
  ['😎 Ответ без кринжа', '❤️ Для знакомства'],
  ['⬅️ Назад'],
]).resize();

function registerCommunication(bot) {
  // Вход в раздел
  bot.hears('💬 Общение', async (ctx) => {
    await ctx.reply(
      '💬 *Раздел Общение*\n\nЗдесь помогу начать разговор, придумать первое сообщение или ответить без кринжа.\n\nВыбери, что нужно 👇',
      { parse_mode: 'Markdown', ...communicationKeyboard }
    );
  });

  // Тема для разговора
  bot.hears('💬 Тема для разговора', async (ctx) => {
    const topic = getRandom(topics);
    await ctx.reply(
      `💬 *Тема для разговора:*\n\n_${topic}_\n\nМожешь скопировать и использовать! 😄`,
      {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
          [Markup.button.callback('🔄 Другая тема', 'new_topic')],
          [Markup.button.callback('⬅️ Назад', 'back_to_comm')],
        ]),
      }
    );
  });

  bot.action('new_topic', async (ctx) => {
    await ctx.answerCbQuery();
    const topic = getRandom(topics);
    await ctx.editMessageText(
      `💬 *Тема для разговора:*\n\n_${topic}_\n\nМожешь скопировать и использовать! 😄`,
      {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
          [Markup.button.callback('🔄 Другая тема', 'new_topic')],
          [Markup.button.callback('⬅️ Назад', 'back_to_comm')],
        ]),
      }
    );
  });

  // Что написать
  bot.hears('✍️ Что написать?', async (ctx) => {
    const msg = getRandom(firstMessages);
    await ctx.reply(
      `✍️ *Попробуй написать вот так:*\n\n${msg}\n\n_Адаптируй под свой стиль!_`,
      {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
          [Markup.button.callback('🔄 Другой вариант', 'new_first_msg')],
          [Markup.button.callback('⬅️ Назад', 'back_to_comm')],
        ]),
      }
    );
  });

  bot.action('new_first_msg', async (ctx) => {
    await ctx.answerCbQuery();
    const msg = getRandom(firstMessages);
    await ctx.editMessageText(
      `✍️ *Попробуй написать вот так:*\n\n${msg}\n\n_Адаптируй под свой стиль!_`,
      {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
          [Markup.button.callback('🔄 Другой вариант', 'new_first_msg')],
          [Markup.button.callback('⬅️ Назад', 'back_to_comm')],
        ]),
      }
    );
  });

  // Ответ без кринжа
  bot.hears('😎 Ответ без кринжа', async (ctx) => {
    const reply = getRandom(noCringeReplies);
    await ctx.reply(
      `😎 *Ответь вот так:*\n\n${reply}\n\n_Коротко, уверенно, без кринжа 👊_`,
      {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
          [Markup.button.callback('🔄 Другой вариант', 'new_no_cringe')],
          [Markup.button.callback('⬅️ Назад', 'back_to_comm')],
        ]),
      }
    );
  });

  bot.action('new_no_cringe', async (ctx) => {
    await ctx.answerCbQuery();
    const reply = getRandom(noCringeReplies);
    await ctx.editMessageText(
      `😎 *Ответь вот так:*\n\n${reply}\n\n_Коротко, уверенно, без кринжа 👊_`,
      {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
          [Markup.button.callback('🔄 Другой вариант', 'new_no_cringe')],
          [Markup.button.callback('⬅️ Назад', 'back_to_comm')],
        ]),
      }
    );
  });

  // Для знакомства (перенаправление)
  bot.hears('❤️ Для знакомства', async (ctx) => {
    await ctx.reply(
      '❤️ Переходи в раздел *Знакомства* для анкеты и фраз для знакомства!',
      { parse_mode: 'Markdown', ...communicationKeyboard }
    );
  });

  // Назад
  bot.hears('⬅️ Назад', async (ctx) => {
    const { mainMenuKeyboard } = require('./menu');
    await ctx.reply('Главное меню 👇', mainMenuKeyboard);
  });

  bot.action('back_to_comm', async (ctx) => {
    await ctx.answerCbQuery();
    await ctx.reply(
      '💬 *Раздел Общение*\n\nВыбери, что нужно 👇',
      { parse_mode: 'Markdown', ...communicationKeyboard }
    );
  });
}

module.exports = { registerCommunication };
