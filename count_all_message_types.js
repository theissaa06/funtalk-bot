const fs = require("fs");

const path = "index.js";
let code = fs.readFileSync(path, "utf8");

const marker = "bot.on('text', async (ctx, next) => {";

if (!code.includes(marker)) {
  console.error("❌ Не нашёл bot.on('text') в index.js");
  process.exit(1);
}

if (!code.includes("async function trackNonTextMessageActivity(ctx, messageType)")) {
  const block = `
async function trackNonTextMessageActivity(ctx, messageType) {
  try {
    if (!ctx.chat || !ctx.from || ctx.from.is_bot) return;

    const chat = getChatDB(ctx.chat.id);

    // Запоминаем пользователя в БД для созыва
    const user = typeof rememberChatUserForCalls === 'function'
      ? (rememberChatUserForCalls(ctx, ctx.from) || getUserDB(chat, ctx.from))
      : getUserDB(chat, ctx.from);

    const day = todayKey();

    user.messages = (user.messages || 0) + 1;
    user.xp = (user.xp || 0) + 1;

    if (!user.messagesDay) user.messagesDay = {};
    user.messagesDay[day] = (user.messagesDay[day] || 0) + 1;

    if (!user.messageTypes) {
      user.messageTypes = {
        text: 0,
        voice: 0,
        video_note: 0,
        photo: 0,
        video: 0,
        sticker: 0,
        document: 0,
        audio: 0,
        animation: 0,
        other: 0
      };
    }

    if (!Object.prototype.hasOwnProperty.call(user.messageTypes, messageType)) {
      user.messageTypes[messageType] = 0;
    }

    user.messageTypes[messageType] += 1;

    // Красивые отдельные счётчики
    if (messageType === 'voice') user.voiceMessages = (user.voiceMessages || 0) + 1;
    if (messageType === 'video_note') user.circleMessages = (user.circleMessages || 0) + 1;
    if (messageType === 'photo') user.photoMessages = (user.photoMessages || 0) + 1;
    if (messageType === 'video') user.videoMessages = (user.videoMessages || 0) + 1;
    if (messageType === 'sticker') user.stickerMessages = (user.stickerMessages || 0) + 1;
    if (messageType === 'document') user.documentMessages = (user.documentMessages || 0) + 1;
    if (messageType === 'audio') user.audioMessages = (user.audioMessages || 0) + 1;
    if (messageType === 'animation') user.animationMessages = (user.animationMessages || 0) + 1;

    // Монеты за активность, но с антифармом как у текста
    if (nowTs() - (user.lastMessageCoinAt || 0) > 30000) {
      user.balance = (user.balance || 0) + 1;
      user.coins = user.balance;
      user.lastMessageCoinAt = nowTs();
    }

    user.lastSeenAt = new Date().toISOString();

    saveDB();

    // Проверяем ачивки после любого типа активности
    if (typeof checkAutoAchievements === 'function') {
      await checkAutoAchievements(ctx, user);
    }
  } catch (error) {
    console.error('trackNonTextMessageActivity error:', error);
  }
}

// Учитываем не только текст, но и голосовые/медиа/стикеры
bot.on('voice', async (ctx) => trackNonTextMessageActivity(ctx, 'voice'));
bot.on('video_note', async (ctx) => trackNonTextMessageActivity(ctx, 'video_note'));
bot.on('photo', async (ctx) => trackNonTextMessageActivity(ctx, 'photo'));
bot.on('video', async (ctx) => trackNonTextMessageActivity(ctx, 'video'));
bot.on('sticker', async (ctx) => trackNonTextMessageActivity(ctx, 'sticker'));
bot.on('document', async (ctx) => trackNonTextMessageActivity(ctx, 'document'));
bot.on('audio', async (ctx) => trackNonTextMessageActivity(ctx, 'audio'));
bot.on('animation', async (ctx) => trackNonTextMessageActivity(ctx, 'animation'));

`;

  code = code.replace(marker, block + "\n" + marker);
}

// Обновляем профиль, чтобы показывал голосовые и медиа, если блок профиля есть
if (!code.includes("🎙 Голосовых:")) {
  code = code.replace(
    "💬 Сообщений: <b>${user.messages}</b>",
    "💬 Сообщений всего: <b>${user.messages}</b>\\n🎙 Голосовых: <b>${user.voiceMessages || 0}</b>\\n⭕ Кружков: <b>${user.circleMessages || 0}</b>\\n🖼 Фото: <b>${user.photoMessages || 0}</b>\\n🎬 Видео: <b>${user.videoMessages || 0}</b>\\n😄 Стикеров: <b>${user.stickerMessages || 0}</b>"
  );

  code = code.replace(
    "💬 Сообщений всего: <b>${user.messages}</b>",
    "💬 Сообщений всего: <b>${user.messages}</b>\\n🎙 Голосовых: <b>${user.voiceMessages || 0}</b>\\n⭕ Кружков: <b>${user.circleMessages || 0}</b>\\n🖼 Фото: <b>${user.photoMessages || 0}</b>\\n🎬 Видео: <b>${user.videoMessages || 0}</b>\\n😄 Стикеров: <b>${user.stickerMessages || 0}</b>"
  );
}

fs.writeFileSync(path, code, "utf8");

console.log("✅ Теперь бот учитывает голосовые, фото, видео, стикеры и другие медиа");
console.log("✅ Всё идёт в общий счётчик, топы, БД и ачивки");
