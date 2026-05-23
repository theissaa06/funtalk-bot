const fs = require("fs");
const path = require("path");
const Database = require("better-sqlite3");

const dbPath = process.env.DATABASE_PATH || "./data/bot.sqlite";
const dbDir = path.dirname(dbPath);
const logsDir = path.join(process.cwd(), "logs");

if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

const db = new Database(dbPath);

db.exec(`
CREATE TABLE IF NOT EXISTS stability_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL,
  chat_id TEXT,
  user_id TEXT,
  message TEXT,
  stack TEXT,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS bot_runtime (
  key TEXT PRIMARY KEY,
  value TEXT,
  updated_at INTEGER
);
`);

function now() {
  return Date.now();
}

function formatDate(ts = Date.now()) {
  return new Date(Number(ts)).toLocaleString("ru-RU");
}

function isGroup(ctx) {
  const type = ctx.chat?.type;
  return type === "group" || type === "supergroup";
}

function writeFileLog(type, payload) {
  try {
    const file = path.join(logsDir, `${new Date().toISOString().slice(0, 10)}.log`);
    const line =
      `[${new Date().toISOString()}] [${type}] ` +
      JSON.stringify(payload, null, 0) +
      "\n";

    fs.appendFileSync(file, line, "utf8");
  } catch {
    // Не падаем из-за логов
  }
}

function saveStabilityLog(type, ctx, errorOrMessage) {
  const message =
    typeof errorOrMessage === "string"
      ? errorOrMessage
      : errorOrMessage?.message || "unknown";

  const stack =
    typeof errorOrMessage === "string"
      ? ""
      : errorOrMessage?.stack || "";

  const chatId = ctx?.chat?.id ? String(ctx.chat.id) : "";
  const userId = ctx?.from?.id ? String(ctx.from.id) : "";

  try {
    db.prepare(`
      INSERT INTO stability_logs (type, chat_id, user_id, message, stack, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(type, chatId, userId, message, stack, now());
  } catch {
    // Не падаем из-за БД
  }

  writeFileLog(type, {
    chatId,
    userId,
    message,
    stack,
  });
}

function setRuntime(key, value) {
  db.prepare(`
    INSERT INTO bot_runtime (key, value, updated_at)
    VALUES (?, ?, ?)
    ON CONFLICT(key)
    DO UPDATE SET value = excluded.value,
                  updated_at = excluded.updated_at
  `).run(String(key), String(value), now());
}

function getRuntime(key) {
  const row = db.prepare(`
    SELECT value FROM bot_runtime WHERE key = ?
  `).get(String(key));

  return row?.value || "";
}

function getUptimeText() {
  const startedAt = Number(getRuntime("started_at") || Date.now());
  const diff = Date.now() - startedAt;

  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days} дн. ${hours % 24} ч.`;
  if (hours > 0) return `${hours} ч. ${minutes % 60} мин.`;
  if (minutes > 0) return `${minutes} мин. ${seconds % 60} сек.`;
  return `${seconds} сек.`;
}

async function isAdmin(ctx, userId) {
  try {
    const member = await ctx.telegram.getChatMember(ctx.chat.id, userId);
    return member.status === "creator" || member.status === "administrator";
  } catch {
    return false;
  }
}

async function requireAdmin(ctx, safeReply) {
  if (!isGroup(ctx)) return true;

  const ok = await isAdmin(ctx, ctx.from.id);

  if (!ok) {
    await safeReply(ctx, "⛔ Эту команду может использовать только админ.");
    return false;
  }

  return true;
}

function getMemoryInfo() {
  const usage = process.memoryUsage();

  return {
    rss: Math.round(usage.rss / 1024 / 1024),
    heapTotal: Math.round(usage.heapTotal / 1024 / 1024),
    heapUsed: Math.round(usage.heapUsed / 1024 / 1024),
  };
}

function getLastErrors(limit = 5) {
  return db.prepare(`
    SELECT * FROM stability_logs
    ORDER BY id DESC
    LIMIT ?
  `).all(limit);
}

function registerStability(bot, helpers) {
  const { safeReply } = helpers;

  setRuntime("started_at", String(Date.now()));
  setRuntime("last_start", new Date().toISOString());

  process.on("uncaughtException", (error) => {
    console.error("❌ uncaughtException:", error);
    saveStabilityLog("UNCAUGHT_EXCEPTION", null, error);
  });

  process.on("unhandledRejection", (reason) => {
    console.error("❌ unhandledRejection:", reason);
    saveStabilityLog("UNHANDLED_REJECTION", null, reason instanceof Error ? reason : String(reason));
  });

  bot.use(async (ctx, next) => {
    try {
      return await next();
    } catch (error) {
      console.error("❌ Middleware crash:", error);
      saveStabilityLog("MIDDLEWARE_ERROR", ctx, error);

      await safeReply(
        ctx,
        "⚠️ Внутренняя ошибка обработчика, но бот продолжает работать.\n\nАдмин может посмотреть /lasterrors"
      ).catch(() => {});
    }
  });

  bot.command("reloadinfo", async (ctx) => {
    return safeReply(
      ctx,
      "🔄 Reload Info\n\n" +
        "В этом боте нет горячей перезагрузки кода.\n\n" +
        "Чтобы применить изменения:\n" +
        "1. Сохрани файлы в VS Code: Ctrl + S\n" +
        "2. В терминале нажми Ctrl + C\n" +
        "3. Запусти снова:\n\n" +
        "npm start\n\n" +
        "Если запускаешь через dev:\n" +
        "npm run dev"
    );
  });

  bot.command("health", async (ctx) => {
    const memory = getMemoryInfo();

    return safeReply(
      ctx,
      "💚 Health Check\n\n" +
        "Статус: работает ✅\n" +
        `Аптайм: ${getUptimeText()}\n` +
        `Node.js: ${process.version}\n` +
        `Платформа: ${process.platform}\n\n` +
        "Память:\n" +
        `RSS: ${memory.rss} MB\n` +
        `Heap: ${memory.heapUsed}/${memory.heapTotal} MB`
    );
  });

  bot.command("lasterrors", async (ctx) => {
    if (!(await requireAdmin(ctx, safeReply))) return;

    const rows = getLastErrors(8);

    if (!rows.length) {
      return safeReply(ctx, "✅ Ошибок в логах пока нет.");
    }

    const text = rows
      .map((row) => {
        return (
          `#${row.id} ${row.type}\n` +
          `Chat: ${row.chat_id || "нет"}\n` +
          `User: ${row.user_id || "нет"}\n` +
          `Ошибка: ${row.message || "нет"}\n` +
          `${formatDate(row.created_at)}`
        );
      })
      .join("\n\n");

    return safeReply(ctx, "🧯 Последние ошибки:\n\n" + text);
  });

  bot.command("clearerrors", async (ctx) => {
    if (!(await requireAdmin(ctx, safeReply))) return;

    db.prepare(`DELETE FROM stability_logs`).run();

    return safeReply(ctx, "✅ Логи ошибок очищены.");
  });

  bot.command("runtime", async (ctx) => {
    const startedAt = getRuntime("started_at");
    const lastStart = getRuntime("last_start");
    const memory = getMemoryInfo();

    return safeReply(
      ctx,
      "⏱ Runtime Info\n\n" +
        `Запущен: ${lastStart || "нет данных"}\n` +
        `Аптайм: ${getUptimeText()}\n` +
        `StartedAt timestamp: ${startedAt || "нет"}\n\n` +
        `Node: ${process.version}\n` +
        `PID: ${process.pid}\n` +
        `Память: ${memory.heapUsed}/${memory.heapTotal} MB`
    );
  });

  bot.command("safehelp", async (ctx) => {
    return safeReply(
      ctx,
      "🧯 Команды стабильности\n\n" +
        "/health — проверить состояние бота\n" +
        "/runtime — информация о запуске\n" +
        "/lasterrors — последние ошибки\n" +
        "/clearerrors — очистить ошибки\n" +
        "/reloadinfo — как перезапустить бота\n\n" +
        "Если бот не отвечает:\n" +
        "1. Проверь терминал\n" +
        "2. Проверь .env и BOT_TOKEN\n" +
        "3. Выполни npm start\n" +
        "4. Проверь /systemcheck"
    );
  });
}

module.exports = {
  registerStability,
  saveStabilityLog,
};