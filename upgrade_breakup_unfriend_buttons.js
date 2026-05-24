const fs = require("fs");

const path = "index.js";
let code = fs.readFileSync(path, "utf8");

// ======================================================
// 1. Меняем функцию removeFriendCommand на красивое подтверждение
// ======================================================

let start = code.indexOf("async function removeFriendCommand(msg, args) {");
let end = code.indexOf("async function showCoupleCommand(msg) {", start);

if (start === -1 || end === -1) {
  console.error("❌ Не нашёл removeFriendCommand или showCoupleCommand");
  process.exit(1);
}

const newRemoveFriend = `async function removeFriendCommand(msg, args) {
  if (!await guardGroup(msg)) return;

  const chatId = msg.chat.id;
  const chat = ensureSocialStorage(getChat(chatId));
  const target = await resolveTarget(msg, args, chatId);

  if (!target) {
    await replyTo(
      msg,
      '❌ <b>Укажи друга</b>\\n\\nМожно так:\\n• ответь на сообщение друга: <code>раздружиться</code>\\n• или напиши: <code>раздружиться ID</code>'
    );
    return;
  }

  if (Number(target.id) === Number(msg.from.id)) {
    await replyTo(msg, '😅 С самим собой дружбу завершить нельзя.');
    return;
  }

  const key = makePairKey(msg.from.id, target.id);

  if (!chat.friendships[key]) {
    await replyTo(msg, '❌ Вы и так не друзья.');
    return;
  }

  const actor = getUser(chatId, msg.from.id, msg.from.first_name, msg.from.username);
  const friend = getUser(chatId, target.id, target.firstName, target.username);

  const kb = {
    inline_keyboard: [
      [
        { text: '💔 Завершить дружбу', callback_data: 'unfriend:' + actor.id + ':' + friend.id + ':yes' }
      ],
      [
        { text: '🤝 Оставить дружбу', callback_data: 'unfriend:' + actor.id + ':' + friend.id + ':no' }
      ]
    ]
  };

  await replyTo(
    msg,
    '🤝 <b>Подтверждение дружбы</b>\\n\\n' +
    mentionByIdSafe(actor.id, actor.firstName) + ', ты точно хочешь завершить дружбу с ' +
    mentionByIdSafe(friend.id, friend.firstName || ('ID ' + friend.id)) + '?\\n\\n' +
    '━━━━━━━━━━━━━━\\n' +
    'Это действие уберёт вас из списка друзей в этой беседе.',
    { reply_markup: kb }
  );
}

`;

code = code.slice(0, start) + newRemoveFriend + code.slice(end);

// ======================================================
// 2. Меняем функцию breakupCommand на красивое подтверждение
// ======================================================

start = code.indexOf("async function breakupCommand(msg) {");
end = code.indexOf("// ── FRIDAY TEXTS", start);

if (start === -1 || end === -1) {
  console.error("❌ Не нашёл breakupCommand или FRIDAY TEXTS");
  process.exit(1);
}

const newBreakup = `async function breakupCommand(msg) {
  if (!await guardGroup(msg)) return;

  const chatId = msg.chat.id;
  const user = getUser(chatId, msg.from.id, msg.from.first_name, msg.from.username);

  if (!user.couple) {
    await replyTo(msg, '💔 У тебя пока нет пары.');
    return;
  }

  const partner = getUser(chatId, user.couple);
  const partnerName = partner.firstName || partner.username || ('ID ' + partner.id);

  const kb = {
    inline_keyboard: [
      [
        { text: '💔 Расстаться', callback_data: 'break:' + user.id + ':' + partner.id + ':yes' }
      ],
      [
        { text: '❤️ Остаться вместе', callback_data: 'break:' + user.id + ':' + partner.id + ':no' }
      ]
    ]
  };

  await replyTo(
    msg,
    '💔 <b>Подтверждение расставания</b>\\n\\n' +
    mentionByIdSafe(user.id, user.firstName) + ', ты точно хочешь расстаться с ' +
    mentionByIdSafe(partner.id, partnerName) + '?\\n\\n' +
    '━━━━━━━━━━━━━━\\n' +
    'Иногда лучше подумать ещё раз. Если уверен(а), нажми кнопку ниже.',
    { reply_markup: kb }
  );
}

`;

code = code.slice(0, start) + newBreakup + code.slice(end);

// ======================================================
// 3. Добавляем callback-кнопки для расставания и дружбы
// ======================================================

const callbackMarker = "    // ── SETTINGS TOGGLE";

if (!code.includes("BREAKUP / UNFRIEND BUTTONS")) {
  const callbackBlock = `    // ── BREAKUP / UNFRIEND BUTTONS ─────────────────────
    if (data.startsWith('break:')) {
      const parts = data.split(':');
      const actorId = Number(parts[1]);
      const partnerId = Number(parts[2]);
      const action = parts[3];

      if (Number(userId) !== actorId) {
        await bot.answerCallbackQuery(query.id, { text: '❌ Эта кнопка не для тебя.' });
        return;
      }

      const actor = getUser(chatId, actorId);
      const partner = getUser(chatId, partnerId);

      if (action === 'no') {
        await bot.answerCallbackQuery(query.id, { text: '❤️ Решение отменено.' });

        await bot.editMessageText(
          '❤️ <b>Расставание отменено</b>\\n\\n' +
          mentionByIdSafe(actor.id, actor.firstName) + ' решил(а) сохранить отношения с ' +
          mentionByIdSafe(partner.id, partner.firstName || ('ID ' + partner.id)) + '.\\n\\n' +
          '✨ Иногда один клик может сохранить красивую историю.',
          {
            chat_id: chatId,
            message_id: msg.message_id,
            parse_mode: 'HTML'
          }
        ).catch(() => {});
        return;
      }

      if (String(actor.couple) !== String(partnerId)) {
        await bot.answerCallbackQuery(query.id, { text: '❌ Вы уже не пара.' });

        await bot.editMessageText(
          '❌ Эти отношения уже не активны.',
          {
            chat_id: chatId,
            message_id: msg.message_id,
            parse_mode: 'HTML'
          }
        ).catch(() => {});
        return;
      }

      actor.couple = null;
      partner.couple = null;

      saveDB();

      await bot.answerCallbackQuery(query.id, { text: '💔 Отношения завершены.' });

      await bot.editMessageText(
        '💔 <b>Отношения завершены</b>\\n\\n' +
        mentionByIdSafe(actor.id, actor.firstName) + ' и ' +
        mentionByIdSafe(partner.id, partner.firstName || ('ID ' + partner.id)) +
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
      const key = makePairKey(actorId, friendId);

      const actor = getUser(chatId, actorId);
      const friend = getUser(chatId, friendId);

      if (action === 'no') {
        await bot.answerCallbackQuery(query.id, { text: '🤝 Отменено.' });

        await bot.editMessageText(
          '🤝 <b>Дружба сохранена</b>\\n\\n' +
          mentionByIdSafe(actor.id, actor.firstName) + ' и ' +
          mentionByIdSafe(friend.id, friend.firstName || ('ID ' + friend.id)) +
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

      if (!chat.friendships[key]) {
        await bot.answerCallbackQuery(query.id, { text: '❌ Вы уже не друзья.' });

        await bot.editMessageText(
          '❌ Эта дружба уже не активна.',
          {
            chat_id: chatId,
            message_id: msg.message_id,
            parse_mode: 'HTML'
          }
        ).catch(() => {});
        return;
      }

      delete chat.friendships[key];
      saveDB();

      await bot.answerCallbackQuery(query.id, { text: '💔 Дружба завершена.' });

      await bot.editMessageText(
        '💔 <b>Дружба завершена</b>\\n\\n' +
        mentionByIdSafe(actor.id, actor.firstName) + ' и ' +
        mentionByIdSafe(friend.id, friend.firstName || ('ID ' + friend.id)) +
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
    console.error("❌ Не нашёл SETTINGS TOGGLE в callback_query");
    process.exit(1);
  }

  code = code.replace(callbackMarker, callbackBlock + callbackMarker);
}

// ======================================================
// 4. Чуть улучшаем help-раздел отношений
// ======================================================

code = code.replace(
  "/друзья — список друзей\\n/пара — посмотреть пару\\n/расстаться — расстаться",
  "/друзья — список друзей\\n/раздружиться ID — завершить дружбу через кнопку\\n/пара — посмотреть пару\\n/расстаться — открыть подтверждение расставания"
);

fs.writeFileSync(path, code, "utf8");

console.log("✅ Расставание теперь через красивое подтверждение");
console.log("✅ Удаление друга теперь через красивое подтверждение");
console.log("✅ Добавлены кнопки подтверждения/отмены");
