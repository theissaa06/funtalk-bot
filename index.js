require("dotenv").config();

const TelegramBot = require("node-telegram-bot-api");

const BOT_TOKEN = process.env.BOT_TOKEN;
const OWNER_ID = Number(process.env.OWNER_ID || 0);

if (!BOT_TOKEN) {
  console.error("❌ BOT_TOKEN не найден. Проверь .env или Environment Variables на Render.");
  process.exit(1);
}

if (!OWNER_ID) {
  console.error("❌ OWNER_ID не найден. Проверь .env или Environment Variables на Render.");
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
Команды /ban, /kick, /mute, /unmute, /warn, /warns, /clearwarns лучше писать ответом на сообщение пользователя.

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

Проверь:
1. Бот является админом
2. У бота есть право блокировать пользователей
3. Цель не является админом
4. Бот стоит выше пользователя по правам

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
1. Бот является админом
2. У бота есть право блокировать пользователей
3. Цель не является админом

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

bot.on("polling_error", (err) => {
  console.error("❌ Polling error:", err.message);
});

process.on("unhandledRejection", (reason) => {
  console.error("❌ Unhandled Rejection:", reason);
});

process.on("uncaughtException", (err) => {
  console.error("❌ Uncaught Exception:", err);
});

console.log(`✅ Бот запущен. Источник: ${SOURCE_NAME}`);
