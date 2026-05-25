const fs = require("fs");

const path = "index.js";
let code = fs.readFileSync(path, "utf8");

// ======================================================
// HARD FIX: запрет повторной выдачи одного и того же ранга
// ======================================================

// 1. Фикс быстрых рангов: /зам, /админ, /модер и т.д.
const quickOld = `const u  = getUser(chatId, t.id, t.firstName, t.username);
  u.adminRank = targetRank;`;

const quickNew = `const u  = getUser(chatId, t.id, t.firstName, t.username);

  if (Number(u.adminRank || 0) === Number(targetRank)) {
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

  u.adminRank = targetRank;`;

if (code.includes(quickOld)) {
  code = code.replace(quickOld, quickNew);
  console.log("✅ Быстрые ранги защищены от повторной выдачи");
} else {
  console.log("⚠️ Точный блок quickRank не найден, пробую regex");

  code = code.replace(
    /const u\s*=\s*getUser\(chatId,\s*t\.id,\s*t\.firstName,\s*t\.username\);\s*u\.adminRank\s*=\s*targetRank;/,
    quickNew
  );
}

// 2. Фикс /setrank
const setrankOld = `const u = getUser(chatId, t.id, t.firstName, t.username); u.adminRank = nr; saveDB();`;

const setrankNew = `const u = getUser(chatId, t.id, t.firstName, t.username);

    if (Number(u.adminRank || 0) === Number(nr)) {
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

    u.adminRank = nr; saveDB();`;

if (code.includes(setrankOld)) {
  code = code.replace(setrankOld, setrankNew);
  console.log("✅ /setrank защищён от повторной выдачи");
} else {
  console.log("⚠️ Точный блок setrank не найден, пробую regex");

  code = code.replace(
    /const u\s*=\s*getUser\(chatId,\s*t\.id,\s*t\.firstName,\s*t\.username\);\s*u\.adminRank\s*=\s*nr;\s*saveDB\(\);/,
    setrankNew
  );
}

// 3. Дополнительная защита: если где-то ещё есть повторное присвоение targetRank
code = code.replace(
  /u\.adminRank\s*=\s*targetRank;\s*saveDB\(\);/g,
  `if (Number(u.adminRank || 0) === Number(targetRank)) {
    const ri = getRankInfo(targetRank);
    await replyTo(msg, \`⚠️ <b>Ранг уже выдан</b>\\n\\n👤 \${mention(u)}\\n🎚 \${ri.emoji} <b>\${ri.name}</b> (\${targetRank})\`);
    return;
  }

  u.adminRank = targetRank;
  saveDB();`
);

fs.writeFileSync(path, code, "utf8");

console.log("✅ Готово: повторная выдача одинакового ранга заблокирована");
