// ============================================================
// src/bot/dating.js
// Раздел "❤️ Знакомства"
// Создание, просмотр, редактирование и удаление анкеты
// ============================================================

const { Markup } = require('telegraf');
const { upsertProfile, getProfile, deleteProfile } = require('../database/db');
const { getDatingPhrase } = require('../data/phrases');

// Клавиатура раздела знакомств
const datingKeyboard = Markup.keyboard([
  ['📝 Создать анкету', '👤 Моя анкета'],
  ['✏️ Редактировать анкету', '🗑 Удалить анкету'],
  ['💬 Фраза для знакомства'],
  ['⬅️ Назад'],
]).resize();

// Состояния создания анкеты (хранятся в памяти во время сессии)
const profileStates = new Map();

/**
 * Форматировать анкету для отображения
 */
function formatProfile(profile) {
  return (
    `👤 *Анкета*\n\n` +
    `👤 Имя: ${profile.name || '—'}\n` +
    `🎂 Возраст: ${profile.age || '—'}\n` +
    `📍 Город: ${profile.city || '—'}\n` +
    `🎮 Интересы: ${profile.interests || '—'}\n` +
    `❤️ Цель: ${profile.goal || '—'}\n` +
    `✨ О себе: ${profile.description || '—'}\n` +
    `👁 Видимость: ${profile.is_visible ? 'открыта' : 'скрыта'}`
  );
}

/**
 * Запустить создание / редактирование анкеты
 */
async function startProfileCreation(ctx, userId, isEdit = false) {
  profileStates.set(userId, {
    step: 'name',
    data: {},
    isEdit,
  });

  await ctx.reply(
    `${isEdit ? '✏️ *Редактирование анкеты*' : '📝 *Создание анкеты*'}\n\nОтвечай на вопросы по очереди.\nДля отмены напиши /menu\n\n*Шаг 1/6 — Введи своё имя:*`,
    { parse_mode: 'Markdown' }
  );
}

function registerDating(bot) {
  // Вход в раздел знакомств
  bot.hears('❤️ Знакомства', async (ctx) => {
    await ctx.reply(
      '❤️ *Раздел Знакомства*\n\nЗдесь можно создать анкету, посмотреть её и получить фразы для начала общения.\n\nВыбери действие 👇',
      { parse_mode: 'Markdown', ...datingKeyboard }
    );
  });

  // Создать анкету
  bot.hears('📝 Создать анкету', async (ctx) => {
    const userId = ctx.state.dbUser.id;
    const existing = getProfile(userId);
    if (existing) {
      await ctx.reply(
        '📝 У тебя уже есть анкета. Хочешь обновить её?',
        Markup.inlineKeyboard([
          [Markup.button.callback('✏️ Да, редактировать', 'start_edit_profile')],
          [Markup.button.callback('❌ Нет, оставить', 'cancel_profile')],
        ])
      );
      return;
    }
    await startProfileCreation(ctx, userId, false);
  });

  bot.action('start_edit_profile', async (ctx) => {
    await ctx.answerCbQuery();
    await startProfileCreation(ctx, ctx.state.dbUser.id, true);
  });

  bot.action('cancel_profile', async (ctx) => {
    await ctx.answerCbQuery();
    await ctx.reply('Окей, анкета не изменена 👌', datingKeyboard);
  });

  // Редактировать анкету
  bot.hears('✏️ Редактировать анкету', async (ctx) => {
    const userId = ctx.state.dbUser.id;
    const existing = getProfile(userId);
    if (!existing) {
      await ctx.reply(
        '📝 У тебя пока нет анкеты. Сначала создай её!',
        datingKeyboard
      );
      return;
    }
    await startProfileCreation(ctx, userId, true);
  });

  // Посмотреть анкету
  bot.hears('👤 Моя анкета', async (ctx) => {
    const userId = ctx.state.dbUser.id;
    const profile = getProfile(userId);
    if (!profile) {
      await ctx.reply('У тебя пока нет анкеты 😊\nНажми *📝 Создать анкету*, чтобы заполнить её!', {
        parse_mode: 'Markdown',
        ...datingKeyboard,
      });
      return;
    }
    await ctx.reply(formatProfile(profile), {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([
        [Markup.button.callback('✏️ Редактировать', 'start_edit_profile')],
        [Markup.button.callback('🗑 Удалить анкету', 'confirm_delete_profile')],
      ]),
    });
  });

  // Удалить анкету
  bot.hears('🗑 Удалить анкету', async (ctx) => {
    await ctx.reply(
      '🗑 *Удалить анкету?*\n\nЭто действие нельзя отменить. Все данные анкеты будут удалены.',
      {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
          [Markup.button.callback('🗑 Да, удалить', 'confirm_delete_profile')],
          [Markup.button.callback('❌ Отмена', 'cancel_delete_profile')],
        ]),
      }
    );
  });

  bot.action('confirm_delete_profile', async (ctx) => {
    await ctx.answerCbQuery();
    const userId = ctx.state.dbUser.id;
    deleteProfile(userId);
    await ctx.reply('✅ Анкета удалена. Твои данные больше не хранятся.', datingKeyboard);
  });

  bot.action('cancel_delete_profile', async (ctx) => {
    await ctx.answerCbQuery();
    await ctx.reply('❌ Удаление отменено.', datingKeyboard);
  });

  // Фраза для знакомства
  bot.hears('💬 Фраза для знакомства', async (ctx) => {
    const phrase = getDatingPhrase();
    await ctx.reply(
      `💬 *Попробуй написать:*\n\n${phrase}`,
      {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
          [Markup.button.callback('🔄 Другая фраза', 'new_dating_phrase')],
        ]),
      }
    );
  });

  bot.action('new_dating_phrase', async (ctx) => {
    await ctx.answerCbQuery();
    const phrase = getDatingPhrase();
    await ctx.editMessageText(
      `💬 *Попробуй написать:*\n\n${phrase}`,
      {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
          [Markup.button.callback('🔄 Другая фраза', 'new_dating_phrase')],
        ]),
      }
    );
  });

  // Команда /profile
  bot.command('profile', async (ctx) => {
    const userId = ctx.state.dbUser.id;
    const profile = getProfile(userId);
    if (!profile) {
      await ctx.reply('У тебя пока нет анкеты 😊\nНажми "❤️ Знакомства" → "📝 Создать анкету"');
      return;
    }
    await ctx.reply(formatProfile(profile), { parse_mode: 'Markdown' });
  });

  // ============================================================
  // Обработчик шагов создания анкеты (текстовые сообщения)
  // ============================================================
  bot.on('text', async (ctx, next) => {
    const userId = ctx.state.dbUser.id;
    const state = profileStates.get(userId);

    // Если нет активного состояния — пропускаем
    if (!state) return next();

    const text = ctx.message.text.trim();

    // Отмена через /menu
    if (text.startsWith('/')) {
      profileStates.delete(userId);
      return next();
    }

    const { step, data } = state;

    // Шаги анкеты
    const steps = {
      name: {
        field: 'name',
        next: 'age',
        validate: (v) => v.length >= 2 && v.length <= 50,
        error: 'Имя должно быть от 2 до 50 символов.',
        question: '*Шаг 2/6 — Сколько тебе лет?* (только цифры)',
      },
      age: {
        field: 'age',
        next: 'city',
        validate: (v) => !isNaN(v) && +v >= 13 && +v <= 99,
        error: 'Введи корректный возраст (13–99).',
        question: '*Шаг 3/6 — Из какого ты города?*',
      },
      city: {
        field: 'city',
        next: 'interests',
        validate: (v) => v.length >= 2 && v.length <= 50,
        error: 'Город должен содержать от 2 до 50 символов.',
        question: '*Шаг 4/6 — Какие у тебя интересы?*\n_Например: игры, музыка, спорт_',
      },
      interests: {
        field: 'interests',
        next: 'goal',
        validate: (v) => v.length >= 3 && v.length <= 200,
        error: 'Напиши хотя бы несколько слов.',
        question: '*Шаг 5/6 — Цель знакомства?*\n_Например: общение, дружба, отношения_',
      },
      goal: {
        field: 'goal',
        next: 'description',
        validate: (v) => v.length >= 3 && v.length <= 100,
        error: 'Напиши цель (3–100 символов).',
        question: '*Шаг 6/6 — Расскажи о себе пару слов:*',
      },
      description: {
        field: 'description',
        next: 'done',
        validate: (v) => v.length >= 5 && v.length <= 300,
        error: 'Описание должно быть от 5 до 300 символов.',
        question: '',
      },
    };

    const current = steps[step];
    if (!current) return next();

    // Валидация
    if (!current.validate(text)) {
      await ctx.reply(`❌ ${current.error}`);
      return;
    }

    // Сохраняем поле
    data[current.field] = current.field === 'age' ? +text : text;
    state.step = current.next;
    profileStates.set(userId, state);

    if (current.next === 'done') {
      // Сохраняем анкету в базе
      upsertProfile(userId, {
        name: data.name,
        age: data.age,
        city: data.city,
        interests: data.interests,
        goal: data.goal,
        description: data.description,
        is_visible: 1,
      });
      profileStates.delete(userId);

      const profile = getProfile(userId);
      await ctx.reply(
        `✅ *Анкета сохранена!*\n\n${formatProfile(profile)}\n\n_Ты можешь редактировать или удалить её в любой момент._`,
        { parse_mode: 'Markdown', ...datingKeyboard }
      );
    } else {
      await ctx.reply(current.question, { parse_mode: 'Markdown' });
    }
  });
}

module.exports = { registerDating };
