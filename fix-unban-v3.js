const fs = require("fs");
const path = require("path");

const root = process.cwd();

function walk(dir) {
  let files = [];

  for (const item of fs.readdirSync(dir)) {
    const full = path.join(dir, item);

    if (
      item === "node_modules" ||
      item === ".git" ||
      item === "dist" ||
      item === "build"
    ) {
      continue;
    }

    const stat = fs.statSync(full);

    if (stat.isDirectory()) {
      files = files.concat(walk(full));
    } else if (/\.(js|ts)$/.test(item)) {
      files.push(full);
    }
  }

  return files;
}

const files = walk(root);

const target = files.find((file) => {
  const code = fs.readFileSync(file, "utf8");
  return (
    code.includes("new TelegramBot") ||
    code.includes("TelegramBot") ||
    code.includes("bot.onText") ||
    code.includes("bot.on(")
  );
});

if (!target) {
  console.log("❌ Не нашёл файл Telegram-бота.");
  process.exit(1);
}

let code = fs.readFileSync(target, "utf8");
const backup = target + ".backup-unban-v3-" + Date.now() + ".bak";
fs.writeFileSync(backup, code, "utf8");

console.log("✅ Файл найден:", path.relative(root, target));
console.log("✅ Бэкап:", path.relative(root, backup));

/**
 * Отключаем старые ответы "Укажи ID", чтобы они не перебивали новый обработчик.
 */
code = code.replaceAll('❌ Укажи ID.', '❌ Старый обработчик отключён. Используй /разбанить @username или reply + /разбанить');
code = code.replaceAll('❌ Укажи ID', '❌ Старый обработчик отключён. Используй /разбанить @username или reply + /разбанить');

const patch = `

/* ================= UNBAN USERNAME V3 PATCH START ================= */

const __unbanFs = require("fs");
const __unbanPath = require("path");

const __unbanDataDir = __unbanPath.join(process.cwd(), "data");
const __unbanUsersFile = __unbanPath.join(__unbanDataDir, "telegram-users.json");

if (!__unbanFs.existsSync(__unbanDataDir)) {
  __unbanFs.mkdirSync(__unbanDataDir, { recursive: true });
}

function __readTelegramUsers() {
  try {
    return JSON.parse(__unbanFs.readFileSync(__unbanUsersFile, "utf8"));
  } catch {
    return {};
  }
}

function __writeTelegramUsers(data) {
  __unbanFs.writeFileSync(__unbanUsersFile, JSON.stringify(data, null, 2), "utf8");
}

function __rememberTelegramUser(user) {
  if (!user || !user.id) return;

  const db = __readTelegramUsers();

  const userData = {
    id: user.id,
    username: user.username || null,
    first_name: user.first_name || "",
    last_name: user.last_name || "",
    updatedAt: new Date().toISOString(),
  };

  db[String(user.id)] = userData;

  if (user.username) {
    const username = String(user.username).replace("@", "").toLowerCase();
    db[username] = user.id;
    db["@" + username] = user.id;
  }

  __writeTelegramUsers(db);
}

function __extractUnbanTarget(msg) {
  if (msg.reply_to_message && msg.reply_to_message.from) {
    __rememberTelegramUser(msg.reply_to_message.from);
    return msg.reply_to_message.from.id;
  }

  const text = String(msg.text || "").trim();
  const parts = text.split(/\\s+/).filter(Boolean);

  if (parts.length < 2) return null;

  let raw = parts[1].trim();

  if (/^\\d+$/.test(raw)) {
    return Number(raw);
  }

  raw = raw.replace(/^@/, "").toLowerCase();

  const db = __readTelegramUsers();

  if (db[raw]) return Number(db[raw]);
  if (db["@" + raw]) return Number(db["@" + raw]);

  return null;
}

function __isUnbanCommand(text) {
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

if (typeof bot !== "undefined" && !global.__UNBAN_USERNAME_V3_PATCH__) {
  global.__UNBAN_USERNAME_V3_PATCH__ = true;

  console.log("✅ UNBAN USERNAME V3 PATCH ACTIVE");

  bot.on("message", async (msg) => {
    try {
      if (msg.from) {
        __rememberTelegramUser(msg.from);
      }

      if (msg.reply_to_message && msg.reply_to_message.from) {
        __rememberTelegramUser(msg.reply_to_message.from);
      }

      if (!__isUnbanCommand(msg.text)) return;

      const targetId = __extractUnbanTarget(msg);

      if (!targetId) {
        return bot.sendMessage(
          msg.chat.id,
          "❌ Укажи пользователя.\\n\\n" +
          "✅ Варианты:\\n" +
          "1. /разбанить 588174634\\n" +
          "2. /разбанить @username\\n" +
          "3. Ответь на сообщение пользователя командой /разбанить\\n\\n" +
          "⚠️ Важно: @username работает только если бот уже видел этого пользователя в чате."
        );
      }

      await bot.unbanChatMember(msg.chat.id, targetId, {
        only_if_banned: true,
      });

      return bot.sendMessage(
        msg.chat.id,
        "✅ Пользователь " + targetId + " разблокирован."
      );
    } catch (error) {
      console.error("❌ Ошибка UNBAN USERNAME V3:", error);

      return bot.sendMessage(
        msg.chat.id,
        "❌ Не удалось разблокировать пользователя.\\n\\n" +
        "Проверь:\\n" +
        "1. Бот администратор\\n" +
        "2. У бота есть право банить/разбанивать\\n" +
        "3. Пользователь реально был забанен\\n" +
        "4. Username уже был замечен ботом"
      );
    }
  });
}

/* ================= UNBAN USERNAME V3 PATCH END ================= */

`;

if (!code.includes("UNBAN USERNAME V3 PATCH START")) {
  code += patch;
}

fs.writeFileSync(target, code, "utf8");

console.log("✅ Фикс применён.");
console.log("✅ Теперь команда работает так:");
console.log("   /разбанить 588174634");
console.log("   /разбанить @username");
console.log("   reply на сообщение + /разбанить");
