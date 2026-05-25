const fs = require("fs");

const path = "index.js";
let code = fs.readFileSync(path, "utf8");

// ======================================================
// CHAT CLEANUP SYSTEM — FIXED INSTALLER
// ======================================================

// 1. Добавляем алиас команды
if (!code.includes("cleanup:")) {
  code = code.replace(
    "del:           ['del','удалить'],",
    "del:           ['del','удалить'],\n  cleanup:       ['cleanup','clean','clear','purge','чистка','очистка','почистить'],"
  );
}

// 2. Добавляем логирование сообщений после строки "const chatId = msg.chat.id;"
const trackMarker = "const chatId = msg.chat.id;";
if (!code.includes("CLEANUP TRACK MESSAGE")) {
  const index = code.indexOf(trackMarker, code.indexOf("bot.on('message'"));

  if (index === -1) {
    console.error("❌ Не нашёл место для логирования сообщений");
    process.exit(1);
  }

  const insertAfter = index + trackMarker.length;

  const trackBlock = `

    // CLEANUP TRACK MESSAGE
    const cleanChatForTrack = getChat(msg.chat.id, msg.chat.title, msg.chat.type);
    if (!cleanChatForTrack.messageLog) cleanChatForTrack.messageLog = [];

    cleanChatForTrack.messageLog.push({
      messageId: msg.message_id,
      userId: msg.from.id,
      username: msg.from.username || null,
      firstName: msg.from.first_name || '',
      date: msg.date || Math.floor(Date.now() / 1000),
      type: msg.text ? 'text' :
        msg.voice ? 'voice' :
        msg.video_note ? 'circle' :
        msg.photo ? 'photo' :
        msg.video ? 'video' :
        msg.sticker ? 'sticker' :
        msg.document ? 'document' :
        msg.audio ? 'audio' :
        msg.animation ? 'animation' : 'other'
    });

    if (cleanChatForTrack.messageLog.length > 3000) {
      cleanChatForTrack.messageLog = cleanChatForTrack.messageLog.slice(-3000);
    }

    saveDB();
`;

  code = code.slice(0, insertAfter) + trackBlock + code.slice(insertAfter);
}

// 3. Добавляем функции очистки перед handleCommand
const handleMarker = "async function handleCommand";
if (!code.includes("async function cleanupMessagesCommand(msg, args)")) {
  const pos = code.indexOf(handleMarker);

  if (pos === -1) {
    console.error("❌ Не нашёл async function handleCommand");
    process.exit(1);
  }

  const functions = `
function cleanupParseAmount(value, fallback = 20) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.min(Math.floor(n), 200);
}

async function cleanupResolveUser(msg, args) {
  if (msg.reply_to_message?.from) {
    return {
      target: {
        id: Number(msg.reply_to_message.from.id),
        username: msg.reply_to_message.from.username || null,
        firstName: msg.reply_to_message.from.first_name || ''
      },
      amount: cleanupParseAmount(args[0], 50)
    };
  }

  const first = String(args[0] || '').trim();

  if (!first) {
    return { target: null, amount: 20 };
  }

  if (first === 'все' || first === 'all') {
    return { target: null, amount: cleanupParseAmount(args[1], 50) };
  }

  if (/^\\d+$/.test(first) && args.length === 1) {
    return { target: null, amount: cleanupParseAmount(first, 20) };
  }

  if (/^\\d+$/.test(first)) {
    return {
      target: {
        id: Number(first),
        username: null,
        firstName: String(first)
      },
      amount: cleanupParseAmount(args[1], 50)
    };
  }

  if (first.startsWith('@') || /^[a-zA-Z0-9_]{5,32}$/.test(first)) {
    const username = first.replace(/^@/, '').toLowerCase();
    const chat = getChat(msg.chat.id);

    const stored = Object.values(chat.users || {}).find((u) => {
      return String(u.username || '').toLowerCase() === username;
    });

    if (!stored) {
      return { notFoundUsername: username };
    }

    return {
      target: {
        id: Number(stored.id),
        username: stored.username || username,
        firstName: stored.firstName || stored.username || String(stored.id)
      },
      amount: cleanupParseAmount(args[1], 50)
    };
  }

  return { target: null, amount: cleanupParseAmount(args[0], 20) };
}

async function deleteMessageSafe(chatId, messageId) {
  try {
    await bot.deleteMessage(chatId, messageId);
    return true;
  } catch (_) {
    return false;
  }
}

async function cleanupMessagesCommand(msg, args) {
  if (!await guardGroup(msg)) return;
  if (!await guardRank(msg, 60)) return;

  const chatId = msg.chat.id;
  const chat = getChat(chatId);

  if (!chat.messageLog) chat.messageLog = [];

  const parsed = await cleanupResolveUser(msg, args);

  if (parsed?.notFoundUsername) {
    await replyTo(
      msg,
      '❌ <b>Пользователь @' + esc(parsed.notFoundUsername) + ' не найден в базе.</b>\\n\\n' +
      'Пусть он напишет сообщение в чат, или используй reply / TG ID.'
    );
    return;
  }

  const amount = parsed.amount || 20;
  const target = parsed.target || null;

  let candidates = [...chat.messageLog].reverse();

  if (target) {
    candidates = candidates.filter((m) => Number(m.userId) === Number(target.id));
  }

  candidates = candidates.slice(0, amount);

  if (!candidates.length) {
    await replyTo(
      msg,
      target
        ? '❌ Не нашёл сообщений этого пользователя в базе чистки.'
        : '❌ В базе чистки пока нет сообщений.'
    );
    return;
  }

  let deleted = 0;
  let failed = 0;

  await deleteMessageSafe(chatId, msg.message_id);

  for (const item of candidates) {
    const ok = await deleteMessageSafe(chatId, item.messageId);
    if (ok) deleted++;
    else failed++;

    await new Promise((resolve) => setTimeout(resolve, 60));
  }

  const deletedIds = new Set(candidates.map((m) => m.messageId));
  chat.messageLog = chat.messageLog.filter((m) => !deletedIds.has(m.messageId));
  saveDB();

  const targetText = target
    ? '👤 Пользователь: ' + (target.username ? '@' + esc(target.username) : esc(target.firstName || String(target.id))) + '\\n'
    : '👥 Режим: последние сообщения чата\\n';

  const report = await bot.sendMessage(
    chatId,
    '🧹 <b>Очистка завершена</b>\\n\\n' +
    targetText +
    '✅ Удалено: <b>' + deleted + '</b>\\n' +
    '⚠️ Не удалось: <b>' + failed + '</b>\\n\\n' +
    '━━━━━━━━━━━━━━\\n' +
    'Удаляются только сообщения, которые бот видел и которые Telegram разрешает удалить.',
    { parse_mode: 'HTML' }
  );

  setTimeout(() => {
    bot.deleteMessage(chatId, report.message_id).catch(() => {});
  }, 10000);
}

`;

  code = code.slice(0, pos) + functions + code.slice(pos);
}

// 4. Добавляем case cleanup перед case del
if (!code.includes("case 'cleanup':")) {
  const marker = "  case 'del': {";

  if (!code.includes(marker)) {
    console.error("❌ Не нашёл case 'del'");
    process.exit(1);
  }

  const cleanupCase = `  case 'cleanup': {
    await cleanupMessagesCommand(msg, args);
    break;
  }

`;

  code = code.replace(marker, cleanupCase + marker);
}

fs.writeFileSync(path, code, "utf8");

console.log("✅ Система очистки чата установлена");
console.log("✅ Команды: чистка 20 / чистка все 50 / чистка @username 50 / reply → чистка 50");
