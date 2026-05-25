const fs = require("fs");

const path = "index.js";
let code = fs.readFileSync(path, "utf8");

const insertBefore = "bot.on('message', async (msg) => {";

if (!code.includes(insertBefore)) {
  console.error("❌ Не нашёл главный bot.on('message')");
  process.exit(1);
}

if (!code.includes("RELATIONSHIP REQUEST FIX V2")) {
  const block = `
// ======================================================
// RELATIONSHIP REQUEST FIX V2
// Отношения через reply / @username / TG ID
// ======================================================

function relFixMention(id, name) {
  return '<a href="tg://user?id=' + id + '">' + esc(name || ('ID ' + id)) + '</a>';
}

function relFixEnsureSocial(chat) {
  if (!chat.couples) chat.couples = {};
  if (!chat.pendingRelationshipRequests) chat.pendingRelationshipRequests = {};
  return chat;
}

async function relFixResolveTarget(msg, rawArg) {
  const chatId = msg.chat.id;

  // 1. Reply на сообщение
  if (msg.reply_to_message && msg.reply_to_message.from && !msg.reply_to_message.from.is_bot) {
    const u = msg.reply_to_message.from;

    return {
      id: Number(u.id),
      firstName: u.first_name || u.username || String(u.id),
      username: u.username || null
    };
  }

  const arg = String(rawArg || '').trim();

  if (!arg) return null;

  // 2. TG ID
  if (/^\\d+$/.test(arg)) {
    const id = Number(arg);

    try {
      const member = await bot.getChatMember(chatId, id);

      if (member && member.user) {
        return {
          id: Number(member.user.id),
          firstName: member.user.first_name || member.user.username || String(id),
          username: member.user.username || null
        };
      }
    } catch (_) {}

    const chat = getChat(chatId);
    const stored = chat.users?.[String(id)];

    if (stored) {
      return {
        id: Number(stored.id || id),
        firstName: stored.firstName || stored.username || String(id),
        username: stored.username || null
      };
    }

    return {
      id,
      firstName: String(id),
      username: null
    };
  }

  // 3. @username
  const username = arg.replace(/^@/, '').toLowerCase();

  if (/^[a-zA-Z0-9_]{5,32}$/.test(username)) {
    const chat = getChat(chatId);

    const stored = Object.values(chat.users || {}).find((u) => {
      return String(u.username || '').toLowerCase() === username;
    });

    if (stored && stored.id) {
      return {
        id: Number(stored.id),
        firstName: stored.firstName || stored.username || String(stored.id),
        username: stored.username || username
      };
    }

    return {
      notFoundUsername: username
    };
  }

  return null;
}

async function relFixStartRequest(msg, rawArg) {
  try {
    if (!isGroup(msg)) return;

    const chatId = msg.chat.id;
    const chat = relFixEnsureSocial(getChat(chatId, msg.chat.title, msg.chat.type));

    const target = await relFixResolveTarget(msg, rawArg);

    if (target?.notFoundUsername) {
      await replyTo(
        msg,
        '❌ <b>Пользователь @' + esc(target.notFoundUsername) + ' не найден в базе этой беседы.</b>\\n\\n' +
        'Чтобы предложить отношения по username, человек должен хотя бы 1 раз написать сообщение в этот чат.\\n\\n' +
        'Лучший вариант: ответь на его сообщение и напиши <code>отношения</code>.'
      );
      return;
    }

    if (!target || !target.id) {
      await replyTo(
        msg,
        '❌ <b>Укажи человека</b>\\n\\n' +
        'Можно так:\\n' +
        '• ответь на сообщение: <code>отношения</code>\\n' +
        '• <code>отношения @username</code>\\n' +
        '• <code>отношения TG_ID</code>'
      );
      return;
    }

    if (Number(target.id) === Number(msg.from.id)) {
      await replyTo(msg, '😅 С самим собой отношения создать нельзя.');
      return;
    }

    if (Number(target.id) === Number(_botId)) {
      await replyTo(msg, '🤖 Со мной нельзя, я пока просто бот.');
      return;
    }

    const fromUser = getUser(chatId, msg.from.id, msg.from.first_name, msg.from.username);
    const toUser = getUser(chatId, target.id, target.firstName, target.username);

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

    const requestId = 'rel_' + Date.now().toString(36) + '_' + Math.floor(Math.random() * 99999).toString(36);

    chat.pendingRelationshipRequests[requestId] = {
      id: requestId,
      fromId: Number(fromUser.id),
      toId: Number(toUser.id),
      fromName: fromUser.firstName || fromUser.username || ('ID ' + fromUser.id),
      toName: toUser.firstName || toUser.username || ('ID ' + toUser.id),
      createdAt: Date.now()
    };

    saveDB();

    await replyTo(
      msg,
      '❤️ <b>Предложение отношений</b>\\n\\n' +
      '👤 ' + relFixMention(fromUser.id, fromUser.firstName || fromUser.username) + '\\n' +
      '💌 предлагает ' + relFixMention(toUser.id, toUser.firstName || toUser.username) + '\\n\\n' +
      '✨ <b>' + esc(toUser.firstName || toUser.username || ('ID ' + toUser.id)) + '</b>, согласна/согласен стать парой?\\n\\n' +
      '💭 Решение только за тобой — можно принять или красиво отказаться.\\n' +
      '⏳ Заявка активна 24 часа.\\n' +
      '🔒 Нажать кнопки может только тот, кому отправили предложение.',
      {
        reply_markup: {
          inline_keyboard: [
            [{ text: '❤️ Принять отношения', callback_data: 'relfix:' + requestId + ':yes' }],
            [{ text: '💔 Отказаться', callback_data: 'relfix:' + requestId + ':no' }]
          ]
        }
      }
    );
  } catch (error) {
    console.error('relFixStartRequest error:', error.message);
    await replyTo(msg, '❌ Ошибка при создании заявки отношений.');
  }
}

// Ловим отношения отдельным обработчиком, чтобы не зависеть от старого parseCommand
bot.onText(/^\\/?(?:отношения|отношение|любовь|love)(?:@[a-zA-Z0-9_]+)?(?:\\s+(.+))?$/i, async (msg, match) => {
  if (!msg.from || msg.from.is_bot) return;
  if (!isGroup(msg)) return;

  const rawArg = match && match[1] ? match[1].trim() : '';

  await relFixStartRequest(msg, rawArg);
});

`;

  code = code.replace(insertBefore, block + "\n" + insertBefore);
}

const callbackMarker = "bot.on('callback_query', async (query) => {";

if (!code.includes(callbackMarker)) {
  console.error("❌ Не нашёл bot.on('callback_query')");
  process.exit(1);
}

if (!code.includes("RELATIONSHIP CALLBACK FIX V2")) {
  const callbackBlock = `
    // ======================================================
    // RELATIONSHIP CALLBACK FIX V2
    // ======================================================
    if (data.startsWith('relfix:')) {
      const parts = data.split(':');
      const requestId = parts[1];
      const action = parts[2];

      const chat = relFixEnsureSocial(getChat(chatId));
      const request = chat.pendingRelationshipRequests?.[requestId];

      if (!request) {
        await bot.answerCallbackQuery(query.id, { text: '❌ Заявка устарела.' }).catch(() => {});
        return;
      }

      if (Number(request.toId) !== Number(userId)) {
        await bot.answerCallbackQuery(query.id, { text: '❌ Эта заявка не для тебя.' }).catch(() => {});
        return;
      }

      if (Date.now() - Number(request.createdAt || 0) > 24 * 60 * 60 * 1000) {
        delete chat.pendingRelationshipRequests[requestId];
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
        delete chat.pendingRelationshipRequests[requestId];
        saveDB();

        await bot.answerCallbackQuery(query.id, { text: '💔 Отклонено.' }).catch(() => {});

        await bot.editMessageText(
          '💔 <b>Предложение отношений отклонено</b>\\n\\n' +
          relFixMention(toUser.id, toUser.firstName || toUser.username) +
          ' отказался/отказалась от предложения.',
          {
            chat_id: chatId,
            message_id: msg.message_id,
            parse_mode: 'HTML'
          }
        ).catch(() => {});
        return;
      }

      if (fromUser.couple || toUser.couple || chat.couples[String(fromUser.id)] || chat.couples[String(toUser.id)]) {
        delete chat.pendingRelationshipRequests[requestId];
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

      fromUser.coins = fromUser.balance;
      toUser.coins = toUser.balance;

      delete chat.pendingRelationshipRequests[requestId];
      saveDB();

      await bot.answerCallbackQuery(query.id, { text: '❤️ Теперь вы пара!' }).catch(() => {});

      await bot.editMessageText(
        '❤️ <b>Новая пара в беседе!</b>\\n\\n' +
        relFixMention(fromUser.id, fromUser.firstName || fromUser.username) + ' и ' +
        relFixMention(toUser.id, toUser.firstName || toUser.username) +
        ' теперь вместе!\\n\\n' +
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

  const tryIndex = code.indexOf("try {", code.indexOf(callbackMarker));

  if (tryIndex === -1) {
    console.error("❌ Не нашёл try внутри callback_query");
    process.exit(1);
  }

  code = code.slice(0, tryIndex + "try {".length) + callbackBlock + code.slice(tryIndex + "try {".length);
}

fs.writeFileSync(path, code, "utf8");

console.log("✅ Жёсткий фикс отношений добавлен");
console.log("✅ Теперь reply → отношения должен работать");
console.log("✅ отношения @username должен работать, если пользователь есть в БД");
console.log("✅ отношения TG_ID должен работать");
