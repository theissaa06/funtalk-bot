const fs = require("fs");

const path = "index.js";
let code = fs.readFileSync(path, "utf8");

// ======================================================
// FIX UNIQUE HIGH RANKS + NO BOT RANKS
// Ранги 100 и 95 могут быть только у одного человека
// ======================================================

function replaceBlock(source, startText, endText, replacement) {
  const start = source.indexOf(startText);
  if (start === -1) {
    console.error("❌ Не нашёл начало блока: " + startText);
    process.exit(1);
  }

  const end = source.indexOf(endText, start);
  if (end === -1) {
    console.error("❌ Не нашёл конец блока: " + endText);
    process.exit(1);
  }

  return source.slice(0, start) + replacement + source.slice(end);
}

// 1. Полностью заменяем quickRank
const quickRankStart = "async function quickRank(msg, args, targetRank, chatId) {";
const quickRankEnd = "// ── ACHIEVEMENTS";

const newQuickRank = `async function quickRank(msg, args, targetRank, chatId) {
  if (!await guardGroup(msg)) return;

  const actorRank = await getEffectiveRank(chatId, msg.from.id);
  const t = await resolveTarget(msg, args, chatId);

  if (t?.notFoundUsername) {
    await replyTo(
      msg,
      '❌ <b>Пользователь @' + esc(t.notFoundUsername) + ' не найден в базе этой беседы.</b>\\n\\n' +
      'Пусть он напишет сообщение в чат, или используй reply / TG ID.'
    );
    return;
  }

  if (!t || !t.id) {
    await replyTo(msg, '❌ Укажи пользователя: reply, TG ID или @username.');
    return;
  }

  if (Number(t.id) === Number(_botId)) {
    await replyTo(msg, '❌ Нельзя выдавать ранг самому боту.');
    return;
  }

  if (t.user?.is_bot) {
    await replyTo(msg, '❌ Нельзя выдавать ранги ботам.');
    return;
  }

  const chat = getChat(chatId);
  const u = getUser(chatId, t.id, t.firstName, t.username);

  if (targetRank === 100) {
    const existingOwner = Object.values(chat.users || {}).find((user) => {
      return Number(user.adminRank || 0) === 100 && Number(user.id) !== Number(t.id);
    });

    if (existingOwner) {
      await replyTo(
        msg,
        '❌ <b>Владелец уже назначен</b>\\n\\n' +
        '👑 Текущий владелец: ' + mention(existingOwner) + '\\n\\n' +
        'Чтобы передать владельца, используй команду передачи владельца.'
      );
      return;
    }

    if (actorRank < 100) {
      try {
        const m = await bot.getChatMember(chatId, msg.from.id);

        if (m.status !== 'creator') {
          await replyTo(msg, '❌ Только создатель группы может назначить владельца.');
          return;
        }
      } catch (_) {
        await replyTo(msg, '❌ Только создатель группы может назначить владельца.');
        return;
      }
    }
  }

  if (targetRank === 95) {
    const existingDeputy = Object.values(chat.users || {}).find((user) => {
      return Number(user.adminRank || 0) === 95 && Number(user.id) !== Number(t.id);
    });

    if (existingDeputy) {
      await replyTo(
        msg,
        '❌ <b>Заместитель владельца уже назначен</b>\\n\\n' +
        '🛡 Текущий заместитель: ' + mention(existingDeputy) + '\\n\\n' +
        'Сначала сними ранг с текущего заместителя, потом назначь нового.'
      );
      return;
    }
  }

  if (targetRank !== 100 && targetRank >= actorRank) {
    await replyTo(msg, \`❌ Нельзя выдать ранг ≥ своему (\${actorRank}).\`);
    return;
  }

  const currentRank = Number(u.adminRank || 0);

  if (currentRank === Number(targetRank)) {
    const ri = getRankInfo(targetRank);

    await replyTo(
      msg,
      \`⚠️ <b>Ранг уже выдан</b>

👤 \${mention(u)}
🆔 <code>\${t.id}</code>
🎚 Текущий ранг: \${ri.emoji} <b>\${ri.name}</b> (\${targetRank})

Повторно выдавать этот же ранг не нужно.\`
    );

    return;
  }

  const targetEffectiveRank = await getEffectiveRank(chatId, t.id);

  if (targetEffectiveRank >= actorRank && Number(t.id) !== Number(msg.from.id)) {
    await replyTo(msg, '❌ Нельзя изменить ранг у равного или выше себя.');
    return;
  }

  u.adminRank = targetRank;
  saveDB();

  const ri = getRankInfo(targetRank);

  if (targetRank === 0) {
    await replyTo(
      msg,
      \`👤 <b>Ранг снят</b>

👤 \${mention(u)}
🆔 <code>\${t.id}</code>
📉 Теперь обычный пользователь
👮 \${esc(msg.from.first_name)}\`
    );
  } else {
    await replyTo(
      msg,
      \`\${ri.emoji} <b>Ранг выдан</b>

👤 \${mention(u)}
🆔 <code>\${t.id}</code>
🎚 \${ri.emoji} <b>\${ri.name}</b> (\${targetRank})
👮 \${esc(msg.from.first_name)}\`
    );
  }

  await sendLog(chatId, \`🎚 Ранг \${ri.name} (\${targetRank}) → \${mention(u)} | \${msg.from.first_name}\`);
}

`;

code = replaceBlock(code, quickRankStart, quickRankEnd, newQuickRank + quickRankEnd);

// 2. В setrank добавляем защиту для 95 и 100 перед u.adminRank = nr;
const setrankNeedle = `    u.adminRank = nr;
    saveDB();`;

const setrankFix = `    if (Number(u.adminRank || 0) === Number(nr)) {
      const ri = getRankInfo(nr);

      await replyTo(
        msg,
        \`⚠️ <b>Ранг уже выдан</b>

👤 \${mention(u)}
🆔 <code>\${t.id}</code>
🎚 Текущий ранг: \${ri.emoji} <b>\${ri.name}</b> (\${nr})

Повторно выдавать этот же ранг не нужно.\`
      );

      return;
    }

    if (nr === 100 || nr === 95) {
      const existing = Object.values(getChat(chatId).users || {}).find((user) => {
        return Number(user.adminRank || 0) === Number(nr) && Number(user.id) !== Number(t.id);
      });

      if (existing) {
        const ri = getRankInfo(nr);

        await replyTo(
          msg,
          '❌ <b>' + ri.name + ' уже назначен</b>\\n\\n' +
          ri.emoji + ' Текущий пользователь: ' + mention(existing) + '\\n\\n' +
          'Сначала сними этот ранг с текущего пользователя.'
        );

        return;
      }
    }

    u.adminRank = nr;
    saveDB();`;

if (!code.includes(setrankNeedle)) {
  console.error("❌ Не нашёл setrank строку u.adminRank = nr;");
  process.exit(1);
}

code = code.replace(setrankNeedle, setrankFix);

fs.writeFileSync(path, code, "utf8");

console.log("✅ Исправлено:");
console.log("✅ Нельзя выдавать ранги ботам");
console.log("✅ Владелец может быть только один");
console.log("✅ Заместитель владельца может быть только один");
console.log("✅ Один и тот же ранг одному человеку повторно не выдаётся");
