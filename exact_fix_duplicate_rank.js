const fs = require("fs");

const path = "index.js";
let code = fs.readFileSync(path, "utf8");

// ======================================================
// EXACT FIX DUPLICATE RANK BY FOUND LINES
// ======================================================

// 1. quickRank: перед u.adminRank = targetRank;
const quickTarget = `  u.adminRank = targetRank;
  saveDB();`;

const quickReplacement = `  if (Number(u.adminRank || 0) === Number(targetRank)) {
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

  u.adminRank = targetRank;
  saveDB();`;

if (!code.includes(quickTarget)) {
  console.error("❌ Не нашёл quickRank строку u.adminRank = targetRank;");
  process.exit(1);
}

code = code.replace(quickTarget, quickReplacement);

// 2. setrank: перед u.adminRank = nr;
const setrankTarget = `    u.adminRank = nr;
    saveDB();`;

const setrankReplacement = `    if (Number(u.adminRank || 0) === Number(nr)) {
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

    u.adminRank = nr;
    saveDB();`;

if (!code.includes(setrankTarget)) {
  console.error("❌ Не нашёл setrank строку u.adminRank = nr;");
  process.exit(1);
}

code = code.replace(setrankTarget, setrankReplacement);

fs.writeFileSync(path, code, "utf8");

console.log("✅ Точно исправлено: повторная выдача quickRank заблокирована");
console.log("✅ Точно исправлено: повторная выдача setrank заблокирована");
