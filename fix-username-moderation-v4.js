const fs = require("fs");

const file = "index.js";

if (!fs.existsSync(file)) {
  console.log("❌ index.js не найден. Запусти из корня funtalk-bot.");
  process.exit(1);
}

let code = fs.readFileSync(file, "utf8");
fs.writeFileSync("index.before-username-moderation-v4.js", code, "utf8");

const patch = `

/* ================= USERNAME MODERATION V4 START ================= */

const __umFs = require("fs");
const __umPath = require("path");

const __umDataDir = __umPath.join(process.cwd(), "data");
const __umUsersFile = __umPath.join(__umDataDir, "username-users.json");

if (!__umFs.existsSync(__umDataDir)) {
  __umFs.mkdirSync(__umDataDir, { recursive: true });
}

function __umReadUsers() {
  try {
    return JSON.parse(__umFs.readFileSync(__umUsersFile, "utf8"));
  } catch {
    return {};
  }
}

function __umWriteUsers(data) {
  __umFs.writeFileSync(__umUsersFile, JSON.stringify(data, null, 2), "utf8");
}

function __umRememberUser(user) {
  if (!user || !user.id) return;

  const db = __umReadUsers();

  const data = {
    id: user.id,
    username: user.username || null,
    first_name: user.first_name || "",
    last_name: user.last_name || "",
    updatedAt: new Date().toISOString(),
  };

  db[String(user.id)] = data;

  if (user.username) {
    const username = String(user.username).replace(/^@/, "").toLowerCase();
    db[username] = user.id;
    db["@" + username] = user.id;
  }

  __umWriteUsers(db);
}

function __umGetCommand(text) {
  const clean = String(text || "").trim();
  const first = clean.split(/\\s+/)[0] || "";
  return first.replace(/@\\w+Bot$/i, "").toLowerCase();
}

function __umGetArgs(text) {
  const clean = String(text || "").trim();
  const parts = clean.split(/\\s+/).filter(Boolean);
  parts.shift();
  return parts;
}

function __umResolveTarget(msg) {
  if (msg.reply_to_message && msg.reply_to_message.from) {
    __umRememberUser(msg.reply_to_message.from);
    return {
      id: msg.reply_to_message.from.id,
      username: msg.reply_to_message.from.username || null,
    };
  }

  const args = __umGetArgs(msg.text);

  if (!args.length) return null;

  const raw = String(args[0]).trim();

  if (!raw.startsWith("@")) {
    return {
      error:
        "❌ Укажи пользователя через @username.\\n\\n" +
        "Пример:\\n" +
        "/разбанить @username\\n" +
        "/бан @username причина\\n" +
        "/кик @username причина\\n" +
        "/мут @username 10м причина\\n\\n" +
        "Или ответь командой на сообщение пользователя."
    };
  }

  const username = raw.replace(/^@/, "").toLowerCase();
  const db = __umReadUsers();
  const id = db[username] || db["@" + username];

  if (!id) {
    return {
      error:
        "❌ Я ещё не знаю этого пользователя.\\n\\n" +
        "Пусть @" + username + " напишет любое сообщение в чат, потом команда заработает.\\n\\n" +
        "Telegram не даёт боту получить ID любого @username, пока бот его не видел."
    };
  }

  return {
    id: Number(id),
    username,
  };
}

function __umReason(text, skip = 2) {
  return String(text || "")
    .trim()
    .split(/\\s+/)
    .slice(skip)
    .join(" ") || "Причина не указана";
}

function __umMuteTime(text) {
  const args = __umGetArgs(text);
  const time = args[1] || "10м";
  const match = time.match(/^(\\d+)(м|m|ч|h|д|d)$/i);

  if (!match) {
    return {
      text: "10м",
      until: Math.floor(Date.now() / 1000) + 10 * 60,
      reasonSkip: 2,
    };
  }

  const amount = Number(match[1]);
  const unit = match[2].toLowerCase();

  let seconds = amount * 60;

  if (unit === "ч" || unit === "h") seconds = amount * 60 * 60;
  if (unit === "д" || unit === "d") seconds = amount * 24 * 60 * 60;

  return {
    text: time,
    until: Math.floor(Date.now() / 1000) + seconds,
    reasonSkip: 3,
  };
}

async function __umSafeSend(chatId, text) {
  try {
    return await bot.sendMessage(chatId, text);
  } catch (error) {
    console.error("sendMessage error:", error);
  }
}

async function __umHandleModeration(msg) {
  const command = __umGetCommand(msg.text);

  const isModerCommand = [
    "/разбанить",
    "/unban",
    "/бан",
    "/забанить",
    "/ban",
    "/кик",
    "/kick",
    "/мут",
    "/mute",
    "/размут",
    "/unmute"
  ].includes(command);

  if (!isModerCommand) return false;

  const chatId = msg.chat.id;
  const target = __umResolveTarget(msg);

  if (!target || target.error) {
    await __umSafeSend(chatId, target?.error || "❌ Укажи @username или ответь командой на сообщение пользователя.");
    return true;
  }

  try {
    if (command === "/разбанить" || command === "/unban") {
      await bot.unbanChatMember(chatId, target.id, {
        only_if_banned: true,
      });

      await __umSafeSend(chatId, "✅ @" + (target.username || target.id) + " разблокирован.");
      return true;
    }

    if (command === "/бан" || command === "/забанить" || command === "/ban") {
      const reason = __umReason(msg.text, 2);

      await bot.banChatMember(chatId, target.id);

      await __umSafeSend(
        chatId,
        "🚫 @" + (target.username || target.id) + " забанен.\\nПричина: " + reason
      );
      return true;
    }

    if (command === "/кик" || command === "/kick") {
      const reason = __umReason(msg.text, 2);

      await bot.banChatMember(chatId, target.id);
      await bot.unbanChatMember(chatId, target.id, {
        only_if_banned: true,
      });

      await __umSafeSend(
        chatId,
        "👢 @" + (target.username || target.id) + " кикнут.\\nПричина: " + reason
      );
      return true;
    }

    if (command === "/мут" || command === "/mute") {
      const mute = __umMuteTime(msg.text);
      const reason = __umReason(msg.text, mute.reasonSkip);

      await bot.restrictChatMember(chatId, target.id, {
        permissions: {
          can_send_messages: false,
          can_send_audios: false,
          can_send_documents: false,
          can_send_photos: false,
          can_send_videos: false,
          can_send_video_notes: false,
          can_send_voice_notes: false,
          can_send_polls: false,
          can_send_other_messages: false,
          can_add_web_page_previews: false,
          can_change_info: false,
          can_invite_users: false,
          can_pin_messages: false,
        },
        until_date: mute.until,
      });

      await __umSafeSend(
        chatId,
        "🔇 @" + (target.username || target.id) + " получил мут на " + mute.text + ".\\nПричина: " + reason
      );
      return true;
    }

    if (command === "/размут" || command === "/unmute") {
      await bot.restrictChatMember(chatId, target.id, {
        permissions: {
          can_send_messages: true,
          can_send_audios: true,
          can_send_documents: true,
          can_send_photos: true,
          can_send_videos: true,
          can_send_video_notes: true,
          can_send_voice_notes: true,
          can_send_polls: true,
          can_send_other_messages: true,
          can_add_web_page_previews: true,
          can_change_info: false,
          can_invite_users: true,
          can_pin_messages: false,
        },
      });

      await __umSafeSend(chatId, "🔊 @" + (target.username || target.id) + " размучен.");
      return true;
    }
  } catch (error) {
    console.error("❌ USERNAME MODERATION V4 ERROR:", error);

    await __umSafeSend(
      chatId,
      "❌ Не удалось выполнить команду.\\n\\n" +
      "Проверь:\\n" +
      "1. Бот администратор\\n" +
      "2. У бота есть права банить/мутить\\n" +
      "3. Пользователь есть в чате или бот уже видел его @username\\n" +
      "4. Ты указал username правильно"
    );

    return true;
  }

  return false;
}

if (typeof bot !== "undefined" && !global.__USERNAME_MODERATION_V4__) {
  global.__USERNAME_MODERATION_V4__ = true;

  console.log("✅ USERNAME MODERATION V4 ACTIVE");

  if (Array.isArray(bot._textRegexpCallbacks)) {
    bot._textRegexpCallbacks = bot._textRegexpCallbacks.filter((item) => {
      const r = String(item.regexp || "");
      return !(
        r.includes("разбанить") ||
        r.includes("unban") ||
        r.includes("забанить") ||
        r.includes("ban") ||
        r.includes("кик") ||
        r.includes("kick") ||
        r.includes("мут") ||
        r.includes("mute") ||
        r.includes("размут") ||
        r.includes("unmute")
      );
    });

    console.log("✅ Старые обработчики модерации отключены");
  }

  bot.prependListener("message", async (msg) => {
    try {
      if (msg.from) __umRememberUser(msg.from);
      if (msg.reply_to_message && msg.reply_to_message.from) {
        __umRememberUser(msg.reply_to_message.from);
      }

      await __umHandleModeration(msg);
    } catch (error) {
      console.error("❌ USERNAME MODERATION V4 LISTENER ERROR:", error);
    }
  });
}

/* ================= USERNAME MODERATION V4 END ================= */

`;

code = code.replace(
  /\/\* ================= USERNAME MODERATION V4 START ================= \*\/[\s\S]*?\/\* ================= USERNAME MODERATION V4 END ================= \*\//g,
  ""
);

code += patch;

fs.writeFileSync(file, code, "utf8");

console.log("✅ Username-модерация V4 установлена.");
console.log("✅ Теперь команды работают через @username или reply.");
console.log("✅ Старые обработчики /разбанить, /бан, /кик, /мут будут отключены при запуске.");
