const fs = require("fs");

const path = "index.js";
let code = fs.readFileSync(path, "utf8");

// ======================================================
// CHAT CLEANUP SYSTEM
// ======================================================

// 1. Добавляем алиасы команды
if (!code.includes("cleanup:       ['cleanup'")) {
  code = code.replace(
    "del:           ['del','удалить'],",
    "del:           ['del','удалить'],\n  cleanup:       ['cleanup','clean','clear','purge','чистка','очистка','почистить'],"
  );
}

// 2. Добавляем хранение ID сообщений в главный message handler
const activityMarker = "// always register user";

if (!code.includes("CLEANUP TRACK MESSAGE")) {
  const trackBlock = `    // CLEANUP TRACK MESSAGE
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

  if (!code.includes(activityMarker)) {
    console.error("❌ Не нашёл место // always register user");
    process.exit(1);
  }

  code = code.replace(activityMarker, trackBlock + activityMarker);
}

// 3. Добавляем функции чистки перед MAIN COMMAND HANDLER
const commandHandlerMarker = "// ═══════════════════════════════════════════════════════════════\n//  MAIN COMMAND HANDLER";

if (!code.includes("async function cleanupMessagesCommand(msg, args)")) {
  const functions = `
function cleanupParseAmount(value, fallback = 20) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.min(Math.floor(n), 200);
}

async function cleanupResolveUser(msg, args) {
  // reply → чистка 50
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

  if (!first || /^\\d+$/.test(first)) {
    // чистка 20 = просто последние 20 сообщений
    if (first && /^\\d+$/.test(first) && args.length === 1) {
      return {
        target: null,
        amount: cleanupParseAmount(first, 20)
      };
    }
  }

  if (first === 'все' || first === 'all') {
    return {
      target: null,
      amount: cleanupParseAmount(args[1], 50)
    };
  }

  // чистка TG_ID 50
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

  // чистка @username 50
  if (first.startsWith('@') || /^[a-zA-Z0-9_]{5,32}$/.test(first)) {
    const username = first.replace(/^@/, '').toLowerCase();
    const chat = getChat(msg.chat.id);

    const stored = Object.values(chat.users || {}).find((u) => {
      return String(u.username || '').toLowerCase() === username;
    });

    if (!stored) {
      return {
        notFoundUsername: username
      };
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

  return {
    target: null,
    amount: cleanupParseAmount(args[0], 20)
  };
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

  // удаляем команду чистки тоже
  await deleteMessageSafe(chatId, msg.message_id);

  for (const item of candidates) {
    const ok = await deleteMessageSafe(chatId, item.messageId);

    if (ok) {
      deleted++;
    } else {
      failed++;
    }

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

  if (!code.includes(commandHandlerMarker)) {
    console.error("❌ Не нашёл MAIN COMMAND HANDLER");
    process.exit(1);
  }

  code = code.replace(commandHandlerMarker, functions + commandHandlerMarker);
}

// 4. Добавляем case в handleCommand
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

// 5. Добавляем в help текст, если получится
code = code.replace(
  "/del /удалить — удалить сообщение",
  "/del /удалить — удалить сообщение\\n/чистка 20 — удалить последние 20 сообщений\\n/чистка @username 50 — удалить сообщения пользователя\\nreply → чистка 50 — удалить сообщения пользователя"
);

fs.writeFileSync(path, code, "utf8");

console.log("✅ Добавлена система очистки чата");
console.log("✅ чистка 20");
console.log("✅ чистка все 50");
console.log("✅ чистка @username 50");
console.log("✅ reply → чистка 50");
