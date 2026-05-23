// ======================================================
// index.js — Telegram bot для "Клуба случайных людей"
// Приветствие + профиль + топ + скачивание видео ссылок
// ======================================================

require("dotenv").config();

const { Telegraf } = require("telegraf");
const fs = require("fs");
const path = require("path");
const { execFile } = require("child_process");
const { promisify } = require("util");

const execFileAsync = promisify(execFile);

const BOT_TOKEN = process.env.BOT_TOKEN;

if (!BOT_TOKEN) {
  console.error("❌ Ошибка: BOT_TOKEN не найден в .env");
  process.exit(1);
}

const bot = new Telegraf(BOT_TOKEN);

// ======================================================
// ПАПКИ И ФАЙЛЫ
// ======================================================

const DATA_DIR = path.join(__dirname, "data");
const DOWNLOAD_DIR = path.join(__dirname, "downloads");
const STATS_FILE = path.join(DATA_DIR, "stats.json");

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR);
}

if (!fs.existsSync(DOWNLOAD_DIR)) {
  fs.mkdirSync(DOWNLOAD_DIR);
}

if (!fs.existsSync(STATS_FILE)) {
  fs.writeFileSync(STATS_FILE, JSON.stringify({}, null, 2));
}

// ======================================================
// РАБОТА СО СТАТИСТИКОЙ
// ======================================================

function loadStats() {
  try {
    return JSON.parse(fs.readFileSync(STATS_FILE, "utf8"));
  } catch {
    return {};
  }
}

function saveStats(stats) {
  fs.writeFileSync(STATS_FILE, JSON.stringify(stats, null, 2));
}

function getUserRank(messages) {
  if (messages >= 5000) return "👑 Легенда чата";
  if (messages >= 2500) return "🔥 Элита";
  if (messages >= 1000) return "💎 Активист";
  if (messages >= 500) return "⭐ Постоянный";
  if (messages >= 100) return "💬 Общительный";
  if (messages >= 25) return "🌱 Новичок";
  return "👤 Участник";
}

function addMessageStat(ctx) {
  if (!ctx.from || !ctx.chat) return;

  const stats = loadStats();

  const chatId = String(ctx.chat.id);
  const userId = String(ctx.from.id);

  if (!stats[chatId]) {
    stats[chatId] = {};
  }

  if (!stats[chatId][userId]) {
    stats[chatId][userId] = {
      id: ctx.from.id,
      firstName: ctx.from.first_name || "",
      username: ctx.from.username || "",
      messages: 0,
      joinedAt: new Date().toISOString(),
    };
  }

  stats[chatId][userId].firstName = ctx.from.first_name || "";
  stats[chatId][userId].username = ctx.from.username || "";
  stats[chatId][userId].messages += 1;

  saveStats(stats);
}

// ======================================================
// ПРОВЕРКА АДМИНА
// ======================================================

async function isAdmin(ctx, userId) {
  try {
    const member = await ctx.telegram.getChatMember(ctx.chat.id, userId);
    return ["creator", "administrator"].includes(member.status);
  } catch {
    return false;
  }
}

// ======================================================
// ПРОВЕРКА ССЫЛОК НА ВИДЕО
// ======================================================

function isVideoLink(text) {
  if (!text) return false;

  return /https?:\/\/(www\.)?(tiktok\.com|vm\.tiktok\.com|vt\.tiktok\.com|youtube\.com|youtu\.be|instagram\.com|www\.instagram\.com)/i.test(
    text
  );
}

async function downloadVideo(url) {
  const fileName = `video_${Date.now()}.mp4`;
  const outputPath = path.join(DOWNLOAD_DIR, fileName);

  await execFileAsync("yt-dlp", [
    "-f",
    "mp4/best",
    "--merge-output-format",
    "mp4",
    "-o",
    outputPath,
    url,
  ]);

  return outputPath;
}

// ======================================================
// /START
// ======================================================

bot.start(async (ctx) => {
  const name = ctx.from?.first_name || ctx.from?.username || "друг";

  const text = `
━━━━━━━━━━━━━━━━━━
🤖 <b>Привет, ${name}!</b>

Я бот для <b>Клуба случайных людей</b>.

Я умею:
• встречать новых участников;
• считать сообщения;
• показывать профиль;
• показывать топ активных;
• выдавать ранги по активности;
• скачивать видео по ссылкам TikTok / YouTube / Instagram;
• помогать администрации.

📌 Команды:
 /help — список команд
 /profile — твой профиль
 /top — топ участников
 /rank — твой ранг

🔥 Добавь меня в чат и выдай права администратора.
━━━━━━━━━━━━━━━━━━
`;

  await ctx.reply(text, {
    parse_mode: "HTML",
  });
});

// ======================================================
// /HELP
// ======================================================

bot.command("help", async (ctx) => {
  const text = `
━━━━━━━━━━━━━━━━━━
📌 <b>Команды бота</b>

👤 <b>Для участников:</b>
/profile — мой профиль
/rank — мой ранг
/top — топ активных
/help — помощь

🛡 <b>Для администрации:</b>
/ban — забанить пользователя
/kick — кикнуть пользователя
/mute — замутить пользователя
/unmute — размутить пользователя

🎬 <b>Скачивание видео:</b>
Просто отправь ссылку TikTok / YouTube / Instagram, и бот отправит видео прямо в чат.

━━━━━━━━━━━━━━━━━━
`;

  await ctx.reply(text, {
    parse_mode: "HTML",
  });
});

// ======================================================
// 👋 ПРИВЕТСТВИЕ НОВОГО УЧАСТНИКА
// ======================================================

bot.on("new_chat_members", async (ctx) => {
  try {
    const chatTitle = ctx.chat?.title || "Клуб случайных людей";
    const members = ctx.message?.new_chat_members || [];

    for (const member of members) {
      if (member.is_bot) continue;

      const name = member.first_name || member.username || "новый участник";

      const userMention = member.username
        ? `@${member.username}`
        : `<a href="tg://user?id=${member.id}">${name}</a>`;

      const welcomeText = `
✨ <b>Новый участник в чате!</b>

👋 Добро пожаловать, ${userMention}

🏠 Ты попал в:
<b>${chatTitle}</b>

━━━━━━━━━━━━━━━━━━
💬 Здесь можно общаться, знакомиться, поднимать активность и прокачивать свой профиль.

📌 Полезные команды:
• /profile — твой профиль
• /rank — твой ранг
• /top — топ участников
• /help — помощь по боту

🔥 Удачного общения в <b>Клубе случайных людей</b>!
━━━━━━━━━━━━━━━━━━
`;

      await ctx.reply(welcomeText, {
        parse_mode: "HTML",
        disable_web_page_preview: true,
      });
    }
  } catch (error) {
    console.error("Ошибка приветствия нового участника:", error);
  }
});

// ======================================================
// 🤖 КОГДА БОТА ДОБАВИЛИ В ГРУППУ
// ======================================================

bot.on("my_chat_member", async (ctx) => {
  try {
    const oldStatus = ctx.update.my_chat_member.old_chat_member.status;
    const newStatus = ctx.update.my_chat_member.new_chat_member.status;

    if (
      ["left", "kicked"].includes(oldStatus) &&
      ["member", "administrator"].includes(newStatus)
    ) {
      await ctx.reply(
        `
🤖 <b>Бот подключён!</b>

Спасибо, что добавили меня в чат.

Чтобы я работал правильно:
1. Выдайте мне права администратора.
2. Разрешите удалять сообщения.
3. Разрешите банить пользователей.
4. Разрешите закреплять сообщения, если нужно.

📌 Напишите /help, чтобы посмотреть команды.
`,
        {
          parse_mode: "HTML",
        }
      );
    }
  } catch (error) {
    console.error("Ошибка my_chat_member:", error);
  }
});

// ======================================================
// /PROFILE
// ======================================================

bot.command("profile", async (ctx) => {
  try {
    const stats = loadStats();

    const chatId = String(ctx.chat.id);
    const userId = String(ctx.from.id);

    const userStats = stats?.[chatId]?.[userId];

    const messages = userStats?.messages || 0;
    const rank = getUserRank(messages);

    const name = ctx.from.first_name || ctx.from.username || "Участник";
    const username = ctx.from.username ? `@${ctx.from.username}` : "нет";

    const text = `
━━━━━━━━━━━━━━━━━━
👤 <b>Профиль участника</b>

🆔 Имя: <b>${name}</b>
🔗 Username: <b>${username}</b>
💬 Сообщений: <b>${messages}</b>
✨ Ранг: <b>${rank}</b>

━━━━━━━━━━━━━━━━━━
`;

    await ctx.reply(text, {
      parse_mode: "HTML",
    });
  } catch (error) {
    console.error("Ошибка /profile:", error);
    await ctx.reply("❌ Не получилось открыть профиль.");
  }
});

// ======================================================
// /RANK
// ======================================================

bot.command("rank", async (ctx) => {
  try {
    const stats = loadStats();

    const chatId = String(ctx.chat.id);
    const userId = String(ctx.from.id);

    const messages = stats?.[chatId]?.[userId]?.messages || 0;
    const rank = getUserRank(messages);

    await ctx.reply(
      `
━━━━━━━━━━━━━━━━━━
✨ <b>Твой ранг:</b> ${rank}

💬 Сообщений: <b>${messages}</b>

━━━━━━━━━━━━━━━━━━
`,
      {
        parse_mode: "HTML",
      }
    );
  } catch (error) {
    console.error("Ошибка /rank:", error);
    await ctx.reply("❌ Не получилось посмотреть ранг.");
  }
});

// ======================================================
// /TOP
// ======================================================

bot.command("top", async (ctx) => {
  try {
    const stats = loadStats();

    const chatId = String(ctx.chat.id);
    const chatStats = stats[chatId] || {};

    const users = Object.values(chatStats)
      .sort((a, b) => b.messages - a.messages)
      .slice(0, 10);

    if (users.length === 0) {
      return ctx.reply("Пока нет статистики сообщений.");
    }

    let text = "🏆 <b>Топ активных участников</b>\n\n";

    users.forEach((user, index) => {
      const place = index + 1;
      const name = user.username
        ? `@${user.username}`
        : user.firstName || "Участник";

      text += `${place}. ${name} — <b>${user.messages}</b> сообщений\n`;
    });

    text += "\n━━━━━━━━━━━━━━━━━━";

    await ctx.reply(text, {
      parse_mode: "HTML",
    });
  } catch (error) {
    console.error("Ошибка /top:", error);
    await ctx.reply("❌ Не получилось показать топ.");
  }
});

// ======================================================
// /BAN
// Использование: ответь на сообщение пользователя и напиши /ban причина
// ======================================================

bot.command("ban", async (ctx) => {
  try {
    const admin = await isAdmin(ctx, ctx.from.id);

    if (!admin) {
      return ctx.reply("❌ Эта команда только для администрации.");
    }

    const reply = ctx.message.reply_to_message;

    if (!reply) {
      return ctx.reply("❌ Ответь на сообщение пользователя командой /ban.");
    }

    const targetId = reply.from.id;
    const reason = ctx.message.text.replace("/ban", "").trim() || "без причины";

    await ctx.telegram.banChatMember(ctx.chat.id, targetId);

    await ctx.reply(
      `
🚫 <b>Пользователь забанен</b>

👤 ID: <code>${targetId}</code>
📌 Причина: <b>${reason}</b>
`,
      {
        parse_mode: "HTML",
      }
    );
  } catch (error) {
    console.error("Ошибка /ban:", error);
    await ctx.reply("❌ Не получилось забанить. Проверь, что бот админ.");
  }
});

// ======================================================
// /KICK
// Использование: ответь на сообщение пользователя и напиши /kick причина
// ======================================================

bot.command("kick", async (ctx) => {
  try {
    const admin = await isAdmin(ctx, ctx.from.id);

    if (!admin) {
      return ctx.reply("❌ Эта команда только для администрации.");
    }

    const reply = ctx.message.reply_to_message;

    if (!reply) {
      return ctx.reply("❌ Ответь на сообщение пользователя командой /kick.");
    }

    const targetId = reply.from.id;
    const reason = ctx.message.text.replace("/kick", "").trim() || "без причины";

    await ctx.telegram.banChatMember(ctx.chat.id, targetId);
    await ctx.telegram.unbanChatMember(ctx.chat.id, targetId);

    await ctx.reply(
      `
👢 <b>Пользователь кикнут</b>

👤 ID: <code>${targetId}</code>
📌 Причина: <b>${reason}</b>
`,
      {
        parse_mode: "HTML",
      }
    );
  } catch (error) {
    console.error("Ошибка /kick:", error);
    await ctx.reply("❌ Не получилось кикнуть. Проверь, что бот админ.");
  }
});

// ======================================================
// /MUTE
// Использование: ответь на сообщение пользователя и напиши /mute
// ======================================================

bot.command("mute", async (ctx) => {
  try {
    const admin = await isAdmin(ctx, ctx.from.id);

    if (!admin) {
      return ctx.reply("❌ Эта команда только для администрации.");
    }

    const reply = ctx.message.reply_to_message;

    if (!reply) {
      return ctx.reply("❌ Ответь на сообщение пользователя командой /mute.");
    }

    const targetId = reply.from.id;

    await ctx.telegram.restrictChatMember(ctx.chat.id, targetId, {
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
        can_manage_topics: false,
      },
    });

    await ctx.reply(
      `
🔇 <b>Пользователь замучен</b>

👤 ID: <code>${targetId}</code>
`,
      {
        parse_mode: "HTML",
      }
    );
  } catch (error) {
    console.error("Ошибка /mute:", error);
    await ctx.reply("❌ Не получилось замутить. Проверь, что бот админ.");
  }
});

// ======================================================
// /UNMUTE
// Использование: ответь на сообщение пользователя и напиши /unmute
// ======================================================

bot.command("unmute", async (ctx) => {
  try {
    const admin = await isAdmin(ctx, ctx.from.id);

    if (!admin) {
      return ctx.reply("❌ Эта команда только для администрации.");
    }

    const reply = ctx.message.reply_to_message;

    if (!reply) {
      return ctx.reply("❌ Ответь на сообщение пользователя командой /unmute.");
    }

    const targetId = reply.from.id;

    await ctx.telegram.restrictChatMember(ctx.chat.id, targetId, {
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
        can_manage_topics: false,
      },
    });

    await ctx.reply(
      `
🔊 <b>Пользователь размучен</b>

👤 ID: <code>${targetId}</code>
`,
      {
        parse_mode: "HTML",
      }
    );
  } catch (error) {
    console.error("Ошибка /unmute:", error);
    await ctx.reply("❌ Не получилось размутить. Проверь, что бот админ.");
  }
});

// ======================================================
// ОБРАБОТКА ТЕКСТА
// Статистика + скачивание видео
// ======================================================

bot.on("text", async (ctx) => {
  const text = ctx.message.text;

  // Считаем сообщения
  addMessageStat(ctx);

  // Если это не ссылка на видео — ничего не делаем
  if (!isVideoLink(text)) return;

  let loadingMessage;
  let videoPath;

  try {
    loadingMessage = await ctx.reply("⏳ Скачиваю видео...");

    videoPath = await downloadVideo(text);

    if (loadingMessage) {
      await ctx.telegram
        .deleteMessage(ctx.chat.id, loadingMessage.message_id)
        .catch(() => {});
    }

    await ctx.replyWithVideo(
      {
        source: videoPath,
      },
      {
        caption: "👉 Скачано через @ТвойБот",
        supports_streaming: true,
      }
    );

    if (videoPath && fs.existsSync(videoPath)) {
      fs.unlinkSync(videoPath);
    }
  } catch (error) {
    console.error("Ошибка скачивания видео:", error);

    if (loadingMessage) {
      await ctx.telegram
        .deleteMessage(ctx.chat.id, loadingMessage.message_id)
        .catch(() => {});
    }

    await ctx.reply(
      "❌ Не получилось скачать видео. Возможно, ссылка закрытая, видео защищено или yt-dlp не установлен."
    );

    if (videoPath && fs.existsSync(videoPath)) {
      fs.unlinkSync(videoPath);
    }
  }
});

// ======================================================
// ОБРАБОТКА ОШИБОК
// ======================================================

bot.catch((error, ctx) => {
  console.error("Глобальная ошибка бота:", error);
});

// ======================================================
// ЗАПУСК БОТА
// ======================================================

bot.launch();

console.log("✅ Бот запущен!");
console.log("🤖 Клуб случайных людей работает");

// ======================================================
// КОРРЕКТНОЕ ВЫКЛЮЧЕНИЕ
// ======================================================

process.once("SIGINT", () => {
  bot.stop("SIGINT");
});

process.once("SIGTERM", () => {
  bot.stop("SIGTERM");
});