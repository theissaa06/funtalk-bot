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

  // Убираем дубли старых ачивок
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

  // ВАЖНО:
  // Мелкие ачивки типа "Первое сообщение" больше НЕ выдаём.
  // Бот просто считает активность внутри БД.
  // Сообщение отправляется только за крупные достижения.

  if (messages >= 100) {
    addAchievement("messages_100", "💬 100 сообщений", 300);
  }

  if (messages >= 500) {
    addAchievement("messages_500", "🔥 500 сообщений", 1000);
  }

  if (messages >= 1000) {
    addAchievement("messages_1000", "👑 1000 сообщений", 2500);
  }

  if (messages >= 5000) {
    addAchievement("messages_5000", "💎 5000 сообщений", 7000);
  }

  if (reputation >= 10) {
    addAchievement("rep_10", "⭐ 10 репутации", 500);
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
    .map((item) => {
      return "✨ " + item.title + "\\n   🎁 Награда: <b>+" + item.rewardCoins + " монет</b>";
    })
    .join("\\n\\n");

  const totalReward = earned.reduce((sum, item) => sum + item.rewardCoins, 0);

  const userName = ctx.from.username
    ? "@" + escapeHtml(ctx.from.username)
    : escapeHtml(ctx.from.first_name || "Пользователь");

  return ctx.reply(
    \`🎉 <b>Новое крупное достижение!</b>

👤 <b>\${userName}</b>

\${achievementLines}

━━━━━━━━━━━━━━
💰 <b>Итог награды:</b> +\${totalReward} монет
🏆 <b>Всего крупных ачивок:</b> \${user.achievements.filter(a => !["first_message", "birthday_set"].includes(a)).length}
🪙 <b>Баланс:</b> \${user.balance || 0} монет\`,
    { parse_mode: "HTML" }
  );
}

`;

code = code.slice(0, start) + newFunction + code.slice(end);

// Убираем старую ачивку first_message из базы, чтобы она не мешала отображению
// Это не удаляет баланс, просто чистит список ачивок.
if (!code.includes("function cleanupOldSmallAchievements()")) {
  const cleanup = `
function cleanupOldSmallAchievements() {
  try {
    const db = loadDB();

    for (const chat of Object.values(db.chats || {})) {
      for (const user of Object.values(chat.users || {})) {
        if (!Array.isArray(user.achievements)) continue;

        user.achievements = user.achievements.filter((id) => {
          return !["first_message", "birthday_set"].includes(id);
        });

        user.achievements = Array.from(new Set(user.achievements));
      }
    }

    saveDB();
  } catch (error) {
    console.error("cleanupOldSmallAchievements error:", error);
  }
}

cleanupOldSmallAchievements();

`;

  code = code.replace(
    "bot.launch({ dropPendingUpdates: true });",
    cleanup + "\nbot.launch({ dropPendingUpdates: true });"
  );
}

fs.writeFileSync(path, code, "utf8");

console.log("✅ Мелкие ачивки убраны");
console.log("✅ Теперь бот выдаёт только крупные достижения");
console.log("✅ 100 / 500 / 1000 / 5000 сообщений");
console.log("✅ Активность всё равно считается внутри БД");
