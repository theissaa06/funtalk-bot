// ============================================================
// src/bot/menu.js
// Главное меню, /start, /help с полным описанием команд
// ============================================================

const { Markup } = require('telegraf');

// ── Клавиатура главного меню (reply-кнопки) ──────────────────
const mainMenuKeyboard = Markup.keyboard([
  ['💬 Общение', '❤️ Знакомства'],
  ['😂 Мемы', '👋 Приветствия'],
  ['🎲 Случайная фраза', '🤖 ИИ-помощник'],
  ['💞 Зашипить пару', '👫 Шип друзей'],
  ['⚙️ Настройки'],
]).resize();

// ── Inline-кнопки разделов справки ───────────────────────────
function helpMenuKeyboard() {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback('👤 Профиль и статы', 'help_profile'),
      Markup.button.callback('🎁 Бонусы и монеты', 'help_economy'),
    ],
    [
      Markup.button.callback('😂 Развлечения', 'help_fun'),
      Markup.button.callback('🤝 Социальное', 'help_social'),
    ],
    [
      Markup.button.callback('🛡 Модерация', 'help_mod'),
      Markup.button.callback('🔒 Защита чата', 'help_security'),
    ],
    [
      Markup.button.callback('📌 Закрепы и инфо', 'help_tools'),
      Markup.button.callback('🤖 ИИ-помощник', 'help_ai'),
    ],
    [Markup.button.callback('📋 Все команды списком', 'help_all')],
  ]);
}

// ── Тексты разделов справки ───────────────────────────────────

const HELP_SECTIONS = {
  profile: `👤 *Профиль и статистика*

/rank — твой уровень, XP и ранг
/top — топ чата по XP
/coins — баланс монет
/richest — топ по монетам
/id — твой Telegram ID
/info — информация о чате
/ping — проверить бота

📊 *Как работает система уровней:*
За каждое сообщение ты получаешь 1–5 XP (раз в 30 сек).
При повышении уровня бот сообщает об этом в чат.

🏅 *Ранги:*
🌱 Новичок → 🥉 Участник → 🥈 Опытный → 🥇 Про → 💎 Эксперт → 👑 Легенда`,

  economy: `🎁 *Бонусы и монеты*

/daily — ежедневный бонус (50–200 монет, раз в 24ч)
/coins — посмотреть баланс
/give — перевести монеты (ответом на сообщение)
/richest — топ богачей чата

💡 *Как ещё получить монеты:*
• +2 монеты за каждые 10 сообщений
• +25 монет при первом входе в чат
• Монеты начисляются автоматически`,

  fun: `😂 *Развлечения*

/meme — случайный мем
/topic — тема для разговора
/random — случайная фраза
/hello — прикольное приветствие
/flip — орёл или решка 🪙
/dice — бросить кубик 🎲
/ai — ИИ-помощник

🎭 *Кнопки меню:*
😂 Мемы — мемные фразы, реакции, ответы для переписки
👋 Приветствия — приветствия по стилям (дружеское, мемное, дерзкое...)
🎲 Случайная фраза — фразы, вопросы для общения, мемные вопросы
💞 Зашипить пару — случайный шип двух участников чата
👫 Шип друзей — случайный шип двух "лучших друзей" чата`,

  social: `🤝 *Социальные функции*

/friend — предложить дружбу (ответом на сообщение)
/friends — список друзей
/unfriend — удалить друга (ответом)
/love — начать отношения (ответом)
/couple — посмотреть свою пару
/breakup — расстаться
/hug — обнять (ответом) 🤗
/kiss — поцеловать (ответом) 😘
/pat — погладить (ответом) 🫶
/slap — шлёпнуть (ответом) 💥
/respect — дать репутацию (ответом) ⭐

💡 *Все социальные команды работают ответом на сообщение нужного человека*`,

  mod: `🛡 *Модерация* _(только для администраторов)_

/mute @user [время] — замутить (10m, 1h, 2d)
/unmute @user — снять мут
/ban @user — забанить
/unban @user — разбанить
/kick @user — кикнуть
/warn @user [причина] — предупреждение
/warnings @user — посмотреть предупреждения
/clearwarns @user — сбросить предупреждения
/del — удалить сообщение (ответом)
/modlog — лог последних действий
/admins — список администраторов
/setrank @user [ранг] — установить кастомный ранг

⚠️ *Автобан:* при 3 предупреждениях — автоматический бан
🛡 *Антифлуд:* 5 сообщений за 5 сек → мут на 60 сек
📢 /call — созыв всех участников (раз в 5 мин)`,

  security: `🔒 *Защита чата* _(только для администраторов)_

/security — статус и настройки защиты
/antilink_on / /antilink_off — анти-ссылки
/antiflood_on / /antiflood_off — антифлуд
/badwords_on / /badwords_off — антимат
/automute_on / /automute_off — авто-мут за нарушения
/badword_add [слово] — добавить слово в фильтр
/badword_list — список запрещённых слов
/badword_remove [слово] — удалить слово

🧩 *Расширенная защита:*
/advanced_security — статус капчи и whitelist
/captcha_on / /captcha_off — капча для новичков
/antibot_on / /antibot_off — авто-бан новых ботов
/smartlinks_on / /smartlinks_off — умная проверка ссылок
/whitelist_add [домен] — разрешить домен
/whitelist — список разрешённых доменов
/captcha_log — лог капчи`,

  tools: `📌 *Инструменты чата*

/pin — закрепить сообщение (ответом)
/unpin — открепить последнее закреплённое
/unpinall — открепить все закрепы
/id — твой ID / ID другого пользователя (ответом)
/info — информация о чате
/ping — задержка бота
/systemcheck — полная проверка системы
/botrights — права бота в чате
/privacyinfo — инструкция по Privacy Mode
/adminhelp — памятка администратора

⚙️ *Настройки:*
/settings — настройки бота
⚙️ Настройки → 🎭 Стиль общения — выбрать стиль
⚙️ Настройки → 🤖 Режим ИИ — выбрать режим ИИ-помощника`,

  ai: `🤖 *ИИ-помощник*

/ai — включить ИИ-помощника

После включения просто пиши любой вопрос:
• _что написать девушке?_
• _придумай мемную фразу_
• _объясни простыми словами что такое блокчейн_
• _помоги начать знакомство_
• _придумай описание для анкеты_

🎛 *Режимы ИИ:*
💬 Обычный — универсальный помощник
❤️ ИИ-знакомства — помощь с общением и знакомствами
😂 Мемный — генерирует шутки и мемные фразы
🧠 Объяснить — объясняет сложное простыми словами
✍️ Текст — помогает писать сообщения и посты

🔴 Для выхода из ИИ-режима нажми "🔴 Выйти из ИИ"

⚠️ _Требует настройки API-ключа в .env_`,

  all: `📋 *Все команды FunTalk Bot*

👤 *Профиль:* /rank /top /coins /richest /id /info /ping

🎁 *Бонусы:* /daily /give

😂 *Развлечения:* /meme /topic /random /hello /flip /dice /ai

🤝 *Социальное:* /friend /friends /unfriend /love /couple /breakup /hug /kiss /pat /slap /respect

🛡 *Модерация:* /mute /unmute /ban /unban /kick /warn /warnings /clearwarns /del /modlog /admins /setrank /call

🔒 *Защита:* /security /antilink_on /antilink_off /antiflood_on /antiflood_off /badwords_on /badwords_off /automute_on /automute_off /badword_add /badword_list /badword_remove /advanced_security /captcha_on /captcha_off /antibot_on /antibot_off /smartlinks_on /smartlinks_off /whitelist_add /whitelist /captcha_log

📌 *Инструменты:* /pin /unpin /unpinall /settings /systemcheck /botrights /privacyinfo /adminhelp

🤖 *ИИ:* /ai

📖 *Справка:* /start /menu /help`,
};

// ── Показать главное меню ─────────────────────────────────────
async function showMainMenu(ctx) {
  const name = ctx.from?.first_name || 'друг';
  await ctx.reply(
    `👋 Привет, *${name}*!\n\n` +
    `Я *FunTalk Bot* — бот для общения, развлечений и управления чатом.\n\n` +
    `*Что я умею:*\n` +
    `💬 Темы для разговора и помощь с общением\n` +
    `❤️ Анкеты для знакомств\n` +
    `😂 Мемные фразы и реакции\n` +
    `👋 Приветствия в разных стилях\n` +
    `🎲 Случайные фразы и вопросы\n` +
    `🤖 ИИ-помощник для любых вопросов\n` +
    `🛡 Модерация и защита чата\n` +
    `📊 Уровни, XP и монеты\n\n` +
    `Выбери раздел ниже 👇\n` +
    `Или напиши /help — полный список команд`,
    {
      parse_mode: 'Markdown',
      ...mainMenuKeyboard,
    }
  );
}

// ── Регистрация обработчиков ──────────────────────────────────
function registerMenu(bot) {

  // /start
  bot.start(async (ctx) => {
    await showMainMenu(ctx);
  });

  // /menu
  bot.command('menu', async (ctx) => {
    await showMainMenu(ctx);
  });

  // /help — показываем навигационное меню
  bot.command('help', async (ctx) => {
    await ctx.reply(
      `📖 *Справка FunTalk Bot*\n\nВыбери раздел, чтобы узнать подробнее 👇`,
      {
        parse_mode: 'Markdown',
        ...helpMenuKeyboard(),
      }
    );
  });

  // ── Обработчики inline-кнопок справки ────────────────────────

  const sections = ['profile', 'economy', 'fun', 'social', 'mod', 'security', 'tools', 'ai', 'all'];

  for (const key of sections) {
    bot.action(`help_${key}`, async (ctx) => {
      await ctx.answerCbQuery();
      await ctx.editMessageText(
        HELP_SECTIONS[key],
        {
          parse_mode: 'Markdown',
          ...Markup.inlineKeyboard([
            [Markup.button.callback('⬅️ Назад к разделам', 'help_back')],
          ]),
        }
      );
    });
  }

  // Кнопка "Назад" — возврат к меню разделов
  bot.action('help_back', async (ctx) => {
    await ctx.answerCbQuery();
    await ctx.editMessageText(
      `📖 *Справка FunTalk Bot*\n\nВыбери раздел, чтобы узнать подробнее 👇`,
      {
        parse_mode: 'Markdown',
        ...helpMenuKeyboard(),
      }
    );
  });

  // ── Кнопки шиппинга из главного меню ─────────────────────────
  bot.hears('💞 Зашипить пару', async (ctx) => {
    if (ctx.chat.type === 'private') {
      return ctx.reply('💞 Шиппинг работает только в группах — там есть кого шипперить!');
    }
    const { shipCouple } = require('./shipping');
    await shipCouple(ctx);
  });

  bot.hears('👫 Шип друзей', async (ctx) => {
    if (ctx.chat.type === 'private') {
      return ctx.reply('� Шип друзей работает только в группах!');
    }
    const { shipFriends } = require('./shipping');
    await shipFriends(ctx);
  });
}

module.exports = { registerMenu, showMainMenu, mainMenuKeyboard };
