const fs = require("fs");

const path = "index.js";
let code = fs.readFileSync(path, "utf8");

// ======================================================
// 1. Добавляем алиасы дружбы и отношений
// ======================================================

code = code.replace(
  "remember:      ['remember','запомнить'],",
  "remember:      ['remember','запомнить'],\n  friend:        ['friend','friendsend','дружба','подружиться'],\n  friends:       ['friends','друзья','мойдрузья'],\n  unfriend:      ['unfriend','удалитьдруга','раздружиться'],"
);

code = code.replace(
  "love:          ['love','любовь'],",
  "relationship:  ['relationship','relations','отношения','отношение','love','любовь'],"
);

// ======================================================
// 2. Добавляем функции заявок дружбы/отношений
// ======================================================

const insertBefore = "// ── FRIDAY TEXTS";

if (!code.includes("function ensureSocialStorage(chat)")) {
  const block = `
function ensureSocialStorage(chat) {
  if (!chat.friendships) chat.friendships = {};
  if (!chat.pendingSocialRequests) chat.pendingSocialRequests = {};
  return chat;
}

function makePairKey(a, b) {
  return [String(a), String(b)].sort().join('_');
}

function mentionByIdSafe(id, name) {
  return '<a href="tg://user?id=' + id + '">' + esc(name || ('ID ' + id)) + '</a>';
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
    const example = type === 'relationship'
      ? 'отношения ID или reply → отношения'
      : 'дружба ID или reply → дружба';

    await replyTo(msg, '❌ Укажи пользователя.\\n\\nПример: ' + example);
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

  if (type === 'relationship') {
    if (fromUser.couple) {
      await replyTo(msg, '❌ У тебя уже есть пара. Сначала напиши: расстаться');
      return;
    }

    if (toUser.couple) {
      await replyTo(msg, '❌ У этого пользователя уже есть пара.');
      return;
    }
  }

  if (type === 'friend') {
    const key = makePairKey(fromUser.id, toUser.id);

    if (chat.friendships[key]) {
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
    '👤 ' + mentionByIdSafe(fromUser.id, fromUser.firstName) + '\\n' +
    '💌 предлагает ' + mentionByIdSafe(toUser.id, toUser.firstName) + '\\n\\n' +
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
  const userId = String(msg.from.id);

  const friends = Object.values(chat.friendships || {})
    .filter((pair) => pair && Array.isArray(pair.users) && pair.users.includes(userId))
    .map((pair) => {
      const friendId = pair.users.find((id) => id !== userId);
      return chat.users[String(friendId)];
    })
    .filter(Boolean);

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

async function removeFriendCommand(msg, args) {
  if (!await guardGroup(msg)) return;

  const chatId = msg.chat.id;
  const chat = ensureSocialStorage(getChat(chatId));
  const target = await resolveTarget(msg, args, chatId);

  if (!target) {
    await replyTo(msg, '❌ Укажи друга по ID или ответь на его сообщение.');
    return;
  }

  const key = makePairKey(msg.from.id, target.id);

  if (!chat.friendships[key]) {
    await replyTo(msg, '❌ Вы и так не друзья.');
    return;
  }

  delete chat.friendships[key];
  saveDB();

  await replyTo(
    msg,
    '💔 <b>Дружба завершена</b>\\n\\n' +
    mentionByIdSafe(msg.from.id, msg.from.first_name) + ' и ' +
    mentionByIdSafe(target.id, target.firstName || ('ID ' + target.id)) +
    ' больше не друзья.'
  );
}

async function showCoupleCommand(msg) {
  if (!await guardGroup(msg)) return;

  const user = getUser(msg.chat.id, msg.from.id, msg.from.first_name, msg.from.username);

  if (!user.couple) {
    await replyTo(msg, '💔 У тебя пока нет пары.');
    return;
  }

  const partner = getUser(msg.chat.id, user.couple);

  await replyTo(
    msg,
    '❤️ <b>Твоя пара</b>\\n\\n' +
    mentionByIdSafe(user.id, user.firstName) + ' + ' + mentionByIdSafe(partner.id, partner.firstName || ('ID ' + partner.id)) +
    '\\n\\n💍 Берегите друг друга.'
  );
}

async function breakupCommand(msg) {
  if (!await guardGroup(msg)) return;

  const user = getUser(msg.chat.id, msg.from.id, msg.from.first_name, msg.from.username);

  if (!user.couple) {
    await replyTo(msg, '💔 У тебя нет пары.');
    return;
  }

  const partner = getUser(msg.chat.id, user.couple);
  const partnerId = user.couple;

  user.couple = null;
  partner.couple = null;

  saveDB();

  await replyTo(
    msg,
    '💔 <b>Отношения завершены</b>\\n\\n' +
    mentionByIdSafe(user.id, user.firstName) + ' и ' +
    mentionByIdSafe(partnerId, partner.firstName || ('ID ' + partnerId)) +
    ' больше не пара.'
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
// 3. Добавляем case-команды в switch
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
// 4. Добавляем обработку кнопок заявок в callback_query
// ======================================================

const callbackMarker = "    // ── SETTINGS TOGGLE";

if (!code.includes("SOCIAL REQUEST BUTTONS")) {
  const callbackBlock = `    // ── SOCIAL REQUEST BUTTONS ─────────────────────────
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

        const declinedText = request.type === 'relationship'
          ? '💔 <b>Предложение отношений отклонено</b>'
          : '🤝 <b>Предложение дружбы отклонено</b>';

        await bot.editMessageText(
          declinedText + '\\n\\n' +
          mentionByIdSafe(toUser.id, toUser.firstName) + ' отказался/отказалась от предложения.',
          {
            chat_id: chatId,
            message_id: msg.message_id,
            parse_mode: 'HTML'
          }
        ).catch(() => {});
        return;
      }

      if (request.type === 'relationship') {
        if (fromUser.couple || toUser.couple) {
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

        fromUser.couple = toUser.id;
        toUser.couple = fromUser.id;

        fromUser.balance = Number(fromUser.balance || 0) + 20;
        toUser.balance = Number(toUser.balance || 0) + 20;

        delete chat.pendingSocialRequests[requestId];
        saveDB();

        await bot.answerCallbackQuery(query.id, { text: '❤️ Теперь вы пара!' });

        await bot.editMessageText(
          '❤️ <b>Новая пара в беседе!</b>\\n\\n' +
          mentionByIdSafe(fromUser.id, fromUser.firstName) + ' и ' +
          mentionByIdSafe(toUser.id, toUser.firstName) + ' теперь вместе!\\n\\n' +
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
        const key = makePairKey(fromUser.id, toUser.id);

        if (chat.friendships[key]) {
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

        chat.friendships[key] = {
          users: [String(fromUser.id), String(toUser.id)],
          createdAt: new Date().toISOString()
        };

        fromUser.balance = Number(fromUser.balance || 0) + 10;
        toUser.balance = Number(toUser.balance || 0) + 10;

        delete chat.pendingSocialRequests[requestId];
        saveDB();

        await bot.answerCallbackQuery(query.id, { text: '🤝 Дружба принята!' });

        await bot.editMessageText(
          '🤝 <b>Новая дружба в беседе!</b>\\n\\n' +
          mentionByIdSafe(fromUser.id, fromUser.firstName) + ' и ' +
          mentionByIdSafe(toUser.id, toUser.firstName) + ' теперь друзья!\\n\\n' +
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

`;

  if (!code.includes(callbackMarker)) {
    console.error("❌ Не нашёл место в callback_query перед SETTINGS TOGGLE");
    process.exit(1);
  }

  code = code.replace(callbackMarker, callbackBlock + callbackMarker);
}

// ======================================================
// 5. Обновляем текст help-раздела отношений
// ======================================================

code = code.replace(
  "/love /любовь — создать пару по reply\\n/couple /пара — посмотреть пару\\n/breakup /расстаться — расстаться",
  "/отношения ID — предложить отношения\\nreply → отношения — предложить отношения\\n/дружба ID — предложить дружбу\\nreply → дружба — предложить дружбу\\n/друзья — список друзей\\n/пара — посмотреть пару\\n/расстаться — расстаться"
);

fs.writeFileSync(path, code, "utf8");

console.log("✅ Система дружбы и отношений обновлена");
console.log("✅ Теперь отношения и дружба создаются только через согласие");
console.log("✅ Добавлены кнопки: Принять / Отказаться");
