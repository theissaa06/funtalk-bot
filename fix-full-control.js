const fs = require("fs");

const file = "index.js";

if (!fs.existsSync(file)) {
  console.log("❌ index.js не найден. Открой терминал в корне funtalk-bot.");
  process.exit(1);
}

let code = fs.readFileSync(file, "utf8");

fs.writeFileSync("index.before-full-control-fix.js", code, "utf8");

// Удаляем старые наши фиксы, которые могли конфликтовать
const oldBlocks = [
  "BUTTONS CALLBACK FIX",
  "ALL BUTTONS FIX",
  "ONLY UNBAN FIX",
  "HARD ONLY UNBAN",
  "MAIN UNBAN USERNAME",
  "UNBAN USERNAME V3",
  "USERNAME MODERATION V4"
];

for (const name of oldBlocks) {
  const re = new RegExp(
    "\\/\\* [= ]*" + name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "[\\s\\S]*?END [= ]*\\*\\/",
    "g"
  );
  code = code.replace(re, "");
}

const patch = `

/* ================= FULL BOT CONTROL FIX START ================= */

const __fcFs = require("fs");
const __fcPath = require("path");

const __fcDataDir = __fcPath.join(process.cwd(), "data");
const __fcUsersFile = __fcPath.join(__fcDataDir, "full-control-users.json");

if (!__fcFs.existsSync(__fcDataDir)) {
  __fcFs.mkdirSync(__fcDataDir, { recursive: true });
}

function __fcReadJson(file, fallback) {
  try {
    return JSON.parse(__fcFs.readFileSync(file, "utf8"));
  } catch {
    return fallback;
  }
}

function __fcWriteJson(file, data) {
  __fcFs.writeFileSync(file, JSON.stringify(data, null, 2), "utf8");
}

function __fcRememberUser(user) {
  if (!user || !user.id) return;

  const db = __fcReadJson(__fcUsersFile, {});

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

  __fcWriteJson(__fcUsersFile, db);
}

function __fcFindUser(username) {
  const clean = String(username || "").replace(/^@/, "").toLowerCase();

  const files = [
    "full-control-users.json",
    "hard-unban-users.json",
    "unban-users.json",
    "username-users.json",
    "telegram-users.json",
    "telegram-users-main.json",
    "tg-users.json"
  ];

  for (const name of files) {
    const db = __fcReadJson(__fcPath.join(__fcDataDir, name), null);
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

function __fcCommand(text) {
  const first = String(text || "").trim().split(/\\s+/)[0] || "";
  return first.replace(/@\\w+Bot$/i, "").toLowerCase();
}

function __fcArgs(text) {
  const parts = String(text || "").trim().split(/\\s+/).filter(Boolean);
  parts.shift();
  return parts;
}

function __fcIsHelpCommand(cmd) {
  return [
    "/start", "/help", "/menu", "/commands",
    "/старт", "/помощь", "/меню", "/команды",
    "помощь", "меню", "команды"
  ].includes(cmd);
}

function __fcResolveTarget(msg) {
  if (msg.reply_to_message && msg.reply_to_message.from) {
    __fcRememberUser(msg.reply_to_message.from);
    return {
      ok: true,
      id: msg.reply_to_message.from.id,
      label: msg.reply_to_message.from.username
        ? "@" + msg.reply_to_message.from.username
        : String(msg.reply_to_message.from.id)
    };
  }

  const args = __fcArgs(msg.text);
  const raw = args[0];

  if (!raw) {
    return {
      ok: false,
      error:
        "❌ Пользователь не указан.\\n\\n" +
        "Используй:\\n" +
        "• /ban @username reason\\n" +
        "• /бан @username причина\\n" +
        "• /unban @username\\n" +
        "• /разбанить @username\\n\\n" +
        "Или ответь командой на сообщение пользователя."
    };
  }

  if (!raw.startsWith("@")) {
    return {
      ok: false,
      error:
        "❌ Нужно указать через @username.\\n\\n" +
        "Пример:\\n" +
        "/разбанить @username"
    };
  }

  const username = raw.replace(/^@/, "").toLowerCase();
  const id = __fcFindUser(username);

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

function __fcReason(text, skip = 2) {
  const parts = String(text || "").trim().split(/\\s+/).filter(Boolean);
  return parts.slice(skip).join(" ") || "Причина не указана";
}

function __fcMute(text) {
  const args = __fcArgs(text);
  const time = args[1] || "10м";
  const m = time.match(/^(\\d+)(м|m|ч|h|д|d)$/i);

  if (!m) {
    return {
      text: "10м",
      until: Math.floor(Date.now() / 1000) + 10 * 60,
      reasonSkip: 2
    };
  }

  const amount = Number(m[1]);
  const unit = m[2].toLowerCase();

  let seconds = amount * 60;
  if (unit === "ч" || unit === "h") seconds = amount * 60 * 60;
  if (unit === "д" || unit === "d") seconds = amount * 24 * 60 * 60;

  return {
    text: time,
    until: Math.floor(Date.now() / 1000) + seconds,
    reasonSkip: 3
  };
}

async function __fcSend(chatId, text) {
  return bot.sendMessage(chatId, text).catch((e) => {
    console.error("sendMessage error:", e);
  });
}

async function __fcSendMenu(chatId) {
  return bot.sendMessage(chatId,
    "🤖 FulTalchik_Botik — меню команд\\n\\n" +
    "⚙️ Все команды работают со слешем и без!\\n\\n" +
    "Выбери раздел:",
    {
      reply_markup: {
        inline_keyboard: [
          [
            { text: "🛡 Модерация", callback_data: "help:moder" },
            { text: "👑 Ранги", callback_data: "help:ranks" }
          ],
          [
            { text: "👤 Профиль", callback_data: "help:profile" },
            { text: "📜 Правила", callback_data: "help:rules" }
          ],
          [
            { text: "⚙️ Настройки", callback_data: "help:settings" },
            { text: "🎁 Магазин", callback_data: "help:shop" }
          ],
          [
            { text: "📣 Созыв", callback_data: "help:call" },
            { text: "❤️ Отношения", callback_data: "help:social" }
          ],
          [
            { text: "🏆 Топы", callback_data: "help:tops" },
            { text: "🎉 Пятница", callback_data: "help:friday" }
          ],
          [
            { text: "🌍 Глоб.ранги", callback_data: "help:global" },
            { text: "💰 Монеты", callback_data: "help:coins" }
          ]
        ]
      }
    }
  );
}

const __fcSections = {
  "help:moder":
    "🛡 Модерация\\n\\n" +
    "Русские команды:\\n" +
    "• /бан @username причина\\n" +
    "• /разбанить @username\\n" +
    "• /кик @username причина\\n" +
    "• /мут @username 10м причина\\n" +
    "• /размут @username\\n" +
    "• /очистить 20\\n\\n" +
    "English commands:\\n" +
    "• /ban @username reason\\n" +
    "• /unban @username\\n" +
    "• /kick @username reason\\n" +
    "• /mute @username 10m reason\\n" +
    "• /unmute @username\\n" +
    "• /clear 20\\n\\n" +
    "Также работает reply на сообщение пользователя.",

  "help:ranks":
    "👑 Ранги\\n\\n" +
    "Русские команды:\\n" +
    "• /ранг\\n" +
    "• /профиль\\n" +
    "• /выдатьранг @username ранг\\n" +
    "• /снятьранг @username\\n" +
    "• /топрангов\\n\\n" +
    "English commands:\\n" +
    "• /rank\\n" +
    "• /profile\\n" +
    "• /setrank @username rank\\n" +
    "• /removerank @username\\n" +
    "• /topranks",

  "help:profile":
    "👤 Профиль\\n\\n" +
    "Команды:\\n" +
    "• /профиль\\n" +
    "• /profile\\n" +
    "• профиль\\n\\n" +
    "Показывает ID, username, ранг и статистику.",

  "help:rules":
    "📜 Правила\\n\\n" +
    "Команды:\\n" +
    "• /правила\\n" +
    "• /rules\\n\\n" +
    "Показывает правила чата.",

  "help:settings":
    "⚙️ Настройки\\n\\n" +
    "Команды:\\n" +
    "• /settings\\n" +
    "• /настройки\\n\\n" +
    "Можно добавить антиспам, приветствие, права и модули.",

  "help:shop":
    "🎁 Магазин\\n\\n" +
    "Команды:\\n" +
    "• /shop\\n" +
    "• /магазин\\n\\n" +
    "Раздел для ролей, титулов, бонусов и монет.",

  "help:call":
    "📣 Созыв\\n\\n" +
    "Команды:\\n" +
    "• /созыв\\n" +
    "• /call\\n\\n" +
    "Функция для созыва участников.",

  "help:social":
    "❤️ Отношения\\n\\n" +
    "Команды:\\n" +
    "• отношения @username\\n" +
    "• отношения reply\\n" +
    "• relationship @username\\n\\n" +
    "Можно добавить дружбу, пары и симпатии.",

  "help:tops":
    "🏆 Топы\\n\\n" +
    "Команды:\\n" +
    "• /топ\\n" +
    "• /top\\n" +
    "• /топ сообщений\\n" +
    "• /top messages\\n" +
    "• /топ монет\\n" +
    "• /top coins",

  "help:friday":
    "🎉 Пятница\\n\\n" +
    "Развлекательный раздел:\\n" +
    "• бонусы\\n" +
    "• мини-ивенты\\n" +
    "• розыгрыши\\n" +
    "• активности",

  "help:global":
    "🌍 Глобальные ранги\\n\\n" +
    "Команды:\\n" +
    "• /глобранги\\n" +
    "• /globalranks",

  "help:coins":
    "💰 Монеты\\n\\n" +
    "Команды:\\n" +
    "• /баланс\\n" +
    "• /balance\\n" +
    "• /монеты\\n" +
    "• /coins\\n" +
    "• /топмонет\\n" +
    "• /topcoins"
};

function __fcNormalizeCallback(data) {
  const d = String(data || "").trim();

  const map = {
    "help:moderation": "help:moder",
    "help:mod": "help:moder",
    "help:ranks": "help:ranks",
    "help:rank": "help:ranks",
    "help:profile": "help:profile",
    "help:rules": "help:rules",
    "help:settings": "help:settings",
    "help:shop": "help:shop",
    "help:call": "help:call",
    "help:summon": "help:call",
    "help:social": "help:social",
    "help:relations": "help:social",
    "help:tops": "help:tops",
    "help:top": "help:tops",
    "help:friday": "help:friday",
    "help:global": "help:global",
    "help:global_ranks": "help:global",
    "help:coins": "help:coins",
    "help:money": "help:coins",

    "moder": "help:moder",
    "moderation": "help:moder",
    "ranks": "help:ranks",
    "rank": "help:ranks",
    "profile": "help:profile",
    "rules": "help:rules",
    "settings": "help:settings",
    "shop": "help:shop",
    "call": "help:call",
    "summon": "help:call",
    "social": "help:social",
    "relations": "help:social",
    "tops": "help:tops",
    "friday": "help:friday",
    "global": "help:global",
    "global_ranks": "help:global",
    "coins": "help:coins",
    "money": "help:coins"
  };

  return map[d] || d;
}

async function __fcHandleCallback(query) {
  const msg = query.message;
  const rawData = String(query.data || "").trim();
  const data = __fcNormalizeCallback(rawData);

  await bot.answerCallbackQuery(query.id).catch(() => {});

  if (!msg || !msg.chat) return true;

  const chatId = msg.chat.id;

  console.log("🔘 FULL CONTROL CALLBACK:", rawData, "=>", data);

  if (__fcSections[data]) {
    await __fcSend(chatId, __fcSections[data]);
    return true;
  }

  await __fcSend(chatId, "⚠️ Кнопка пока не настроена.\\n\\nCallback data: " + rawData);
  return true;
}

async function __fcHandleMessage(msg) {
  if (!msg || !msg.text) return false;

  if (msg.from) __fcRememberUser(msg.from);
  if (msg.reply_to_message && msg.reply_to_message.from) {
    __fcRememberUser(msg.reply_to_message.from);
  }

  const chatId = msg.chat.id;
  const cmd = __fcCommand(msg.text);

  if (__fcIsHelpCommand(cmd)) {
    await __fcSendMenu(chatId);
    return true;
  }

  if (cmd === "/разбанить" || cmd === "/unban") {
    const target = __fcResolveTarget(msg);

    if (!target.ok) {
      await __fcSend(chatId, target.error);
      return true;
    }

    try {
      await bot.unbanChatMember(chatId, target.id, { only_if_banned: true });
      await __fcSend(chatId, "✅ " + target.label + " разблокирован.");
    } catch (e) {
      console.error("unban error:", e);
      await __fcSend(chatId, "❌ Не удалось разблокировать " + target.label + ". Проверь права бота.");
    }

    return true;
  }

  if (cmd === "/бан" || cmd === "/забанить" || cmd === "/ban") {
    const target = __fcResolveTarget(msg);

    if (!target.ok) {
      await __fcSend(chatId, target.error);
      return true;
    }

    const reason = __fcReason(msg.text, 2);

    try {
      await bot.banChatMember(chatId, target.id);
      await __fcSend(chatId, "🚫 " + target.label + " забанен.\\nПричина: " + reason);
    } catch (e) {
      console.error("ban error:", e);
      await __fcSend(chatId, "❌ Не удалось забанить " + target.label + ". Проверь права бота.");
    }

    return true;
  }

  if (cmd === "/кик" || cmd === "/kick") {
    const target = __fcResolveTarget(msg);

    if (!target.ok) {
      await __fcSend(chatId, target.error);
      return true;
    }

    const reason = __fcReason(msg.text, 2);

    try {
      await bot.banChatMember(chatId, target.id);
      await bot.unbanChatMember(chatId, target.id, { only_if_banned: true });
      await __fcSend(chatId, "👢 " + target.label + " кикнут.\\nПричина: " + reason);
    } catch (e) {
      console.error("kick error:", e);
      await __fcSend(chatId, "❌ Не удалось кикнуть " + target.label + ". Проверь права бота.");
    }

    return true;
  }

  if (cmd === "/мут" || cmd === "/mute") {
    const target = __fcResolveTarget(msg);

    if (!target.ok) {
      await __fcSend(chatId, target.error);
      return true;
    }

    const mute = __fcMute(msg.text);
    const reason = __fcReason(msg.text, mute.reasonSkip);

    try {
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
          can_add_web_page_previews: false
        },
        until_date: mute.until
      });

      await __fcSend(chatId, "🔇 " + target.label + " получил мут на " + mute.text + ".\\nПричина: " + reason);
    } catch (e) {
      console.error("mute error:", e);
      await __fcSend(chatId, "❌ Не удалось выдать мут " + target.label + ". Проверь права бота.");
    }

    return true;
  }

  if (cmd === "/размут" || cmd === "/unmute") {
    const target = __fcResolveTarget(msg);

    if (!target.ok) {
      await __fcSend(chatId, target.error);
      return true;
    }

    try {
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
          can_add_web_page_previews: true
        }
      });

      await __fcSend(chatId, "🔊 " + target.label + " размучен.");
    } catch (e) {
      console.error("unmute error:", e);
      await __fcSend(chatId, "❌ Не удалось снять мут " + target.label + ". Проверь права бота.");
    }

    return true;
  }

  if (cmd === "/очистить" || cmd === "/clear") {
    await __fcSend(chatId, "🧹 Очистка будет работать через твой старый модуль, если он включён.");
    return true;
  }

  if (cmd === "/правила" || cmd === "/rules") {
    await __fcSend(chatId, __fcSections["help:rules"]);
    return true;
  }

  if (cmd === "/профиль" || cmd === "/profile" || cmd === "профиль") {
    await __fcSend(
      chatId,
      "👤 Профиль\\n\\n" +
      "ID: " + msg.from.id + "\\n" +
      "Username: " + (msg.from.username ? "@" + msg.from.username : "нет")
    );
    return true;
  }

  return false;
}

if (typeof bot !== "undefined" && !global.__FULL_BOT_CONTROL_FIX__) {
  global.__FULL_BOT_CONTROL_FIX__ = true;

  console.log("✅ FULL BOT CONTROL FIX ACTIVE");

  const __fcOriginalEmit = bot.emit.bind(bot);

  bot.emit = function(eventName, ...args) {
    try {
      if (eventName === "message") {
        const msg = args[0];

        if (msg && msg.from) __fcRememberUser(msg.from);
        if (msg && msg.reply_to_message && msg.reply_to_message.from) {
          __fcRememberUser(msg.reply_to_message.from);
        }

        const cmd = __fcCommand(msg && msg.text);

        const interceptCommands = [
          "/start", "/help", "/menu", "/commands",
          "/старт", "/помощь", "/меню", "/команды",
          "/разбанить", "/unban",
          "/бан", "/забанить", "/ban",
          "/кик", "/kick",
          "/мут", "/mute",
          "/размут", "/unmute",
          "/правила", "/rules",
          "/профиль", "/profile",
          "/очистить", "/clear",
          "помощь", "меню", "команды", "профиль"
        ];

        if (msg && interceptCommands.includes(cmd)) {
          __fcHandleMessage(msg).catch((e) => console.error("FULL CONTROL MESSAGE ERROR:", e));
          return true;
        }
      }

      if (eventName === "callback_query") {
        const query = args[0];

        if (query && query.data) {
          __fcHandleCallback(query).catch((e) => console.error("FULL CONTROL CALLBACK ERROR:", e));
          return true;
        }
      }
    } catch (e) {
      console.error("FULL CONTROL EMIT ERROR:", e);
    }

    return __fcOriginalEmit(eventName, ...args);
  };
}

/* ================= FULL BOT CONTROL FIX END ================= */

`;

code += patch;

fs.writeFileSync(file, code, "utf8");

console.log("✅ Полный фикс установлен.");
console.log("✅ Кнопки + команды RU/EN перехватываются до старых обработчиков.");
console.log("✅ При запуске должна быть строка: FULL BOT CONTROL FIX ACTIVE");
