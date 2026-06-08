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
  ['🎰 Игры', '🏪 Магазин'],
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
    [
      Markup.button.callback('🎰 Мини-игры', 'help_games'),
      Markup.button.callback('🏪 Магазин', 'help_shop'),
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

  games: `🎰 *Мини-игры*

/casino [ставка] — слоты (мин. 10 монет)
/roulette [ставка] [red|black|green|even|odd|0-36] — рулетка
/duel [сумма] — дуэль (ответом на сообщение)
/guess — угадай число от 1 до 100

🎰 *Казино — выплаты:*
💎💎💎 — x10 | 7️⃣7️⃣7️⃣ — x8 | ⭐⭐⭐ — x5
🍇🍇🍇 — x4 | 🍊🍊🍊 — x3 | 🍋🍋🍋 — x2.5
🍒🍒🍒 — x2 | Два одинаковых — x1 (возврат)

🎡 *Рулетка — выплаты:*
Красное/чёрное — x2 | Чётное/нечётное — x2
Зеро — x14 | Конкретное число — x35

⚔️ *Дуэль:*
Вызов: ответь на сообщение /duel 100
Принять/отказать — кнопками (60 сек)

🔢 *Угадай число:*
/guess — начать игру
/guess [число] — назвать число
Награда зависит от количества попыток`,

  shop: `🏪 *Магазин и инвентарь*

/shop — открыть магазин
/inventory — мой инвентарь
/usetitle [id] — надеть титул

🏷 *Доступные товары:*
⭐ VIP — 500💰
🔥 Про игрок — 800💰
👑 Легенда — 2000💰
💎 Богач — 1500💰
🌑 Тень — 1000💰
🌟 Звезда чата — 1200💰
👻 Призрак — 700💰
🤴 Король — 3000💰
👸 Королева — 3000💰
💻 Хакер — 900💰
⚡ XP x2 (1 час) — 300💰
🎁 Бонус x2 (1 раз) — 200💰

Титулы отображаются в /rank`,

  all: `📋 *Все команды FunTalk Bot*

👤 *Профиль:* /rank /top /coins /richest /id /info /ping /mystats

🎁 *Бонусы:* /daily /give

😂 *Развлечения:* /meme /topic /random /hello /flip /dice /ai

🤝 *Социальное:* /friend /friends /unfriend /love /couple /breakup /hug /kiss /pat /slap /respect

⭐ *Репутация:* +реп / -реп / /toprep / /myrep

🎰 *Игры:* /casino /roulette /duel /guess

🏪 *Магазин:* /shop /inventory /usetitle

🏆 *Достижения:* /achievements

📊 *Статистика:* /chatstats /toptoday /mystats

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

  const sections = ['profile', 'economy', 'fun', 'social', 'mod', 'security', 'tools', 'ai', 'all', 'games', 'shop'];

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
      return ctx.reply('👫 Шип друзей работает только в группах!');
    }
    const { shipFriends } = require('./shipping');
    await shipFriends(ctx);
  });

  // ── Кнопка "🎰 Игры" ─────────────────────────────────────────
  bot.hears('🎰 Игры', async (ctx) => {
    await ctx.reply(
      `🎰 <b>Мини-игры FunTalk</b>\n\n` +
      `/casino [ставка] — слоты 🎰\n` +
      `/roulette [ставка] [цвет/число] — рулетка 🎡\n` +
      `/duel [сумма] — дуэль ⚔️ (ответом на сообщение)\n` +
      `/guess — угадай число 🔢\n\n` +
      `<b>Минимальная ставка: 10 монет</b>\n\n` +
      `💰 Монеты: /coins | Бонус: /daily`,
      {
        parse_mode: 'HTML',
        ...Markup.inlineKeyboard([
          [
            Markup.button.callback('🎰 Слоты (50)', 'game_casino_50'),
            Markup.button.callback('🎡 Рулетка', 'game_roulette_info'),
          ],
          [
            Markup.button.callback('🔢 Угадай число', 'game_guess_start'),
          ],
        ]),
      }
    );
  });

  // Быстрые кнопки игр
  bot.action('game_casino_50', async (ctx) => {
    await ctx.answerCbQuery();
    ctx.message = ctx.callbackQuery.message;
    ctx.message.text = '/casino 50';
    ctx.message.from = ctx.from;
    // Имитируем команду через reply
    await ctx.reply('/casino 50 — используй эту команду в чате!');
  });

  bot.action('game_roulette_info', async (ctx) => {
    await ctx.answerCbQuery();
    await ctx.editMessageText(
      `🎡 <b>Рулетка</b>\n\n` +
      `Команда: /roulette [ставка] [выбор]\n\n` +
      `<b>Варианты ставок:</b>\n` +
      `🔴 red — красное (x2)\n` +
      `⚫ black — чёрное (x2)\n` +
      `🟢 green — зеро (x14)\n` +
      `even — чётное (x2)\n` +
      `odd — нечётное (x2)\n` +
      `0–36 — конкретное число (x35)\n\n` +
      `Пример: /roulette 100 red`,
      {
        parse_mode: 'HTML',
        ...Markup.inlineKeyboard([[Markup.button.callback('⬅️ Назад', 'game_back')]]),
      }
    );
  });

  bot.action('game_guess_start', async (ctx) => {
    await ctx.answerCbQuery();
    await ctx.reply('🔢 Начинаю игру! Напиши /guess чтобы загадать число, потом /guess [число] чтобы угадать.');
  });

  bot.action('game_back', async (ctx) => {
    await ctx.answerCbQuery();
    await ctx.editMessageText(
      `🎰 <b>Мини-игры FunTalk</b>\n\n` +
      `/casino [ставка] — слоты 🎰\n` +
      `/roulette [ставка] [цвет/число] — рулетка 🎡\n` +
      `/duel [сумма] — дуэль ⚔️ (ответом)\n` +
      `/guess — угадай число 🔢`,
      {
        parse_mode: 'HTML',
        ...Markup.inlineKeyboard([
          [
            Markup.button.callback('🎰 Слоты (50)', 'game_casino_50'),
            Markup.button.callback('🎡 Рулетка', 'game_roulette_info'),
          ],
          [Markup.button.callback('🔢 Угадай число', 'game_guess_start')],
        ]),
      }
    );
  });

  // ── Кнопка "🏪 Магазин" — открывает магазин из shop.js ──────
  bot.hears('🏪 Магазин', async (ctx) => {
    try {
      const { pageText, pageKeyboard } = require('./shop');
      const chatId = ctx.chat.type === 'private' ? ctx.from.id : ctx.chat.id;
      const db     = require('../db');
      const user   = db.prepare('SELECT coins FROM users WHERE id = ? AND chat_id = ?').get(ctx.from.id, chatId);
      const coins  = user?.coins || 0;

      await ctx.reply(
        pageText(0, coins),
        { parse_mode: 'HTML', ...pageKeyboard(0) }
      );
    } catch (err) {
      console.error('[menu 🏪]', err.message);
      await ctx.reply('❌ Ошибка при открытии магазина. Попробуй /shop');
    }
  });
}

module.exports = { registerMenu, showMainMenu, mainMenuKeyboard };
