const fs = require("fs");

const path = "index.js";
let code = fs.readFileSync(path, "utf8");

// ======================================================
// FINAL RELATIONSHIP FIX
// Ловим отношения прямо внутри главного bot.on('message')
// ======================================================

const mainHandlerStart = "bot.on('message', async (msg) => {";
const mainHandlerIndex = code.indexOf(mainHandlerStart);

if (mainHandlerIndex === -1) {
  console.error("❌ Не нашёл главный bot.on('message')");
  process.exit(1);
}

// 1. Добавляем функции, если их нет
if (!code.includes("async function finalRelationshipRequest(msg, argText = '')")) {
  const functions = `
// ======================================================
// FINAL RELATIONSHIP SYSTEM
// ======================================================

function finalRelMention(id, name) {
  return '<a href="tg://user?id=' + id + '">' + esc(name || ('ID ' + id)) + '</a>';
}

function finalRelEnsure(chat) {
  if (!chat.couples) chat.couples = {};
  if (!chat.pendingRelationshipRequests) chat.pendingRelationshipRequests = {};
  return chat;
}

async function finalRelFindTarget(msg, argText = '') {
  const chatId = msg.chat.id;

  // reply
  if (msg.reply_to_message && msg.reply_to_message.from && !msg.reply_to_message.from.is_bot) {
    const u = msg.reply_to_message.from;
    return {
      id: Number(u.id),
      firstName: u.first_name || u.username || String(u.id),
      username: u.username || null
    };
  }

  const arg = String(argText || '').trim();

  if (!arg) return null;

  // TG ID
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

  // @username
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

async function finalRelationshipRequest(msg, argText = '') {
  try {
    if (!isGroup(msg)) return;

    const chatId = msg.chat.id;
    const chat = finalRelEnsure(getChat(chatId, msg.chat.title, msg.chat.type));

    const target = await finalRelFindTarget(msg, argText);

    if (target?.notFoundUsername) {
      await replyTo(
        msg,
        '❌ <b>Пользователь @' + esc(target.notFoundUsername) + ' не найден в базе этой беседы.</b>\\n\\n' +
        'Пусть человек напишет любое сообщение в чат, потом повтори.\\n\\n' +
        'Самый надёжный вариант: ответь на его сообщение и напиши <code>/отношения</code>.'
      );
      return true;
    }

    if (!target || !target.id) {
      await replyTo(
        msg,
        '❌ <b>Укажи человека</b>\\n\\n' +
        'Можно так:\\n' +
        '• reply на сообщение → <code>/отношения</code>\\n' +
        '• <code>/отношения @username</code>\\n' +
        '• <code>/отношения TG_ID</code>'
      );
      return true;
    }

    if (Number(target.id) === Number(msg.from.id)) {
      await replyTo(msg, '😅 С самим собой отношения создать нельзя.');
      return true;
    }

    const fromUser = getUser(chatId, msg.from.id, msg.from.first_name, msg.from.username);
    const toUser = getUser(chatId, target.id, target.firstName, target.username);

    const fromId = String(fromUser.id);
    const toId = String(toUser.id);

    if (fromUser.couple || chat.couples[fromId]) {
      await replyTo(msg, '❌ У тебя уже есть пара. Сначала напиши: <code>/расстаться</code>');
      return true;
    }

    if (toUser.couple || chat.couples[toId]) {
      await replyTo(msg, '❌ У этого пользователя уже есть пара.');
      return true;
    }

    const requestId = 'finalrel_' + Date.now().toString(36) + '_' + Math.floor(Math.random() * 99999).toString(36);

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
      '👤 ' + finalRelMention(fromUser.id, fromUser.firstName || fromUser.username) + '\\n' +
      '💌 предлагает ' + finalRelMention(toUser.id, toUser.firstName || toUser.username) + '\\n\\n' +
      '✨ <b>' + esc(toUser.firstName || toUser.username || ('ID ' + toUser.id)) + '</b>, согласна/согласен стать парой?\\n\\n' +
      '💭 Решение только за тобой — можно принять или красиво отказаться.\\n' +
      '⏳ Заявка активна 24 часа.\\n' +
      '🔒 Нажать кнопки может только тот, кому отправили предложение.',
      {
        reply_markup: {
          inline_keyboard: [
            [{ text: '❤️ Принять отношения', callback_data: 'finalrel:' + requestId + ':yes' }],
            [{ text: '💔 Отказаться', callback_data: 'finalrel:' + requestId + ':no' }]
          ]
        }
      }
    );

    return true;
  } catch (error) {
    console.error('finalRelationshipRequest error:', error);
    await replyTo(msg, '❌ Ошибка при создании заявки отношений.');
    return true;
  }
}

`;

  code = code.slice(0, mainHandlerIndex) + functions + "\n" + code.slice(mainHandlerIndex);
}

// 2. Вставляем перехват отношений внутрь главного message handler
const afterGroupCheck = "if (!isGroup(msg)) return;";
const searchFrom = code.indexOf(mainHandlerStart);
const insertPoint = code.indexOf(afterGroupCheck, searchFrom);

if (insertPoint === -1) {
  console.error("❌ Не нашёл if (!isGroup(msg)) return;");
  process.exit(1);
}

if (!code.includes("FINAL RELATIONSHIP DIRECT MESSAGE HOOK")) {
  const hook = `
    // FINAL RELATIONSHIP DIRECT MESSAGE HOOK
    if (msg.text) {
      const relText = String(msg.text || '').trim();
      const relMatch = relText.match(/^\\/?(?:отношения|отношение|любовь|love)(?:@[a-zA-Z0-9_]+)?(?:\\s+(.+))?$/i);

      if (relMatch) {
        const argText = relMatch[1] ? relMatch[1].trim() : '';
        const handled = await finalRelationshipRequest(msg, argText);
        if (handled) return;
      }
    }

`;

  const insertAfter = insertPoint + afterGroupCheck.length;
  code = code.slice(0, insertAfter) + hook + code.slice(insertAfter);
}

// 3. Добавляем callback для кнопок
const callbackStart = code.indexOf("bot.on('callback_query', async (query) => {");

if (callbackStart === -1) {
  console.error("❌ Не нашёл bot.on('callback_query')");
  process.exit(1);
}

if (!code.includes("FINAL RELATIONSHIP CALLBACK HOOK")) {
  const tryIndex = code.indexOf("try {", callbackStart);

  if (tryIndex === -1) {
    console.error("❌ Не нашёл try внутри callback_query");
    process.exit(1);
  }

  const callbackHook = `
    // FINAL RELATIONSHIP CALLBACK HOOK
    if ((query.data || '').startsWith('finalrel:')) {
      const data = query.data || '';
      const msg = query.message;
      const chatId = msg.chat.id;
      const userId = query.from.id;

      const parts = data.split(':');
      const requestId = parts[1];
      const action = parts[2];

      const chat = finalRelEnsure(getChat(chatId));
      const request = chat.pendingRelationshipRequests?.[requestId];

      if (!request) {
        await bot.answerCallbackQuery(query.id, { text: '❌ Заявка устарела.' }).catch(() => {});
        return;
      }

      if (Number(request.toId) !== Number(userId)) {
        await bot.answerCallbackQuery(query.id, { text: '❌ Эта заявка не для тебя.' }).catch(() => {});
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
          finalRelMention(toUser.id, toUser.firstName || toUser.username) +
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
        finalRelMention(fromUser.id, fromUser.firstName || fromUser.username) + ' и ' +
        finalRelMention(toUser.id, toUser.firstName || toUser.username) +
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

  code = code.slice(0, tryIndex + "try {".length) + callbackHook + code.slice(tryIndex + "try {".length);
}

fs.writeFileSync(path, code, "utf8");

console.log("✅ FINAL RELATIONSHIP FIX установлен");
console.log("✅ /отношения reply должно работать");
console.log("✅ отношения reply будет работать только если Privacy Mode выключен");
console.log("✅ /отношения @username работает, если пользователь есть в БД");
