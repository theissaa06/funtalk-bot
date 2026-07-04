// ============================================================
// src/index.js — Главный файл FunTalk Bot
// ============================================================

require('dotenv').config();

const { Telegraf } = require('telegraf');

const BOT_TOKEN = process.env.BOT_TOKEN;
if (!BOT_TOKEN) {
  console.error('❌ BOT_TOKEN не найден в .env');
  process.exit(1);
}

const isTest = process.env.NODE_ENV === 'test' || process.env.FUNTALK_TEST === '1';
const bot = new Telegraf(BOT_TOKEN);

// ── Вспомогательная функция безопасного ответа ───────────────
async function safeReply(ctx, text) {
  try {
    await ctx.reply(text);
  } catch (err) {
    console.error('[safeReply]', err.message);
  }
}

const helpers = { safeReply };

// ── Middleware: ctx.state.dbUser и ctx.state.settings ─────────
const { upsertUser, upsertSettings } = require('./database/db');

bot.use(async (ctx, next) => {
  try {
    if (ctx.from && !ctx.from.is_bot) {
      const dbUser = upsertUser(
        ctx.from.id,
        ctx.from.username  || null,
        ctx.from.first_name || null
      );
      ctx.state.dbUser    = dbUser;
      ctx.state.settings  = upsertSettings(dbUser.id);
    } else {
      ctx.state.dbUser   = ctx.state.dbUser   || { id: 0 };
      ctx.state.settings = ctx.state.settings || { style: 'friendly', ai_mode: 'general' };
    }
  } catch (err) {
    console.error('[userMiddleware]', err.message);
    ctx.state.dbUser   = ctx.state.dbUser   || { id: 0 };
    ctx.state.settings = ctx.state.settings || { style: 'friendly', ai_mode: 'general' };
  }
  return next();
});

// ══════════════════════════════════════════════════════════════
// ПОДКЛЮЧЕНИЕ МОДУЛЕЙ
// ══════════════════════════════════════════════════════════════

// Стабильность (глобальные обработчики ошибок, keep-alive HTTP)
const { setupStability } = require('./stability');
if (!isTest) {
  setupStability(bot);
}

// Русские команды (/мут → /mute и т.д.)
const ruCommands = require('./ruCommands');
ruCommands.register(bot);

// Модерация (mute/ban/kick/warn + антифлуд)
const moderation = require('./moderation');
moderation.register(bot);

// Удаление пользователей с запоминанием в базе
const removeUser = require('./removeUser');
removeUser.register(bot);

// Закрепы
const pin = require('./pin');
pin.register(bot);

// Уровни и XP
const levels = require('./levels');
levels.register(bot);

// Экономика (монеты, daily, give)
const economy = require('./economy');
economy.register(bot);

// Созыв участников
const call = require('./call');
call.register(bot);

// Инструменты чата (id, info, ping, meme, topic, random, flip, dice)
const chatTools = require('./chatTools');
chatTools.register(bot);

// Ранги администраторов
const adminRanks = require('./adminRanks');
adminRanks.register(bot);

// Безопасность (антиссылки, антифлуд, антимат)
const { registerSecurity } = require('./security');
registerSecurity(bot, helpers);

// Расширенная безопасность (капча, антибот, whitelist)
const { registerAdvancedSecurity } = require('./advancedSecurity');
registerAdvancedSecurity(bot, helpers);

// Документация команд
const { registerCommandDocs } = require('./commandDocs');
registerCommandDocs(bot, helpers);

// Системные инструменты
const { registerSystemTools } = require('./systemTools');
registerSystemTools(bot, helpers);

// Автоответчик
const autoResponder = require('./autoResponder');
autoResponder.register(bot);

// ── Модули из src/bot/ ────────────────────────────────────────

// Главное меню (/start, /menu, /help)
const { registerMenu } = require('./bot/menu');
registerMenu(bot);

// Приветствие новых участников
const { registerWelcome } = require('./bot/welcome');
registerWelcome(bot);

// Раздел "💬 Общение"
const { registerCommunication } = require('./bot/communication');
registerCommunication(bot);

// Раздел "❤️ Знакомства"
const { registerDating } = require('./bot/dating');
registerDating(bot);

// Раздел "😂 Мемы"
const { registerMemes } = require('./bot/memes');
registerMemes(bot);

// Раздел "👋 Приветствия"
const { registerGreetings } = require('./bot/greetings');
registerGreetings(bot);

// Раздел "🎲 Случайная фраза"
const { registerRandomPhrase } = require('./bot/randomPhrase');
registerRandomPhrase(bot);

// Раздел "🤖 ИИ-помощник"
const { registerAiAssistant } = require('./bot/aiAssistant');
registerAiAssistant(bot);

// Раздел "⚙️ Настройки"
const { registerSettings } = require('./bot/settings');
registerSettings(bot);

// Шиппинг пар и друзей
const { registerShipping } = require('./bot/shipping');
registerShipping(bot);

// 🎰 Мини-игры (казино, рулетка, дуэль, угадай число)
const { registerGames } = require('./bot/games');
registerGames(bot);

// 🏪 Магазин (титулы, бусты)
const { registerShop } = require('./bot/shop');
registerShop(bot);

// 🏆 Достижения
const { registerAchievements } = require('./bot/achievements');
registerAchievements(bot);

// ⭐ Репутация (+реп / -реп)
const { registerReputation } = require('./bot/reputation');
registerReputation(bot);

// 📊 Статистика чата
const { registerChatStats } = require('./bot/chatstats');
registerChatStats(bot);

// 🎬 Скачивание видео/фото (TikTok, YouTube, Instagram, VK)
const { registerDownloader } = require('./bot/downloader');
registerDownloader(bot);

// Безопасность (жалобы, фильтрация опасных запросов)
// ВАЖНО: подключать последним чтобы не блокировать другие обработчики
const { registerSafety, safetyMiddleware } = require('./bot/safety');
registerSafety(bot);
bot.use(safetyMiddleware);

// ── Запуск ────────────────────────────────────────────────────
async function launchBotWithRetry(retries = 0) {
  try {
    // dropPendingUpdates: true очищает старые обновления при перезапуске
    // это решает ошибку 409 при деплое на Railway
    await bot.launch({ dropPendingUpdates: true });
    console.log('✅ FunTalk Bot запущен!');

    // Команды для всех пользователей
    await bot.telegram.setMyCommands([
      { command: 'start',        description: '🏠 Главное меню' },
      { command: 'help',         description: '📖 Справка по всем командам' },
      { command: 'menu',         description: '📋 Открыть меню' },

      // Профиль
      { command: 'rank',         description: '📊 Мой уровень и XP' },
      { command: 'top',          description: '🏆 Топ чата по XP' },
      { command: 'coins',        description: '💰 Мой баланс монет' },
      { command: 'richest',      description: '💎 Топ богачей чата' },
      { command: 'daily',        description: '🎁 Ежедневный бонус' },
      { command: 'give',         description: '💸 Перевести монеты (ответом)' },
      { command: 'mystats',      description: '📊 Моя статистика' },

      // Репутация
      { command: 'myrep',        description: '⭐ Моя репутация' },
      { command: 'toprep',       description: '🌟 Топ по репутации' },

      // Достижения и магазин
      { command: 'achievements', description: '🏆 Мои достижения' },
      { command: 'shop',         description: '🏪 Магазин' },
      { command: 'inventory',    description: '🎒 Мой инвентарь' },

      // Игры
      { command: 'casino',       description: '🎰 Казино / слоты' },
      { command: 'roulette',     description: '🎡 Рулетка' },
      { command: 'duel',         description: '⚔️ Дуэль (ответом)' },
      { command: 'guess',        description: '🔢 Угадай число' },

      // Развлечения
      { command: 'meme',         description: '😂 Случайный мем' },
      { command: 'topic',        description: '💬 Тема для разговора' },
      { command: 'random',       description: '🎲 Случайная фраза' },
      { command: 'hello',        description: '👋 Прикольное приветствие' },
      { command: 'flip',         description: '🪙 Орёл или решка' },
      { command: 'dice',         description: '🎲 Бросить кубик' },

      // Скачивание
      { command: 'download',     description: '🎬 Скачать видео/фото (TikTok, YouTube...)' },

      // Социальное
      { command: 'friend',       description: '🤝 Предложить дружбу (ответом)' },
      { command: 'friends',      description: '👥 Мои друзья' },
      { command: 'unfriend',     description: '💔 Удалить друга (ответом)' },
      { command: 'love',         description: '❤️ Начать отношения (ответом)' },
      { command: 'couple',       description: '💑 Моя пара' },
      { command: 'breakup',      description: '💔 Расстаться' },
      { command: 'hug',          description: '🤗 Обнять (ответом)' },
      { command: 'kiss',         description: '😘 Поцеловать (ответом)' },
      { command: 'pat',          description: '🫶 Погладить (ответом)' },
      { command: 'slap',         description: '💥 Шлёпнуть (ответом)' },

      // Информация
      { command: 'id',           description: '🪪 Мой Telegram ID' },
      { command: 'info',         description: 'ℹ️ Информация о чате' },
      { command: 'ping',         description: '🏓 Проверить бота' },
      { command: 'ai',           description: '🤖 ИИ-помощник' },
      { command: 'settings',     description: '⚙️ Настройки' },
    ]);

    // Команды только для администраторов
    await bot.telegram.setMyCommands([
      { command: 'mute',              description: '🔇 Замутить участника' },
      { command: 'unmute',            description: '🔊 Снять мут' },
      { command: 'ban',               description: '🔨 Забанить участника' },
      { command: 'unban',             description: '✅ Разбанить участника' },
      { command: 'kick',              description: '👢 Кикнуть участника' },
      { command: 'warn',              description: '⚠️ Выдать предупреждение' },
      { command: 'warnings',          description: '📋 Предупреждения участника' },
      { command: 'clearwarns',        description: '🗑 Сбросить предупреждения' },
      { command: 'del',               description: '🗑 Удалить сообщение (ответом)' },
      { command: 'modlog',            description: '📜 Лог модерации' },
      { command: 'admins',            description: '🛡 Список администраторов' },
      { command: 'setrank',           description: '🏅 Установить ранг участнику' },
      { command: 'call',              description: '📢 Созыв всех участников' },
      { command: 'pin',               description: '📌 Закрепить сообщение (ответом)' },
      { command: 'unpin',             description: '📌 Открепить последнее' },
      { command: 'unpinall',          description: '📌 Открепить все закрепы' },
      { command: 'security',          description: '🛡 Настройки защиты' },
      { command: 'advanced_security', description: '🧩 Расширенная защита' },
      { command: 'chatstats',         description: '📊 Статистика чата' },
      { command: 'toptoday',          description: '🔥 Топ активности за сегодня' },
      { command: 'systemcheck',       description: '🧪 Проверка системы' },
      { command: 'botrights',         description: '🔑 Права бота в чате' },
      { command: 'adminhelp',         description: '📖 Памятка администратора' },
    ], { scope: { type: 'all_chat_administrators' } });

    console.log('✅ Команды зарегистрированы в Telegram');
  } catch (err) {
    console.error('❌ Ошибка запуска бота:', err.message);
    
    // Если получена ошибка 409 (Conflict), попробуем перезагрузить через несколько секунд
    if (err.message.includes('409') && retries < 10) {
      const delaySeconds = 5 + (retries * 2); // 5, 7, 9, 11... секунд
      console.log(`⏳ Ошибка конфликта. Попытка ${retries + 1}/10 через ${delaySeconds} сек...`);
      setTimeout(() => launchBotWithRetry(retries + 1), delaySeconds * 1000);
    } else if (retries >= 10) {
      console.error('❌ Не удалось запустить бота после 10 попыток.');
      process.exit(1);
    } else {
      process.exit(1);
    }
  }
}

if (require.main === module && !isTest) {
  launchBotWithRetry();
}

module.exports = {
  bot,
  launchBotWithRetry,
  safeReply,
};
