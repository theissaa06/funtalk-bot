const fs = require("fs");

const file = "index.js";

if (!fs.existsSync(file)) {
  console.log("❌ index.js не найден. Запусти команду из корня funtalk-bot.");
  process.exit(1);
}

let code = fs.readFileSync(file, "utf8");

fs.writeFileSync("index.before-hard-unban-v6.js", code, "utf8");

code = code.replace(
  /\/\* ================= HARD ONLY UNBAN OVERRIDE V6 START ================= \*\/[\s\S]*?\/\* ================= HARD ONLY UNBAN OVERRIDE V6 END ================= \*\//g,
  ""
);

const patch = `

/* ================= HARD ONLY UNBAN OVERRIDE V6 START ================= */

const __huFs = require("fs");
const __huPath = require("path");

const __huDataDir = __huPath.join(process.cwd(), "data");
const __huUsersFile = __huPath.join(__huDataDir, "hard-unban-users.json");

if (!__huFs.existsSync(__huDataDir)) {
  __huFs.mkdirSync(__huDataDir, { recursive: true });
}

function __huReadJson(file, fallback) {
  try {
    return JSON.parse(__huFs.readFileSync(file, "utf8"));
  } catch {
    return fallback;
  }
}

function __huWriteJson(file, data) {
  __huFs.writeFileSync(file, JSON.stringify(data, null, 2), "utf8");
}

function __huRememberUser(user) {
  if (!user || !user.id) return;

  const db = __huReadJson(__huUsersFile, {});

  db[String(user.id)] = {
    id: user.id,
    username: user.username || null,
    first_name: user.first_name || "",
    last_name: user.last_name || "",
    updatedAt: new Date().toISOString()
  };

  if (user.username) {
    const username = String(user.username).replace(/^@/, "").toLowerCase();
    db[username] = user.id;
    db["@" + username] = user.id;
  }

  __huWriteJson(__huUsersFile, db);
}

function __huFindUserIdByUsername(username) {
  const clean = String(username || "").replace(/^@/, "").toLowerCase();

  const mainDb = __huReadJson(__huUsersFile, {});
  if (mainDb[clean]) return Number(mainDb[clean]);
  if (mainDb["@" + clean]) return Number(mainDb["@" + clean]);

  // Ищем ещё в старых базах, если они уже создавались раньше
  const possibleFiles = [
    "tg-users.json",
    "telegram-users.json",
    "telegram-users-main.json",
    "username-users.json",
    "unban-users.json"
  ];

  for (const name of possibleFiles) {
    const file = __huPath.join(__huDataDir, name);
    const db = __huReadJson(file, null);
    if (!db) continue;

    if (db[clean]) return Number(db[clean]);
    if (db["@" + clean]) return Number(db["@" + clean]);

    for (const key of Object.keys(db)) {
      const item = db[key];

      if (
        item &&
        typeof item === "object" &&
        item.username &&
        String(item.username).toLowerCase() === clean &&
        item.id
      ) {
        return Number(item.id);
      }
    }
  }

  return null;
}

function __huIsUnbanCommand(text) {
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

function __huResolveTarget(msg) {
  if (msg.reply_to_message && msg.reply_to_message.from) {
    __huRememberUser(msg.reply_to_message.from);

    return {
      ok: true,
      id: msg.reply_to_message.from.id,
      label: msg.reply_to_message.from.username
        ? "@" + msg.reply_to_message.from.username
        : String(msg.reply_to_message.from.id)
    };
  }

  const parts = String(msg.text || "").trim().split(/\\s+/).filter(Boolean);

  if (parts.length < 2) {
    return {
      ok: false,
      error:
        "❌ Пользователь не указан.\\n\\n" +
        "Используй так:\\n" +
        "• /разбанить @username\\n" +
        "• ответь на сообщение пользователя командой /разбанить\\n\\n" +
        "Важно: через @username работает, если бот уже видел пользователя в чате."
    };
  }

  const raw = parts[1].trim();

  if (!raw.startsWith("@")) {
    return {
      ok: false,
      error:
        "❌ Нужно указать именно @username.\\n\\n" +
        "Пример:\\n" +
        "/разбанить @username"
    };
  }

  const username = raw.replace(/^@/, "").toLowerCase();
  const id = __huFindUserIdByUsername(username);

  if (!id) {
    return {
      ok: false,
      error:
        "❌ Я ещё не знаю @" + username + ".\\n\\n" +
        "Пусть этот пользователь напишет любое сообщение в чат, потом команда заработает.\\n\\n" +
        "Telegram не даёт боту получить ID любого @username, пока бот его не видел."
    };
  }

  return {
    ok: true,
    id,
    label: "@" + username
  };
}

async function __huHandleUnban(msg) {
  const chatId = msg.chat.id;
  const target = __huResolveTarget(msg);

  if (!target.ok) {
    await bot.sendMessage(chatId, target.error);
    return;
  }

  try {
    await bot.unbanChatMember(chatId, target.id, {
      only_if_banned: true
    });

    await bot.sendMessage(chatId, "✅ " + target.label + " разблокирован.");
  } catch (error) {
    console.error("❌ HARD UNBAN V6 ERROR:", error);

    await bot.sendMessage(
      chatId,
      "❌ Не удалось разблокировать " + target.label + ".\\n\\n" +
      "Проверь:\\n" +
      "1. Бот администратор\\n" +
      "2. У бота есть право банить/разбанивать\\n" +
      "3. Пользователь реально был заблокирован\\n" +
      "4. Пользователь есть в этом чате"
    );
  }
}

if (typeof bot !== "undefined" && !global.__HARD_ONLY_UNBAN_OVERRIDE_V6__) {
  global.__HARD_ONLY_UNBAN_OVERRIDE_V6__ = true;

  console.log("✅ HARD ONLY UNBAN OVERRIDE V6 ACTIVE");

  const __huOriginalEmit = bot.emit.bind(bot);

  bot.emit = function(eventName, ...args) {
    try {
      if (eventName === "message") {
        const msg = args[0];

        if (msg && msg.from) {
          __huRememberUser(msg.from);
        }

        if (msg && msg.reply_to_message && msg.reply_to_message.from) {
          __huRememberUser(msg.reply_to_message.from);
        }

        if (msg && __huIsUnbanCommand(msg.text)) {
          __huHandleUnban(msg).catch((error) => {
            console.error("❌ HARD UNBAN V6 ASYNC ERROR:", error);
          });

          // ВАЖНО: не отдаём /разбанить старым обработчикам
          return true;
        }
      }
    } catch (error) {
      console.error("❌ HARD UNBAN V6 EMIT ERROR:", error);
    }

    return __huOriginalEmit(eventName, ...args);
  };
}

/* ================= HARD ONLY UNBAN OVERRIDE V6 END ================= */

`;

code += patch;

fs.writeFileSync(file, code, "utf8");

console.log("✅ Исправлен только /разбанить.");
console.log("✅ Старые обработчики /разбанить теперь не должны срабатывать.");
console.log("✅ При запуске должна быть строка: HARD ONLY UNBAN OVERRIDE V6 ACTIVE");
