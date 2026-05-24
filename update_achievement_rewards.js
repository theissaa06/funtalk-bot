const fs = require("fs");

const path = "index.js";
let code = fs.readFileSync(path, "utf8");

const start = code.indexOf("async function checkAutoAchievements(ctx, user) {");
const end = code.indexOf("async function processAutoFeaturesForMessage", start);

if (start === -1 || end === -1) {
  console.error("❌ Не нашёл checkAutoAchievements или processAutoFeaturesForMessage");
  process.exit(1);
}

const newFunction = `async function checkAutoAchievements(ctx, user) {
  if (!user) return;

  if (!Array.isArray(user.achievements)) {
    user.achievements = [];
  }

  // Убираем дубли старых ачивок, если они появились раньше
  user.achievements = Array.from(new Set(user.achievements));

  const earned = [];

  function addAchievement(id, title, rewardCoins) {
    if (user.achievements.includes(id)) return;

    user.achievements.push(id);

    user.balance = Number(user.balance || 0) + rewardCoins;
    user.coins = user.balance;

    earned.push({
      id,
      title,
      rewardCoins
    });
  }

  const messages = Number(user.messages || 0);
  const reputation = Number(user.reputation || 0);
  const warnsCount = Number(user.warns?.length || 0);

  // 🏆 Награды за достижения
  if (messages >= 1) {
    addAchievement("first_message", "🏆 Первое сообщение", 25);
  }

  if (messages >= 100) {
    addAchievement("messages_100", "💬 100 сообщений", 300);
  }

  if (messages >= 500) {
    addAchievement("messages_500", "🔥 500 сообщений", 1000);
  }

  if (messages >= 1000) {
    addAchievement("messages_1000", "👑 1000 сообщений", 2500);
  }

  if (reputation >= 10) {
    addAchievement("rep_10", "⭐ 10 репутации", 500);
  }

  if (user.birthday) {
    addAchievement("birthday_set", "🎂 Указал день рождения", 200);
  }

  if (warnsCount === 0 && messages >= 100) {
    addAchievement("clean_100", "🛡 100 сообщений без предупреждений", 700);
  }

  if (!earned.length) {
    saveDB();
    return;
  }

  saveDB();

  const achievementLines = earned
    .map((item) => item.title + " → <b>+" + item.rewardCoins + " монет</b>")
    .join("\\n");

  const totalReward = earned.reduce((sum, item) => sum + item.rewardCoins, 0);

  return ctx.reply(
    \`🎉 <b>Новое достижение!</b>

👤 \${mentionUser(ctx.from)}

\${achievementLines}

━━━━━━━━━━━━━━
🎁 Получено монет: <b>+\${totalReward}</b>
🏆 Всего ачивок: <b>\${user.achievements.length}</b>
🪙 Баланс: <b>\${user.balance || 0}</b> монет\`,
    { parse_mode: "HTML" }
  );
}

`;

code = code.slice(0, start) + newFunction + code.slice(end);

fs.writeFileSync(path, code, "utf8");

console.log("✅ Ачивки с наградами обновлены");
console.log("🏆 Первое сообщение: +25 монет");
console.log("💬 100 сообщений: +300 монет");
console.log("🔥 500 сообщений: +1000 монет");
console.log("👑 1000 сообщений: +2500 монет");
console.log("⭐ 10 репутации: +500 монет");
console.log("🎂 Указал день рождения: +200 монет");
console.log("🛡 100 сообщений без предов: +700 монет");
