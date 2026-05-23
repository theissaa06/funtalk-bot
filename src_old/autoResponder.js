const fs = require("fs");
const path = require("path");
const Database = require("better-sqlite3");

const dbPath = process.env.DATABASE_PATH || "./data/bot.sqlite";
const dbDir = path.dirname(dbPath);

if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const db = new Database(dbPath);

db.exec(`
CREATE TABLE IF NOT EXISTS auto_responder_settings (
  chat_id TEXT PRIMARY KEY,
  triggers_enabled INTEGER DEFAULT 1,
  mini_ai_enabled INTEGER DEFAULT 1,
  admin_templates_enabled INTEGER DEFAULT 1,
  updated_at INTEGER
);

CREATE TABLE IF NOT EXISTS auto_triggers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  chat_id TEXT NOT NULL,
  trigger_text TEXT NOT NULL,
  response_text TEXT NOT NULL,
  created_by TEXT,
  created_at INTEGER
);

CREATE TABLE IF NOT EXISTS admin_templates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  chat_id TEXT NOT NULL,
  template_name TEXT NOT NULL,
  response_text TEXT NOT NULL,
  created_by TEXT,
  created_at INTEGER,
  UNIQUE(chat_id, template_name)
);

CREATE TABLE IF NOT EXISTS auto_responder_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  chat_id TEXT NOT NULL,
  user_id TEXT,
  action TEXT NOT NULL,
  details TEXT,
  created_at INTEGER NOT NULL
);
`);

function now() {
  return Date.now();
}

function isGroup(ctx) {
  const type = ctx.chat?.type;
  return type === "group" || type === "supergroup";
}

function normalize(text) {
  return String(text || "")
    .toLowerCase()
    .replaceAll("ё", "е")
    .trim();
}

function parseArgs(ctx) {
  const text = ctx.message?.text || "";
  return text.split(/\s+/).slice(1);
}

function parseTextAfterCommand(ctx) {
  const text = ctx.message?.text || "";
  return text.split(/\s+/).slice(1).join(" ").trim();
}

function ensureSettings(chatId) {
  db.prepare(`
    INSERT OR IGNORE INTO auto_responder_settings (
      chat_id,
      triggers_enabled,
      mini_ai_enabled,
      admin_templates_enabled,
      updated_at
    )
    VALUES (?, 1, 1, 1, ?)
  `).run(String(chatId), now());
}

function getSettings(chatId) {
  ensureSettings(chatId);

  return db.prepare(`
    SELECT * FROM auto_responder_settings
    WHERE chat_id = ?
  `).get(String(chatId));
}

function saveLog(chatId, userId, action, details = "") {
  db.prepare(`
    INSERT INTO auto_responder_logs (chat_id, user_id, action, details, created_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(
    String(chatId),
    String(userId || ""),
    action,
    details,
    now()
  );
}

async function isAdmin(ctx, userId) {
  try {
    const member = await ctx.telegram.getChatMember(ctx.chat.id, userId);
    return member.status === "creator" || member.status === "administrator";
  } catch {
    return false;
  }
}

async function requireGroup(ctx, safeReply) {
  if (!isGroup(ctx)) {
    await safeReply(ctx, "Эта команда работает только в группе.");
    return false;
  }

  return true;
}

async function requireAdmin(ctx, safeReply) {
  const ok = await isAdmin(ctx, ctx.from.id);

  if (!ok) {
    await safeReply(ctx, "⛔ Эту команду может использовать только админ.");
    return false;
  }

  return true;
}

function onOff(value) {
  return value ? "включено ✅" : "выключено ❌";
}

function userName(user) {
  if (!user) return "участник";
  if (user.username) return `@${user.username}`;
  return user.first_name || "участник";
}

function replaceVars(text, ctx) {
  return String(text || "")
    .replaceAll("{name}", userName(ctx.from))
    .replaceAll("{first_name}", ctx.from?.first_name || "участник")
    .replaceAll("{username}", ctx.from?.username ? `@${ctx.from.username}` : "без username")
    .replaceAll("{chat}", ctx.chat?.title || "чат");
}

function miniAiAnswer(text, ctx) {
  const value = normalize(text);

  if (value.includes("привет") || value.includes("салам") || value.includes("здарова")) {
    return `👋 Привет, ${userName(ctx.from)}! Как настроение?`;
  }

  if (value.includes("как дела") || value.includes("как ты")) {
    return "😄 У меня всё стабильно: слежу за чатом, ловлю флуд и помогаю общаться.";
  }

  if (value.includes("что ты умеешь") || value.includes("команды")) {
    return (
      "🤖 Я умею общение, игры, модерацию, защиту, уровни, экономику, правила и автоответы.\n\n" +
      "Напиши /help, чтобы увидеть все команды."
    );
  }

  if (value.includes("правила")) {
    return "📜 Правила можно посмотреть командой /rules.";
  }

  if (value.includes("ранг") || value.includes("уровень")) {
    return "🏆 Свой ранг можно посмотреть командой /rank.";
  }

  if (value.includes("магазин") || value.includes("монеты")) {
    return "💰 Магазин открывается командой /shop, баланс — /balance, ежедневный бонус — /daily.";
  }

  if (value.includes("мут") || value.includes("бан") || value.includes("варн")) {
    return "🛡 Модерационные команды доступны админам. Список: /modhelp.";
  }

  if (value.includes("игра") || value.includes("поиграем")) {
    return "🎮 Игры доступны командой /games.";
  }

  if (value.includes("спасибо") || value.includes("спс")) {
    return "🤝 Всегда пожалуйста!";
  }

  const randomAnswers = [
    "👀 Я понял. Можешь уточнить чуть подробнее?",
    "🤖 Интересно. Если хочешь, могу подсказать команду под эту ситуацию.",
    "💬 Я рядом. Напиши /help, если нужен список возможностей.",
    "😄 Звучит как повод начать нормальный диалог.",
    "🧠 Я пока мини-AI без API, но уже могу помогать по базовым вопросам чата.",
  ];

  return randomAnswers[Math.floor(Math.random() * randomAnswers.length)];
}

function shouldMiniAiRespond(ctx, text, botUsername) {
  if (!text) return false;

  const value = normalize(text);

  if (value.startsWith("бот ")) return true;
  if (value.startsWith("фанток ") || value.startsWith("funtalk ")) return true;

  if (botUsername && value.includes(`@${botUsername.toLowerCase()}`)) {
    return true;
  }

  const reply = ctx.message?.reply_to_message;

  if (reply?.from?.is_bot) {
    return true;
  }

  return false;
}

function responderHelpText() {
  return (
    "🤖 Автоответчик FunTalk\n\n" +
    "/autoresponder — настройки автоответчика\n" +
    "/triggers_on — включить триггеры\n" +
    "/triggers_off — выключить триггеры\n" +
    "/trigger_add слово | ответ — добавить триггер\n" +
    "/trigger_del ID — удалить триггер\n" +
    "/triggers — список триггеров\n\n" +
    "/miniai_on — включить мини-AI\n" +
    "/miniai_off — выключить мини-AI\n\n" +
    "/template_add имя | текст — добавить шаблон админа\n" +
    "/template_del имя — удалить шаблон\n" +
    "/templates — список шаблонов\n" +
    "/replytpl имя — ответить шаблоном на сообщение\n\n" +
    "Переменные:\n" +
    "{name}, {first_name}, {username}, {chat}\n\n" +
    "Мини-AI отвечает, если сообщение начинается с «бот ...» или если ответить на сообщение бота."
  );
}

function registerAutoResponder(bot, helpers) {
  const { safeReply } = helpers;
  let botUsername = "";

  bot.telegram.getMe()
    .then((me) => {
      botUsername = me.username || "";
    })
    .catch(() => {});

  bot.command("autoresponder", async (ctx) => {
    if (!(await requireGroup(ctx, safeReply))) return;

    const s = getSettings(ctx.chat.id);

    return safeReply(
      ctx,
      "🤖 Автоответчик\n\n" +
        `Триггеры: ${onOff(s.triggers_enabled)}\n` +
        `Мини-AI: ${onOff(s.mini_ai_enabled)}\n` +
        `Шаблоны админа: ${onOff(s.admin_templates_enabled)}\n\n` +
        responderHelpText()
    );
  });

  bot.command("triggers_on", async (ctx) => {
    if (!(await requireGroup(ctx, safeReply))) return;
    if (!(await requireAdmin(ctx, safeReply))) return;

    ensureSettings(ctx.chat.id);

    db.prepare(`
      UPDATE auto_responder_settings
      SET triggers_enabled = 1, updated_at = ?
      WHERE chat_id = ?
    `).run(now(), String(ctx.chat.id));

    return safeReply(ctx, "✅ Триггеры включены.");
  });

  bot.command("triggers_off", async (ctx) => {
    if (!(await requireGroup(ctx, safeReply))) return;
    if (!(await requireAdmin(ctx, safeReply))) return;

    ensureSettings(ctx.chat.id);

    db.prepare(`
      UPDATE auto_responder_settings
      SET triggers_enabled = 0, updated_at = ?
      WHERE chat_id = ?
    `).run(now(), String(ctx.chat.id));

    return safeReply(ctx, "✅ Триггеры выключены.");
  });

  bot.command("trigger_add", async (ctx) => {
    if (!(await requireGroup(ctx, safeReply))) return;
    if (!(await requireAdmin(ctx, safeReply))) return;

    const raw = parseTextAfterCommand(ctx);
    const parts = raw.split("|").map((item) => item.trim());

    if (parts.length < 2 || !parts[0] || !parts[1]) {
      return safeReply(
        ctx,
        "Используй так:\n/trigger_add привет | Привет, {name}!"
      );
    }

    db.prepare(`
      INSERT INTO auto_triggers (chat_id, trigger_text, response_text, created_by, created_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(
      String(ctx.chat.id),
      normalize(parts[0]),
      parts[1],
      String(ctx.from.id),
      now()
    );

    saveLog(ctx.chat.id, ctx.from.id, "TRIGGER_ADD", parts[0]);

    return safeReply(ctx, `✅ Триггер добавлен: ${parts[0]}`);
  });

  bot.command("trigger_del", async (ctx) => {
    if (!(await requireGroup(ctx, safeReply))) return;
    if (!(await requireAdmin(ctx, safeReply))) return;

    const id = Number(parseArgs(ctx)[0]);

    if (!Number.isInteger(id)) {
      return safeReply(ctx, "Укажи ID триггера. Посмотреть список: /triggers");
    }

    const result = db.prepare(`
      DELETE FROM auto_triggers
      WHERE chat_id = ? AND id = ?
    `).run(String(ctx.chat.id), id);

    if (!result.changes) {
      return safeReply(ctx, "Такого триггера нет.");
    }

    saveLog(ctx.chat.id, ctx.from.id, "TRIGGER_DELETE", String(id));

    return safeReply(ctx, `✅ Триггер #${id} удалён.`);
  });

  bot.command("triggers", async (ctx) => {
    if (!(await requireGroup(ctx, safeReply))) return;

    const rows = db.prepare(`
      SELECT * FROM auto_triggers
      WHERE chat_id = ?
      ORDER BY id DESC
      LIMIT 30
    `).all(String(ctx.chat.id));

    if (!rows.length) {
      return safeReply(ctx, "Триггеров пока нет.");
    }

    const text = rows
      .map((row) => `#${row.id} — ${row.trigger_text}\nОтвет: ${row.response_text}`)
      .join("\n\n");

    return safeReply(ctx, "🧩 Триггеры:\n\n" + text);
  });

  bot.command("miniai_on", async (ctx) => {
    if (!(await requireGroup(ctx, safeReply))) return;
    if (!(await requireAdmin(ctx, safeReply))) return;

    ensureSettings(ctx.chat.id);

    db.prepare(`
      UPDATE auto_responder_settings
      SET mini_ai_enabled = 1, updated_at = ?
      WHERE chat_id = ?
    `).run(now(), String(ctx.chat.id));

    return safeReply(ctx, "✅ Мини-AI включён.");
  });

  bot.command("miniai_off", async (ctx) => {
    if (!(await requireGroup(ctx, safeReply))) return;
    if (!(await requireAdmin(ctx, safeReply))) return;

    ensureSettings(ctx.chat.id);

    db.prepare(`
      UPDATE auto_responder_settings
      SET mini_ai_enabled = 0, updated_at = ?
      WHERE chat_id = ?
    `).run(now(), String(ctx.chat.id));

    return safeReply(ctx, "✅ Мини-AI выключен.");
  });

  bot.command("template_add", async (ctx) => {
    if (!(await requireGroup(ctx, safeReply))) return;
    if (!(await requireAdmin(ctx, safeReply))) return;

    const raw = parseTextAfterCommand(ctx);
    const parts = raw.split("|").map((item) => item.trim());

    if (parts.length < 2 || !parts[0] || !parts[1]) {
      return safeReply(
        ctx,
        "Используй так:\n/template_add правила | Прочитай правила: /rules"
      );
    }

    const name = normalize(parts[0]).replace(/\s+/g, "_");

    db.prepare(`
      INSERT INTO admin_templates (chat_id, template_name, response_text, created_by, created_at)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(chat_id, template_name)
      DO UPDATE SET response_text = excluded.response_text,
                    created_by = excluded.created_by,
                    created_at = excluded.created_at
    `).run(
      String(ctx.chat.id),
      name,
      parts[1],
      String(ctx.from.id),
      now()
    );

    saveLog(ctx.chat.id, ctx.from.id, "TEMPLATE_ADD", name);

    return safeReply(ctx, `✅ Шаблон сохранён: ${name}`);
  });

  bot.command("template_del", async (ctx) => {
    if (!(await requireGroup(ctx, safeReply))) return;
    if (!(await requireAdmin(ctx, safeReply))) return;

    const name = normalize(parseArgs(ctx)[0]).replace(/\s+/g, "_");

    if (!name) {
      return safeReply(ctx, "Укажи имя шаблона. Например: /template_del правила");
    }

    const result = db.prepare(`
      DELETE FROM admin_templates
      WHERE chat_id = ? AND template_name = ?
    `).run(String(ctx.chat.id), name);

    if (!result.changes) {
      return safeReply(ctx, "Такого шаблона нет.");
    }

    return safeReply(ctx, `✅ Шаблон ${name} удалён.`);
  });

  bot.command("templates", async (ctx) => {
    if (!(await requireGroup(ctx, safeReply))) return;

    const rows = db.prepare(`
      SELECT * FROM admin_templates
      WHERE chat_id = ?
      ORDER BY template_name ASC
      LIMIT 50
    `).all(String(ctx.chat.id));

    if (!rows.length) {
      return safeReply(ctx, "Шаблонов пока нет.");
    }

    const text = rows
      .map((row) => `/${row.template_name}\n${row.response_text}`)
      .join("\n\n");

    return safeReply(ctx, "📌 Шаблоны админа:\n\n" + text);
  });

  bot.command("replytpl", async (ctx) => {
    if (!(await requireGroup(ctx, safeReply))) return;
    if (!(await requireAdmin(ctx, safeReply))) return;

    const name = normalize(parseArgs(ctx)[0]).replace(/\s+/g, "_");

    if (!name) {
      return safeReply(ctx, "Укажи имя шаблона. Например: /replytpl правила");
    }

    const row = db.prepare(`
      SELECT * FROM admin_templates
      WHERE chat_id = ? AND template_name = ?
    `).get(String(ctx.chat.id), name);

    if (!row) {
      return safeReply(ctx, "Такого шаблона нет. Список: /templates");
    }

    const text = replaceVars(row.response_text, ctx);

    return ctx.reply(text, {
      reply_to_message_id: ctx.message?.reply_to_message?.message_id,
    }).catch((err) => {
      console.error("Ошибка replytpl:", err.message);
    });
  });

  bot.command("autoresponderlog", async (ctx) => {
    if (!(await requireGroup(ctx, safeReply))) return;
    if (!(await requireAdmin(ctx, safeReply))) return;

    const rows = db.prepare(`
      SELECT * FROM auto_responder_logs
      WHERE chat_id = ?
      ORDER BY id DESC
      LIMIT 10
    `).all(String(ctx.chat.id));

    if (!rows.length) {
      return safeReply(ctx, "Лог автоответчика пуст.");
    }

    const text = rows
      .map((log) => {
        const date = new Date(Number(log.created_at)).toLocaleString("ru-RU");

        return (
          `#${log.id} ${log.action}\n` +
          `User ID: ${log.user_id || "нет"}\n` +
          `Детали: ${log.details || "нет"}\n` +
          `${date}`
        );
      })
      .join("\n\n");

    return safeReply(ctx, "🤖 Лог автоответчика:\n\n" + text);
  });

  bot.use(async (ctx, next) => {
    try {
      if (!isGroup(ctx)) return next();

      const text = ctx.message?.text || "";
      const user = ctx.from;

      if (!text || !user || user.is_bot) return next();

      const settings = getSettings(ctx.chat.id);

      if (text.startsWith("/")) return next();

      if (settings.triggers_enabled) {
        const rows = db.prepare(`
          SELECT * FROM auto_triggers
          WHERE chat_id = ?
          ORDER BY id DESC
          LIMIT 100
        `).all(String(ctx.chat.id));

        const value = normalize(text);

        const found = rows.find((row) => {
          return value.includes(normalize(row.trigger_text));
        });

        if (found) {
          saveLog(ctx.chat.id, user.id, "TRIGGER_USED", found.trigger_text);
          await safeReply(ctx, replaceVars(found.response_text, ctx));
          return;
        }
      }

      if (settings.mini_ai_enabled && shouldMiniAiRespond(ctx, text, botUsername)) {
        saveLog(ctx.chat.id, user.id, "MINI_AI", text.slice(0, 120));
        await safeReply(ctx, miniAiAnswer(text, ctx));
        return;
      }
    } catch (error) {
      console.error("Ошибка autoResponder middleware:", error.message);
    }

    return next();
  });
}

module.exports = {
  registerAutoResponder,
};