const fs = require("fs");

const path = "index.js";
let code = fs.readFileSync(path, "utf8");

// ======================================================
// 1. Добавляем функции БД для созыва
// ======================================================

const insertBefore = "function mainMenuKeyboard() {";

if (!code.includes("function rememberChatUserForCalls(ctx, userLike)")) {
  const helpers = `
function rememberChatUserForCalls(ctx, userLike) {
  if (!ctx || !ctx.chat || !userLike || userLike.is_bot) return null;

  const chat = getChatDB(ctx.chat.id);
  const user = getUserDB(chat, userLike);

  user.id = Number(userLike.id);
  user.firstName = userLike.first_name || userLike.firstName || user.firstName || '';
  user.username = userLike.username || user.username || '';
  user.isBot = Boolean(userLike.is_bot);
  user.canCall = true;
  user.leftChat = false;
  user.chatId = ctx.chat.id;
  user.chatTitle = ctx.chat.title || chat.title || 'эта беседа';
  user.lastSeenAt = new Date().toISOString();

  if (!user.firstSeenAt) {
    user.firstSeenAt = new Date().toISOString();
  }

  return user;
}

function markUserLeftChat(ctx, userLike) {
  if (!ctx || !ctx.chat || !userLike) return;

  const chat = getChatDB(ctx.chat.id);
  const user = getUserDB(chat, userLike);

  user.leftChat = true;
  user.canCall = false;
  user.leftAt = new Date().toISOString();

  saveDB();
}

function getCallableUsersFromDB(chat, mode = 'all') {
  let users = Object.values(chat.users || {});

  users = users.filter((u) => {
    if (!u) return false;
    if (!u.id) return false;
    if (u.isBot) return false;
    if (u.leftChat) return false;
    if (u.canCall === false) return false;
    return true;
  });

  if (mode === 'admins') {
    users = users.filter((u) => {
      const rank = Number(u.adminRank || chat.admins[String(u.id)] || 0);
      return rank >= 10;
    });
  }

  if (mode === 'owners') {
    users = users.filter((u) => {
      const rank = Number(u.adminRank || chat.admins[String(u.id)] || 0);
      return rank >= 95 || Number(u.id) === OWNER_ID;
    });
  }

  const unique = new Map();

  for (const user of users) {
    unique.set(String(user.id), user);
  }

  return Array.from(unique.values());
}

`;

  if (!code.includes(insertBefore)) {
    console.error("❌ Не нашёл function mainMenuKeyboard()");
    process.exit(1);
  }

  code = code.replace(insertBefore, helpers + insertBefore);
}

// ======================================================
// 2. Исправляем обработку каждого сообщения:
// если человек написал — сразу сохраняем в БД для созыва
// ======================================================

code = code.replace(
  "const user = getUserDB(chat, ctx.from);",
  "const user = rememberChatUserForCalls(ctx, ctx.from) || getUserDB(chat, ctx.from);"
);

// Если замена произошла несколько раз — это нормально.
// Но если вдруг функция уже была вставлена вручную, повторов быть не должно.
code = code.replaceAll(
  "const user = rememberChatUserForCalls(ctx, ctx.from) || rememberChatUserForCalls(ctx, ctx.from) || getUserDB(chat, ctx.from);",
  "const user = rememberChatUserForCalls(ctx, ctx.from) || getUserDB(chat, ctx.from);"
);

// ======================================================
// 3. Исправляем новых участников:
// при входе в чат тоже сохраняем в БД
// ======================================================

code = code.replace(
  "const u = getUserDB(chat, member); u.balance += 25;",
  "const u = rememberChatUserForCalls(ctx, member) || getUserDB(chat, member); u.canCall = true; u.leftChat = false; u.balance += 25;"
);

// ======================================================
// 4. Исправляем вышедших участников:
// если человек вышел, не созываем его
// ======================================================

const leftMarker = "const member = ctx.message.left_chat_member;";
if (code.includes(leftMarker) && !code.includes("markUserLeftChat(ctx, member);")) {
  code = code.replace(
    leftMarker,
    leftMarker + "\n    markUserLeftChat(ctx, member);"
  );
}

// ======================================================
// 5. Исправляем сам созыв:
// теперь берём всех известных пользователей из БД,
// даже если они сейчас не онлайн
// ======================================================

const callStart = code.indexOf("async function sendCallByModeButton(ctx, mode) {");
const callEnd = code.indexOf("bot.action(/^call:(all|admins|owners|cancel):", callStart);

if (callStart !== -1 && callEnd !== -1) {
  const newCallFunction = `async function sendCallByModeButton(ctx, mode) {
  const chatId = ctx.chat.id;
  const chat = getChatDB(chatId);

  let minRank = 40;

  if (mode === 'all') minRank = 60;
  if (mode === 'admins') minRank = 40;
  if (mode === 'owners') minRank = 80;

  const userRank = await getUserAdminRank(ctx, ctx.from.id);

  if (userRank < minRank) {
    return ctx.telegram.sendMessage(
      chatId,
      \`❌ Недостаточно прав.\\n\\nТвой ранг: \${rankInfo(userRank).title}\\nНужный ранг: \${rankInfo(minRank).title}\`,
      { parse_mode: 'HTML' }
    );
  }

  const now = nowTs();
  const lastCall = chat.lastCallAt || 0;
  const cooldown = 10 * 60 * 1000;

  if (now - lastCall < cooldown) {
    const left = Math.ceil((cooldown - (now - lastCall)) / 60000);

    return ctx.telegram.sendMessage(
      chatId,
      \`⏳ Созыв уже был недавно. Подожди ещё \${left} мин.\`
    );
  }

  // Берём людей из БД:
  // написал сообщение / вошёл в чат / добавлен через запомнить / админ после обновитьадминов
  let users = getCallableUsersFromDB(chat, mode);

  if (!users.length) {
    return ctx.telegram.sendMessage(
      chatId,
      '❌ Некого созывать.\\n\\nБот ещё не знает участников этой категории.\\n\\nЧтобы бот запомнил человека:\\n• человек должен написать любое сообщение;\\n• или ответь на его сообщение: запомнить;\\n• или добавь по ID: запомнить 123456789 Имя;\\n• для админов: обновитьадминов'
    );
  }

  chat.lastCallAt = now;
  saveDB();

  const title =
    mode === 'all'
      ? '👥 Все участники из базы'
      : mode === 'admins'
        ? '🛡 Администрация из базы'
        : '👑 Владельцы из базы';

  await ctx.telegram.sendMessage(
    chatId,
    \`📢 <b>Созыв: \${title}</b>\\n\\n👮 Созвал: \${mentionUser(ctx.from)}\\n👥 Найдено в БД: <b>\${users.length}</b>\`,
    { parse_mode: 'HTML' }
  );

  for (let i = 0; i < users.length; i += 25) {
    const chunk = users.slice(i, i + 25);

    const mentions = chunk
      .map((u) => {
        const name = u.firstName || u.username || \`ID \${u.id}\`;
        return mentionById(u.id, name);
      })
      .join(' ');

    await ctx.telegram.sendMessage(chatId, mentions, { parse_mode: 'HTML' });
  }
}

`;

  code = code.slice(0, callStart) + newCallFunction + code.slice(callEnd);
} else {
  console.log("⚠️ sendCallByModeButton не найден. Возможно, у тебя другая версия кода.");
}

// ======================================================
// 6. Добавляем команду проверки базы
// ======================================================

code = code.replace(
  "help: ['help', 'помощь', 'commands', 'команды'],",
  "help: ['help', 'помощь', 'commands', 'команды'],\n  basedb: ['база', 'db', 'бд', 'участникибаза'],"
);

const callCommandMarker = "  if (command === 'call') {";

if (!code.includes("if (command === 'basedb') {")) {
  const dbCommandBlock = `  if (command === 'basedb') {
    if (!(await requireGroup(ctx))) return;

    const users = getCallableUsersFromDB(chat, 'all');
    const admins = getCallableUsersFromDB(chat, 'admins');
    const owners = getCallableUsersFromDB(chat, 'owners');

    return ctx.reply(
      \`📦 <b>База этой беседы</b>\\n\\n👥 Всего для созыва: <b>\${users.length}</b>\\n🛡 Админов: <b>\${admins.length}</b>\\n👑 Владельцев: <b>\${owners.length}</b>\\n\\nЕсли человек написал хоть 1 сообщение — он автоматически сохраняется в БД и его можно созывать даже оффлайн.\`,
      { parse_mode: 'HTML' }
    );
  }

`;

  if (code.includes(callCommandMarker)) {
    code = code.replace(callCommandMarker, dbCommandBlock + callCommandMarker);
  }
}

fs.writeFileSync(path, code, "utf8");

console.log("✅ БД для созыва исправлена");
console.log("✅ Теперь каждый написавший сообщение автоматически сохраняется");
console.log("✅ Созыв берёт людей из БД, даже если они оффлайн");
console.log("✅ Добавлена команда: база");
