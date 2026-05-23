require("dotenv").config();

const fs = require("fs");
const path = require("path");
const TelegramBot = require("node-telegram-bot-api");
const http = require("http");

const PORT = process.env.PORT || 3000;

http
  .createServer((req, res) => {
    res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Telegram bot is running");
  })
  .listen(PORT, () => {
    console.log(`🌐 Health server started on port ${PORT}`);
  });

const BOT_TOKEN = process.env.BOT_TOKEN;
const OWNER_ID = Number(process.env.OWNER_ID || 0);

if (!BOT_TOKEN) {
  console.error("❌ BOT_TOKEN не найден. Проверь файл .env или Environment Variables на Render.");
  process.exit(1);
}

if (!OWNER_ID) {
  console.error("❌ OWNER_ID не найден. Проверь файл .env или Environment Variables на Render.");
  process.exit(1);
}

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

const warns = new Map();

const DATA_FILE = path.join(__dirname, "relationships.json");

const couples = new Map();
const pendingCouples = new Map();

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

function getWarnKey(chatId, userId) {
  return `${chatId}:${userId}`;
}

function escapeHtml(text = "") {
  return String(text)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function formatUser(user) {
  const fullName = [user.first_name, user.last_name].filter(Boolean).join(" ");
  const username = user.username ? `@${user.username}` : "без username";

  return `${escapeHtml(fullName || "Пользователь")} (${escapeHtml(username)}, ID: <code>${user.id}</code>)`;
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

function loadRelationships() {
  try {
    if (!fs.existsSync(DATA_FILE)) return;

    const raw = fs.readFileSync(DATA_FILE, "utf8");

    if (!raw.trim()) return;

    const data = JSON.parse(raw);

    if (Array.isArray(data.couples)) {
      couples.clear();

      for (const item of data.couples) {
        if (item.key && item.couple) {
          couples.set(item.key, item.couple);
        }
      }
    }

    console.log("✅ Система отношений загружена.");
  } catch (err) {
    console.error("❌ Ошибка загрузки relationships.json:", err.message);
  }
}

function saveRelationships() {
  try {
    const data = {
      updatedAt: new Date().toISOString(),
      couples: [...couples.entries()].map(([key, couple]) => ({
        key,
        couple,
      })),
    };

    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), "utf8");
  } catch (err) {
    console.error("❌ Ошибка сохранения relationships.json:", err.message);
  }
}

function getUserName(user) {
  return (
    [user.first_name, user.last_name].filter(Boolean).join(" ") ||
    user.username ||
    "Пользователь"
  );
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

  return {
    current,
    next,
  };
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
    await safeSend(chatId, "⚠️ Нельзя применять действие к боту.", {
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
Команды /couple, /ban, /kick, /mute, /unmute, /warn, /warns, /clearwarns лучше писать ответом на сообщение пользователя.

<b>Источник:</b> ${SOURCE_NAME}
`.trim();

  await safeSend(msg.chat.id, text, {
    reply_to_message_id: msg.message_id,
  });
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

Возможные причины:
1. Бот не администратор
2. У бота нет права блокировать пользователей
3. Пользователь выше бота по правам
4. Это администратор или владелец группы

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
    await bot.unbanChatMember(msg.chat.id, target.id, {
      only_if_banned: true,
    });

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

Проверь:
1. Бот админ
2. Есть право блокировать пользователей
3. Пользователь не админ

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
    await bot.unbanChatMember(msg.chat.id, userId, {
      only_if_banned: true,
    });

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

async function handleLove(msg) {
  await showLoveProfile(msg.chat.id, msg.from.id);
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

bot.on("message", async (msg) => {
  try {
    if (!msg.text) return;

    const command = getCommand(msg.text);

    if (!command.startsWith("/")) return;

    const handlers = {
      "/start": handleStart,
      "/ping": handlePing,
      "/id": handleId,
      "/help": handleHelp,

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
        gift: {
          title: "🎁 Подарок",
          text: "подарил(а) подарок своей паре",
          xp: 150,
          coins: -10,
        },
        date: {
          title: "🍽 Свидание",
          text: "устроил(а) романтическое свидание",
          xp: 300,
          coins: -25,
        },
        hug: {
          title: "🤗 Объятие",
          text: "обнял(а) свою пару",
          xp: 80,
          coins: 0,
        },
        kiss: {
          title: "💋 Поцелуй",
          text: "подарил(а) нежный поцелуй",
          xp: 120,
          coins: 0,
        },
        proposal: {
          title: "💍 Предложение",
          text: "сделал(а) важный шаг в отношениях",
          xp: 500,
          coins: -50,
        },
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
});

process.on("unhandledRejection", (reason) => {
  console.error("❌ Unhandled Rejection:", reason);
});

process.on("uncaughtException", (err) => {
  console.error("❌ Uncaught Exception:", err);
});

loadRelationships();

console.log(`✅ Бот запущен. Источник: ${SOURCE_NAME}`);