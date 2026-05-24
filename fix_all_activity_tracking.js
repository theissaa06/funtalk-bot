const fs = require("fs");

const path = "index.js";
let code = fs.readFileSync(path, "utf8");

const insertBefore = "function mainMenuKeyboard() {";

if (!code.includes("async function trackAnyMessageActivity(ctx, forcedType = null)")) {
  const block = `
function getMessageActivityType(message) {
  if (!message) return 'other';
  if (message.text) return 'text';
  if (message.voice) return 'voice';
  if (message.video_note) return 'video_note';
  if (message.photo) return 'photo';
  if (message.video) return 'video';
  if (message.sticker) return 'sticker';
  if (message.document) return 'document';
  if (message.audio) return 'audio';
  if (message.animation) return 'animation';
  if (message.contact) return 'contact';
  if (message.location) return 'location';
  return 'other';
}

async function trackAnyMessageActivity(ctx, forcedType = null) {
  try {
    if (!ctx.chat || !ctx.from || ctx.from.is_bot || !ctx.message) return null;

    const chat = getChatDB(ctx.chat.id);

    // Защита от двойного учёта одного и того же сообщения
    if (!chat.countedMessages) chat.countedMessages = {};

    const msgKey = String(ctx.message.message_id);

    if (chat.countedMessages[msgKey]) {
      return chat.users[String(ctx.from.id)] || getUserDB(chat, ctx.from);
    }

    chat.countedMessages[msgKey] = Date.now();

    // Чистим старые id сообщений, чтобы база не раздувалась
    const ids = Object.keys(chat.countedMessages);
    if (ids.length > 1000) {
      ids
        .sort((a, b) => chat.countedMessages[a] - chat.countedMessages[b])
        .slice(0, ids.length - 1000)
        .forEach((id) => delete chat.countedMessages[id]);
    }

    // Запоминаем пользователя для созыва
    const user = typeof rememberChatUserForCalls === 'function'
      ? (rememberChatUserForCalls(ctx, ctx.from) || getUserDB(chat, ctx.from))
      : getUserDB(chat, ctx.from);

    const day = todayKey();
    const type = forcedType || getMessageActivityType(ctx.message);

    user.messages = Number(user.messages || 0) + 1;
    user.xp = Number(user.xp || 0) + 1;

    if (!user.messagesDay) user.messagesDay = {};
    user.messagesDay[day] = Number(user.messagesDay[day] || 0) + 1;

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
        contact: 0,
        location: 0,
        other: 0
      };
    }

    if (!Object.prototype.hasOwnProperty.call(user.messageTypes, type)) {
      user.messageTypes[type] = 0;
    }

    user.messageTypes[type] += 1;

    user.textMessages = Number(user.messageTypes.text || 0);
    user.voiceMessages = Number(user.messageTypes.voice || 0);
    user.circleMessages = Number(user.messageTypes.video_note || 0);
    user.photoMessages = Number(user.messageTypes.photo || 0);
    user.videoMessages = Number(user.messageTypes.video || 0);
    user.stickerMessages = Number(user.messageTypes.sticker || 0);
    user.documentMessages = Number(user.messageTypes.document || 0);
    user.audioMessages = Number(user.messageTypes.audio || 0);
    user.animationMessages = Number(user.messageTypes.animation || 0);

    // Монеты за активность с антифармом
    if (nowTs() - Number(user.lastMessageCoinAt || 0) > 30000) {
      user.balance = Number(user.balance || 0) + 1;
      user.coins = user.balance;
      user.lastMessageCoinAt = nowTs();
    }

    user.canCall = true;
    user.leftChat = false;
    user.lastSeenAt = new Date().toISOString();

    saveDB();

    return user;
  } catch (error) {
    console.error('trackAnyMessageActivity error:', error);
    return null;
  }
}

`;

  if (!code.includes(insertBefore)) {
    console.error("❌ Не нашёл function mainMenuKeyboard()");
    process.exit(1);
  }

  code = code.replace(insertBefore, block + insertBefore);
}

// Добавляем универсальный обработчик ВСЕХ НЕ-ТЕКСТОВЫХ сообщений
const textHandlerMarker = "bot.on('text', async (ctx, next) => {";

if (!code.includes("bot.on('message', async (ctx, next) => {")) {
  const messageHandler = `
bot.on('message', async (ctx, next) => {
  try {
    // Текстовые сообщения обрабатываются ниже в bot.on('text')
    if (ctx.message?.text) return next();

    if (isGroup(ctx)) {
      await trackAnyMessageActivity(ctx);
    }

    return next();
  } catch (error) {
    console.error('message activity handler error:', error);
    return next();
  }
});

`;

  if (!code.includes(textHandlerMarker)) {
    console.error("❌ Не нашёл bot.on('text')");
    process.exit(1);
  }

  code = code.replace(textHandlerMarker, messageHandler + textHandlerMarker);
}

// Исправляем старый подсчёт в bot.on('text'), чтобы не было дублей
const oldCounterRegex = /const chat = getChatDB\(ctx\.chat\.id\);\s*const user = .*?;\s*const day = todayKey\(\);\s*user\.messages \+= 1;\s*user\.xp \+= 1;\s*user\.messagesDay\[day\] = \(user\.messagesDay\[day\] \|\| 0\) \+ 1;\s*if \(nowTs\(\) - \(user\.lastMessageCoinAt \|\| 0\) > 30000\) \{\s*user\.balance \+= 1;\s*user\.lastMessageCoinAt = nowTs\(\);\s*\}\s*saveDB\(\);\s*const rank = await getUserAdminRank\(ctx, ctx\.from\.id\);/;

if (oldCounterRegex.test(code)) {
  code = code.replace(
    oldCounterRegex,
    `const chat = getChatDB(ctx.chat.id);
      const user = await trackAnyMessageActivity(ctx, 'text');
      const rank = await getUserAdminRank(ctx, ctx.from.id);`
  );
} else {
  console.log("⚠️ Старый блок подсчёта текста не найден regex-ом. Возможно, он уже изменён.");
}

// Если у тебя были отдельные обработчики voice/photo/sticker, они не страшны,
// потому что trackAnyMessageActivity защищён от двойного учёта по message_id.

// Обновляем профиль, чтобы показывал разные типы активности
if (!code.includes("📊 <b>Типы активности:</b>")) {
  code = code.replace(
    "🪙 Баланс: <b>${user.balance}</b> монет",
    `🪙 Баланс: <b>\${user.balance}</b> монет

📊 <b>Типы активности:</b>
✍️ Текст: <b>\${user.textMessages || user.messageTypes?.text || 0}</b>
🎙 Голосовые: <b>\${user.voiceMessages || 0}</b>
⭕ Кружки: <b>\${user.circleMessages || 0}</b>
🖼 Фото: <b>\${user.photoMessages || 0}</b>
🎬 Видео: <b>\${user.videoMessages || 0}</b>
😄 Стикеры: <b>\${user.stickerMessages || 0}</b>`
  );
}

fs.writeFileSync(path, code, "utf8");

console.log("✅ Исправлен учёт всей активности");
console.log("✅ Теперь БД запоминает любого, кто отправил любое сообщение");
console.log("✅ Текст, голосовые, фото, видео, стикеры и кружки идут в общий топ");
console.log("✅ Защита от двойного учёта одного сообщения добавлена");
