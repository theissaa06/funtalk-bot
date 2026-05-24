const fs = require("fs");

const path = "index.js";
let code = fs.readFileSync(path, "utf8");

// ======================================================
// 1. Алиасы команд дружбы и отношений
// ======================================================

function addAliasBlock() {
  if (!code.includes("friend:") && code.includes("remember:")) {
    code = code.replace(
      /remember:\s*\[[^\]]+\],/,
      (m) => `${m}
  friend:        ['friend','дружба','подружиться','friendsend'],
  friends:       ['friends','друзья','мойдрузья'],
  unfriend:      ['unfriend','раздружиться','завершить','удалитьдруга'],`
    );
  }

  if (code.includes("love:") && !code.includes("relationship:")) {
    code = code.replace(
      /love:\s*\[[^\]]+\],/,
      "relationship:  ['relationship','relations','отношения','отношение','love','любовь'],"
    );
  }

  if (code.includes("breakup:") && !code.includes("'разрыв'")) {
    code = code.replace(
      /breakup:\s*\[[^\]]+\],/,
      "breakup:       ['breakup','расстаться','разрыв'],"
    );
  }
}
addAliasBlock();

// ======================================================
// 2. Функции нормального хранения пары/дружбы в БД
// ======================================================

const insertBefore = "// ── FRIDAY TEXTS";

if (!code.includes("function ensureSocialStorage(chat)")) {
  const block = `
function ensureSocialStorage(chat) {
  if (!chat.couples) chat.couples = {};
  if (!chat.friendships) chat.friendships = {};
  if (!chat.pendingSocialRequests) chat.pendingSocialRequests = {};
  return chat;
}

function socialUserId(id) {
  return String(id);
}

function makeFriendKey(a, b) {
  return [socialUserId(a), socialUserId(b)].sort().join('_');
}

function mentionByIdPretty(id, name) {
  return '<a href="tg://user?id=' + id + '">' + esc(name || ('ID ' + id)) + '</a>';
}

function getStoredCoupleId(chat, user) {
  if (!user) return null;
  const uid = socialUserId(user.id);
  return user.couple || chat.couples?.[uid] || null;
}

function setStoredCouple(chat, userA, userB) {
  ensureSocialStorage(chat);

  const a = socialUserId(userA.id);
  const b = socialUserId(userB.id);

  userA.couple = b;
  userB.couple = a;

  chat.couples[a] = b;
  chat.couples[b] = a;

  userA.balance = Number(userA.balance || 0) + 20;
  userB.balance = Number(userB.balance || 0) + 20;
  userA.coins = userA.balance;
  userB.coins = userB.balance;
}

function clearStoredCouple(chat, userA, userB) {
  ensureSocialStorage(chat);

  const a = socialUserId(userA.id);
  const b = socialUserId(userB.id);

  userA.couple = null;
  userB.couple = null;

  delete chat.couples[a];
  delete chat.couples[b];
}

function areFriends(chat, a, b) {
  ensureSocialStorage(chat);
  const key = makeFriendKey(a, b);
  return Boolean(chat.friendships[key]);
}

function setStoredFriendship(chat, userA, userB) {
  ensureSocialStorage(chat);

  const key = makeFriendKey(userA.id, userB.id);

  // Храним массивом, чтобы не ломать старый профиль, где было pair.includes(userId)
  chat.friendships[key] = [
    socialUserId(userA.id),
    socialUserId(userB.id),
    new Date().toISOString()
  ];

  userA.balance = Number(userA.balance || 0) + 10;
  userB.balance = Number(userB.balance || 0) + 10;
  userA.coins = userA.balance;
  userB.coins = userB.balance;
}

function clearStoredFriendship(chat, a, b) {
  ensureSocialStorage(chat);
  const key = makeFriendKey(a, b);
  delete chat.friendships[key];
}

function getFriendList(chat, userId) {
  ensureSocialStorage(chat);
  const uid = socialUserId(userId);

  return Object.values(chat.friendships || {})
    .map((pair) => {
      if (Array.isArray(pair)) {
        if (!pair.includes(uid)) return null;
        const friendId = pair.find((id) => String(id) !== uid);
        return chat.users?.[String(friendId)] || null;
      }

      if (pair?.users && Array.isArray(pair.users)) {
        if (!pair.users.includes(uid)) return null;
        const friendId = pair.users.find((id) => String(id) !== uid);
        return chat.users?.[String(friendId)] || null;
      }

      return null;
    })
    .filter(Boolean);
}

function createSocialRequestId() {
  return Date.now().toString(36) + Math.floor(Math.random() * 99999).toString(36);
}

async function startSocialRequest(msg, args, type) {
  if (!await guardGroup(msg)) return;

  const chatId = msg.chat.id;
  const chat = ensureSocialStorage(getChat(chatId));

  const target = await resolveTarget(msg, args, chatId);

  if (!target) {
    await replyTo(
      msg,
      type === 'relationship'
        ? '❌ Укажи человека.\\n\\nПример:\\n• reply → <code>отношения</code>\\n• <code>отношения ID</code>'
        : '❌ Укажи человека.\\n\\nПример:\\n• reply → <code>дружба</code>\\n• <code>дружба ID</code>'
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
    fromId: fromUser.id,
    toId: toUser.id,
    fromName: fromUser.firstName || msg.from.first_name || 'Пользователь',
    toName: toUser.firstName || target.firstName || 'Пользователь',
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
    '👤 ' + mentionByIdPretty(fromUser.id, fromUser.firstName) + '\\n' +
    '💌 предлагает ' + mentionByIdPretty(toUser.id, toUser.firstName) + '\\n\\n' +
    '✨ <b>' + esc(toUser.firstName || 'Пользователь') + '</b>, ' + question + '\\n\\n' +
    '━━━━━━━━━━━━━━\\n' +
    '⏳ Заявка активна 24 часа.\\n' +
    'Нажать кнопки может только тот, кому отправили предложение.';

  const kb = {
    inline_keyboard: [
      [
        { text: '✅ Принять', callback_data: 'soc:' + requestId + ':yes' },
        { text: '❌ Отказаться', callback_data: 'soc:' + requestId + ':no' }
      ]
    ]
  };

  await replyTo(msg, text, { reply_markup: kb });
}

async function showFriendsList(msg) {
  if (!await guardGroup(msg)) return;

  const chat = ensureSocialStorage(getChat(msg.chat.id));
  const friends = getFriendList(chat, msg.from.id);

  if (!friends.length) {
    await replyTo(msg, '🤝 У тебя пока нет друзей в этой беседе.');
    return;
  }

  let text = '🤝 <b>Твои друзья</b>\\n\\n';

  friends.forEach((friend, index) => {
    text += (index + 1) + '. ' + mention(friend) + '\\n';
  });

  await replyTo(msg, text);
}

async function showCoupleCommand(msg) {
  if (!await guardGroup(msg)) return;

  const chat = ensureSocialStorage(getChat(msg.chat.id));
  const user = getUser(msg.chat.id, msg.from.id, msg.from.first_name, msg.from.username);
  const coupleId = getStoredCoupleId(chat, user);

  if (!coupleId) {
    await replyTo(msg, '💔 У тебя пока нет пары.');
    return;
  }

  const partner = getUser(msg.chat.id, coupleId);

  await replyTo(
    msg,
    '❤️ <b>Твоя пара</b>\\n\\n' +
    mentionByIdPretty(user.id, user.firstName) + ' + ' +
    mentionByIdPretty(partner.id, partner.firstName || ('ID ' + partner.id)) +
    '\\n\\n💍 Берегите друг друга.'
  );
}

async function breakupCommand(msg) {
  if (!await guardGroup(msg)) return;

  const chat = ensureSocialStorage(getChat(msg.chat.id));
  const user = getUser(msg.chat.id, msg.from.id, msg.from.first_name, msg.from.username);
  const partnerId = getStoredCoupleId(chat, user);

  if (!partnerId) {
    await replyTo(msg, '💔 У тебя пока нет пары.');
    return;
  }

  const partner = getUser(msg.chat.id, partnerId);
  const partnerName = partner.firstName || partner.username || ('ID ' + partner.id);

  const kb = {
    inline_keyboard: [
      [{ text: '💔 Расстаться', callback_data: 'break:' + user.id + ':' + partner.id + ':yes' }],
      [{ text: '❤️ Остаться вместе', callback_data: 'break:' + user.id + ':' + partner.id + ':no' }]
    ]
  };

  await replyTo(
    msg,
    '💔 <b>Подтверждение расставания</b>\\n\\n' +
    mentionByIdPretty(user.id, user.firstName) + ', ты точно хочешь расстаться с ' +
    mentionByIdPretty(partner.id, partnerName) + '?\\n\\n' +
    '━━━━━━━━━━━━━━\\n' +
    'Иногда лучше подумать ещё раз. Если уверен(а), нажми кнопку ниже.',
    { reply_markup: kb }
  );
}

async function removeFriendCommand(msg, args) {
  if (!await guardGroup(msg)) return;

  const chatId = msg.chat.id;
  const chat = ensureSocialStorage(getChat(chatId));
  const target = await resolveTarget(msg, args, chatId);

  if (!target) {
    await replyTo(
      msg,
      '❌ <b>Укажи друга</b>\\n\\nМожно так:\\n• reply → <code>раздружиться</code>\\n• reply → <code>завершить дружбу</code>\\n• <code>раздружиться ID</code>'
    );
    return;
  }

  if (Number(target.id) === Number(msg.from.id)) {
    await replyTo(msg, '😅 С самим собой дружбу завершить нельзя.');
    return;
  }

  if (!areFriends(chat, msg.from.id, target.id)) {
    await replyTo(msg, '❌ Вы и так не друзья.');
    return;
  }

  const actor = getUser(chatId, msg.from.id, msg.from.first_name, msg.from.username);
  const friend = getUser(chatId, target.id, target.firstName, target.username);

  const kb = {
    inline_keyboard: [
      [{ text: '💔 Завершить дружбу', callback_data: 'unfriend:' + actor.id + ':' + friend.id + ':yes' }],
      [{ text: '🤝 Оставить дружбу', callback_data: 'unfriend:' + actor.id + ':' + friend.id + ':no' }]
    ]
  };

  await replyTo(
    msg,
    '🤝 <b>Подтверждение дружбы</b>\\n\\n' +
    mentionByIdPretty(actor.id, actor.firstName) + ', ты точно хочешь завершить дружбу с ' +
    mentionByIdPretty(friend.id, friend.firstName || ('ID ' + friend.id)) + '?\\n\\n' +
    '━━━━━━━━━━━━━━\\n' +
    'Это действие уберёт вас из списка друзей в этой беседе.',
    { reply_markup: kb }
  );
}

`;

  if (!code.includes(insertBefore)) {
    console.error("❌ Не нашёл место вставки перед FRIDAY TEXTS");
    process.exit(1);
  }

  code = code.replace(insertBefore, block + insertBefore);
}

// ======================================================
// 3. Добавляем cases команд в switch
// ======================================================

const commandMarker = "  case 'hug':";

if (!code.includes("case 'relationship':")) {
  const cases = `  case 'relationship': {
    await startSocialRequest(msg, args, 'relationship');
    break;
  }

  case 'friend': {
    await startSocialRequest(msg, args, 'friend');
    break;
  }

  case 'friends': {
    await showFriendsList(msg);
    break;
  }

  case 'unfriend': {
    await removeFriendCommand(msg, args);
    break;
  }

  case 'couple': {
    await showCoupleCommand(msg);
    break;
  }

  case 'breakup': {
    await breakupCommand(msg);
    break;
  }

`;

  if (!code.includes(commandMarker)) {
    console.error("❌ Не нашёл место перед case hug");
    process.exit(1);
  }

  code = code.replace(commandMarker, cases + commandMarker);
}

// ======================================================
// 4. Callback кнопок: принять/отказать/расстаться/раздружиться
// ======================================================

const callbackMarker = "    // ── SETTINGS TOGGLE";

if (!code.includes("SOCIAL RELATIONSHIP FRIENDSHIP BUTTONS V2")) {
  const callbackBlock = `    // ── SOCIAL RELATIONSHIP FRIENDSHIP BUTTONS V2 ───────
    if (data.startsWith('soc:')) {
      const parts = data.split(':');
      const requestId = parts[1];
      const action = parts[2];

      const chat = ensureSocialStorage(getChat(chatId));
      const request = chat.pendingSocialRequests?.[requestId];

      if (!request) {
        await bot.answerCallbackQuery(query.id, { text: '❌ Заявка устарела.' });
        return;
      }

      if (Number(request.toId) !== Number(userId)) {
        await bot.answerCallbackQuery(query.id, { text: '❌ Эта заявка не для тебя.' });
        return;
      }

      if (Date.now() - Number(request.createdAt || 0) > 24 * 60 * 60 * 1000) {
        delete chat.pendingSocialRequests[requestId];
        saveDB();
        await bot.answerCallbackQuery(query.id, { text: '⏳ Заявка истекла.' });
        await bot.editMessageText('⏳ Заявка устарела и больше недоступна.', {
          chat_id: chatId,
          message_id: msg.message_id,
          parse_mode: 'HTML'
        }).catch(() => {});
        return;
      }

      const fromUser = getUser(chatId, request.fromId);
      const toUser = getUser(chatId, request.toId);

      if (action === 'no') {
        delete chat.pendingSocialRequests[requestId];
        saveDB();

        await bot.answerCallbackQuery(query.id, { text: '❌ Отклонено.' });

        await bot.editMessageText(
          (request.type === 'relationship'
            ? '💔 <b>Предложение отношений отклонено</b>'
            : '🤝 <b>Предложение дружбы отклонено</b>') +
          '\\n\\n' +
          mentionByIdPretty(toUser.id, toUser.firstName) + ' отказался/отказалась от предложения.',
          {
            chat_id: chatId,
            message_id: msg.message_id,
            parse_mode: 'HTML'
          }
        ).catch(() => {});
        return;
      }

      if (request.type === 'relationship') {
        if (getStoredCoupleId(chat, fromUser) || getStoredCoupleId(chat, toUser)) {
          delete chat.pendingSocialRequests[requestId];
          saveDB();

          await bot.answerCallbackQuery(query.id, { text: '❌ У кого-то уже есть пара.' });
          await bot.editMessageText('❌ Заявка больше недоступна: у одного из пользователей уже есть пара.', {
            chat_id: chatId,
            message_id: msg.message_id,
            parse_mode: 'HTML'
          }).catch(() => {});
          return;
        }

        setStoredCouple(chat, fromUser, toUser);

        delete chat.pendingSocialRequests[requestId];
        saveDB();

        await bot.answerCallbackQuery(query.id, { text: '❤️ Теперь вы пара!' });

        await bot.editMessageText(
          '❤️ <b>Новая пара в беседе!</b>\\n\\n' +
          mentionByIdPretty(fromUser.id, fromUser.firstName) + ' и ' +
          mentionByIdPretty(toUser.id, toUser.firstName) + ' теперь вместе!\\n\\n' +
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

      if (request.type === 'friend') {
        if (areFriends(chat, fromUser.id, toUser.id)) {
          delete chat.pendingSocialRequests[requestId];
          saveDB();

          await bot.answerCallbackQuery(query.id, { text: '🤝 Вы уже друзья.' });
          await bot.editMessageText('🤝 Вы уже друзья.', {
            chat_id: chatId,
            message_id: msg.message_id,
            parse_mode: 'HTML'
          }).catch(() => {});
          return;
        }

        setStoredFriendship(chat, fromUser, toUser);

        delete chat.pendingSocialRequests[requestId];
        saveDB();

        await bot.answerCallbackQuery(query.id, { text: '🤝 Дружба принята!' });

        await bot.editMessageText(
          '🤝 <b>Новая дружба в беседе!</b>\\n\\n' +
          mentionByIdPretty(fromUser.id, fromUser.firstName) + ' и ' +
          mentionByIdPretty(toUser.id, toUser.firstName) + ' теперь друзья!\\n\\n' +
          '✨ Дружба — это когда в чате есть свой человек.\\n' +
          '🎁 Бонус каждому: <b>+10 монет</b>',
          {
            chat_id: chatId,
            message_id: msg.message_id,
            parse_mode: 'HTML'
          }
        ).catch(() => {});
        return;
      }
    }

    if (data.startsWith('break:')) {
      const parts = data.split(':');
      const actorId = Number(parts[1]);
      const partnerId = Number(parts[2]);
      const action = parts[3];

      if (Number(userId) !== actorId) {
        await bot.answerCallbackQuery(query.id, { text: '❌ Эта кнопка не для тебя.' });
        return;
      }

      const chat = ensureSocialStorage(getChat(chatId));
      const actor = getUser(chatId, actorId);
      const partner = getUser(chatId, partnerId);

      if (action === 'no') {
        await bot.answerCallbackQuery(query.id, { text: '❤️ Решение отменено.' });

        await bot.editMessageText(
          '❤️ <b>Расставание отменено</b>\\n\\n' +
          mentionByIdPretty(actor.id, actor.firstName) + ' решил(а) сохранить отношения с ' +
          mentionByIdPretty(partner.id, partner.firstName || ('ID ' + partner.id)) + '.\\n\\n' +
          '✨ Иногда один клик может сохранить красивую историю.',
          {
            chat_id: chatId,
            message_id: msg.message_id,
            parse_mode: 'HTML'
          }
        ).catch(() => {});
        return;
      }

      if (String(getStoredCoupleId(chat, actor)) !== String(partnerId)) {
        await bot.answerCallbackQuery(query.id, { text: '❌ Вы уже не пара.' });

        await bot.editMessageText('❌ Эти отношения уже не активны.', {
          chat_id: chatId,
          message_id: msg.message_id,
          parse_mode: 'HTML'
        }).catch(() => {});
        return;
      }

      clearStoredCouple(chat, actor, partner);
      saveDB();

      await bot.answerCallbackQuery(query.id, { text: '💔 Отношения завершены.' });

      await bot.editMessageText(
        '💔 <b>Отношения завершены</b>\\n\\n' +
        mentionByIdPretty(actor.id, actor.firstName) + ' и ' +
        mentionByIdPretty(partner.id, partner.firstName || ('ID ' + partner.id)) +
        ' больше не пара.\\n\\n' +
        '━━━━━━━━━━━━━━\\n' +
        'Спасибо за вашу историю. У каждого начинается новая глава.',
        {
          chat_id: chatId,
          message_id: msg.message_id,
          parse_mode: 'HTML'
        }
      ).catch(() => {});
      return;
    }

    if (data.startsWith('unfriend:')) {
      const parts = data.split(':');
      const actorId = Number(parts[1]);
      const friendId = Number(parts[2]);
      const action = parts[3];

      if (Number(userId) !== actorId) {
        await bot.answerCallbackQuery(query.id, { text: '❌ Эта кнопка не для тебя.' });
        return;
      }

      const chat = ensureSocialStorage(getChat(chatId));
      const actor = getUser(chatId, actorId);
      const friend = getUser(chatId, friendId);

      if (action === 'no') {
        await bot.answerCallbackQuery(query.id, { text: '🤝 Отменено.' });

        await bot.editMessageText(
          '🤝 <b>Дружба сохранена</b>\\n\\n' +
          mentionByIdPretty(actor.id, actor.firstName) + ' и ' +
          mentionByIdPretty(friend.id, friend.firstName || ('ID ' + friend.id)) +
          ' остаются друзьями.\\n\\n' +
          '✨ Хорошие люди в чате на вес золота.',
          {
            chat_id: chatId,
            message_id: msg.message_id,
            parse_mode: 'HTML'
          }
        ).catch(() => {});
        return;
      }

      if (!areFriends(chat, actorId, friendId)) {
        await bot.answerCallbackQuery(query.id, { text: '❌ Вы уже не друзья.' });

        await bot.editMessageText('❌ Эта дружба уже не активна.', {
          chat_id: chatId,
          message_id: msg.message_id,
          parse_mode: 'HTML'
        }).catch(() => {});
        return;
      }

      clearStoredFriendship(chat, actorId, friendId);
      saveDB();

      await bot.answerCallbackQuery(query.id, { text: '💔 Дружба завершена.' });

      await bot.editMessageText(
        '💔 <b>Дружба завершена</b>\\n\\n' +
        mentionByIdPretty(actor.id, actor.firstName) + ' и ' +
        mentionByIdPretty(friend.id, friend.firstName || ('ID ' + friend.id)) +
        ' больше не друзья.\\n\\n' +
        '━━━━━━━━━━━━━━\\n' +
        'Без драмы — просто разные дороги.',
        {
          chat_id: chatId,
          message_id: msg.message_id,
          parse_mode: 'HTML'
        }
      ).catch(() => {});
      return;
    }

`;

  if (!code.includes(callbackMarker)) {
    console.error("❌ Не нашёл место в callback_query перед SETTINGS TOGGLE");
    process.exit(1);
  }

  code = code.replace(callbackMarker, callbackBlock + callbackMarker);
}

fs.writeFileSync(path, code, "utf8");

console.log("✅ Дружба и отношения теперь нормально хранятся в БД");
console.log("✅ Пара сохраняется в user.couple и chat.couples");
console.log("✅ Дружба сохраняется в chat.friendships");
console.log("✅ Расставание и завершение дружбы работают через кнопки");
