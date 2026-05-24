const fs = require("fs");

const path = "index.js";
let code = fs.readFileSync(path, "utf8");

// ======================================================
// 1. Добавляем/усиливаем алиасы команд дружбы и отношений
// ======================================================

function addAliasAfter(anchor, insert) {
  if (!code.includes(anchor)) return false;
  if (code.includes(insert.trim().split("\n")[0].trim())) return true;
  code = code.replace(anchor, anchor + "\n" + insert);
  return true;
}

// Добавляем friend/friends/unfriend после remember
if (!code.includes("friend:        ['friend'")) {
  code = code.replace(
    "remember:      ['remember','запомнить'],",
    `remember:      ['remember','запомнить'],
  friend:        ['friend','дружба','подружиться','friendsend'],
  friends:       ['friends','друзья','мойдрузья'],
  unfriend:      ['unfriend','раздружиться','удалитьдруга','завершитьдружбу','завершить дружбу'],`
  );
}

// Заменяем love на relationship, чтобы работали отношения/love/любовь
if (code.includes("love:          ['love','любовь'],") && !code.includes("relationship:  ['relationship'")) {
  code = code.replace(
    "love:          ['love','любовь'],",
    "relationship:  ['relationship','relations','отношения','отношение','love','любовь'],"
  );
}

// Если relationship уже есть, но без нужных алиасов — расширяем
code = code.replace(
  /relationship:\s*\[[^\]]+\],/,
  "relationship:  ['relationship','relations','отношения','отношение','love','любовь'],"
);

// Расширяем breakup
code = code.replace(
  /breakup:\s*\[[^\]]+\],/,
  "breakup:       ['breakup','расстаться','разрыв'],"
);

// ======================================================
// 2. Делаем resolveTarget максимально нормальным:
// reply, TG ID, известный пользователь из БД
// ======================================================

const start = code.indexOf("async function resolveTarget(msg, args, chatId) {");
const end = code.indexOf("function isGroup(msg)", start);

if (start === -1 || end === -1) {
  console.error("❌ Не нашёл resolveTarget или isGroup");
  process.exit(1);
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

  // 2) По Telegram ID
  if (args[0] && /^\\d+$/.test(String(args[0]))) {
    const id = parseInt(args[0], 10);
    const restArgs = args.slice(1);

    // Сначала пробуем взять из Telegram
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
    } catch (_) {
      // Если Telegram не отдал пользователя, пробуем взять из нашей БД
    }

    // Потом пробуем взять из базы
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

    // Если даже в БД нет — всё равно возвращаем ID
    // Это позволит создать запись и отправить заявку по ID,
    // но человек сможет нажать кнопку только если Telegram отдаст callback от него.
    return {
      id,
      firstName: String(id),
      username: null,
      user: null,
      args: restArgs
    };
  }

  return null;
}

`;

code = code.slice(0, start) + newResolveTarget + code.slice(end);

// ======================================================
// 3. Добавляем cases, если их ещё нет
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
// 4. Обновляем help-текст отношений, если такой блок есть
// ======================================================

code = code.replace(
  /\/отношения ID — предложить отношения[\s\S]*?\/расстаться — открыть подтверждение расставания/,
  `/отношения ID — предложить отношения по TG ID
reply → отношения — предложить отношения ответом
/дружба ID — предложить дружбу по TG ID
reply → дружба — предложить дружбу ответом
/друзья — список друзей
/раздружиться ID — завершить дружбу по TG ID
reply → раздружиться — завершить дружбу ответом
reply → завершить дружбу — завершить дружбу ответом
/пара — посмотреть пару
/расстаться — открыть подтверждение расставания`
);

fs.writeFileSync(path, code, "utf8");

console.log("✅ Добавлена поддержка TG ID и reply для дружбы/отношений");
console.log("✅ отношения ID и reply → отношения");
console.log("✅ дружба ID и reply → дружба");
console.log("✅ раздружиться ID и reply → раздружиться");
console.log("✅ завершить дружбу работает как команда");
