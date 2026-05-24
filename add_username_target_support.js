const fs = require("fs");

const path = "index.js";
let code = fs.readFileSync(path, "utf8");

const start = code.indexOf("async function resolveTarget(msg, args = [], chatId) {");
let end = code.indexOf("function isGroup(msg)", start);

if (start === -1) {
  // Если у тебя старая версия resolveTarget без args = []
  const oldStart = code.indexOf("async function resolveTarget(msg, args, chatId) {");
  end = code.indexOf("function isGroup(msg)", oldStart);

  if (oldStart === -1 || end === -1) {
    console.error("❌ Не нашёл resolveTarget или isGroup");
    process.exit(1);
  }

  var realStart = oldStart;
} else {
  var realStart = start;
}

const newResolveTarget = `async function resolveTarget(msg, args = [], chatId) {
  // 1) По ответу на сообщение
  if (msg.reply_to_message && msg.reply_to_message.from) {
    const u = msg.reply_to_message.from;

    return {
      id: u.id,
      firstName: u.first_name || u.firstName || String(u.id),
      username: u.username || null,
      user: u,
      args
    };
  }

  const firstArg = String(args[0] || '').trim();

  // 2) По Telegram ID
  if (firstArg && /^\\d+$/.test(firstArg)) {
    const id = parseInt(firstArg, 10);
    const restArgs = args.slice(1);

    try {
      const member = await bot.getChatMember(chatId, id);

      if (member && member.user) {
        return {
          id: member.user.id,
          firstName: member.user.first_name || String(id),
          username: member.user.username || null,
          user: member.user,
          args: restArgs
        };
      }
    } catch (_) {}

    const chat = getChat(chatId);
    const stored = chat.users?.[String(id)];

    if (stored) {
      return {
        id,
        firstName: stored.firstName || String(id),
        username: stored.username || null,
        user: null,
        args: restArgs
      };
    }

    return {
      id,
      firstName: String(id),
      username: null,
      user: null,
      args: restArgs
    };
  }

  // 3) По Telegram username: @username или username
  // Важно: бот может найти username только если человек уже есть в БД этой беседы.
  if (firstArg) {
    const usernameRaw = firstArg.replace(/^@/, '').toLowerCase();

    // Не пытаемся искать обычные слова без @, если это явно не username.
    // Но для удобства поддерживаем и @username, и username.
    if (/^[a-zA-Z0-9_]{5,32}$/.test(usernameRaw)) {
      const chat = getChat(chatId);

      const stored = Object.values(chat.users || {}).find((u) => {
        return String(u.username || '').toLowerCase() === usernameRaw;
      });

      if (stored) {
        return {
          id: stored.id,
          firstName: stored.firstName || stored.first_name || stored.username || String(stored.id),
          username: stored.username || null,
          user: null,
          args: args.slice(1)
        };
      }

      // Если username не найден в БД — объясним пользователю красиво через null.
      return {
        notFoundUsername: usernameRaw,
        args: args.slice(1)
      };
    }
  }

  return null;
}

`;

code = code.slice(0, realStart) + newResolveTarget + code.slice(end);

// Улучшаем guardTarget, чтобы красиво объяснял, если @username не найден в БД
const guardStart = code.indexOf("async function guardTarget(msg, args, chatId) {");
const guardEnd = code.indexOf("async function guardCanPunish", guardStart);

if (guardStart !== -1 && guardEnd !== -1) {
  const newGuardTarget = `async function guardTarget(msg, args, chatId) {
  const t = await resolveTarget(msg, args, chatId);

  if (t?.notFoundUsername) {
    await replyTo(
      msg,
      '❌ <b>Пользователь @' + esc(t.notFoundUsername) + ' не найден в БД этой беседы.</b>\\n\\n' +
      'Чтобы бот нашёл человека по username, он должен хотя бы 1 раз написать сообщение в чат.\\n\\n' +
      'Можно также использовать:\\n' +
      '• reply на сообщение пользователя;\\n' +
      '• TG ID пользователя.'
    );
    return null;
  }

  if (!t) {
    await replyTo(
      msg,
      '❌ <b>Пользователь не указан</b>\\n\\n' +
      'Можно использовать:\\n' +
      '• reply на сообщение;\\n' +
      '• TG ID;\\n' +
      '• @username, если пользователь есть в БД.'
    );
    return null;
  }

  return t;
}

`;

  code = code.slice(0, guardStart) + newGuardTarget + code.slice(guardEnd);
}

// Улучшаем подсказки в социальных функциях, если они есть
code = code.replaceAll(
  'отношения ID',
  'отношения @username / ID'
);

code = code.replaceAll(
  'дружба ID',
  'дружба @username / ID'
);

code = code.replaceAll(
  'раздружиться ID',
  'раздружиться @username / ID'
);

fs.writeFileSync(path, code, "utf8");

console.log("✅ Добавлен поиск пользователей по @username");
console.log("✅ Теперь команды работают по reply, TG ID и @username");
console.log("⚠️ @username работает, если пользователь уже есть в БД бота");
