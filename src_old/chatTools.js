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
CREATE TABLE IF NOT EXISTS chat_tools_settings (
  chat_id TEXT PRIMARY KEY,
  rules TEXT DEFAULT '',
  welcome_enabled INTEGER DEFAULT 1,
  goodbye_enabled INTEGER DEFAULT 1,
  welcome_text TEXT DEFAULT '',
  goodbye_text TEXT DEFAULT '',
  log_chat_id TEXT DEFAULT '',
  updated_at INTEGER
);

CREATE TABLE IF NOT EXISTS custom_commands (
  chat_id TEXT NOT NULL,
  command TEXT NOT NULL,
  response TEXT NOT NULL,
  created_by TEXT,
  created_at INTEGER,
  PRIMARY KEY (chat_id, command)
);
`);

function now() {
  return Date.now();
}

function isGroup(ctx) {
  const type = ctx.chat?.type;
  return type === "group" || type === "supergroup";
}

function ensureSettings(chatId) {
  db.prepare(`
    INSERT OR IGNORE INTO chat_tools_settings (
      chat_id,
      rules,
      welcome_enabled,
      goodbye_enabled,
      welcome_text,
      goodbye_text,
      log_chat_id,
      updated_at
    )
    VALUES (?, '', 1, 1, '', '', '', ?)
  `).run(String(chatId), now());
}

function getSettings(chatId) {
  ensureSettings(chatId);

  return db.prepare(`
    SELECT * FROM chat_tools_settings
    WHERE chat_id = ?
  `).get(String(chatId));
}

function parseArgsText(ctx) {
  const text = ctx.message?.text || "";
  return text.split(/\s+/).slice(1).join(" ").trim();
}

function parseCommandArgs(ctx) {
  const text = ctx.message?.text || "";
  return text.split(/\s+/).slice(1);
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

function userName(user) {
  if (!user) return "участник";
  if (user.username) return `@${user.username}`;
  return user.first_name || "участник";
}

function replaceVars(text, user, chat) {
  return String(text || "")
    .replaceAll("{name}", userName(user))
    .replaceAll("{first_name}", user?.first_name || "участник")
    .replaceAll("{username}", user?.username ? `@${user.username}` : "без username")
    .replaceAll("{id}", String(user?.id || ""))
    .replaceAll("{chat}", chat?.title || "чат")
    .replaceAll("{rules}", "/rules")
    .replaceAll("{commands}", "/commands")
    .replaceAll("{rank}", "/rank")
    .replaceAll("{daily}", "/daily");
}

async function sendLog(ctx, text) {
  try {
    const settings = getSettings(ctx.chat.id);
    const logChatId = settings.log_chat_id;

    if (!logChatId) return;

    await ctx.telegram.sendMessage(logChatId, text);
  } catch (error) {
    console.error("Ошибка отправки в лог-чат:", error.message);
  }
}

function defaultWelcomeText() {
  return (
    "👋 Добро пожаловать, {name}!\n\n" +
    "Ты попал в «{chat}».\n\n" +
    "📌 Что можно сделать сразу:\n" +
    "• прочитать правила: {rules}\n" +
    "• посмотреть команды: {commands}\n" +
    "• проверить свой ранг: {rank}\n" +
    "• забрать ежедневный бонус: {daily}\n\n" +
    "💬 Будь активным, уважай участников и не спамь."
  );
}

function defaultGoodbyeText() {
  return "👋 {name} покинул чат. Надеемся, ещё увидимся.";
}

function chatToolsHelpText() {
  return (
    "⚙️ Инструменты чата\n\n" +
    "/rules — показать правила\n" +
    "/setrules текст — установить правила\n" +
    "/clearrules — очистить правила\n\n" +
    "/welcome_on — включить приветствие\n" +
    "/welcome_off — выключить приветствие\n" +
    "/setwelcome текст — установить приветствие\n" +
    "/welcome_preview — посмотреть приветствие\n" +
    "/welcome_vars — переменные приветствия\n\n" +
    "/goodbye_on — включить прощание\n" +
    "/goodbye_off — выключить прощание\n" +
    "/setgoodbye текст — установить прощание\n" +
    "/goodbye_preview — посмотреть прощание\n\n" +
    "/setlogchat — установить текущий чат как лог-чат\n" +
    "/logchat_off — выключить лог-чат\n\n" +
    "/cmd_add команда ответ — добавить кастомную команду\n" +
    "/cmd_del команда — удалить кастомную команду\n" +
    "/cmds — список кастомных команд"
  );
}

function registerChatTools(bot, helpers) {
  const { safeReply } = helpers;

  bot.on("new_chat_members", async (ctx) => {
    try {
      if (!isGroup(ctx)) return;

      ensureSettings(ctx.chat.id);

      const settings = getSettings(ctx.chat.id);

      if (!settings.welcome_enabled) return;

      const members = ctx.message?.new_chat_members || [];

      for (const member of members) {
        if (member.is_bot) continue;

        const text = replaceVars(
          settings.welcome_text || defaultWelcomeText(),
          member,
          ctx.chat
        );

        await ctx.reply(text, {
          disable_web_page_preview: true,
        }).catch(() => safeReply(ctx, text));

        await sendLog(
          ctx,
          `👋 Новый участник\nЧат: ${ctx.chat.title}\nПользователь: ${userName(member)}\nID: ${member.id}`
        );
      }
    } catch (error) {
      console.error("Ошибка приветствия chatTools:", error.message);
    }
  });

  bot.on("left_chat_member", async (ctx) => {
    try {
      if (!isGroup(ctx)) return;

      ensureSettings(ctx.chat.id);

      const settings = getSettings(ctx.chat.id);

      if (!settings.goodbye_enabled) return;

      const member = ctx.message?.left_chat_member;

      if (!member || member.is_bot) return;

      const text = replaceVars(
        settings.goodbye_text || defaultGoodbyeText(),
        member,
        ctx.chat
      );

      await safeReply(ctx, text);

      await sendLog(
        ctx,
        `👋 Участник вышел\nЧат: ${ctx.chat.title}\nПользователь: ${userName(member)}\nID: ${member.id}`
      );
    } catch (error) {
      console.error("Ошибка прощания chatTools:", error.message);
    }
  });

  bot.command("chattools", async (ctx) => {
    if (!(await requireGroup(ctx, safeReply))) return;
    return safeReply(ctx, chatToolsHelpText());
  });

  bot.command("welcome_vars", async (ctx) => {
    return safeReply(
      ctx,
      "🧩 Переменные для приветствия\n\n" +
        "{name} — имя или username\n" +
        "{first_name} — имя\n" +
        "{username} — username\n" +
        "{id} — Telegram ID\n" +
        "{chat} — название чата\n" +
        "{rules} — команда /rules\n" +
        "{commands} — команда /commands\n" +
        "{rank} — команда /rank\n" +
        "{daily} — команда /daily\n\n" +
        "Пример:\n" +
        "/setwelcome 👋 Привет, {name}! Добро пожаловать в {chat}. Правила: {rules}"
    );
  });

  bot.command("welcome_preview", async (ctx) => {
    if (!(await requireGroup(ctx, safeReply))) return;

    const settings = getSettings(ctx.chat.id);
    const text = replaceVars(
      settings.welcome_text || defaultWelcomeText(),
      ctx.from,
      ctx.chat
    );

    return safeReply(ctx, "👀 Превью приветствия:\n\n" + text);
  });

  bot.command("goodbye_preview", async (ctx) => {
    if (!(await requireGroup(ctx, safeReply))) return;

    const settings = getSettings(ctx.chat.id);
    const text = replaceVars(
      settings.goodbye_text || defaultGoodbyeText(),
      ctx.from,
      ctx.chat
    );

    return safeReply(ctx, "👀 Превью прощания:\n\n" + text);
  });

  bot.command("rules", async (ctx) => {
    if (!(await requireGroup(ctx, safeReply))) return;

    const settings = getSettings(ctx.chat.id);

    if (!settings.rules) {
      return safeReply(
        ctx,
        "📜 Правила пока не установлены.\n\nАдмин может добавить их командой:\n/setrules текст правил"
      );
    }

    return safeReply(ctx, "📜 Правила чата:\n\n" + settings.rules);
  });

  bot.command("setrules", async (ctx) => {
    if (!(await requireGroup(ctx, safeReply))) return;
    if (!(await requireAdmin(ctx, safeReply))) return;

    const rules = parseArgsText(ctx);

    if (!rules) {
      return safeReply(ctx, "Напиши правила после команды:\n/setrules Не спамить, уважать участников...");
    }

    ensureSettings(ctx.chat.id);

    db.prepare(`
      UPDATE chat_tools_settings
      SET rules = ?, updated_at = ?
      WHERE chat_id = ?
    `).run(rules, now(), String(ctx.chat.id));

    await sendLog(ctx, `📜 Правила обновлены\nАдмин: ${userName(ctx.from)}`);

    return safeReply(ctx, "✅ Правила чата сохранены.");
  });

  bot.command("clearrules", async (ctx) => {
    if (!(await requireGroup(ctx, safeReply))) return;
    if (!(await requireAdmin(ctx, safeReply))) return;

    ensureSettings(ctx.chat.id);

    db.prepare(`
      UPDATE chat_tools_settings
      SET rules = '', updated_at = ?
      WHERE chat_id = ?
    `).run(now(), String(ctx.chat.id));

    return safeReply(ctx, "✅ Правила очищены.");
  });

  bot.command("welcome_on", async (ctx) => {
    if (!(await requireGroup(ctx, safeReply))) return;
    if (!(await requireAdmin(ctx, safeReply))) return;

    ensureSettings(ctx.chat.id);

    db.prepare(`
      UPDATE chat_tools_settings
      SET welcome_enabled = 1, updated_at = ?
      WHERE chat_id = ?
    `).run(now(), String(ctx.chat.id));

    return safeReply(ctx, "✅ Приветствие включено.");
  });

  bot.command("welcome_off", async (ctx) => {
    if (!(await requireGroup(ctx, safeReply))) return;
    if (!(await requireAdmin(ctx, safeReply))) return;

    ensureSettings(ctx.chat.id);

    db.prepare(`
      UPDATE chat_tools_settings
      SET welcome_enabled = 0, updated_at = ?
      WHERE chat_id = ?
    `).run(now(), String(ctx.chat.id));

    return safeReply(ctx, "✅ Приветствие выключено.");
  });

  bot.command("setwelcome", async (ctx) => {
    if (!(await requireGroup(ctx, safeReply))) return;
    if (!(await requireAdmin(ctx, safeReply))) return;

    const text = parseArgsText(ctx);

    if (!text) {
      return safeReply(
        ctx,
        "Напиши текст приветствия:\n/setwelcome 👋 Привет, {name}! Добро пожаловать в {chat}"
      );
    }

    ensureSettings(ctx.chat.id);

    db.prepare(`
      UPDATE chat_tools_settings
      SET welcome_text = ?, updated_at = ?
      WHERE chat_id = ?
    `).run(text, now(), String(ctx.chat.id));

    return safeReply(ctx, "✅ Текст приветствия сохранён. Посмотреть: /welcome_preview");
  });

  bot.command("goodbye_on", async (ctx) => {
    if (!(await requireGroup(ctx, safeReply))) return;
    if (!(await requireAdmin(ctx, safeReply))) return;

    ensureSettings(ctx.chat.id);

    db.prepare(`
      UPDATE chat_tools_settings
      SET goodbye_enabled = 1, updated_at = ?
      WHERE chat_id = ?
    `).run(now(), String(ctx.chat.id));

    return safeReply(ctx, "✅ Прощание включено.");
  });

  bot.command("goodbye_off", async (ctx) => {
    if (!(await requireGroup(ctx, safeReply))) return;
    if (!(await requireAdmin(ctx, safeReply))) return;

    ensureSettings(ctx.chat.id);

    db.prepare(`
      UPDATE chat_tools_settings
      SET goodbye_enabled = 0, updated_at = ?
      WHERE chat_id = ?
    `).run(now(), String(ctx.chat.id));

    return safeReply(ctx, "✅ Прощание выключено.");
  });

  bot.command("setgoodbye", async (ctx) => {
    if (!(await requireGroup(ctx, safeReply))) return;
    if (!(await requireAdmin(ctx, safeReply))) return;

    const text = parseArgsText(ctx);

    if (!text) {
      return safeReply(ctx, "Напиши текст прощания:\n/setgoodbye 👋 {name} покинул чат.");
    }

    ensureSettings(ctx.chat.id);

    db.prepare(`
      UPDATE chat_tools_settings
      SET goodbye_text = ?, updated_at = ?
      WHERE chat_id = ?
    `).run(text, now(), String(ctx.chat.id));

    return safeReply(ctx, "✅ Текст прощания сохранён. Посмотреть: /goodbye_preview");
  });

  bot.command("setlogchat", async (ctx) => {
    if (!(await requireGroup(ctx, safeReply))) return;
    if (!(await requireAdmin(ctx, safeReply))) return;

    ensureSettings(ctx.chat.id);

    db.prepare(`
      UPDATE chat_tools_settings
      SET log_chat_id = ?, updated_at = ?
      WHERE chat_id = ?
    `).run(String(ctx.chat.id), now(), String(ctx.chat.id));

    return safeReply(
      ctx,
      "✅ Этот чат установлен как лог-чат.\n\nСюда будут приходить некоторые уведомления."
    );
  });

  bot.command("logchat_off", async (ctx) => {
    if (!(await requireGroup(ctx, safeReply))) return;
    if (!(await requireAdmin(ctx, safeReply))) return;

    ensureSettings(ctx.chat.id);

    db.prepare(`
      UPDATE chat_tools_settings
      SET log_chat_id = '', updated_at = ?
      WHERE chat_id = ?
    `).run(now(), String(ctx.chat.id));

    return safeReply(ctx, "✅ Лог-чат выключен.");
  });

  bot.command("cmd_add", async (ctx) => {
    if (!(await requireGroup(ctx, safeReply))) return;
    if (!(await requireAdmin(ctx, safeReply))) return;

    const args = parseCommandArgs(ctx);
    const command = String(args[0] || "").replace("/", "").toLowerCase();
    const response = args.slice(1).join(" ").trim();

    if (!command || !response) {
      return safeReply(
        ctx,
        "Используй так:\n/cmd_add привет Привет, чат!"
      );
    }

    if (command.length > 32) {
      return safeReply(ctx, "Команда слишком длинная. Максимум 32 символа.");
    }

    db.prepare(`
      INSERT INTO custom_commands (chat_id, command, response, created_by, created_at)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(chat_id, command)
      DO UPDATE SET response = excluded.response,
                    created_by = excluded.created_by,
                    created_at = excluded.created_at
    `).run(
      String(ctx.chat.id),
      command,
      response,
      String(ctx.from.id),
      now()
    );

    return safeReply(ctx, `✅ Кастомная команда /${command} сохранена.`);
  });

  bot.command("cmd_del", async (ctx) => {
    if (!(await requireGroup(ctx, safeReply))) return;
    if (!(await requireAdmin(ctx, safeReply))) return;

    const command = String(parseCommandArgs(ctx)[0] || "")
      .replace("/", "")
      .toLowerCase();

    if (!command) {
      return safeReply(ctx, "Укажи команду:\n/cmd_del привет");
    }

    const result = db.prepare(`
      DELETE FROM custom_commands
      WHERE chat_id = ? AND command = ?
    `).run(String(ctx.chat.id), command);

    if (result.changes === 0) {
      return safeReply(ctx, "Такой кастомной команды нет.");
    }

    return safeReply(ctx, `✅ Команда /${command} удалена.`);
  });

  bot.command("cmds", async (ctx) => {
    if (!(await requireGroup(ctx, safeReply))) return;

    const rows = db.prepare(`
      SELECT command FROM custom_commands
      WHERE chat_id = ?
      ORDER BY command ASC
      LIMIT 100
    `).all(String(ctx.chat.id));

    if (!rows.length) {
      return safeReply(ctx, "Кастомных команд пока нет.");
    }

    const text = rows.map((row) => `/${row.command}`).join("\n");

    return safeReply(ctx, "🧩 Кастомные команды:\n\n" + text);
  });

  bot.use(async (ctx, next) => {
    try {
      if (!isGroup(ctx)) return next();

      const text = ctx.message?.text || "";

      if (!text.startsWith("/")) return next();

      const command = text.split(/\s+/)[0].replace("/", "").toLowerCase();

      const row = db.prepare(`
        SELECT response FROM custom_commands
        WHERE chat_id = ? AND command = ?
      `).get(String(ctx.chat.id), command);

      if (row) {
        await safeReply(ctx, row.response);
        return;
      }
    } catch (error) {
      console.error("Ошибка кастомной команды:", error.message);
    }

    return next();
  });
}

module.exports = {
  registerChatTools,
};