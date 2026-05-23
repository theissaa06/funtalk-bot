// ============================================================
// src/index.js
// Главный файл FunTalk Bot
// Аккуратная загрузка всех модулей.
// ============================================================

require("dotenv").config();

const http = require("http");
const { Telegraf } = require("telegraf");

const BOT_TOKEN = process.env.BOT_TOKEN;

if (!BOT_TOKEN) {
  console.error("❌ BOT_TOKEN не найден в .env");
  console.error("Добавь в .env строку: BOT_TOKEN=твой_токен_от_BotFather");
  process.exit(1);
}

const bot = new Telegraf(BOT_TOKEN);

// ── Keep-alive сервер для Render ─────────────────────────────
const PORT = process.env.PORT || 3000;

http
  .createServer((req, res) => {
    res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("FunTalk Bot is running ✅");
  })
  .listen(PORT, () => {
    console.log(`🌐 Keep-alive сервер слушает порт ${PORT}`);
  });

// ── Общие helpers для старых модулей ─────────────────────────
const helpers = {
  safeReply: async (ctx, text, extra = {}) => {
    try {
      if (!ctx || !ctx.reply) return null;
      return await ctx.reply(text, extra);
    } catch (err) {
      console.error("[helpers:safeReply]", err.message);
      return null;
    }
  },

  safeDelete: async (ctx, messageId) => {
    try {
      if (!ctx || !ctx.telegram || !ctx.chat) return false;
      await ctx.telegram.deleteMessage(ctx.chat.id, messageId);
      return true;
    } catch (err) {
      console.error("[helpers:safeDelete]", err.message);
      return false;
    }
  },

  isAdmin: async (ctx, userId) => {
    try {
      const member = await ctx.telegram.getChatMember(ctx.chat.id, userId);
      return member.status === "creator" || member.status === "administrator";
    } catch (err) {
      console.error("[helpers:isAdmin]", err.message);
      return false;
    }
  },

  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
};

// ── Возможные имена функций у модулей ─────────────────────────
const moduleRegisterNames = {
  ruCommands: ["register"],
  removeUser: ["register"],
  stability: ["register", "registerStability"],
  moderation: ["register", "registerModeration"],
  levels: ["register", "registerLevels"],
  economy: ["register", "registerEconomy"],
  chatTools: ["register", "registerChatTools"],
  adminRanks: ["register", "registerAdminRanks"],
  call: ["register"],
  pin: ["register"],
  autoResponder: ["register", "registerAutoResponder"],
  commandDocs: ["register", "registerCommandDocs"],
  systemTools: ["register", "registerSystemTools"],
  advancedSecurity: ["register", "registerAdvancedSecurity"],
  security: ["register", "registerSecurity"],
};

// ── Безопасная загрузка модулей ──────────────────────────────
function registerModule(name) {
  try {
    const mod = require(`./${name}`);

    if (typeof mod === "function") {
      mod(bot, helpers);
      console.log(`✅ Модуль ${name} подключён`);
      return;
    }

    const possibleNames = moduleRegisterNames[name] || ["register"];

    for (const fnName of possibleNames) {
      if (mod && typeof mod[fnName] === "function") {
        mod[fnName](bot, helpers);
        console.log(`✅ Модуль ${name} подключён через ${fnName}()`);
        return;
      }
    }

    console.log(`⚠️ Модуль ${name} загружен, но register-функция не найдена`);
  } catch (error) {
    console.error(`❌ Ошибка подключения модуля ${name}:`, error.message);
    throw error;
  }
}

// ── Порядок важен ────────────────────────────────────────────
const modules = [
  "ruCommands",
  "removeUser",
  "stability",
  "moderation",
  "levels",
  "economy",
  "chatTools",
  "adminRanks",
  "call",
  "pin",
  "autoResponder",
  "commandDocs",
  "systemTools",
  "advancedSecurity",
  "security",
];

for (const moduleName of modules) {
  registerModule(moduleName);
}

// ── Глобальная обработка ошибок Telegraf ─────────────────────
bot.catch((err, ctx) => {
  console.error("❌ Ошибка бота:", err);

  try {
    if (ctx && ctx.reply) {
      ctx.reply("⚠️ Произошла ошибка, но бот продолжает работать.").catch(() => {});
    }
  } catch {
    // ignore
  }
});

// ── Запуск бота ──────────────────────────────────────────────
bot
  .launch()
  .then(() => {
    console.log("✅ FunTalk Bot запущен.");
    console.log("📌 Главная команда: /commands");
  })
  .catch((error) => {
    console.error("❌ Не удалось запустить бота:", error.message);

    if (String(error.message).includes("409")) {
      console.error("⚠️ 409 Conflict: бот уже запущен где-то ещё, например на Render или в другом терминале.");
      console.error("Оставь только одну копию бота: либо локально, либо Render.");
    }

    process.exit(1);
  });

// ── Корректная остановка ─────────────────────────────────────
process.once("SIGINT", () => {
  console.log("🛑 Получен SIGINT. Останавливаем бота...");
  bot.stop("SIGINT");
});

process.once("SIGTERM", () => {
  console.log("🛑 Получен SIGTERM. Останавливаем бота...");
  bot.stop("SIGTERM");
});
