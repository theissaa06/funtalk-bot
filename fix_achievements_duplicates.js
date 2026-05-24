const fs = require("fs");

const path = "index.js";
let code = fs.readFileSync(path, "utf8");

// ======================================================
// 1. Убираем повторные вызовы processAutoFeaturesForMessage
// ======================================================

const duplicateLine = "await processAutoFeaturesForMessage(ctx, text, autoUser);";
const parts = code.split(duplicateLine);

if (parts.length > 2) {
  code = parts[0] + duplicateLine + parts.slice(1).join("");
  console.log("✅ Убраны дубли вызова авто-ачивок");
}

// ======================================================
// 2. Полностью заменяем checkAutoAchievements на нормальную версию
// ======================================================

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

  // Убираем возможные дубли, если они уже появились раньше
  user.achievements = Array.from(new Set(user.achievements));

  const earned = [];

  function addAchievement(id, text, rewardCoins = 0) {
    if (user.achievements.includes(id)) return;

    user.achievements.push(id);

    if (rewardCoins > 0) {
      user.balance = (user.balance || 0) + rewardCoins;
      user.coins = user.balance;
    }

    earned.push({
      id,
      text,
      rewardCoins
    });
  }

  const messages = Number(user.messages || 0);
  const reputation = Number(user.reputation || 0);
  const warnsCount = Number(user.warns?.length || 0);

  if (messages >= 1) {
    addAchievement('first_message', '🏆 Первое сообщение', 25);
  }

  if (messages >= 100) {
    addAchievement('messages_100', '💬 100 сообщений', 300);
  }

  if (messages >= 500) {
    addAchievement('messages_500', '🔥 500 сообщений', 1000);
  }

  if (messages >= 1000) {
    addAchievement('messages_1000', '👑 1000 сообщений', 2500);
  }

  if (reputation >= 10) {
    addAchievement('rep_10', '⭐ 10 репутации', 500);
  }

  if (user.birthday) {
    addAchievement('birthday_set', '🎂 Указал день рождения', 200);
  }

  if (warnsCount === 0 && messages >= 100) {
    addAchievement('clean_100', '🛡 100 сообщений без предупреждений', 700);
  }

  if (!earned.length) {
    saveDB();
    return;
  }

  saveDB();

  const lines = earned.map((item) => {
    if (item.rewardCoins > 0) {
      return item.text + '  <b>+ ' + item.rewardCoins + ' монет</b>';
    }

    return item.text;
  });

  return ctx.reply(
    \`🎉 <b>Новое достижение!</b>

👤 \${mentionUser(ctx.from)}

\${lines.join('\\n')}

━━━━━━━━━━━━━━
🏆 Всего ачивок: <b>\${user.achievements.length}</b>
🪙 Баланс: <b>\${user.balance || 0}</b> монет\`,
    { parse_mode: 'HTML' }
  );
}

`;

code = code.slice(0, start) + newFunction + code.slice(end);

// ======================================================
// 3. Чиним processAutoFeaturesForMessage, чтобы ачивки не спамились на системных/командных штуках
// ======================================================

const processStart = code.indexOf("async function processAutoFeaturesForMessage(ctx, text, user) {");
const processEnd = code.indexOf("function getWeeklyStats(chat)", processStart);

if (processStart === -1 || processEnd === -1) {
  console.error("❌ Не нашёл processAutoFeaturesForMessage или getWeeklyStats");
  process.exit(1);
}

const newProcess = `async function processAutoFeaturesForMessage(ctx, text, user) {
  if (!ctx.chat || !ctx.from || ctx.from.is_bot) return;
  if (!user) return;

  const messageText = String(text || '').trim();

  // Не обрабатываем пустые сообщения
  if (!messageText) return;

  const chat = getChatDB(ctx.chat.id);
  const cfg = ensureAutoFeatures(chat);

  if (!cfg.enabled) return;

  // День рождения и напоминания срабатывают только на подходящие фразы
  const birthdaySaved = await tryAutoSaveBirthday(ctx, messageText, user);
  if (birthdaySaved) return;

  const reminderCreated = await tryAutoCreateReminder(ctx, messageText);
  if (reminderCreated) return;

  // Ачивки проверяются всегда, но каждая выдаётся только 1 раз
  await checkAutoAchievements(ctx, user);
}

`;

code = code.slice(0, processStart) + newProcess + code.slice(processEnd);

fs.writeFileSync(path, code, "utf8");

console.log("✅ Ачивки исправлены");
console.log("✅ Повторная выдача Первого сообщения убрана");
console.log("✅ Добавлены монеты за достижения");
