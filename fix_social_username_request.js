const fs = require("fs");

const path = "index.js";
let code = fs.readFileSync(path, "utf8");

// ======================================================
// 1. Чиним resolveTarget: reply / TG ID / @username из БД
// ======================================================

let start = code.indexOf("async function resolveTarget(msg, args = [], chatId) {");
let end = code.indexOf("function isGroup(msg)", start);

if (start === -1) {
  start = code.indexOf("async function resolveTarget(msg, args, chatId) {");
  end = code.indexOf("function isGroup(msg)", start);
}

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

  // 2) По Telegram ID
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

  // 3) По @username
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

// ======================================================
// 2. Чиним startSocialRequest, чтобы не создавал заявку на "Без имени"
// ======================================================

start = code.indexOf("async function startSocialRequest(msg, args, type) {");
end = code.indexOf("async function showFriendsList", start);

if (start === -1 || end === -1) {
  console.error("❌ Не нашёл startSocialRequest или showFriendsList");
  process.exit(1);
}

const newStartSocialRequest = `async function startSocialRequest(msg, args, type) {
  if (!await guardGroup(msg)) return;

  const chatId = msg.chat.id;
  const chat = ensureSocialStorage(getChat(chatId));

  const target = await resolveTarget(msg, args, chatId);

  if (target?.notFoundUsername) {
    await replyTo(
      msg,
      '❌ <b>Пользователь @' + esc(target.notFoundUsername) + ' не найден в базе этой беседы.</b>\\n\\n' +
      'Чтобы предложить дружбу/отношения по username, человек должен хотя бы 1 раз написать сообщение в этот чат.\\n\\n' +
      'Лучшие варианты:\\n' +
      '• ответь на сообщение человека: <code>' + (type === 'relationship' ? 'отношения' : 'дружба') + '</code>\\n' +
      '• или используй TG ID: <code>' + (type === 'relationship' ? 'отношения' : 'дружба') + ' 123456789</code>'
    );
    return;
  }

  if (!target || !target.id) {
    await replyTo(
      msg,
      type === 'relationship'
        ? '❌ <b>Укажи человека</b>\\n\\nМожно так:\\n• reply → <code>отношения</code>\\n• <code>отношения @username</code>\\n• <code>отношения TG_ID</code>'
        : '❌ <b>Укажи человека</b>\\n\\nМожно так:\\n• reply → <code>дружба</code>\\n• <code>дружба @username</code>\\n• <code>дружба TG_ID</code>'
    );
    return;
  }

  if (Number(target.id) === Number(msg.from.id)) {
    await replyTo(msg, type === 'relationship'
      ? '😅 С самим собой отношения создать нельзя.'
      : '😅 Сам с собой дружить нельзя.'
    );
    return;
  }

  if (Number(target.id) === Number(_botId)) {
    await replyTo(msg, '🤖 Со мной нельзя, я пока просто бот.');
    return;
  }

  const fromUser = getUser(chatId, msg.from.id, msg.from.first_name, msg.from.username);
  const toUser = getUser(chatId, target.id, target.firstName, target.username);

  ensureSocialStorage(chat);

  const toDisplayName = toUser.firstName || toUser.username || target.firstName || ('ID ' + target.id);

  if (type === 'relationship') {
    if (getStoredCoupleId(chat, fromUser)) {
      await replyTo(msg, '❌ У тебя уже есть пара. Сначала напиши: <code>расстаться</code>');
      return;
    }

    if (getStoredCoupleId(chat, toUser)) {
      await replyTo(msg, '❌ У этого пользователя уже есть пара.');
      return;
    }
  }

  if (type === 'friend') {
    if (areFriends(chat, fromUser.id, toUser.id)) {
      await replyTo(msg, '🤝 Вы уже друзья.');
      return;
    }
  }

  const requestId = createSocialRequestId();

  chat.pendingSocialRequests[requestId] = {
    id: requestId,
    type,
    chatId,
    fromId: Number(fromUser.id),
    toId: Number(toUser.id),
    fromName: fromUser.firstName || msg.from.first_name || 'Пользователь',
    toName: toDisplayName,
    createdAt: Date.now()
  };

  saveDB();

  const title = type === 'relationship'
    ? '❤️ <b>Предложение отношений</b>'
    : '🤝 <b>Предложение дружбы</b>';

  const question = type === 'relationship'
    ? 'согласна/согласен стать парой?'
    : 'согласна/согласен стать друзьями?';

  const text =
    title + '\\n\\n' +
    '👤 ' + mentionByIdPretty(fromUser.id, fromUser.firstName || fromUser.username || ('ID ' + fromUser.id)) + '\\n' +
    '💌 предлагает ' + mentionByIdPretty(toUser.id, toDisplayName) + '\\n\\n' +
    '✨ <b>' + esc(toDisplayName) + '</b>, ' + question + '\\n\\n' +
    '💭 Решение только за тобой — можно принять или красиво отказаться.\\n' +
    '⏳ Заявка активна 24 часа.\\n' +
    '🔒 Нажать кнопки может только тот, кому отправили предложение.';

  const acceptText = type === 'relationship' ? '❤️ Принять отношения' : '🤝 Принять дружбу';
  const declineText = type === 'relationship' ? '💔 Отказаться' : '🙅 Отказаться';

  const kb = {
    inline_keyboard: [
      [{ text: acceptText, callback_data: 'soc:' + requestId + ':yes' }],
      [{ text: declineText, callback_data: 'soc:' + requestId + ':no' }]
    ]
  };

  if (typeof botInviteUrl === 'function') {
    kb.inline_keyboard.push([{ text: '➕ Добавить бота в чат', url: botInviteUrl() }]);
  }

  await replyTo(msg, text, { reply_markup: kb });
}

`;

code = code.slice(0, start) + newStartSocialRequest + code.slice(end);

fs.writeFileSync(path, code, "utf8");

console.log("✅ Исправлены заявки дружбы/отношений по @username");
console.log("✅ Больше не будет 'Без имени', если username не найден");
console.log("✅ Если username не найден в БД — бот объяснит, что делать");
console.log("✅ Кнопку сможет нажать только настоящий получатель заявки");
