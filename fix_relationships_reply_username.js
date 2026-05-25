const fs = require("fs");

const path = "index.js";
let code = fs.readFileSync(path, "utf8");

// ======================================================
// FIX: отношения reply + отношения @username
// ======================================================

// 1) Расширяем алиасы: love должен ловить отношения/отношение
code = code.replace(
  /love:\s*\[[^\]]+\],/,
  "love:          ['love','любовь','отношения','отношение','relation','relationship'],"
);

// 2) Делаем resolveTarget: reply / ID / @username из БД
let start = code.indexOf("async function resolveTarget(msg, args, chatId) {");
let end = code.indexOf("function isGroup(msg)", start);

if (start === -1 || end === -1) {
  console.error("❌ Не нашёл resolveTarget или function isGroup");
  process.exit(1);
}

const newResolveTarget = `async function resolveTarget(msg, args = [], chatId) {
  // 1) По ответу на сообщение
  if (msg.reply_to_message && msg.reply_to_message.from) {
    const u = msg.reply_to_message.from;

    return {
      id: Number(u.id),
      firstName: u.first_name || u.firstName || String(u.id),
      username: u.username || null,
      user: u,
      args
    };
  }

  const firstArg = String(args[0] || '').trim();

  if (!firstArg) return null;

  // 2) По TG ID
  if (/^\\d+$/.test(firstArg)) {
    const id = Number(firstArg);
    const restArgs = args.slice(1);

    try {
      const member = await bot.getChatMember(chatId, id);

      if (member && member.user) {
        return {
          id: Number(member.user.id),
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
        id: Number(stored.id || id),
        firstName: stored.firstName || stored.first_name || stored.username || String(id),
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

  // 3) По @username или username
  // Важно: Telegram Bot API не ищет любого человека по username сам.
  // Поэтому ищем в БД этой беседы: человек должен был хоть раз написать в чат.
  if (firstArg.startsWith('@') || /^[a-zA-Z0-9_]{5,32}$/.test(firstArg)) {
    const usernameRaw = firstArg.replace(/^@/, '').toLowerCase();

    if (/^[a-zA-Z0-9_]{5,32}$/.test(usernameRaw)) {
      const chat = getChat(chatId);

      const stored = Object.values(chat.users || {}).find((u) => {
        return String(u.username || '').toLowerCase() === usernameRaw;
      });

      if (stored && stored.id) {
        return {
          id: Number(stored.id),
          firstName: stored.firstName || stored.first_name || stored.username || String(stored.id),
          username: stored.username || usernameRaw,
          user: null,
          args: args.slice(1)
        };
      }

      return {
        notFoundUsername: usernameRaw,
        args: args.slice(1)
      };
    }
  }

  return null;
}

`;

code = code.slice(0, start) + newResolveTarget + code.slice(end);

// 3) Добавляем красивую ошибку в guardTarget, чтобы не было "Без имени"
start = code.indexOf("async function guardTarget(msg, args, chatId) {");
end = code.indexOf("async function guardCanPunish", start);

if (start !== -1 && end !== -1) {
  const newGuardTarget = `async function guardTarget(msg, args, chatId) {
  const t = await resolveTarget(msg, args, chatId);

  if (t?.notFoundUsername) {
    await replyTo(
      msg,
      '❌ <b>Пользователь @' + esc(t.notFoundUsername) + ' не найден в базе этой беседы.</b>\\n\\n' +
      'Чтобы бот нашёл человека по username, он должен хотя бы 1 раз написать сообщение в чат.\\n\\n' +
      'Можно использовать:\\n' +
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

  code = code.slice(0, start) + newGuardTarget + code.slice(end);
}

// 4) Полностью заменяем case love,
// чтобы он работал с reply, TG ID и @username, а не только reply
start = code.indexOf("  case 'love': {");
end = code.indexOf("  case 'couple':", start);

if (start === -1 || end === -1) {
  console.error("❌ Не нашёл case love или case couple");
  process.exit(1);
}

const newLoveCase = `  case 'love': {
    if (!await guardGroup(msg)) return;

    const t = await resolveTarget(msg, args, chatId);

    if (t?.notFoundUsername) {
      await replyTo(
        msg,
        '❌ <b>Пользователь @' + esc(t.notFoundUsername) + ' не найден в базе этой беседы.</b>\\n\\n' +
        'Пусть человек напишет любое сообщение в чат, потом повтори:\\n' +
        '<code>отношения @' + esc(t.notFoundUsername) + '</code>\\n\\n' +
        'Или используй reply на его сообщение.'
      );
      return;
    }

    if (!t || !t.id) {
      await replyTo(
        msg,
        '❌ <b>Укажи человека</b>\\n\\n' +
        'Можно так:\\n' +
        '• reply на сообщение → <code>отношения</code>\\n' +
        '• <code>отношения @username</code>\\n' +
        '• <code>отношения TG_ID</code>'
      );
      return;
    }

    if (Number(t.id) === Number(msg.from.id)) {
      await replyTo(msg, '😅 С самим собой отношения создать нельзя.');
      return;
    }

    if (Number(t.id) === Number(_botId)) {
      await replyTo(msg, '🤖 Со мной нельзя, я пока просто бот.');
      return;
    }

    const chat = getChat(chatId);
    if (!chat.couples) chat.couples = {};
    if (!chat.pendingLoveRequests) chat.pendingLoveRequests = {};

    const fromUser = getUser(chatId, msg.from.id, msg.from.first_name, msg.from.username);
    const toUser = getUser(chatId, t.id, t.firstName, t.username);

    const fromId = String(fromUser.id);
    const toId = String(toUser.id);

    if (fromUser.couple || chat.couples[fromId]) {
      await replyTo(msg, '❌ У тебя уже есть пара. Сначала напиши: <code>расстаться</code>');
      return;
    }

    if (toUser.couple || chat.couples[toId]) {
      await replyTo(msg, '❌ У этого пользователя уже есть пара.');
      return;
    }

    const requestId = 'love_' + Date.now().toString(36) + '_' + Math.floor(Math.random() * 99999).toString(36);

    chat.pendingLoveRequests[requestId] = {
      id: requestId,
      fromId: Number(fromUser.id),
      toId: Number(toUser.id),
      fromName: fromUser.firstName || fromUser.username || ('ID ' + fromUser.id),
      toName: toUser.firstName || toUser.username || ('ID ' + toUser.id),
      createdAt: Date.now()
    };

    saveDB();

    const toName = toUser.firstName || toUser.username || ('ID ' + toUser.id);
    const fromName = fromUser.firstName || fromUser.username || ('ID ' + fromUser.id);

    await replyTo(
      msg,
      '❤️ <b>Предложение отношений</b>\\n\\n' +
      '👤 <a href="tg://user?id=' + fromUser.id + '">' + esc(fromName) + '</a>\\n' +
      '💌 предлагает <a href="tg://user?id=' + toUser.id + '">' + esc(toName) + '</a>\\n\\n' +
      '✨ <b>' + esc(toName) + '</b>, согласна/согласен стать парой?\\n\\n' +
      '💭 Решение только за тобой — можно принять или красиво отказаться.\\n' +
      '⏳ Заявка активна 24 часа.\\n' +
      '🔒 Нажать кнопки может только тот, кому отправили предложение.',
      {
        reply_markup: {
          inline_keyboard: [
            [{ text: '❤️ Принять отношения', callback_data: 'love_req:' + requestId + ':yes' }],
            [{ text: '💔 Отказаться', callback_data: 'love_req:' + requestId + ':no' }]
          ]
        }
      }
    );

    break;
  }

`;

code = code.slice(0, start) + newLoveCase + code.slice(end);

// 5) Добавляем callback обработчик love_req, если его нет
let cbStart = code.indexOf("bot.on('callback_query', async (query) => {");

if (cbStart === -1) {
  console.error("❌ Не нашёл bot.on('callback_query')");
  process.exit(1);
}

if (!code.includes("data.startsWith('love_req:')")) {
  const insertAt = code.indexOf("try {", cbStart);

  if (insertAt === -1) {
    console.error("❌ Не нашёл try внутри callback_query");
    process.exit(1);
  }

  const callbackBlock = `
    const data = query.data || '';
    const msg = query.message;
    const chatId = msg?.chat?.id;
    const userId = query.from.id;

    if (data.startsWith('love_req:')) {
      const parts = data.split(':');
      const requestId = parts[1];
      const action = parts[2];

      const chat = getChat(chatId);
      if (!chat.couples) chat.couples = {};
      if (!chat.pendingLoveRequests) chat.pendingLoveRequests = {};

      const request = chat.pendingLoveRequests[requestId];

      if (!request) {
        await bot.answerCallbackQuery(query.id, { text: '❌ Заявка устарела.' }).catch(() => {});
        return;
      }

      if (Number(request.toId) !== Number(userId)) {
        await bot.answerCallbackQuery(query.id, { text: '❌ Эта заявка не для тебя.' }).catch(() => {});
        return;
      }

      if (Date.now() - Number(request.createdAt || 0) > 24 * 60 * 60 * 1000) {
        delete chat.pendingLoveRequests[requestId];
        saveDB();

        await bot.answerCallbackQuery(query.id, { text: '⏳ Заявка истекла.' }).catch(() => {});
        await bot.editMessageText('⏳ Заявка на отношения устарела и больше недоступна.', {
          chat_id: chatId,
          message_id: msg.message_id,
          parse_mode: 'HTML'
        }).catch(() => {});
        return;
      }

      const fromUser = getUser(chatId, request.fromId);
      const toUser = getUser(chatId, request.toId);

      if (action === 'no') {
        delete chat.pendingLoveRequests[requestId];
        saveDB();

        await bot.answerCallbackQuery(query.id, { text: '💔 Отклонено.' }).catch(() => {});
        await bot.editMessageText(
          '💔 <b>Предложение отношений отклонено</b>\\n\\n' +
          '<a href="tg://user?id=' + toUser.id + '">' + esc(toUser.firstName || toUser.username || ('ID ' + toUser.id)) + '</a> отказался/отказалась от предложения.',
          {
            chat_id: chatId,
            message_id: msg.message_id,
            parse_mode: 'HTML'
          }
        ).catch(() => {});
        return;
      }

      if (fromUser.couple || toUser.couple || chat.couples[String(fromUser.id)] || chat.couples[String(toUser.id)]) {
        delete chat.pendingLoveRequests[requestId];
        saveDB();

        await bot.answerCallbackQuery(query.id, { text: '❌ У кого-то уже есть пара.' }).catch(() => {});
        await bot.editMessageText('❌ Заявка больше недоступна: у одного из пользователей уже есть пара.', {
          chat_id: chatId,
          message_id: msg.message_id,
          parse_mode: 'HTML'
        }).catch(() => {});
        return;
      }

      fromUser.couple = String(toUser.id);
      toUser.couple = String(fromUser.id);
      chat.couples[String(fromUser.id)] = String(toUser.id);
      chat.couples[String(toUser.id)] = String(fromUser.id);

      fromUser.balance = Number(fromUser.balance || 0) + 20;
      toUser.balance = Number(toUser.balance || 0) + 20;

      delete chat.pendingLoveRequests[requestId];
      saveDB();

      await bot.answerCallbackQuery(query.id, { text: '❤️ Теперь вы пара!' }).catch(() => {});

      await bot.editMessageText(
        '❤️ <b>Новая пара в беседе!</b>\\n\\n' +
        '<a href="tg://user?id=' + fromUser.id + '">' + esc(fromUser.firstName || fromUser.username || ('ID ' + fromUser.id)) + '</a> и ' +
        '<a href="tg://user?id=' + toUser.id + '">' + esc(toUser.firstName || toUser.username || ('ID ' + toUser.id)) + '</a> теперь вместе!\\n\\n' +
        '💍 Пусть всё будет красиво, спокойно и по взаимности.\\n' +
        '🎁 Бонус каждому: <b>+20 монет</b>',
        {
          chat_id: chatId,
          message_id: msg.message_id,
          parse_mode: 'HTML'
        }
      ).catch(() => {});

      return;
    }

`;

  code = code.slice(0, insertAt + "try {".length) + callbackBlock + code.slice(insertAt + "try {".length);
}

fs.writeFileSync(path, code, "utf8");

console.log("✅ Исправлено: отношения reply");
console.log("✅ Исправлено: отношения @username");
console.log("✅ Исправлено: отношения TG_ID");
console.log("✅ Пара создаётся только после кнопки Принять");
