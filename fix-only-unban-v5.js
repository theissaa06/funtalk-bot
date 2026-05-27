const fs = require("fs");

const file = "index.js";

if (!fs.existsSync(file)) {
  console.log("❌ index.js не найден. Запусти из корня funtalk-bot.");
  process.exit(1);
}

let code = fs.readFileSync(file, "utf8");

fs.writeFileSync("index.before-unban-only-v5.js", code, "utf8");

// Удаляем только старые наши фиксы разбанов, остальное не трогаем
code = code.replace(
  /\/\* ================= MAIN UNBAN USERNAME PATCH START ================= \*\/[\s\S]*?\/\* ================= MAIN UNBAN USERNAME PATCH END ================= \*\//g,
  ""
);

code = code.replace(
  /\/\* ================= UNBAN USERNAME V3 PATCH START ================= \*\/[\s\S]*?\/\* ================= UNBAN USERNAME V3 PATCH END ================= \*\//g,
  ""
);

code = code.replace(
  /\/\* ================= USERNAME MODERATION V4 START ================= \*\/[\s\S]*?\/\* ================= USERNAME MODERATION V4 END ================= \*\//g,
  ""
);

const patch = `

/* ================= ONLY UNBAN FIX V5 START ================= */

const __unbanOnlyFs = require("fs");
const __unbanOnlyPath = require("path");

const __unbanOnlyDataDir = __unbanOnlyPath.join(process.cwd(), "data");
const __unbanOnlyUsersFile = __unbanOnlyPath.join(__unbanOnlyDataDir, "unban-users.json");

if (!__unbanOnlyFs.existsSync(__unbanOnlyDataDir)) {
  __unbanOnlyFs.mkdirSync(__unbanOnlyDataDir, { recursive: true });
}

function __unbanOnlyReadUsers() {
  try {
    return JSON.parse(__unbanOnlyFs.readFileSync(__unbanOnlyUsersFile, "utf8"));
  } catch {
    return {};
  }
}

function __unbanOnlyWriteUsers(data) {
  __unbanOnlyFs.writeFileSync(__unbanOnlyUsersFile, JSON.stringify(data, null, 2), "utf8");
}

function __unbanOnlyRememberUser(user) {
  if (!user || !user.id) return;

  const db = __unbanOnlyReadUsers();

  db[String(user.id)] = {
    id: user.id,
    username: user.username || null,
    first_name: user.first_name || "",
    last_name: user.last_name || "",
    updatedAt: new Date().toISOString(),
  };

  if (user.username) {
    const username = String(user.username).replace(/^@/, "").toLowerCase();
    db[username] = user.id;
    db["@" + username] = user.id;
  }

  __unbanOnlyWriteUsers(db);
}

function __unbanOnlyIsCommand(text) {
  const t = String(text || "").trim().toLowerCase();

  return (
    t === "/разбанить" ||
    t.startsWith("/разбанить ") ||
    t.startsWith("/разбанить@") ||
    t === "/unban" ||
    t.startsWith("/unban ") ||
    t.startsWith("/unban@")
  );
}

function __unbanOnlyResolveTarget(msg) {
  if (msg.reply_to_message && msg.reply_to_message.from) {
    __unbanOnlyRememberUser(msg.reply_to_message.from);

    return {
      id: msg.reply_to_message.from.id,
      username: msg.reply_to_message.from.username || null,
    };
  }

  const text = String(msg.text || "").trim();
  const parts = text.split(/\\s+/).filter(Boolean);

  if (parts.length < 2) {
    return {
      error:
        "❌ Укажи пользователя.\\n\\n" +
        "Правильно:\\n" +
        "/разбанить @username\\n\\n" +
        "Или ответь на сообщение пользователя командой:\\n" +
        "/разбанить"
    };
  }

  let raw = parts[1].trim();

  if (!raw.startsWith("@")) {
    return {
      error:
        "❌ Нужно указывать через @username.\\n\\n" +
        "Пример:\\n" +
        "/разбанить @username"
    };
  }

  const username = raw.replace(/^@/, "").toLowerCase();
  const db = __unbanOnlyReadUsers();
  const userId = db[username] || db["@" + username];

  if (!userId) {
    return {
      error:
        "❌ Я ещё не знаю @" + username + ".\\n\\n" +
        "Пусть этот пользователь напишет любое сообщение в чат, потом команда заработает.\\n\\n" +
        "Telegram не даёт боту получить ID любого @username, пока бот его не видел."
    };
  }

  return {
    id: Number(userId),
    username,
  };
}

if (typeof bot !== "undefined" && !global.__ONLY_UNBAN_FIX_V5__) {
  global.__ONLY_UNBAN_FIX_V5__ = true;

  console.log("✅ ONLY UNBAN FIX V5 ACTIVE");

  // Отключаем только старые onText-обработчики /разбанить и /unban
  if (Array.isArray(bot._textRegexpCallbacks)) {
    bot._textRegexpCallbacks = bot._textRegexpCallbacks.filter((item) => {
      const regexpText = String(item.regexp || "").toLowerCase();

      return !(
        regexpText.includes("разбанить") ||
        regexpText.includes("unban")
      );
    });

    console.log("✅ Старые обработчики /разбанить отключены");
  }

  bot.prependListener("message", async (msg) => {
    try {
      if (msg.from) {
        __unbanOnlyRememberUser(msg.from);
      }

      if (msg.reply_to_message && msg.reply_to_message.from) {
        __unbanOnlyRememberUser(msg.reply_to_message.from);
      }

      if (!__unbanOnlyIsCommand(msg.text)) return;

      const target = __unbanOnlyResolveTarget(msg);

      if (!target || target.error) {
        return bot.sendMessage(msg.chat.id, target?.error || "❌ Укажи @username.");
      }

      await bot.unbanChatMember(msg.chat.id, target.id, {
        only_if_banned: true,
      });

      return bot.sendMessage(
        msg.chat.id,
        "✅ @" + (target.username || target.id) + " разблокирован."
      );
    } catch (error) {
      console.error("❌ ONLY UNBAN FIX V5 ERROR:", error);

      return bot.sendMessage(
        msg.chat.id,
        "❌ Не удалось разблокировать пользователя.\\n\\n" +
        "Проверь:\\n" +
        "1. Бот администратор\\n" +
        "2. У бота есть право банить/разбанивать\\n" +
        "3. Пользователь реально был заблокирован\\n" +
        "4. Бот уже видел этого @username в чате"
      );
    }
  });
}

/* ================= ONLY UNBAN FIX V5 END ================= */

`;

code += patch;

fs.writeFileSync(file, code, "utf8");

console.log("✅ Исправлена только команда /разбанить.");
console.log("✅ Остальная структура проекта не тронута.");
console.log("✅ При запуске должна быть строка: ONLY UNBAN FIX V5 ACTIVE");
