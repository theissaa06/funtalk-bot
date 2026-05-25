const fs = require("fs");
const path = require("path");

const root = process.cwd();

function walk(dir) {
  const out = [];
  for (const item of fs.readdirSync(dir)) {
    const full = path.join(dir, item);
    if (
      item === "node_modules" ||
      item === ".git" ||
      item === "dist" ||
      item === "build" ||
      item.startsWith("index.before")
    ) continue;

    const st = fs.statSync(full);
    if (st.isDirectory()) out.push(...walk(full));
    else if (/\.(js|ts)$/.test(item)) out.push(full);
  }
  return out;
}

const files = walk(root);

const target = files.find((file) => {
  const text = fs.readFileSync(file, "utf8");
  return (
    text.includes("разбанить") ||
    text.includes("Укажи ID") ||
    text.includes("unbanChatMember")
  );
});

if (!target) {
  console.log("❌ Не нашёл файл с командой /разбанить.");
  console.log("Проверь, что ты находишься в папке Telegram-бота.");
  process.exit(1);
}

let code = fs.readFileSync(target, "utf8");
const backup = target + ".before-username-unban-" + Date.now() + ".bak";
fs.writeFileSync(backup, code, "utf8");

console.log("✅ Найден файл:", path.relative(root, target));
console.log("✅ Бэкап создан:", path.relative(root, backup));

const helper = `
/* ===== TG USERNAME RESOLVER PATCH START ===== */
const __tgFs = require("fs");
const __tgPath = require("path");

const __tgDataDir = __tgPath.join(process.cwd(), "data");
const __tgUsersDb = __tgPath.join(__tgDataDir, "tg-users.json");

if (!__tgFs.existsSync(__tgDataDir)) {
  __tgFs.mkdirSync(__tgDataDir, { recursive: true });
}

function __tgReadUsersDb() {
  try {
    return JSON.parse(__tgFs.readFileSync(__tgUsersDb, "utf8"));
  } catch {
    return {};
  }
}

function __tgWriteUsersDb(data) {
  __tgFs.writeFileSync(__tgUsersDb, JSON.stringify(data, null, 2), "utf8");
}

function rememberTelegramUser(user) {
  if (!user || !user.id) return;

  const db = __tgReadUsersDb();

  db[String(user.id)] = {
    id: user.id,
    username: user.username || null,
    first_name: user.first_name || "",
    last_name: user.last_name || "",
    updatedAt: new Date().toISOString(),
  };

  if (user.username) {
    const username = String(user.username).toLowerCase();
    db["@" + username] = user.id;
    db[username] = user.id;
  }

  __tgWriteUsersDb(db);
}

function resolveTelegramTarget(msg) {
  if (msg && msg.reply_to_message && msg.reply_to_message.from) {
    rememberTelegramUser(msg.reply_to_message.from);
    return msg.reply_to_message.from.id;
  }

  const text = String((msg && msg.text) || "");
  const cleanText = text.replace(/@\\w+Bot/gi, "").trim();
  const parts = cleanText.split(/\\s+/).filter(Boolean);
  const raw = parts[1];

  if (!raw) return null;

  if (/^\\d+$/.test(raw)) {
    return Number(raw);
  }

  const username = raw.replace(/^@/, "").toLowerCase();
  const db = __tgReadUsersDb();

  const fromDb = db["@" + username] || db[username];

  if (fromDb) {
    return Number(fromDb);
  }

  return null;
}

function getTelegramTargetText(msg) {
  const target = resolveTelegramTarget(msg);
  if (target) return target;

  return null;
}
/* ===== TG USERNAME RESOLVER PATCH END ===== */

`;

if (!code.includes("TG USERNAME RESOLVER PATCH START")) {
  const firstRequire = code.match(/^(const|let|var)\\s+.+?require\\(.+?\\);/m);
  if (firstRequire) {
    const idx = firstRequire.index + firstRequire[0].length;
    code = code.slice(0, idx) + "\n" + helper + code.slice(idx);
  } else {
    code = helper + code;
  }
}

const rememberHandler = `
/* ===== TG REMEMBER USERS PATCH START ===== */
if (typeof bot !== "undefined" && !global.__tgRememberUsersPatch) {
  global.__tgRememberUsersPatch = true;

  bot.on("message", (msg) => {
    try {
      rememberTelegramUser(msg.from);

      if (msg.reply_to_message && msg.reply_to_message.from) {
        rememberTelegramUser(msg.reply_to_message.from);
      }
    } catch (error) {
      console.error("rememberTelegramUser error:", error);
    }
  });
}
/* ===== TG REMEMBER USERS PATCH END ===== */

`;

if (!code.includes("TG REMEMBER USERS PATCH START")) {
  code += "\n" + rememberHandler;
}

const unbanHandler = `
/* ===== TG USERNAME UNBAN COMMAND PATCH START ===== */
if (typeof bot !== "undefined" && !global.__tgUsernameUnbanPatch) {
  global.__tgUsernameUnbanPatch = true;

  bot.onText(/^\\/разбанить(?:@\\w+Bot)?(?:\\s+(.+))?$/i, async (msg) => {
    try {
      rememberTelegramUser(msg.from);

      if (msg.reply_to_message && msg.reply_to_message.from) {
        rememberTelegramUser(msg.reply_to_message.from);
      }

      const targetId = resolveTelegramTarget(msg);

      if (!targetId) {
        return bot.sendMessage(
          msg.chat.id,
          "❌ Укажи пользователя правильно:\\n\\n" +
          "✅ /разбанить @username\\n" +
          "✅ /разбанить 588174634\\n" +
          "✅ или ответь /разбанить на сообщение пользователя\\n\\n" +
          "⚠️ Через @username работает, если бот уже видел этого пользователя в чате."
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
      console.error("Ошибка /разбанить через username:", error);

      return bot.sendMessage(
        msg.chat.id,
        "❌ Не удалось разблокировать пользователя.\\n\\n" +
        "Проверь:\\n" +
        "1. Бот администратор\\n" +
        "2. У бота есть право банить/разбанивать\\n" +
        "3. Пользователь реально был в бане\\n" +
        "4. Username уже был замечен ботом"
      );
    }
  });
}
/* ===== TG USERNAME UNBAN COMMAND PATCH END ===== */

`;

if (!code.includes("TG USERNAME UNBAN COMMAND PATCH START")) {
  code += "\n" + unbanHandler;
}

/*
  Пробуем отключить старые простые ответы "Укажи ID", чтобы не было дубля.
  Не трогаем логику бана, только конкретный старый ответ.
*/
code = code.replace(
  /return\\s+bot\\.sendMessage\\(\\s*msg\\.chat\\.id\\s*,\\s*["'`]❌?\\s*Укажи ID\\.?["'`]\\s*\\);?/g,
  `return; // old "Укажи ID" disabled by username-unban patch`
);

code = code.replace(
  /bot\\.sendMessage\\(\\s*msg\\.chat\\.id\\s*,\\s*["'`]❌?\\s*Укажи ID\\.?["'`]\\s*\\);?/g,
  `/* old "Укажи ID" disabled by username-unban patch */`
);

fs.writeFileSync(target, code, "utf8");

console.log("✅ Патч применён.");
console.log("✅ Теперь работает:");
console.log("   /разбанить @username");
console.log("   /разбанить 588174634");
console.log("   reply на сообщение + /разбанить");
console.log("");
console.log("⚠️ Важно: @username сработает, если бот уже видел пользователя в чате.");

