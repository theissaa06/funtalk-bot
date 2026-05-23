require("dotenv").config();

const { Telegraf } = require("telegraf");
const fs = require("fs");
const path = require("path");
const { execFile } = require("child_process");
const { promisify } = require("util");

const execFileAsync = promisify(execFile);

const BOT_TOKEN = process.env.BOT_TOKEN;
const BOT_USERNAME = process.env.BOT_USERNAME || "ТвойБот";

if (!BOT_TOKEN) {
  console.error("❌ BOT_TOKEN не найден в .env");
  process.exit(1);
}

const bot = new Telegraf(BOT_TOKEN);

// ======================================================
// ПАПКИ
// ======================================================

const DATA_DIR = path.join(__dirname, "data");
const DOWNLOAD_DIR = path.join(__dirname, "downloads");
const DB_FILE = path.join(DATA_DIR, "database.json");

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(DOWNLOAD_DIR)) fs.mkdirSync(DOWNLOAD_DIR, { recursive: true });

if (!fs.existsSync(DB_FILE)) {
  fs.writeFileSync(
    DB_FILE,
    JSON.stringify(
      {
        chats: {},
      },
      null,
      2
    )
  );
}

// ======================================================
// БАЗА
// ======================================================

function loadDB() {
  try {
    return JSON.parse(fs.readFileSync(DB_FILE, "utf8"));
  } catch {
    return { chats: {} };
  }
}

function saveDB(db) {
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
}

function getChatDB(db, chatId) {
  const id = String(chatId);

  if (!db.chats[id]) {
    db.chats[id] = {
      users: {},
      friendships: {},
      couples: {},
    };
  }

  return db.chats[id];
}

function getUserDB(chat, user) {
  const id = String(user.id);

  if (!chat.users[id]) {
    chat.users[id] = {
      id: user.id,
      firstName: user.first_name || "",
      username: user.username || "",
      messages: 0,
      coins: 0,
      reputation: 0,
      warnings: 0,
      lastBonus: null,
      joinedAt: new Date().toISOString(),
    };
  }

  chat.users[id].firstName = user.first_name || "";
  chat.users[id].username = user.username || "";

  return chat.users[id];
}

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function escapeHtml(text = "") {
  return String(text)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function getUserName(user) {
  return user.first_name || user.username || "Участник";
}

function mentionUser(user) {
  const name = escapeHtml(getUserName(user));
  return `<a href="tg://user?id=${user.id}">${name}</a>`;
}

function getRank(messages) {
  if (messages >= 10000) return "👑 Легенда клуба";
  if (messages >= 5000) return "💎 Элита чата";
  if (messages >= 2500) return "🔥 Душа компании";
  if (messages >= 1000) return "⭐ Супер актив";
  if (messages >= 500) return "💬 Постоянный";
  if (messages >= 100) return "🌱 Активный новичок";
  if (messages >= 25) return "👤 Новичок";
  return "🕊 Тихий участник";
}

function getLevel(messages) {
  return Math.floor(messages / 50) + 1;
}

function getReplyUser(ctx) {
  return ctx.message?.reply_to_message?.from || null;
}

async function isAdmin(ctx, userId) {
  try {
    const member = await ctx.telegram.getChatMember(ctx.chat.id, userId);
    return ["creator", "administrator"].includes(member.status);
  } catch {
    return false;
  }
}

// ======================================================
// ССЫЛКИ НА ВИДЕО
// ======================================================

function normalizeUrl(text) {
  if (!text) return null;

  const match = text.match(/https?:\/\/[^\s]+/i);
  if (!match) return null;

  return match[0]
    .replace(/[)\]}>,.!?]+$/g, "")
    .trim();
}

function isVideoLink(text) {
  const url = normalizeUrl(text);
  if (!url) return false;

  return /(tiktok\.com|vm\.tiktok\.com|vt\.tiktok\.com|youtube\.com|youtu\.be|instagram\.com)/i.test(
    url
  );
}

function getFileSizeMB(filePath) {
  const stat = fs.statSync(filePath);
  return stat.size / 1024 / 1024;
}

function findDownloadedFile(prefix) {
  const files = fs.readdirSync(DOWNLOAD_DIR);

  const found = files.find((file) => file.startsWith(prefix));

  if (!found) return null;

  return path.join(DOWNLOAD_DIR, found);
}

function removeOldDownloadFiles(prefix) {
  try {
    const files = fs.readdirSync(DOWNLOAD_DIR);

    for (const file of files) {
      if (file.startsWith(prefix)) {
        const filePath = path.join(DOWNLOAD_DIR, file);
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }
      }
    }
  } catch {}
}

async function runYtDlp(command, args) {
  return execFileAsync(command, args, {
    timeout: 180000,
    maxBuffer: 1024 * 1024 * 20,
  });
}

async function downloadVideo(url) {
  const prefix = `video_${Date.now()}_${Math.floor(Math.random() * 99999)}`;
  const outputTemplate = path.join(DOWNLOAD_DIR, `${prefix}.%(ext)s`);

  const baseArgs = [
    "--no-playlist",
    "--no-check-certificates",
    "--force-overwrites",
    "--no-warnings",

    "--user-agent",
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",

    "--referer",
    "https://www.tiktok.com/",

    "-f",
    "best[ext=mp4]/best",

    "--merge-output-format",
    "mp4",

    "-o",
    outputTemplate,

    url,
  ];

  const attempts = [
    {
      name: "py -m yt_dlp",
      command: "py",
      args: ["-m", "yt_dlp", ...baseArgs],
    },
    {
      name: "python -m yt_dlp",
      command: "python",
      args: ["-m", "yt_dlp", ...baseArgs],
    },
    {
      name: "python3 -m yt_dlp",
      command: "python3",
      args: ["-m", "yt_dlp", ...baseArgs],
    },
    {
      name: "yt-dlp",
      command: "yt-dlp",
      args: baseArgs,
    },
  ];

  const errors = [];

  for (const attempt of attempts) {
    try {
      console.log(`▶️ Пробую скачать через: ${attempt.name}`);

      await runYtDlp(attempt.command, attempt.args);

      const downloadedFile = findDownloadedFile(prefix);

      if (!downloadedFile || !fs.existsSync(downloadedFile)) {
        errors.push(`${attempt.name}: файл не найден после скачивания`);
        continue;
      }

      const sizeMB = getFileSizeMB(downloadedFile);

      if (sizeMB > 48) {
        removeOldDownloadFiles(prefix);
        throw new Error(
          `Видео слишком большое: ${sizeMB.toFixed(
            1
          )} MB. Telegram Bot API может не принять файл больше 50 MB.`
        );
      }

      console.log(`✅ Видео скачано: ${downloadedFile}`);
      console.log(`📦 Размер: ${sizeMB.toFixed(1)} MB`);

      return downloadedFile;
    } catch (error) {
      const message = error.stderr || error.stdout || error.message || String(error);
      console.log(`❌ Не вышло через ${attempt.name}`);
      console.log(message);
      errors.push(`${attempt.name}: ${message}`);
    }
  }

  throw new Error(errors.join("\n\n"));
}

// ======================================================
// START / HELP
// ======================================================

bot.start(async (ctx) => {
  const name = escapeHtml(getUserName(ctx.from));

  await ctx.reply(
    `
━━━━━━━━━━━━━━━━━━
🤖 <b>Привет, ${name}!</b>

Я бот для <b>Клуба случайных людей</b>.

Я умею:
• встречать новых участников;
• считать сообщения;
• выдавать ранги;
• начислять монеты;
• давать ежедневный бонус;
• добавлять дружбу;
• создавать отношения;
• считать репутацию;
• показывать топ;
• скачивать видео TikTok / YouTube / Instagram;
• помогать администрации.

📌 Напиши /help, чтобы увидеть команды.
━━━━━━━━━━━━━━━━━━
`,
    { parse_mode: "HTML" }
  );
});

bot.command("help", async (ctx) => {
  await ctx.reply(
    `
━━━━━━━━━━━━━━━━━━
📌 <b>Команды бота</b>

👤 <b>Профиль:</b>
/profile — мой профиль
/rank — мой ранг
/balance — мои монеты
/top — топ по сообщениям
/topcoins — топ по монетам
/toprep — топ по репутации

🎁 <b>Бонусы:</b>
/bonus — ежедневный бонус
/gift 50 — подарить монеты ответом на сообщение

🤝 <b>Дружба:</b>
/friend — подружиться ответом
/friends — мои друзья
/unfriend — удалить друга ответом

❤️ <b>Отношения:</b>
/love — начать отношения ответом
/couple — посмотреть пару
/breakup — расстаться

✨ <b>Действия:</b>
/hug — обнять ответом
/kiss — поцеловать ответом
/pat — погладить ответом
/slap — шлёпнуть ответом
/respect — дать репутацию ответом

🛡 <b>Админ:</b>
/ban — бан ответом
/kick — кик ответом
/mute — мут ответом
/unmute — размут ответом
/warn — предупреждение ответом
/unwarn — снять предупреждение ответом

🎬 <b>Видео:</b>
Просто отправь ссылку TikTok / YouTube / Instagram.
━━━━━━━━━━━━━━━━━━
`,
    { parse_mode: "HTML" }
  );
});

// ======================================================
// ПРИВЕТСТВИЕ НОВЫХ УЧАСТНИКОВ
// ======================================================

bot.on("new_chat_members", async (ctx) => {
  try {
    const db = loadDB();
    const chat = getChatDB(db, ctx.chat.id);
    const chatTitle = escapeHtml(ctx.chat?.title || "Клуб случайных людей");

    for (const member of ctx.message.new_chat_members || []) {
      if (member.is_bot) continue;

      const user = getUserDB(chat, member);
      user.coins += 25;

      await ctx.reply(
        `
✨ <b>Новый участник в чате!</b>

👋 Добро пожаловать, ${mentionUser(member)}!

🏠 Ты попал в:
<b>${chatTitle}</b>

━━━━━━━━━━━━━━━━━━
🎁 Стартовый бонус: <b>+25 монет</b>
💬 Пиши сообщения, поднимай активность и прокачивай профиль.

📌 Полезные команды:
• /profile — твой профиль
• /bonus — ежедневный бонус
• /top — топ участников
• /help — все команды

🔥 Удачного общения в <b>Клубе случайных людей</b>!
━━━━━━━━━━━━━━━━━━
`,
        {
          parse_mode: "HTML",
          disable_web_page_preview: true,
        }
      );
    }

    saveDB(db);
  } catch (error) {
    console.error("Ошибка приветствия:", error);
  }
});

// ======================================================
// ПРОФИЛЬ / ТОПЫ
// ======================================================

bot.command("profile", async (ctx) => {
  const db = loadDB();
  const chat = getChatDB(db, ctx.chat.id);
  const user = getUserDB(chat, ctx.from);

  const userId = String(ctx.from.id);
  const coupleId = chat.couples[userId];
  const couple = coupleId ? chat.users[String(coupleId)] : null;

  const friendsCount = Object.values(chat.friendships).filter((pair) =>
    pair.includes(userId)
  ).length;

  saveDB(db);

  await ctx.reply(
    `
━━━━━━━━━━━━━━━━━━
👤 <b>Профиль</b>

🆔 Имя: <b>${escapeHtml(user.firstName || "Участник")}</b>
🔗 Username: <b>${user.username ? "@" + escapeHtml(user.username) : "нет"}</b>

💬 Сообщений: <b>${user.messages}</b>
🏆 Уровень: <b>${getLevel(user.messages)}</b>
✨ Ранг: <b>${getRank(user.messages)}</b>

🪙 Монеты: <b>${user.coins}</b>
⭐ Репутация: <b>${user.reputation}</b>
⚠️ Предупреждения: <b>${user.warnings}</b>

🤝 Друзей: <b>${friendsCount}</b>
❤️ Пара: <b>${couple ? escapeHtml(couple.firstName || "участник") : "нет"}</b>

━━━━━━━━━━━━━━━━━━
`,
    { parse_mode: "HTML" }
  );
});

bot.command("rank", async (ctx) => {
  const db = loadDB();
  const chat = getChatDB(db, ctx.chat.id);
  const user = getUserDB(chat, ctx.from);

  await ctx.reply(
    `
✨ <b>Твой ранг:</b> ${getRank(user.messages)}
🏆 Уровень: <b>${getLevel(user.messages)}</b>
💬 Сообщений: <b>${user.messages}</b>
`,
    { parse_mode: "HTML" }
  );
});

bot.command("balance", async (ctx) => {
  const db = loadDB();
  const chat = getChatDB(db, ctx.chat.id);
  const user = getUserDB(chat, ctx.from);

  await ctx.reply(`🪙 У тебя <b>${user.coins}</b> монет.`, {
    parse_mode: "HTML",
  });
});

bot.command("top", async (ctx) => {
  const db = loadDB();
  const chat = getChatDB(db, ctx.chat.id);

  const users = Object.values(chat.users)
    .sort((a, b) => b.messages - a.messages)
    .slice(0, 10);

  if (!users.length) return ctx.reply("Пока нет статистики.");

  let text = "🏆 <b>Топ по сообщениям</b>\n\n";

  users.forEach((u, i) => {
    const name = u.username
      ? `@${escapeHtml(u.username)}`
      : escapeHtml(u.firstName || "Участник");

    text += `${i + 1}. ${name} — <b>${u.messages}</b>\n`;
  });

  await ctx.reply(text, { parse_mode: "HTML" });
});

bot.command("topcoins", async (ctx) => {
  const db = loadDB();
  const chat = getChatDB(db, ctx.chat.id);

  const users = Object.values(chat.users)
    .sort((a, b) => b.coins - a.coins)
    .slice(0, 10);

  if (!users.length) return ctx.reply("Пока нет статистики.");

  let text = "🪙 <b>Топ богачей чата</b>\n\n";

  users.forEach((u, i) => {
    const name = u.username
      ? `@${escapeHtml(u.username)}`
      : escapeHtml(u.firstName || "Участник");

    text += `${i + 1}. ${name} — <b>${u.coins}</b> монет\n`;
  });

  await ctx.reply(text, { parse_mode: "HTML" });
});

bot.command("toprep", async (ctx) => {
  const db = loadDB();
  const chat = getChatDB(db, ctx.chat.id);

  const users = Object.values(chat.users)
    .sort((a, b) => b.reputation - a.reputation)
    .slice(0, 10);

  if (!users.length) return ctx.reply("Пока нет статистики.");

  let text = "⭐ <b>Топ по репутации</b>\n\n";

  users.forEach((u, i) => {
    const name = u.username
      ? `@${escapeHtml(u.username)}`
      : escapeHtml(u.firstName || "Участник");

    text += `${i + 1}. ${name} — <b>${u.reputation}</b> реп.\n`;
  });

  await ctx.reply(text, { parse_mode: "HTML" });
});

// ======================================================
// БОНУСЫ
// ======================================================

bot.command("bonus", async (ctx) => {
  const db = loadDB();
  const chat = getChatDB(db, ctx.chat.id);
  const user = getUserDB(chat, ctx.from);

  const today = todayKey();

  if (user.lastBonus === today) {
    return ctx.reply("⏳ Ты уже забирал ежедневный бонус сегодня. Приходи завтра!");
  }

  const amount = Math.floor(Math.random() * 76) + 25;

  user.lastBonus = today;
  user.coins += amount;

  saveDB(db);

  await ctx.reply(
    `
🎁 <b>Ежедневный бонус получен!</b>

🪙 Начислено: <b>+${amount}</b> монет
💰 Баланс: <b>${user.coins}</b> монет
`,
    { parse_mode: "HTML" }
  );
});

bot.command("gift", async (ctx) => {
  const target = getReplyUser(ctx);

  if (!target || target.is_bot) {
    return ctx.reply("❌ Ответь на сообщение пользователя и напиши: /gift 50");
  }

  const amount = Number(ctx.message.text.split(" ")[1]);

  if (!amount || amount <= 0) {
    return ctx.reply("❌ Укажи сумму. Например: /gift 50");
  }

  const db = loadDB();
  const chat = getChatDB(db, ctx.chat.id);
  const fromUser = getUserDB(chat, ctx.from);
  const toUser = getUserDB(chat, target);

  if (fromUser.coins < amount) {
    return ctx.reply("❌ У тебя недостаточно монет.");
  }

  fromUser.coins -= amount;
  toUser.coins += amount;

  saveDB(db);

  await ctx.reply(
    `🎁 ${mentionUser(ctx.from)} подарил ${mentionUser(target)} <b>${amount}</b> монет!`,
    { parse_mode: "HTML" }
  );
});

// ======================================================
// ДРУЖБА / ОТНОШЕНИЯ
// ======================================================

bot.command("friend", async (ctx) => {
  const target = getReplyUser(ctx);

  if (!target || target.is_bot) {
    return ctx.reply("❌ Ответь на сообщение человека, с которым хочешь подружиться.");
  }

  if (target.id === ctx.from.id) {
    return ctx.reply("😅 Сам с собой дружить нельзя.");
  }

  const db = loadDB();
  const chat = getChatDB(db, ctx.chat.id);

  getUserDB(chat, ctx.from);
  getUserDB(chat, target);

  const a = String(ctx.from.id);
  const b = String(target.id);
  const key = [a, b].sort().join("_");

  if (chat.friendships[key]) {
    return ctx.reply("🤝 Вы уже друзья.");
  }

  chat.friendships[key] = [a, b, new Date().toISOString()];

  const user = getUserDB(chat, ctx.from);
  user.coins += 10;

  saveDB(db);

  await ctx.reply(
    `
🤝 <b>Новая дружба!</b>

${mentionUser(ctx.from)} и ${mentionUser(target)} теперь друзья!

🎁 Бонус за дружбу: <b>+10 монет</b>
`,
    { parse_mode: "HTML" }
  );
});

bot.command("friends", async (ctx) => {
  const db = loadDB();
  const chat = getChatDB(db, ctx.chat.id);

  const userId = String(ctx.from.id);

  const friends = Object.values(chat.friendships)
    .filter((pair) => pair.includes(userId))
    .map((pair) => {
      const friendId = pair[0] === userId ? pair[1] : pair[0];
      return chat.users[friendId];
    })
    .filter(Boolean);

  if (!friends.length) {
    return ctx.reply("🤝 У тебя пока нет друзей в чате.");
  }

  let text = "🤝 <b>Твои друзья:</b>\n\n";

  friends.forEach((friend, index) => {
    const name = friend.username
      ? `@${escapeHtml(friend.username)}`
      : escapeHtml(friend.firstName || "Участник");

    text += `${index + 1}. ${name}\n`;
  });

  await ctx.reply(text, { parse_mode: "HTML" });
});

bot.command("unfriend", async (ctx) => {
  const target = getReplyUser(ctx);

  if (!target) {
    return ctx.reply("❌ Ответь на сообщение друга командой /unfriend.");
  }

  const db = loadDB();
  const chat = getChatDB(db, ctx.chat.id);

  const a = String(ctx.from.id);
  const b = String(target.id);
  const key = [a, b].sort().join("_");

  if (!chat.friendships[key]) {
    return ctx.reply("❌ Вы и так не друзья.");
  }

  delete chat.friendships[key];

  saveDB(db);

  await ctx.reply(`💔 ${mentionUser(ctx.from)} и ${mentionUser(target)} больше не друзья.`, {
    parse_mode: "HTML",
  });
});

bot.command("love", async (ctx) => {
  const target = getReplyUser(ctx);

  if (!target || target.is_bot) {
    return ctx.reply("❌ Ответь на сообщение человека, с кем хочешь начать отношения.");
  }

  if (target.id === ctx.from.id) {
    return ctx.reply("😅 С самим собой отношения не создать.");
  }

  const db = loadDB();
  const chat = getChatDB(db, ctx.chat.id);

  getUserDB(chat, ctx.from);
  getUserDB(chat, target);

  const a = String(ctx.from.id);
  const b = String(target.id);

  if (chat.couples[a] || chat.couples[b]) {
    return ctx.reply("❌ У одного из вас уже есть отношения.");
  }

  chat.couples[a] = b;
  chat.couples[b] = a;

  const user = getUserDB(chat, ctx.from);
  const partner = getUserDB(chat, target);

  user.coins += 20;
  partner.coins += 20;

  saveDB(db);

  await ctx.reply(
    `
❤️ <b>Новая пара в чате!</b>

${mentionUser(ctx.from)} и ${mentionUser(target)} теперь вместе!

🎁 Бонус каждому: <b>+20 монет</b>
💍 Совет да любовь!
`,
    { parse_mode: "HTML" }
  );
});

bot.command("couple", async (ctx) => {
  const db = loadDB();
  const chat = getChatDB(db, ctx.chat.id);

  const userId = String(ctx.from.id);
  const partnerId = chat.couples[userId];

  if (!partnerId) {
    return ctx.reply("💔 У тебя пока нет пары.");
  }

  const partner = chat.users[String(partnerId)];

  await ctx.reply(
    `
❤️ <b>Твоя пара:</b>
${partner ? escapeHtml(partner.firstName || "Участник") : "участник"}

💍 Берегите отношения!
`,
    { parse_mode: "HTML" }
  );
});

bot.command("breakup", async (ctx) => {
  const db = loadDB();
  const chat = getChatDB(db, ctx.chat.id);

  const userId = String(ctx.from.id);
  const partnerId = chat.couples[userId];

  if (!partnerId) {
    return ctx.reply("💔 У тебя нет отношений.");
  }

  delete chat.couples[userId];
  delete chat.couples[String(partnerId)];

  saveDB(db);

  await ctx.reply("💔 Отношения завершены.");
});

// ======================================================
// ДЕЙСТВИЯ / РЕПУТАЦИЯ
// ======================================================

async function actionCommand(ctx, emoji, text) {
  const target = getReplyUser(ctx);

  if (!target || target.is_bot) {
    return ctx.reply("❌ Ответь на сообщение пользователя.");
  }

  await ctx.reply(`${emoji} ${mentionUser(ctx.from)} ${text} ${mentionUser(target)}`, {
    parse_mode: "HTML",
  });
}

bot.command("hug", (ctx) => actionCommand(ctx, "🤗", "обнял"));
bot.command("kiss", (ctx) => actionCommand(ctx, "😘", "поцеловал"));
bot.command("pat", (ctx) => actionCommand(ctx, "🫶", "погладил"));
bot.command("slap", (ctx) => actionCommand(ctx, "💥", "шлёпнул"));

bot.command("respect", async (ctx) => {
  const target = getReplyUser(ctx);

  if (!target || target.is_bot) {
    return ctx.reply("❌ Ответь на сообщение пользователя командой /respect.");
  }

  if (target.id === ctx.from.id) {
    return ctx.reply("😅 Себе репутацию давать нельзя.");
  }

  const db = loadDB();
  const chat = getChatDB(db, ctx.chat.id);

  const targetUser = getUserDB(chat, target);
  targetUser.reputation += 1;

  saveDB(db);

  await ctx.reply(
    `⭐ ${mentionUser(ctx.from)} повысил репутацию ${mentionUser(target)}!\n\nРепутация: <b>${targetUser.reputation}</b>`,
    { parse_mode: "HTML" }
  );
});

// ======================================================
// АДМИН-КОМАНДЫ
// ======================================================

bot.command("ban", async (ctx) => {
  if (!(await isAdmin(ctx, ctx.from.id))) {
    return ctx.reply("❌ Команда только для администрации.");
  }

  const target = getReplyUser(ctx);
  if (!target) return ctx.reply("❌ Ответь на сообщение пользователя командой /ban.");

  const reason = ctx.message.text.replace("/ban", "").trim() || "без причины";

  try {
    await ctx.telegram.banChatMember(ctx.chat.id, target.id);

    await ctx.reply(
      `🚫 <b>Пользователь забанен</b>\n\n👤 ${mentionUser(target)}\n📌 Причина: <b>${escapeHtml(reason)}</b>`,
      { parse_mode: "HTML" }
    );
  } catch (error) {
    console.error(error);
    await ctx.reply("❌ Не получилось забанить. Проверь права бота.");
  }
});

bot.command("kick", async (ctx) => {
  if (!(await isAdmin(ctx, ctx.from.id))) {
    return ctx.reply("❌ Команда только для администрации.");
  }

  const target = getReplyUser(ctx);
  if (!target) return ctx.reply("❌ Ответь на сообщение пользователя командой /kick.");

  const reason = ctx.message.text.replace("/kick", "").trim() || "без причины";

  try {
    await ctx.telegram.banChatMember(ctx.chat.id, target.id);
    await ctx.telegram.unbanChatMember(ctx.chat.id, target.id);

    await ctx.reply(
      `👢 <b>Пользователь кикнут</b>\n\n👤 ${mentionUser(target)}\n📌 Причина: <b>${escapeHtml(reason)}</b>`,
      { parse_mode: "HTML" }
    );
  } catch (error) {
    console.error(error);
    await ctx.reply("❌ Не получилось кикнуть. Проверь права бота.");
  }
});

bot.command("mute", async (ctx) => {
  if (!(await isAdmin(ctx, ctx.from.id))) {
    return ctx.reply("❌ Команда только для администрации.");
  }

  const target = getReplyUser(ctx);
  if (!target) return ctx.reply("❌ Ответь на сообщение пользователя командой /mute.");

  try {
    await ctx.telegram.restrictChatMember(ctx.chat.id, target.id, {
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
      },
    });

    await ctx.reply(`🔇 ${mentionUser(target)} замучен.`, {
      parse_mode: "HTML",
    });
  } catch (error) {
    console.error(error);
    await ctx.reply("❌ Не получилось замутить. Проверь права бота.");
  }
});

bot.command("unmute", async (ctx) => {
  if (!(await isAdmin(ctx, ctx.from.id))) {
    return ctx.reply("❌ Команда только для администрации.");
  }

  const target = getReplyUser(ctx);
  if (!target) return ctx.reply("❌ Ответь на сообщение пользователя командой /unmute.");

  try {
    await ctx.telegram.restrictChatMember(ctx.chat.id, target.id, {
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
      },
    });

    await ctx.reply(`🔊 ${mentionUser(target)} размучен.`, {
      parse_mode: "HTML",
    });
  } catch (error) {
    console.error(error);
    await ctx.reply("❌ Не получилось размутить. Проверь права бота.");
  }
});

bot.command("warn", async (ctx) => {
  if (!(await isAdmin(ctx, ctx.from.id))) {
    return ctx.reply("❌ Команда только для администрации.");
  }

  const target = getReplyUser(ctx);
  if (!target) return ctx.reply("❌ Ответь на сообщение пользователя командой /warn.");

  const db = loadDB();
  const chat = getChatDB(db, ctx.chat.id);
  const user = getUserDB(chat, target);

  user.warnings += 1;

  saveDB(db);

  await ctx.reply(
    `⚠️ ${mentionUser(target)} получил предупреждение.\n\nВсего предупреждений: <b>${user.warnings}</b>`,
    { parse_mode: "HTML" }
  );
});

bot.command("unwarn", async (ctx) => {
  if (!(await isAdmin(ctx, ctx.from.id))) {
    return ctx.reply("❌ Команда только для администрации.");
  }

  const target = getReplyUser(ctx);
  if (!target) return ctx.reply("❌ Ответь на сообщение пользователя командой /unwarn.");

  const db = loadDB();
  const chat = getChatDB(db, ctx.chat.id);
  const user = getUserDB(chat, target);

  user.warnings = Math.max(0, user.warnings - 1);

  saveDB(db);

  await ctx.reply(
    `✅ С ${mentionUser(target)} снято предупреждение.\n\nОсталось предупреждений: <b>${user.warnings}</b>`,
    { parse_mode: "HTML" }
  );
});

// ======================================================
// ОБРАБОТКА ТЕКСТА: СТАТИСТИКА + СКАЧИВАНИЕ ВИДЕО
// ======================================================

bot.on("text", async (ctx) => {
  const text = ctx.message.text;

  const db = loadDB();
  const chat = getChatDB(db, ctx.chat.id);
  const user = getUserDB(chat, ctx.from);

  user.messages += 1;

  if (user.messages % 10 === 0) {
    user.coins += 2;
  }

  saveDB(db);

  if (!isVideoLink(text)) return;

  const url = normalizeUrl(text);

  let loadingMessage = null;
  let videoPath = null;

  try {
    loadingMessage = await ctx.reply("⏳ Скачиваю видео, подожди немного...");

    videoPath = await downloadVideo(url);

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
        caption: `👉 Скачано через @${BOT_USERNAME}`,
        supports_streaming: true,
      }
    );

    if (videoPath && fs.existsSync(videoPath)) {
      fs.unlinkSync(videoPath);
    }
  } catch (error) {
    console.error("Ошибка скачивания видео:", error.message || error);

    if (loadingMessage) {
      await ctx.telegram
        .deleteMessage(ctx.chat.id, loadingMessage.message_id)
        .catch(() => {});
    }

    let shortError = String(error.message || error);

    if (shortError.length > 800) {
      shortError = shortError.slice(0, 800) + "...";
    }

    await ctx.reply(
      `
❌ <b>Не получилось скачать видео.</b>

Что проверить:
1. На сервере установлен <b>yt-dlp</b>.
2. На сервере установлен <b>Python</b>.
3. Ссылка публичная, не закрытая.
4. Видео не больше 50 MB.
5. TikTok не заблокировал скачивание с сервера.

🧪 Техническая ошибка:
<code>${escapeHtml(shortError)}</code>
`,
      { parse_mode: "HTML" }
    );

    if (videoPath && fs.existsSync(videoPath)) {
      fs.unlinkSync(videoPath);
    }
  }
});

// ======================================================
// ОШИБКИ / ЗАПУСК
// ======================================================

bot.catch((error) => {
  console.error("Глобальная ошибка бота:", error);
});

bot.launch();

console.log("✅ Бот запущен!");
console.log("🤖 Клуб случайных людей работает");
console.log("🎬 Скачивание видео включено");

process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));