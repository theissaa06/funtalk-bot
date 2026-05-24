const fs = require("fs");

const path = "index.js";
let code = fs.readFileSync(path, "utf8");

const insertBefore = "function mainMenuKeyboard() {";

if (!code.includes("function ensureAutoFeatures(chat)")) {
  const block = `
function ensureAutoFeatures(chat) {
  if (!chat.settings) chat.settings = {};

  if (!chat.settings.autoFeatures) {
    chat.settings.autoFeatures = {
      enabled: true,
      timezone: 'Asia/Almaty',
      birthdayTime: '09:00',
      weeklyReportTime: '20:00',
      lastWeeklyReportDate: null
    };
  }

  if (!chat.reminders) chat.reminders = [];
  return chat.settings.autoFeatures;
}

function getAutoTimeParts(timezone = 'Asia/Almaty') {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    weekday: 'short',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).formatToParts(new Date());

  const data = {};
  for (const part of parts) data[part.type] = part.value;

  return {
    weekday: data.weekday,
    date: data.year + '-' + data.month + '-' + data.day,
    monthDay: data.day + '.' + data.month,
    time: data.hour + ':' + data.minute
  };
}

function normalizeBirthdayDayMonth(day, month) {
  const d = Number(day);
  const m = Number(month);

  if (!d || !m) return null;
  if (d < 1 || d > 31) return null;
  if (m < 1 || m > 12) return null;

  return {
    day: String(d).padStart(2, '0'),
    month: String(m).padStart(2, '0')
  };
}

async function tryAutoSaveBirthday(ctx, text, user) {
  const lower = String(text || '').toLowerCase();

  const hasBirthdayWords =
    lower.includes('др') ||
    lower.includes('днюха') ||
    lower.includes('день рождения') ||
    lower.includes('родился') ||
    lower.includes('родилась');

  if (!hasBirthdayWords) return false;

  const match = lower.match(/(\\d{1,2})[\\.\\/-](\\d{1,2})/);

  if (!match) return false;

  const date = normalizeBirthdayDayMonth(match[1], match[2]);
  if (!date) return false;

  user.birthday = {
    day: date.day,
    month: date.month,
    setAt: new Date().toISOString()
  };

  if (!user.achievements) user.achievements = [];

  if (!user.achievements.includes('birthday_set')) {
    user.achievements.push('birthday_set');
  }

  saveDB();

  await ctx.reply(
    \`🎂 <b>День рождения запомнил!</b>

👤 Пользователь: \${mentionUser(ctx.from)}
📅 Дата: <b>\${date.day}.\${date.month}</b>

В этот день бот поздравит тебя в беседе 🥳\`,
    { parse_mode: 'HTML' }
  );

  return true;
}

function parseNaturalReminder(text) {
  const raw = String(text || '').trim();
  const lower = raw.toLowerCase();

  if (!lower.startsWith('напомни')) return null;

  let match = lower.match(/^напомни\\s+через\\s+(\\d+)\\s*(минут|минуту|минуты|мин|час|часа|часов)\\s+(.+)/i);

  if (match) {
    const amount = Number(match[1]);
    const unit = match[2];
    const reminderText = raw.slice(match[0].indexOf(match[3])).trim();

    let ms = 0;

    if (unit.startsWith('мин')) ms = amount * 60 * 1000;
    else ms = amount * 60 * 60 * 1000;

    return {
      dueAt: Date.now() + ms,
      text: reminderText,
      human: 'через ' + amount + ' ' + unit
    };
  }

  match = lower.match(/^напомни\\s+завтра\\s+в\\s+(\\d{1,2}):(\\d{2})\\s+(.+)/i);

  if (match) {
    const hour = Number(match[1]);
    const minute = Number(match[2]);

    if (hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59) {
      const due = new Date();
      due.setDate(due.getDate() + 1);
      due.setHours(hour, minute, 0, 0);

      const reminderText = raw.slice(match[0].indexOf(match[3])).trim();

      return {
        dueAt: due.getTime(),
        text: reminderText,
        human: 'завтра в ' + String(hour).padStart(2, '0') + ':' + String(minute).padStart(2, '0')
      };
    }
  }

  return null;
}

async function tryAutoCreateReminder(ctx, text) {
  const reminder = parseNaturalReminder(text);
  if (!reminder) return false;

  const chat = getChatDB(ctx.chat.id);
  ensureAutoFeatures(chat);

  chat.reminders.push({
    id: 'rem_' + Date.now() + '_' + Math.floor(Math.random() * 99999),
    userId: ctx.from.id,
    userName: ctx.from.first_name || ctx.from.username || 'Пользователь',
    text: reminder.text,
    dueAt: reminder.dueAt,
    createdAt: new Date().toISOString(),
    done: false
  });

  saveDB();

  await ctx.reply(
    \`⏰ <b>Напоминание создано!</b>

👤 Для: \${mentionUser(ctx.from)}
📝 Текст: <b>\${escapeHtml(reminder.text)}</b>
⏳ Когда: <b>\${escapeHtml(reminder.human)}</b>\`,
    { parse_mode: 'HTML' }
  );

  return true;
}

async function checkAutoAchievements(ctx, user) {
  if (!user.achievements) user.achievements = [];

  const earned = [];

  function addAchievement(id, text) {
    if (!user.achievements.includes(id)) {
      user.achievements.push(id);
      earned.push(text);
    }
  }

  if ((user.messages || 0) >= 1) addAchievement('first_message', '🏆 Первое сообщение');
  if ((user.messages || 0) >= 100) addAchievement('messages_100', '💬 100 сообщений');
  if ((user.messages || 0) >= 500) addAchievement('messages_500', '🔥 500 сообщений');
  if ((user.messages || 0) >= 1000) addAchievement('messages_1000', '👑 1000 сообщений');
  if ((user.reputation || 0) >= 10) addAchievement('rep_10', '⭐ 10 репутации');
  if (user.birthday) addAchievement('birthday_set', '🎂 Указал день рождения');
  if ((user.warns?.length || 0) === 0 && (user.messages || 0) >= 100) {
    addAchievement('clean_100', '🛡 100 сообщений без предупреждений');
  }

  if (earned.length) {
    saveDB();

    await ctx.reply(
      \`🎉 <b>Новое достижение!</b>

👤 \${mentionUser(ctx.from)}

\${earned.join('\\n')}\`,
      { parse_mode: 'HTML' }
    );
  }
}

async function processAutoFeaturesForMessage(ctx, text, user) {
  if (!ctx.chat || !ctx.from || ctx.from.is_bot) return;

  const chat = getChatDB(ctx.chat.id);
  const cfg = ensureAutoFeatures(chat);

  if (!cfg.enabled) return;

  const birthdaySaved = await tryAutoSaveBirthday(ctx, text, user);
  if (birthdaySaved) return;

  const reminderCreated = await tryAutoCreateReminder(ctx, text);
  if (reminderCreated) return;

  await checkAutoAchievements(ctx, user);
}

function getWeeklyStats(chat) {
  const now = new Date();
  const days = [];

  for (let i = 0; i < 7; i++) {
    const d = new Date(now);
    d.setDate(now.getDate() - i);
    days.push(d.toISOString().slice(0, 10));
  }

  let totalMessages = 0;
  let activeUsers = 0;
  let topUser = null;
  let topScore = 0;
  let topRepUser = null;
  let topRep = -999999;
  let warns = 0;

  for (const user of Object.values(chat.users || {})) {
    let userWeekMessages = 0;

    for (const day of days) {
      userWeekMessages += user.messagesDay?.[day] || 0;
    }

    if (userWeekMessages > 0) activeUsers++;
    totalMessages += userWeekMessages;

    if (userWeekMessages > topScore) {
      topScore = userWeekMessages;
      topUser = user;
    }

    if ((user.reputation || 0) > topRep) {
      topRep = user.reputation || 0;
      topRepUser = user;
    }

    warns += user.warns?.length || 0;
  }

  return {
    totalMessages,
    activeUsers,
    topUser,
    topScore,
    topRepUser,
    topRep,
    warns
  };
}

async function sendWeeklyReport(chatId) {
  const chat = getChatDB(chatId);
  const stats = getWeeklyStats(chat);

  const topName = stats.topUser
    ? usernameText(stats.topUser)
    : 'пока нет';

  const repName = stats.topRepUser
    ? usernameText(stats.topRepUser)
    : 'пока нет';

  await bot.telegram.sendMessage(
    chatId,
    \`📊 <b>Итоги недели</b>

💬 Сообщений за неделю: <b>\${stats.totalMessages}</b>
👥 Активных участников: <b>\${stats.activeUsers}</b>
🏆 Самый активный: <b>\${topName}</b> — <b>\${stats.topScore}</b>
⭐ Больше всего репутации: <b>\${repName}</b>
⚠️ Предупреждений в базе: <b>\${stats.warns}</b>

━━━━━━━━━━━━━━
🚀 Новая неделя — новый топ!\`,
    { parse_mode: 'HTML' }
  );
}

function startAutoFeaturesScheduler() {
  setInterval(async () => {
    try {
      const db = loadDB();

      for (const chatId of Object.keys(db.chats || {})) {
        const chat = db.chats[chatId];
        const cfg = ensureAutoFeatures(chat);
        const now = getAutoTimeParts(cfg.timezone || 'Asia/Almaty');

        // Напоминания
        const reminders = chat.reminders || [];

        for (const reminder of reminders) {
          if (reminder.done) continue;
          if (Date.now() < reminder.dueAt) continue;

          reminder.done = true;
          saveDB();

          await bot.telegram.sendMessage(
            chatId,
            \`🔔 <b>Напоминание</b>

\${mentionById(reminder.userId, reminder.userName)}, ты просил напомнить:

📝 <b>\${escapeHtml(reminder.text)}</b>\`,
            { parse_mode: 'HTML' }
          ).catch((error) => console.error('reminder send error:', error.message));
        }

        chat.reminders = reminders.filter((r) => !r.done);

        // Дни рождения
        if (now.time === cfg.birthdayTime) {
          for (const user of Object.values(chat.users || {})) {
            if (!user.birthday) continue;

            const md = user.birthday.day + '.' + user.birthday.month;
            const key = now.date + ':' + user.id;

            if (md === now.monthDay && user.lastBirthdayCongrats !== key) {
              user.lastBirthdayCongrats = key;
              saveDB();

              await bot.telegram.sendMessage(
                chatId,
                \`🎉 <b>Сегодня день рождения!</b>

Поздравляем \${mentionById(user.id, user.firstName || user.username || 'пользователя')} 🥳

Желаем счастья, здоровья, хорошего настроения и много крутых моментов в жизни 🎂✨\`,
                { parse_mode: 'HTML' }
              ).catch((error) => console.error('birthday send error:', error.message));
            }
          }
        }

        // Еженедельный отчёт — воскресенье 20:00
        if (now.weekday === 'Sun' && now.time === cfg.weeklyReportTime && cfg.lastWeeklyReportDate !== now.date) {
          cfg.lastWeeklyReportDate = now.date;
          saveDB();

          await sendWeeklyReport(chatId).catch((error) => {
            console.error('weekly report error:', error.message);
          });
        }
      }

      saveDB();
    } catch (error) {
      console.error('auto features scheduler error:', error);
    }
  }, 60 * 1000);
}

`;

  if (!code.includes(insertBefore)) {
    console.error("❌ Не нашёл function mainMenuKeyboard()");
    process.exit(1);
  }

  code = code.replace(insertBefore, block + insertBefore);
}

// Добавляем обработку каждого обычного сообщения
const targetLine = "if (parsed) return handleCommand(ctx, parsed);";

if (!code.includes("await processAutoFeaturesForMessage(ctx, text, user);")) {
  code = code.replace(
    targetLine,
    `if (!parsed && isGroup(ctx)) {
      const autoChat = getChatDB(ctx.chat.id);
      const autoUser = getUserDB(autoChat, ctx.from);
      await processAutoFeaturesForMessage(ctx, text, autoUser);
    }

    ${targetLine}`
  );
}

// Запускаем авто-системы перед bot.launch
if (!code.includes("startAutoFeaturesScheduler();")) {
  code = code.replace(
    "bot.launch({ dropPendingUpdates: true });",
    "startAutoFeaturesScheduler();\n\nbot.launch({ dropPendingUpdates: true });"
  );
}

fs.writeFileSync(path, code, "utf8");

console.log("✅ Добавлены авто-дни рождения без команд");
console.log("✅ Добавлены авто-напоминания без команд");
console.log("✅ Добавлены авто-ачивки без команд");
console.log("✅ Добавлен еженедельный отчёт без команд");
