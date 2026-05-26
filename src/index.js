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

// ── Middleware: устанавливаем ctx.state.dbUser и ctx.state.settings ──
// Нужно для модулей bot/settings.js, bot/dating.js, bot/aiAssistant.js
const { upsertUser, upsertSettings } = require('./database/db');

bot.use(async (ctx, next) => {
  try {
    if (ctx.from && !ctx.from.is_bot) {
      const dbUser = upsertUser(
        ctx.from.id,
        ctx.from.username || null,
        ctx.from.first_name || null
      );
      ctx.state.dbUser = dbUser;
      ctx.state.settings = upsertSettings(dbUser.id);
    } else {
      // Заглушка для случаев без from (например, channel posts)
      ctx.state.dbUser = ctx.state.dbUser || { id: 0 };
      ctx.state.settings = ctx.state.settings || { style: 'friendly', ai_mode: 'general' };
    }
  } catch (err) {
    console.error('[userMiddleware]', err.message);
    ctx.state.dbUser = ctx.state.dbUser || { id: 0 };
    ctx.state.settings = ctx.state.settings || { style: 'friendly', ai_mode: 'general' };
  }
  return next();
});

// ── Подключаем модули ─────────────────────────────────────────

// Стабильность (глобальные обработчики ошибок, keep-alive)
const { setupStability } = require('./stability');
setupStability(bot);

// Русские команды (маппер /мут → /mute и т.д.)
const ruCommands = require('./ruCommands');
ruCommands.register(bot);

// Модерация
const moderation = require('./moderation');
moderation.register(bot);

// Удаление пользователей (ban/kick/unban с расширенной логикой)
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

// Инструменты чата (id, info, ping, meme, topic, random, flip, dice, settings)
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

// Системные инструменты (systemcheck, botrights, ping и т.д.)
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

// Безопасность (жалобы, фильтрация опасных запросов)
const { registerSafety, safetyMiddleware } = require('./bot/safety');
registerSafety(bot);
bot.use(safetyMiddleware);

// ── Запуск ────────────────────────────────────────────────────
bot.launch()
  .then(() => {
    console.log('✅ FunTalk Bot запущен!');
  })
  .catch((err) => {
    console.error('❌ Ошибка запуска бота:', err.message);
    process.exit(1);
  });
