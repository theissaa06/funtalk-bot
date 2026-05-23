require("dotenv").config();

const fs = require("fs");
const path = require("path");
const http = require("http");
const TelegramBot = require("node-telegram-bot-api");

const BOT_TOKEN = process.env.BOT_TOKEN;
const OWNER_ID = Number(process.env.OWNER_ID || 0);
const PORT = process.env.PORT || 3000;

if (!BOT_TOKEN) {
  console.error("❌ BOT_TOKEN не найден. Проверь .env или Variables на хостинге.");
  process.exit(1);
}

if (!OWNER_ID) {
  console.error("❌ OWNER_ID не найден. Проверь .env или Variables на хостинге.");
  process.exit(1);
}

http
  .createServer((req, res) => {
    res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Telegram bot is running");
  })
  .listen(PORT, () => {
    console.log(`🌐 Health server started on port ${PORT}`);
  });

const bot = new TelegramBot(BOT_TOKEN, {
  polling: {
    interval: 300,
    autoStart: true,
    params: {
      timeout: 10,
    },
  },
});

const SOURCE_NAME = "Клуб случайных людей";

const RELATIONSHIPS_FILE = path.join(__dirname, "relationships.json");
const SOCIAL_FILE = path.join(__dirname, "social.json");

const warns = new Map();

const couples = new Map();
const pendingCouples = new Map();

const socialUsers = new Map();
const pendingFriends = new Map();

const relationshipLevels = [
  { level: 1, name: "Симпатия", xp: 0 },
  { level: 2, name: "Флирт", xp: 500 },
  { level: 3, name: "Влюблённость", xp: 1200 },
  { level: 4, name: "Пара", xp: 2500 },
  { level: 5, name: "Сильная связь", xp: 5000 },
  { level: 6, name: "Любовь", xp: 9000 },
  { level: 7, name: "Родные души", xp: 14000 },
  { level: 8, name: "Легендарная пара", xp: 22000 },
];

function getCommand(text = "") {
  const firstWord = text.trim().split(/\s+/)[0] || "";
  return firstWord.toLowerCase().replace(/@[\w_]+$/i, "");
}

function isGroupChat(msg) {
  return msg.chat.type === "group" || msg.chat.type === "supergroup";
}

function escapeHtml(text = "") {
  return String(text)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function getUserName(user) {
  return (
    [user.first_name, user.last_name].filter(Boolean).join(" ") ||
    user.username ||
    "Пользователь"
  );
}

function formatUser(user) {
  const fullName = getUserName(user);
  const username = user.username ? `@${user.username}` : "без username";
  return `${escapeHtml(fullName)} (${escapeHtml(username)}, ID: <code>${user.id}</code>)`;
}

function getReason(msg, fallback = "Причина не указана") {
  const parts = String(msg.text || "").trim().split(/\s+/);
  parts.shift();
  const reason = parts.join(" ").trim();
  return escapeHtml(reason || fallback);
}

function getMuteData(msg) {
  const parts = String(msg.text || "").trim().split(/\s+/);
  parts.shift();

  const minutesRaw = Number(parts[0]);
  const minutes = Number.isFinite(minutesRaw) && minutesRaw > 0 ? minutesRaw : 10;

  let reasonParts = parts.slice(1);

  if (!Number.isFinite(minutesRaw)) {
    reasonParts = parts;
  }

  const reason = reasonParts.join(" ").trim() || "Причина не указана";

  return {
    minutes,
    reason: escapeHtml(reason),
  };
}

function readJsonFile(filePath, fallback) {
  try {
    if (!fs.existsSync(filePath)) return fallback;

    const raw = fs.readFileSync(filePath, "utf8");

    if (!raw.trim()) return fallback;

    return JSON.parse(raw);
  } catch (err) {
    console.error(`❌ Ошибка чтения ${path.basename(filePath)}:`, err.message);
    return fallback;
  }
}

function writeJsonFile(filePath, data) {
  try {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf8");
  } catch (err) {
    console.error(`❌ Ошибка сохранения ${path.basename(filePath)}:`, err.message);
  }
}

function loadRelationships() {
  const data = readJsonFile(RELATIONSHIPS_FILE, { couples: [] });

  if (Array.isArray(data.couples)) {
    couples.clear();

    for (const item of data.couples) {
      if (item.key && item.couple) {
        couples.set(item.key, item.couple);
      }
    }
  }

  console.log("✅ Система отношений загружена.");
}

function saveRelationships() {
  writeJsonFile(RELATIONSHIPS_FILE, {
    updatedAt: new Date().toISOString(),
    couples: [...couples.entries()].map(([key, couple]) => ({ key, couple })),
  });
}

function loadSocialData() {
  const data = readJsonFile(SOCIAL_FILE, { users: [] });

  if (Array.isArray(data.users)) {
    socialUsers.clear();

    for (const item of data.users) {
      if (item.key && item.user) {
        socialUsers.set(item.key, item.user);
      }
    }
  }

  console.log("✅ Социальная система загружена.");
}

function saveSocialData() {
  writeJsonFile(SOCIAL_FILE, {
    updatedAt: new Date().toISOString(),
    users: [...socialUsers.entries()].map(([key, user]) => ({ key, user })),
  });
}

function getWarnKey(chatId, userId) {
  return `${chatId}:${userId}`;
}

function getCoupleKey(chatId, userId1, userId2) {
  const ids = [Number(userId1), Number(userId2)].sort((a, b) => a - b);
  return `${chatId}:${ids[0]}:${ids[1]}`;
}

function findUserCouple(chatId, userId) {
  for (const [key, couple] of couples.entries()) {
    if (couple.chatId === chatId && couple.members.includes(userId)) {
      return { key, couple };
    }
  }

  return null;
}

function getRelationshipLevel(xp) {
  let current = relationshipLevels[0];

  for (const item of relationshipLevels) {
    if (xp >= item.xp) {
      current = item;
    }
  }

  const next = relationshipLevels.find((item) => item.xp > xp);

  return { current, next };
}

function getProgressBar(current, max) {
  const total = 10;

  if (!max || max <= 0) {
    return "💗".repeat(total);
  }

  const percent = Math.min(current / max, 1);
  const filled = Math.round(percent * total);
  const empty = total - filled;

  return "💗".repeat(filled) + "🤍".repeat(empty);
}

function daysBetween(date) {
  const started = new Date(date).getTime();
  const now = Date.now();

  if (!Number.isFinite(started)) return 1;

  return Math.max(1, Math.floor((now - started) / 86400000));
}

function getSocialKey(chatId, userId) {
  return `${chatId}:${userId}`;
}

function getSocialLevel(messages) {
  if (messages >= 10000) return 20;
  if (messages >= 7000) return 18;
  if (messages >= 5000) return 16;
  if (messages >= 3000) return 14;
  if (messages >= 2000) return 12;
  if (messages >= 1000) return 10;
  if (messages >= 700) return 8;
  if (messages >= 400) return 6;
  if (messages >= 200) return 4;
  if (messages >= 50) return 2;
  return 1;
}

function getActivityPercent(messages) {
  if (messages >= 1000) return 100;
  return Math.min(100, Math.round((messages / 1000) * 100));
}

function getSocialUser(chatId, telegramUser) {
  const key = getSocialKey(chatId, telegramUser.id);
  let user = socialUsers.get(key);

  if (!user) {
    user = {
      chatId,
      userId: telegramUser.id,
      name: getUserName(telegramUser),
      username: telegramUser.username || "",
      messages: 0,
      level: 1,
      xp: 0,
      coins: 0,
      reputation: 0,
      friends: [],
      createdAt: new Date().toISOString(),
      lastMessageAt: null,
    };

    socialUsers.set(key, user);
  } else {
    user.name = getUserName(telegramUser);
    user.username = telegramUser.username || "";

    if (!Array.isArray(user.friends)) user.friends = [];
    if (typeof user.messages !== "number") user.messages = 0;
    if (typeof user.xp !== "number") user.xp = 0;
    if (typeof user.coins !== "number") user.coins = 0;
    if (typeof user.reputation !== "number") user.reputation = 0;
    if (typeof user.level !== "number") user.level = getSocialLevel(user.messages);
  }

  return user;
}

function addMessageStats(msg) {
  if (!msg.text) return;
  if (msg.text.startsWith("/")) return;
  if (!isGroupChat(msg)) return;
  if (!msg.from || msg.from.is_bot) return;

  const user = getSocialUser(msg.chat.id, msg.from);

  user.messages += 1;
  user.xp += 5;
  user.coins += 1;
  user.level = getSocialLevel(user.messages);
  user.lastMessageAt = new Date().toISOString();

  saveSocialData();
}

function getFriendKey(chatId, fromId, targetId) {
  return `${chatId}:${fromId}:${targetId}`;
}

function areFriends(userA, userB) {
  return userA.friends.includes(userB.userId) && userB.friends.includes(userA.userId);
}

function getLoveMenuKeyboard() {
  return {
    inline_keyboard: [
      [
        { text: "🎁 Подарок", callback_data: "love:gift" },
        { text: "🍽 Свидание", callback_data: "love:date" },
      ],
      [
        { text: "🤗 Объятие", callback_data: "love:hug" },
        { text: "💋 Поцелуй", callback_data: "love:kiss" },
      ],
      [
        { text: "💍 Предложение", callback_data: "love:proposal" },
        { text: "📜 История", callback_data: "love:history" },
      ],
      [
        { text: "👥 Профиль пары", callback_data: "love:profile" },
        { text: "🏆 Рейтинг", callback_data: "love:top" },
      ],
    ],
  };
}

async function safeSend(chatId, text, options = {}) {
  try {
    return await bot.sendMessage(chatId, text, {
      parse_mode: "HTML",
      disable_web_page_preview: true,
      ...options,
    });
  } catch (err) {
    console.error("❌ Ошибка отправки сообщения:", err.message);
    return null;
  }
}

async function getMember(chatId, userId) {
  try {
    return await bot.getChatMember(chatId, userId);
  } catch (err) {
    console.error("❌ Не удалось получить участника:", err.message);
    return null;
  }
}

async function isOwner(userId) {
  return Number(userId) === OWNER_ID;
}

async function isAdmin(chatId, userId) {
  if (await isOwner(userId)) return true;

  const member = await getMember(chatId, userId);

  if (!member) return false;

  return member.status === "creator" || member.status === "administrator";
}

async function checkGroupAndAdmin(msg) {
  const chatId = msg.chat.id;
  const userId = msg.from.id;

  if (!isGroupChat(msg)) {
    await safeSend(chatId, "⚠️ Эта команда работает только в группе.", {
      reply_to_message_id: msg.message_id,
    });
    return false;
  }

  const allowed = await isAdmin(chatId, userId);

  if (!allowed) {
    await safeSend(chatId, "⛔ У тебя нет прав для этой команды.", {
      reply_to_message_id: msg.message_id,
    });
    return false;
  }

  return true;
}

async function getTargetFromReply(msg) {
  const target = msg.reply_to_message?.from;

  if (!target) {
    await safeSend(
      msg.chat.id,
      [
        "⚠️ Используй команду ответом на сообщение пользователя.",
        "",
        "Примеры:",
        "<code>/profile</code>",
        "<code>/friend</code>",
        "<code>/couple</code>",
        "<code>/ban спам</code>",
        "<code>/kick нарушение</code>",
        "<code>/mute 10 флуд</code>",
        "<code>/warn причина</code>",
      ].join("\n"),
      { reply_to_message_id: msg.message_id }
    );

    return null;
  }

  return target;
}

async function protectTarget(msg, target) {
  const chatId = msg.chat.id;

  if (target.is_bot) {
    await safeSend(chatId, "⚠️ Нельзя применять это действие к боту.", {
      reply_to_message_id: msg.message_id,
    });
    return false;
  }

  if (Number(target.id) === OWNER_ID) {
    await safeSend(chatId, "⛔ Нельзя применить действие к владельцу бота.", {
      reply_to_message_id: msg.message_id,
    });
    return false;
  }

  const targetMember = await getMember(chatId, target.id);

  if (
    targetMember &&
    (targetMember.status === "creator" || targetMember.status === "administrator")
  ) {
    await safeSend(chatId, "⛔ Нельзя применить действие к администратору.", {
      reply_to_message_id: msg.message_id,
    });
    return false;
  }

  return true;
}

async function handleStart(msg) {
  await safeSend(
    msg.chat.id,
    [
      "👋 Бот запущен.",
      "",
      `✨ Статус: бот для беседы «${SOURCE_NAME}»`,
      "",
      "Напиши /help, чтобы увидеть команды.",
    ].join("\n"),
    { reply_to_message_id: msg.message_id }
  );
}

async function handlePing(msg) {
  await safeSend(msg.chat.id, "✅ Бот работает и отвечает на команды.", {
    reply_to_message_id: msg.message_id,
  });
}

async function handleId(msg) {
  await safeSend(
    msg.chat.id,
    [
      `🆔 Твой ID: <code>${msg.from.id}</code>`,
      `💬 ID чата: <code>${msg.chat.id}</code>`,
      `🏷 Источник: ${SOURCE_NAME}`,
    ].join("\n"),
    { reply_to_message_id: msg.message_id }
  );
}

async function handleHelp(msg) {
  const text = `
<b>📌 Команды бота</b>

<b>Проверка:</b>
/start — запуск
/ping — проверить, отвечает ли бот
/id — узнать свой ID и ID чата
/help — список команд
/commands — список команд

<b>Профиль и активность:</b>
/profile — мой профиль
/profile ответом — профиль пользователя
/top — топ по сообщениям
/reptop — топ репутации
/rep — дать репутацию ответом
/friend — предложить дружбу ответом
/friends — список друзей
/unfriend — удалить друга ответом

<b>Отношения:</b>
/love — открыть систему отношений
/couple — создать пару ответом на сообщение
/breakup — разорвать отношения
/lovetop — рейтинг пар

<b>Модерация:</b>
/ban причина — забанить пользователя
/kick причина — кикнуть пользователя
/unban ID — разбанить по ID
/mute 10 причина — замутить на 10 минут
/unmute — снять мут
/warn причина — выдать предупреждение
/warns — посмотреть предупреждения
/clearwarns — очистить предупреждения

<b>Как использовать:</b>
Команды /profile, /friend, /couple, /ban, /kick, /mute, /unmute, /warn, /clearwarns лучше писать ответом на сообщение пользователя.

<b>Источник:</b> ${SOURCE_NAME}
`.trim();

  await safeSend(msg.chat.id, text, {
    reply_to_message_id: msg.message_id,
  });
}

async function handleProfile(msg) {
  const target = msg.reply_to_message?.from || msg.from;

  if (target.is_bot) {
    await safeSend(msg.chat.id, "⚠️ У ботов нет профиля.", {
      reply_to_message_id: msg.message_id,
    });
    return;
  }

  const user = getSocialUser(msg.chat.id, target);
  const coupleFound = findUserCouple(msg.chat.id, target.id);
  const activity = getActivityPercent(user.messages);

  const text = `
👤 <b>Профиль участника</b>

👥 <b>Имя:</b> ${escapeHtml(user.name)}
${user.username ? `🔗 <b>Username:</b> @${escapeHtml(user.username)}` : "🔗 <b>Username:</b> нет"}
🆔 <b>ID:</b> <code>${user.userId}</code>

💬 <b>Сообщений:</b> ${user.messages}
⭐ <b>Уровень:</b> ${user.level}
✨ <b>XP:</b> ${user.xp}
🔥 <b>Активность:</b> ${activity}%
💰 <b>Монеты:</b> ${user.coins}
🏆 <b>Репутация:</b> ${user.reputation}
👥 <b>Друзей:</b> ${user.friends.length}
💞 <b>Пара:</b> ${coupleFound ? "есть" : "нет"}

📅 <b>В клубе с:</b> ${new Date(user.createdAt).toLocaleDateString("ru-RU")}
  `.trim();

  await safeSend(msg.chat.id, text, {
    reply_to_message_id: msg.message_id,
  });

  saveSocialData();
}

async function handleTop(msg) {
  const list = [...socialUsers.values()]
    .filter((user) => user.chatId === msg.chat.id)
    .sort((a, b) => b.messages - a.messages)
    .slice(0, 10);

  if (!list.length) {
    await safeSend(msg.chat.id, "📊 Топ пока пустой. Напишите сообщения в группе.");
    return;
  }

  const text = list
    .map((user, index) => {
      return `${index + 1}. ${escapeHtml(user.name)} — 💬 ${user.messages} сообщений · ⭐ ${user.level} ур.`;
    })
    .join("\n");

  await safeSend(
    msg.chat.id,
    `
🏆 <b>Топ по сообщениям</b>

${text}
    `.trim()
  );
}

async function handleRepTop(msg) {
  const list = [...socialUsers.values()]
    .filter((user) => user.chatId === msg.chat.id)
    .sort((a, b) => b.reputation - a.reputation)
    .slice(0, 10);

  if (!list.length) {
    await safeSend(msg.chat.id, "🏆 Топ репутации пока пустой.");
    return;
  }

  const text = list
    .map((user, index) => {
      return `${index + 1}. ${escapeHtml(user.name)} — 🏆 ${user.reputation} репутации`;
    })
    .join("\n");

  await safeSend(
    msg.chat.id,
    `
🏆 <b>Топ репутации</b>

${text}
    `.trim()
  );
}

async function handleRep(msg) {
  if (!isGroupChat(msg)) {
    await safeSend(msg.chat.id, "⚠️ Репутацию можно выдавать только в группе.", {
      reply_to_message_id: msg.message_id,
    });
    return;
  }

  const target = msg.reply_to_message?.from;

  if (!target) {
    await safeSend(msg.chat.id, "🏆 Ответь на сообщение пользователя командой:\n\n<code>/rep</code>", {
      reply_to_message_id: msg.message_id,
    });
    return;
  }

  if (target.is_bot || target.id === msg.from.id) {
    await safeSend(msg.chat.id, "⚠️ Нельзя выдать репутацию себе или боту.", {
      reply_to_message_id: msg.message_id,
    });
    return;
  }

  const targetUser = getSocialUser(msg.chat.id, target);

  targetUser.reputation += 1;
  targetUser.xp += 25;

  saveSocialData();

  await safeSend(
    msg.chat.id,
    `
🏆 <b>Репутация повышена</b>

👤 ${formatUser(target)}
✨ +1 репутация
⭐ +25 XP
    `.trim(),
    { reply_to_message_id: msg.message_id }
  );
}

async function handleFriend(msg) {
  if (!isGroupChat(msg)) {
    await safeSend(msg.chat.id, "⚠️ Дружбу можно предложить только в группе.", {
      reply_to_message_id: msg.message_id,
    });
    return;
  }

  const target = msg.reply_to_message?.from;

  if (!target) {
    await safeSend(msg.chat.id, "👥 Ответь на сообщение пользователя командой:\n\n<code>/friend</code>", {
      reply_to_message_id: msg.message_id,
    });
    return;
  }

  if (target.is_bot) {
    await safeSend(msg.chat.id, "⚠️ Нельзя дружить с ботом.", {
      reply_to_message_id: msg.message_id,
    });
    return;
  }

  if (target.id === msg.from.id) {
    await safeSend(msg.chat.id, "😅 Нельзя предложить дружбу самому себе.", {
      reply_to_message_id: msg.message_id,
    });
    return;
  }

  const fromUser = getSocialUser(msg.chat.id, msg.from);
  const targetUser = getSocialUser(msg.chat.id, target);

  if (areFriends(fromUser, targetUser)) {
    await safeSend(msg.chat.id, "👥 Вы уже друзья.", {
      reply_to_message_id: msg.message_id,
    });
    return;
  }

  const requestKey = getFriendKey(msg.chat.id, msg.from.id, target.id);

  pendingFriends.set(requestKey, {
    chatId: msg.chat.id,
    from: msg.from,
    target,
    createdAt: Date.now(),
  });

  await safeSend(
    msg.chat.id,
    `
👥 <b>Предложение дружбы</b>

👤 ${formatUser(msg.from)}
хочет добавить в друзья
👤 ${formatUser(target)}

${escapeHtml(getUserName(target))}, принять дружбу?
    `.trim(),
    {
      reply_to_message_id: msg.message_id,
      reply_markup: {
        inline_keyboard: [
          [
            { text: "✅ Принять", callback_data: `friend:accept:${msg.from.id}:${target.id}` },
            { text: "❌ Отклонить", callback_data: `friend:decline:${msg.from.id}:${target.id}` },
          ],
        ],
      },
    }
  );
}

async function handleFriends(msg) {
  const user = getSocialUser(msg.chat.id, msg.from);

  if (!user.friends.length) {
    await safeSend(msg.chat.id, "👥 У тебя пока нет друзей. Добавь друга командой /friend ответом на сообщение.", {
      reply_to_message_id: msg.message_id,
    });
    return;
  }

  const friends = user.friends
    .map((friendId, index) => {
      const friend = socialUsers.get(getSocialKey(msg.chat.id, friendId));
      return `${index + 1}. ${friend ? escapeHtml(friend.name) : `ID ${friendId}`}`;
    })
    .join("\n");

  await safeSend(
    msg.chat.id,
    `
👥 <b>Твои друзья</b>

${friends}
    `.trim(),
    { reply_to_message_id: msg.message_id }
  );
}

async function handleUnfriend(msg) {
  const target = msg.reply_to_message?.from;

  if (!target) {
    await safeSend(msg.chat.id, "👥 Ответь на сообщение друга командой:\n\n<code>/unfriend</code>", {
      reply_to_message_id: msg.message_id,
    });
    return;
  }

  const user = getSocialUser(msg.chat.id, msg.from);
  const targetUser = getSocialUser(msg.chat.id, target);

  if (!areFriends(user, targetUser)) {
    await safeSend(msg.chat.id, "⚠️ Вы не друзья.", {
      reply_to_message_id: msg.message_id,
    });
    return;
  }

  user.friends = user.friends.filter((id) => id !== target.id);
  targetUser.friends = targetUser.friends.filter((id) => id !== msg.from.id);

  saveSocialData();

  await safeSend(
    msg.chat.id,
    `
💔 <b>Дружба удалена</b>

${escapeHtml(user.name)} и ${escapeHtml(targetUser.name)} больше не друзья.
    `.trim(),
    { reply_to_message_id: msg.message_id }
  );
}

async function handleLove(msg) {
  await showLoveProfile(msg.chat.id, msg.from.id);
}

async function showLoveProfile(chatId, userId, messageId = null) {
  const found = findUserCouple(chatId, userId);

  if (!found) {
    const text = `
💞 <b>Система отношений</b>

У тебя пока нет пары.

Чтобы создать пару, ответь на сообщение пользователя командой:

<code>/couple</code>

После этого пользователь должен принять приглашение кнопкой.
    `.trim();

    return safeSend(chatId, text);
  }

  const { couple } = found;
  const levelData = getRelationshipLevel(couple.xp);
  const currentLevel = levelData.current;
  const nextLevel = levelData.next;
  const days = daysBetween(couple.startedAt);

  const progressNow = nextLevel ? couple.xp - currentLevel.xp : couple.xp;
  const progressMax = nextLevel ? nextLevel.xp - currentLevel.xp : couple.xp;
  const bar = getProgressBar(progressNow, progressMax);

  const text = `
💞 <b>Система отношений</b>

👤 <b>${escapeHtml(couple.user1.name)}</b>
💗
👤 <b>${escapeHtml(couple.user2.name)}</b>

❤️ <b>Статус:</b> В отношениях
🔥 <b>Дней вместе:</b> ${days}
💎 <b>Уровень:</b> ${escapeHtml(currentLevel.name)} · ${currentLevel.level} LVL
✨ <b>Очки любви:</b> ${couple.xp}
🪙 <b>Монеты любви:</b> ${couple.coins}

📈 <b>Прогресс:</b>
${bar}
${nextLevel ? `${progressNow} / ${progressMax} XP до уровня «${escapeHtml(nextLevel.name)}»` : "Максимальный уровень"}

📅 <b>Вместе с:</b> ${new Date(couple.startedAt).toLocaleDateString("ru-RU")}

💌 <b>Что хотите сделать?</b>
  `.trim();

  if (messageId) {
    try {
      await bot.editMessageText(text, {
        chat_id: chatId,
        message_id: messageId,
        parse_mode: "HTML",
        reply_markup: getLoveMenuKeyboard(),
      });
      return;
    } catch {
      return safeSend(chatId, text, {
        reply_markup: getLoveMenuKeyboard(),
      });
    }
  }

  return safeSend(chatId, text, {
    reply_markup: getLoveMenuKeyboard(),
  });
}

async function handleCouple(msg) {
  if (!isGroupChat(msg)) {
    await safeSend(msg.chat.id, "⚠️ Создать пару можно только в группе.", {
      reply_to_message_id: msg.message_id,
    });
    return;
  }

  const target = msg.reply_to_message?.from;

  if (!target) {
    await safeSend(
      msg.chat.id,
      "💞 Чтобы создать пару, ответь на сообщение человека командой:\n\n<code>/couple</code>",
      { reply_to_message_id: msg.message_id }
    );
    return;
  }

  if (target.is_bot) {
    await safeSend(msg.chat.id, "⚠️ Нельзя создать отношения с ботом.", {
      reply_to_message_id: msg.message_id,
    });
    return;
  }

  if (target.id === msg.from.id) {
    await safeSend(msg.chat.id, "😅 Нельзя создать пару с самим собой.", {
      reply_to_message_id: msg.message_id,
    });
    return;
  }

  const existing1 = findUserCouple(msg.chat.id, msg.from.id);
  const existing2 = findUserCouple(msg.chat.id, target.id);

  if (existing1 || existing2) {
    await safeSend(msg.chat.id, "⚠️ Один из пользователей уже состоит в отношениях.", {
      reply_to_message_id: msg.message_id,
    });
    return;
  }

  const requestKey = `${msg.chat.id}:${msg.from.id}:${target.id}`;

  pendingCouples.set(requestKey, {
    chatId: msg.chat.id,
    from: msg.from,
    target,
    createdAt: Date.now(),
  });

  await safeSend(
    msg.chat.id,
    `
💌 <b>Предложение отношений</b>

👤 ${formatUser(msg.from)}
хочет создать пару с
👤 ${formatUser(target)}

${escapeHtml(getUserName(target))}, принять предложение?
    `.trim(),
    {
      reply_to_message_id: msg.message_id,
      reply_markup: {
        inline_keyboard: [
          [
            { text: "💗 Принять", callback_data: `couple:accept:${msg.from.id}:${target.id}` },
            { text: "💔 Отказаться", callback_data: `couple:decline:${msg.from.id}:${target.id}` },
          ],
        ],
      },
    }
  );
}

async function handleBreakup(msg) {
  const found = findUserCouple(msg.chat.id, msg.from.id);

  if (!found) {
    await safeSend(msg.chat.id, "⚠️ У тебя сейчас нет пары.", {
      reply_to_message_id: msg.message_id,
    });
    return;
  }

  couples.delete(found.key);
  saveRelationships();

  await safeSend(
    msg.chat.id,
    `
💔 <b>Отношения завершены</b>

Пара была расформирована.
История любви закончилась, но воспоминания остались...
    `.trim(),
    { reply_to_message_id: msg.message_id }
  );
}

async function handleLoveTop(msg) {
  const list = [...couples.values()]
    .filter((couple) => couple.chatId === msg.chat.id)
    .sort((a, b) => b.xp - a.xp)
    .slice(0, 10);

  if (!list.length) {
    await safeSend(msg.chat.id, "🏆 Рейтинга пока нет. Создайте первую пару через /couple.");
    return;
  }

  const text = list
    .map((couple, index) => {
      const level = getRelationshipLevel(couple.xp).current;
      return `${index + 1}. 💞 ${escapeHtml(couple.user1.name)} + ${escapeHtml(couple.user2.name)} — ${couple.xp} XP · ${escapeHtml(level.name)}`;
    })
    .join("\n");

  await safeSend(
    msg.chat.id,
    `
🏆 <b>Рейтинг пар</b>

${text}
    `.trim()
  );
}

async function handleBan(msg) {
  if (!(await checkGroupAndAdmin(msg))) return;

  const target = await getTargetFromReply(msg);
  if (!target) return;

  if (!(await protectTarget(msg, target))) return;

  const reason = getReason(msg);

  try {
    await bot.banChatMember(msg.chat.id, target.id);

    await safeSend(
      msg.chat.id,
      `
🚫 <b>Пользователь забанен</b>

👤 ${formatUser(target)}
👮 Модератор: ${formatUser(msg.from)}
📌 Причина: ${reason}
🏷 Источник: ${SOURCE_NAME}
      `.trim()
    );
  } catch (err) {
    await safeSend(
      msg.chat.id,
      `
❌ Не удалось забанить пользователя.

Проверь:
1. Бот админ
2. У бота есть право блокировать пользователей
3. Цель не является администратором

Ошибка: <code>${escapeHtml(err.message)}</code>
      `.trim(),
      { reply_to_message_id: msg.message_id }
    );
  }
}

async function handleKick(msg) {
  if (!(await checkGroupAndAdmin(msg))) return;

  const target = await getTargetFromReply(msg);
  if (!target) return;

  if (!(await protectTarget(msg, target))) return;

  const reason = getReason(msg);

  try {
    await bot.banChatMember(msg.chat.id, target.id);
    await bot.unbanChatMember(msg.chat.id, target.id, { only_if_banned: true });

    await safeSend(
      msg.chat.id,
      `
👢 <b>Пользователь кикнут</b>

👤 ${formatUser(target)}
👮 Модератор: ${formatUser(msg.from)}
📌 Причина: ${reason}
🏷 Источник: ${SOURCE_NAME}
      `.trim()
    );
  } catch (err) {
    await safeSend(
      msg.chat.id,
      `
❌ Не удалось кикнуть пользователя.

Ошибка: <code>${escapeHtml(err.message)}</code>
      `.trim(),
      { reply_to_message_id: msg.message_id }
    );
  }
}

async function handleUnban(msg) {
  if (!(await checkGroupAndAdmin(msg))) return;

  const parts = String(msg.text || "").trim().split(/\s+/);
  const userId = Number(parts[1]);

  if (!userId) {
    await safeSend(
      msg.chat.id,
      "⚠️ Укажи ID пользователя.\n\nПример:\n<code>/unban 123456789</code>",
      { reply_to_message_id: msg.message_id }
    );
    return;
  }

  try {
    await bot.unbanChatMember(msg.chat.id, userId, { only_if_banned: true });

    await safeSend(
      msg.chat.id,
      `✅ Пользователь с ID <code>${userId}</code> разбанен.\n🏷 Источник: ${SOURCE_NAME}`,
      { reply_to_message_id: msg.message_id }
    );
  } catch (err) {
    await safeSend(
      msg.chat.id,
      `❌ Не удалось разбанить.\nОшибка: <code>${escapeHtml(err.message)}</code>`,
      { reply_to_message_id: msg.message_id }
    );
  }
}

async function handleMute(msg) {
  if (!(await checkGroupAndAdmin(msg))) return;

  const target = await getTargetFromReply(msg);
  if (!target) return;

  if (!(await protectTarget(msg, target))) return;

  const { minutes, reason } = getMuteData(msg);
  const untilDate = Math.floor(Date.now() / 1000) + minutes * 60;

  try {
    await bot.restrictChatMember(msg.chat.id, target.id, {
      until_date: untilDate,
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
    });

    await safeSend(
      msg.chat.id,
      `
🔇 <b>Пользователь замучен</b>

👤 ${formatUser(target)}
⏱ Время: ${minutes} мин.
👮 Модератор: ${formatUser(msg.from)}
📌 Причина: ${reason}
🏷 Источник: ${SOURCE_NAME}
      `.trim()
    );
  } catch (err) {
    await safeSend(
      msg.chat.id,
      `❌ Не удалось замутить.\nОшибка: <code>${escapeHtml(err.message)}</code>`,
      { reply_to_message_id: msg.message_id }
    );
  }
}

async function handleUnmute(msg) {
  if (!(await checkGroupAndAdmin(msg))) return;

  const target = await getTargetFromReply(msg);
  if (!target) return;

  if (!(await protectTarget(msg, target))) return;

  try {
    await bot.restrictChatMember(msg.chat.id, target.id, {
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
        can_invite_users: true,
      },
    });

    await safeSend(
      msg.chat.id,
      `
🔊 <b>Мут снят</b>

👤 ${formatUser(target)}
🏷 Источник: ${SOURCE_NAME}
      `.trim(),
      { reply_to_message_id: msg.message_id }
    );
  } catch (err) {
    await safeSend(
      msg.chat.id,
      `❌ Не удалось снять мут.\nОшибка: <code>${escapeHtml(err.message)}</code>`,
      { reply_to_message_id: msg.message_id }
    );
  }
}

async function handleWarn(msg) {
  if (!(await checkGroupAndAdmin(msg))) return;

  const target = await getTargetFromReply(msg);
  if (!target) return;

  if (!(await protectTarget(msg, target))) return;

  const reason = getReason(msg);
  const key = getWarnKey(msg.chat.id, target.id);
  const nextWarns = (warns.get(key) || 0) + 1;

  warns.set(key, nextWarns);

  await safeSend(
    msg.chat.id,
    `
⚠️ <b>Предупреждение выдано</b>

👤 ${formatUser(target)}
👮 Модератор: ${formatUser(msg.from)}
📌 Причина: ${reason}
📊 Предупреждений: ${nextWarns}/3
🏷 Источник: ${SOURCE_NAME}
    `.trim()
  );

  if (nextWarns >= 3) {
    try {
      await bot.banChatMember(msg.chat.id, target.id);
      warns.delete(key);

      await safeSend(
        msg.chat.id,
        `
🚫 <b>Автобан</b>

Пользователь ${formatUser(target)} забанен за 3 предупреждения.
        `.trim()
      );
    } catch (err) {
      await safeSend(
        msg.chat.id,
        `❌ Не удалось выполнить автобан.\nОшибка: <code>${escapeHtml(err.message)}</code>`
      );
    }
  }
}

async function handleWarns(msg) {
  const target = msg.reply_to_message?.from || msg.from;
  const key = getWarnKey(msg.chat.id, target.id);
  const count = warns.get(key) || 0;

  await safeSend(
    msg.chat.id,
    `
📊 <b>Предупреждения</b>

👤 ${formatUser(target)}
⚠️ Количество: ${count}/3
🏷 Источник: ${SOURCE_NAME}
    `.trim(),
    { reply_to_message_id: msg.message_id }
  );
}

async function handleClearWarns(msg) {
  if (!(await checkGroupAndAdmin(msg))) return;

  const target = await getTargetFromReply(msg);
  if (!target) return;

  const key = getWarnKey(msg.chat.id, target.id);
  warns.delete(key);

  await safeSend(
    msg.chat.id,
    `
✅ <b>Предупреждения очищены</b>

👤 ${formatUser(target)}
🏷 Источник: ${SOURCE_NAME}
    `.trim(),
    { reply_to_message_id: msg.message_id }
  );
}

bot.on("message", async (msg) => {
  try {
    if (!msg.text) return;

    addMessageStats(msg);

    const command = getCommand(msg.text);

    if (!command.startsWith("/")) return;

    const handlers = {
      "/start": handleStart,
      "/ping": handlePing,
      "/id": handleId,
      "/help": handleHelp,
      "/commands": handleHelp,

      "/profile": handleProfile,
      "/top": handleTop,
      "/reptop": handleRepTop,
      "/rep": handleRep,
      "/friend": handleFriend,
      "/friends": handleFriends,
      "/unfriend": handleUnfriend,

      "/love": handleLove,
      "/couple": handleCouple,
      "/breakup": handleBreakup,
      "/lovetop": handleLoveTop,

      "/ban": handleBan,
      "/kick": handleKick,
      "/unban": handleUnban,
      "/mute": handleMute,
      "/unmute": handleUnmute,
      "/warn": handleWarn,
      "/warns": handleWarns,
      "/clearwarns": handleClearWarns,
    };

    const handler = handlers[command];

    if (!handler) {
      await safeSend(msg.chat.id, "❓ Неизвестная команда. Напиши /help", {
        reply_to_message_id: msg.message_id,
      });
      return;
    }

    await handler(msg);
  } catch (err) {
    console.error("❌ Главная ошибка обработки сообщения:", err);

    await safeSend(
      msg.chat.id,
      `❌ Ошибка в команде.\n\n<code>${escapeHtml(err.message)}</code>`,
      { reply_to_message_id: msg.message_id }
    );
  }
});

bot.on("callback_query", async (query) => {
  try {
    const data = query.data || "";
    const msg = query.message;

    if (!msg) return;

    const chatId = msg.chat.id;
    const userId = query.from.id;

    if (data.startsWith("friend:accept:")) {
      const parts = data.split(":");
      const fromId = Number(parts[2]);
      const targetId = Number(parts[3]);

      if (userId !== targetId) {
        await bot.answerCallbackQuery(query.id, {
          text: "Это предложение дружбы не для тебя.",
          show_alert: true,
        });
        return;
      }

      const requestKey = getFriendKey(chatId, fromId, targetId);
      const request = pendingFriends.get(requestKey);

      if (!request) {
        await bot.answerCallbackQuery(query.id, {
          text: "Предложение уже недействительно.",
          show_alert: true,
        });
        return;
      }

      const fromUser = getSocialUser(chatId, request.from);
      const targetUser = getSocialUser(chatId, request.target);

      if (!fromUser.friends.includes(targetId)) fromUser.friends.push(targetId);
      if (!targetUser.friends.includes(fromId)) targetUser.friends.push(fromId);

      fromUser.xp += 100;
      targetUser.xp += 100;
      fromUser.coins += 25;
      targetUser.coins += 25;

      pendingFriends.delete(requestKey);
      saveSocialData();

      await bot.answerCallbackQuery(query.id, {
        text: "Вы теперь друзья 👥",
      });

      await safeSend(
        chatId,
        `
👥 <b>Новая дружба!</b>

${escapeHtml(fromUser.name)} и ${escapeHtml(targetUser.name)} теперь друзья.

✨ +100 XP каждому
💰 +25 монет каждому
        `.trim()
      );

      return;
    }

    if (data.startsWith("friend:decline:")) {
      const parts = data.split(":");
      const fromId = Number(parts[2]);
      const targetId = Number(parts[3]);

      if (userId !== targetId) {
        await bot.answerCallbackQuery(query.id, {
          text: "Это предложение дружбы не для тебя.",
          show_alert: true,
        });
        return;
      }

      const requestKey = getFriendKey(chatId, fromId, targetId);
      pendingFriends.delete(requestKey);

      await bot.answerCallbackQuery(query.id, {
        text: "Предложение дружбы отклонено.",
      });

      await safeSend(chatId, "👥 Предложение дружбы было отклонено.");
      return;
    }

    if (data.startsWith("couple:accept:")) {
      const parts = data.split(":");
      const fromId = Number(parts[2]);
      const targetId = Number(parts[3]);

      if (userId !== targetId) {
        await bot.answerCallbackQuery(query.id, {
          text: "Это предложение не для тебя.",
          show_alert: true,
        });
        return;
      }

      const requestKey = `${chatId}:${fromId}:${targetId}`;
      const request = pendingCouples.get(requestKey);

      if (!request) {
        await bot.answerCallbackQuery(query.id, {
          text: "Предложение уже недействительно.",
          show_alert: true,
        });
        return;
      }

      if (findUserCouple(chatId, fromId) || findUserCouple(chatId, targetId)) {
        pendingCouples.delete(requestKey);

        await bot.answerCallbackQuery(query.id, {
          text: "Один из пользователей уже состоит в отношениях.",
          show_alert: true,
        });
        return;
      }

      const coupleKey = getCoupleKey(chatId, fromId, targetId);

      couples.set(coupleKey, {
        chatId,
        members: [fromId, targetId],
        user1: {
          id: request.from.id,
          name: getUserName(request.from),
          username: request.from.username || "",
        },
        user2: {
          id: request.target.id,
          name: getUserName(request.target),
          username: request.target.username || "",
        },
        xp: 1000,
        coins: 100,
        startedAt: new Date().toISOString(),
        history: [
          {
            title: "Начало отношений",
            text: "Пара официально создана.",
            xp: 1000,
            date: new Date().toISOString(),
          },
        ],
      });

      pendingCouples.delete(requestKey);
      saveRelationships();

      await bot.answerCallbackQuery(query.id, {
        text: "Вы теперь пара 💗",
      });

      await safeSend(
        chatId,
        `
💞 <b>Новая пара!</b>

👤 ${formatUser(request.from)}
💗
👤 ${formatUser(request.target)}

✨ Отношения начались!
+1000 XP любви
        `.trim()
      );

      return;
    }

    if (data.startsWith("couple:decline:")) {
      const parts = data.split(":");
      const fromId = Number(parts[2]);
      const targetId = Number(parts[3]);

      if (userId !== targetId) {
        await bot.answerCallbackQuery(query.id, {
          text: "Это предложение не для тебя.",
          show_alert: true,
        });
        return;
      }

      const requestKey = `${chatId}:${fromId}:${targetId}`;
      pendingCouples.delete(requestKey);

      await bot.answerCallbackQuery(query.id, {
        text: "Предложение отклонено.",
      });

      await safeSend(chatId, "💔 Предложение отношений было отклонено.");
      return;
    }

    if (data.startsWith("love:")) {
      const found = findUserCouple(chatId, userId);

      if (!found) {
        await bot.answerCallbackQuery(query.id, {
          text: "У тебя пока нет пары.",
          show_alert: true,
        });
        return;
      }

      const { couple } = found;
      const action = data.split(":")[1];

      const actions = {
        gift: { title: "🎁 Подарок", text: "подарил(а) подарок своей паре", xp: 150, coins: -10 },
        date: { title: "🍽 Свидание", text: "устроил(а) романтическое свидание", xp: 300, coins: -25 },
        hug: { title: "🤗 Объятие", text: "обнял(а) свою пару", xp: 80, coins: 0 },
        kiss: { title: "💋 Поцелуй", text: "подарил(а) нежный поцелуй", xp: 120, coins: 0 },
        proposal: { title: "💍 Предложение", text: "сделал(а) важный шаг в отношениях", xp: 500, coins: -50 },
      };

      if (action === "profile") {
        await bot.answerCallbackQuery(query.id);
        await showLoveProfile(chatId, userId, msg.message_id);
        return;
      }

      if (action === "top") {
        await bot.answerCallbackQuery(query.id);
        await handleLoveTop({
          chat: { id: chatId },
          from: query.from,
          message_id: msg.message_id,
        });
        return;
      }

      if (action === "history") {
        const history = couple.history
          .slice(-7)
          .reverse()
          .map((item, index) => {
            const date = new Date(item.date).toLocaleDateString("ru-RU");
            return `${index + 1}. ${escapeHtml(item.title)} — +${item.xp} XP\n📅 ${date}`;
          })
          .join("\n\n");

        await bot.answerCallbackQuery(query.id);

        await safeSend(
          chatId,
          `
📜 <b>История отношений</b>

${history || "История пока пустая."}
          `.trim()
        );

        return;
      }

      const selected = actions[action];

      if (!selected) {
        await bot.answerCallbackQuery(query.id);
        return;
      }

      if (selected.coins < 0 && couple.coins < Math.abs(selected.coins)) {
        await bot.answerCallbackQuery(query.id, {
          text: "Недостаточно монет любви.",
          show_alert: true,
        });
        return;
      }

      couple.xp += selected.xp;
      couple.coins += selected.coins;

      couple.history.push({
        title: selected.title,
        text: selected.text,
        xp: selected.xp,
        date: new Date().toISOString(),
      });

      saveRelationships();

      await bot.answerCallbackQuery(query.id, {
        text: `+${selected.xp} XP любви`,
      });

      await safeSend(
        chatId,
        `
${selected.title} <b>Действие выполнено</b>

👤 ${escapeHtml(getUserName(query.from))} ${selected.text}.

✨ +${selected.xp} XP любви
${selected.coins < 0 ? `🪙 ${selected.coins} монет` : ""}
        `.trim()
      );

      return;
    }
  } catch (err) {
    console.error("❌ Callback error:", err);

    try {
      await bot.answerCallbackQuery(query.id, {
        text: "Произошла ошибка.",
        show_alert: true,
      });
    } catch {}
  }
});

bot.on("polling_error", (err) => {
  console.error("❌ Polling error:", err.message);

  if (String(err.message).includes("401")) {
    console.error("❌ BOT_TOKEN неправильный или отозван. Останавливаю процесс.");
    process.exit(1);
  }
});

process.on("unhandledRejection", (reason) => {
  console.error("❌ Unhandled Rejection:", reason);
});

process.on("uncaughtException", (err) => {
  console.error("❌ Uncaught Exception:", err);
});

loadRelationships();
loadSocialData();

console.log(`✅ Бот запущен. Источник: ${SOURCE_NAME}`);