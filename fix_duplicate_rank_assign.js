const fs = require("fs");

const path = "index.js";
let code = fs.readFileSync(path, "utf8");

// ======================================================
// FIX DUPLICATE RANK ASSIGN
// Нельзя выдавать один и тот же ранг повторно
// ======================================================

// 1. Фиксим quickRank
let start = code.indexOf("async function quickRank(msg, args, targetRank, chatId) {");
let end = code.indexOf("// ── ACHIEVEMENTS", start);

if (start === -1 || end === -1) {
  console.error("❌ Не нашёл quickRank или блок ACHIEVEMENTS");
  process.exit(1);
}

const newQuickRank = `async function quickRank(msg, args, targetRank, chatId) {
  if (!await guardGroup(msg)) return;

  const actorRank = await getEffectiveRank(chatId, msg.from.id);

  if (targetRank === 100) {
    const existing = Object.values(getChat(chatId).users).find(u => u.adminRank === 100);

    if (existing && String(existing.id) !== String(msg.from.id)) {
      await replyTo(msg, '❌ Владелец уже назначен. Используй /transferowner');
      return;
    }

    if (actorRank < 100) {
      try {
        const m = await bot.getChatMember(chatId, msg.from.id);

        if (m.status !== 'creator') {
          await replyTo(msg, '❌ Только создатель группы.');
          return;
        }
      } catch (_) {
        await replyTo(msg, '❌ Только создатель группы.');
        return;
      }
    }
  } else if (targetRank >= actorRank) {
    await replyTo(msg, \`❌ Нельзя выдать ранг ≥ своему (\${actorRank}).\`);
    return;
  }

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

  const u = getUser(chatId, t.id, t.firstName, t.username);
  const currentRank = Number(u.adminRank || 0);

  if (currentRank === Number(targetRank)) {
    const ri = getRankInfo(targetRank);

    await replyTo(
      msg,
      \`⚠️ <b>Ранг уже выдан</b>\\n\\n👤 \${mention(u)}\\n🆔 <code>\${t.id}</code>\\n🎚 Текущий ранг: \${ri.emoji} <b>\${ri.name}</b> (\${targetRank})\\n\\nПовторно выдавать этот же ранг не нужно.\`
    );
    return;
  }

  // Нельзя менять ранг равного/выше себя
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
      \`👤 <b>Ранг снят</b>\\n\\n👤 \${mention(u)}\\n🆔 <code>\${t.id}</code>\\n📉 Теперь обычный пользователь\\n👮 \${esc(msg.from.first_name)}\`
    );
  } else {
    await replyTo(
      msg,
      \`\${ri.emoji} <b>Ранг выдан</b>\\n\\n👤 \${mention(u)}\\n🆔 <code>\${t.id}</code>\\n🎚 \${ri.emoji} <b>\${ri.name}</b> (\${targetRank})\\n👮 \${esc(msg.from.first_name)}\`
    );
  }

  await sendLog(chatId, \`🎚 Ранг \${ri.name} (\${targetRank}) → \${mention(u)} | \${msg.from.first_name}\`);
}

`;

code = code.slice(0, start) + newQuickRank + code.slice(end);

// 2. Фиксим обычный /setrank
start = code.indexOf("  case 'setrank': {");
end = code.indexOf("  case 'delrank':", start);

if (start === -1 || end === -1) {
  console.error("❌ Не нашёл case setrank или delrank");
  process.exit(1);
}

const newSetRankCase = `  case 'setrank': {
    if (!await guardGroup(msg) || !await guardRank(msg, 20)) return;

    const t = await guardTarget(msg, args, chatId);
    if (!t) return;

    const nr = parseInt(t.args[0], 10);

    if (isNaN(nr) || !RANKS[nr]) {
      await replyTo(msg, \`❌ Неверный ранг. Допустимые: \${Object.keys(RANKS).join(', ')}\`);
      return;
    }

    const ar = await getEffectiveRank(chatId, msg.from.id);

    if (nr >= ar) {
      await replyTo(msg, \`❌ Нельзя выдать ранг ≥ своему (\${ar}).\`);
      return;
    }

    const u = getUser(chatId, t.id, t.firstName, t.username);
    const currentRank = Number(u.adminRank || 0);

    if (currentRank === Number(nr)) {
      const ri = getRankInfo(nr);

      await replyTo(
        msg,
        \`⚠️ <b>Ранг уже выдан</b>\\n\\n👤 \${mention(u)}\\n🆔 <code>\${t.id}</code>\\n🎚 Текущий ранг: \${ri.emoji} <b>\${ri.name}</b> (\${nr})\\n\\nПовторно выдавать этот же ранг не нужно.\`
      );
      return;
    }

    const tr = await getEffectiveRank(chatId, t.id);

    if (tr >= ar) {
      await replyTo(msg, '❌ Нельзя изменить ранг у равного или выше себя.');
      return;
    }

    u.adminRank = nr;
    saveDB();

    const ri = getRankInfo(nr);

    await replyTo(
      msg,
      \`\${ri.emoji} <b>Ранг выдан</b>\\n\\n👤 \${mention(u)}\\n🆔 <code>\${t.id}</code>\\n🎚 \${ri.name} (\${nr})\\n👮 \${esc(msg.from.first_name)}\`
    );

    await sendLog(chatId, \`🎚 Ранг \${ri.name}(\${nr}) → \${mention(u)} | \${msg.from.first_name}\`);
    break;
  }

`;

code = code.slice(0, start) + newSetRankCase + code.slice(end);

fs.writeFileSync(path, code, "utf8");

console.log("✅ Защита от повторной выдачи ранга добавлена");
console.log("✅ Работает для быстрых рангов: админ/модер/куратор и т.д.");
console.log("✅ Работает для /setrank и выдатьранг");
