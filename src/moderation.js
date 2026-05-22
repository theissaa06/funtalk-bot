const fs = require("fs");
const path = require("path");
const Database = require("better-sqlite3");

const dbPath = process.env.DATABASE_PATH || "./data/bot.sqlite";
const dbDir = path.dirname(dbPath);

if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const db = new Database(dbPath);

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  chat_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  username TEXT,
  first_name TEXT,
  last_name TEXT,
  total_messages INTEGER DEFAULT 0,
  today_messages INTEGER DEFAULT 0,
  today_date TEXT,
  warns INTEGER DEFAULT 0,
  joined_at INTEGER,
  last_active_at INTEGER,
  muted_until INTEGER DEFAULT 0,
  PRIMARY KEY (chat_id, user_id)
);

CREATE TABLE IF NOT EXISTS chat_settings (
  chat_id TEXT PRIMARY KEY,
  autokick_enabled INTEGER DEFAULT 0,
  autokick_days INTEGER DEFAULT 2
);

CREATE TABLE IF NOT EXISTS mod_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  chat_id TEXT NOT NULL,
  moderator_id TEXT,
  target_id TEXT,
  action TEXT NOT NULL,
  reason TEXT,
  created_at INTEGER NOT NULL
);
`);

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function now() {
  return Date.now();
}

function normalizeUsername(username) {
  return String(username || "").replace("@", "").toLowerCase();
}

function formatDate(ts) {
  if (!ts) return "нет данных";
  return new Date(Number(ts)).toLocaleString("ru-RU");
}

function getDisplayName(user) {
  if (!user) return "Неизвестно";
  if (user.username) return `@${user.username}`;
  return [user.first_name, user.last_name].filter(Boolean).join(" ") || `ID ${user.user_id || user.id}`;
}

function ensureSettings(chatId) {
  db.prepare(`
    INSERT OR IGNORE INTO chat_settings (chat_id, autokick_enabled, autokick_days)
    VALUES (?, 0, 2)
  `).run(String(chatId));
}

function saveModLog(chatId, moderatorId, targetId, action, reason = "") {
  db.prepare(`
    INSERT INTO mod_logs (chat_id, moderator_id, target_id, action, reason, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(String(chatId), String(moderatorId || ""), String(targetId || ""), action, reason, now());
}

function upsertUser(chatId, user, countMessage = true) {
  if (!chatId || !user || user.is_bot) return;

  const chat = String(chatId);
  const id = String(user.id);
  const date = todayKey();
  const current = db.prepare(`
    SELECT * FROM users WHERE chat_id = ? AND user_id = ?
  `).get(chat, id);

  if (!current) {
    db.prepare(`
      INSERT INTO users (
        chat_id, user_id, username, first_name, last_name,
        total_messages, today_messages, today_date, warns, joined_at, last_active_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)
    `).run(
      chat,
      id,
      normalizeUsername(user.username),
      user.first_name || "",
      user.last_name || "",
      countMessage ? 1 : 0,
      countMessage ? 1 : 0,
      date,
      now(),
      now()
    );
    return;
  }

  let todayMessages = current.today_messages || 0;

  if (current.today_date !== date) {
    todayMessages = 0;
  }

  db.prepare(`
    UPDATE users
    SET username = ?,
        first_name = ?,
        last_name = ?,
        total_messages = total_messages + ?,
        today_messages = ?,
        today_date = ?,
        last_active_at = ?
    WHERE chat_id = ? AND user_id = ?
  `).run(
    normalizeUsername(user.username),
    user.first_name || "",
    user.last_name || "",
    countMessage ? 1 : 0,
    countMessage + todayMessages,
    date,
    now(),
    chat,
    id
  );
}

function getUser(chatId, userId) {
  return db.prepare(`
    SELECT * FROM users WHERE chat_id = ? AND user_id = ?
  `).get(String(chatId), String(userId));
}

function findUserByUsername(chatId, username) {
  return db.prepare(`
    SELECT * FROM users
    WHERE chat_id = ? AND lower(username) = ?
  `).get(String(chatId), normalizeUsername(username));
}

function parseArgs(ctx) {
  const text = ctx.message?.text || "";
  return text.split(/\s+/).slice(1);
}

function getReason(args, startIndex = 1) {
  return args.slice(startIndex).join(" ").trim() || "без причины";
}

function parseDuration(value) {
  const raw = String(value || "").toLowerCase().trim();
  const match = raw.match(/^(\d+)(m|h|d)$/);

  if (!match) return null;

  const amount = Number(match[1]);
  const unit = match[2];

  if (unit === "m") return amount * 60;
  if (unit === "h") return amount * 60 * 60;
  if (unit === "d") return amount * 60 * 60 * 24;

  return null;
}

async function isAdmin(ctx, userId) {
  try {
    const member = await ctx.telegram.getChatMember(ctx.chat.id, userId);
    return member.status === "creator" || member.status === "administrator";
  } catch {
    return false;
  }
}

async function requireGroup(ctx, safeReply) {
  const type = ctx.chat?.type;
  if (type !== "group" && type !== "supergroup") {
    await safeReply(ctx, "Эта команда работает только в группе.");
    return false;
  }
  return true;
}

async function requireAdmin(ctx, safeReply) {
  const ok = await isAdmin(ctx, ctx.from.id);

  if (!ok) {
    await safeReply(ctx, "⛔ Эту команду может использовать только админ.");
    return false;
  }

  return true;
}

async function resolveTarget(ctx, args, safeReply) {
  const replyUser = ctx.message?.reply_to_message?.from;

  if (replyUser && !replyUser.is_bot) {
    upsertUser(ctx.chat.id, replyUser, false);

    return {
      id: replyUser.id,
      username: replyUser.username || "",
      first_name: replyUser.first_name || "",
      last_name: replyUser.last_name || "",
    };
  }

  const raw = args[0];

  if (!raw) {
    await safeReply(ctx, "Укажи пользователя: ответом на сообщение, @username или ID.");
    return null;
  }

  if (raw.startsWith("@")) {
    const found = findUserByUsername(ctx.chat.id, raw);

    if (!found) {
      await safeReply(
        ctx,
        "Я пока не знаю этого пользователя. Пусть он напишет хотя бы одно сообщение в группе, либо используй команду ответом на его сообщение."
      );
      return null;
    }

    return {
      id: Number(found.user_id),
      username: found.username,
      first_name: found.first_name,
      last_name: found.last_name,
    };
  }

  if (/^\d+$/.test(raw)) {
    const found = getUser(ctx.chat.id, raw);

    return {
      id: Number(raw),
      username: found?.username || "",
      first_name: found?.first_name || "",
      last_name: found?.last_name || "",
    };
  }

  await safeReply(ctx, "Не понял пользователя. Используй ответ на сообщение, @username или ID.");
  return null;
}

function profileText(user) {
  return (
    "👤 Профиль пользователя\n\n" +
    `Имя: ${getDisplayName(user)}\n` +
    `ID: ${user.user_id || user.id}\n` +
    `Сообщений всего: ${user.total_messages || 0}\n` +
    `Сообщений сегодня: ${user.today_messages || 0}\n` +
    `Варнов: ${user.warns || 0}\n` +
    `В чате с: ${formatDate(user.joined_at)}\n` +
    `Последняя активность: ${formatDate(user.last_active_at)}`
  );
}

function moderationHelpText() {
  return (
    "🛡 Команды модерации:\n\n" +
    "/profile — мой профиль\n" +
    "/profile @user — профиль пользователя\n" +
    "/stats — статистика группы\n" +
    "/top — топ активных\n" +
    "/today — топ за сегодня\n" +
    "/inactive — неактивные пользователи\n\n" +
    "/warn @user причина — выдать варн\n" +
    "/warns @user — показать варны\n" +
    "/clearwarns @user — очистить варны\n" +
    "/kick @user причина — кикнуть\n" +
    "/ban @user причина — забанить\n" +
    "/unban ID — разбанить по ID\n" +
    "/mute @user 30m причина — замутить\n" +
    "/unmute @user — размутить\n" +
    "/modlog — последние действия\n\n" +
    "/autokick_on — включить авто-кик неактивных\n" +
    "/autokick_off — выключить авто-кик\n" +
    "/autokick_days 2 — кикать после 2 дней неактива\n" +
    "/settings — настройки группы\n\n" +
    "Важно: лучше использовать команды ответом на сообщение пользователя."
  );
}

function registerModeration(bot, helpers) {
  const { safeReply, isPrivateChat } = helpers;

  bot.use(async (ctx, next) => {
    try {
      const type = ctx.chat?.type;
      const user = ctx.from;

      if ((type === "group" || type === "supergroup") && user && !user.is_bot) {
        ensureSettings(ctx.chat.id);
        upsertUser(ctx.chat.id, user, true);
      }
    } catch (error) {
      console.error("Ошибка записи активности:", error.message);
    }

    return next();
  });

  bot.command("modhelp", async (ctx) => {
    return safeReply(ctx, moderationHelpText());
  });

  bot.command("profile", async (ctx) => {
    if (!(await requireGroup(ctx, safeReply))) return;

    const args = parseArgs(ctx);
    let target = null;

    if (args.length > 0 || ctx.message?.reply_to_message) {
      target = await resolveTarget(ctx, args, safeReply);
      if (!target) return;
    } else {
      target = ctx.from;
    }

    upsertUser(ctx.chat.id, target, false);

    const user = getUser(ctx.chat.id, target.id);

    return safeReply(ctx, profileText(user || {
      user_id: target.id,
      username: target.username,
      first_name: target.first_name,
      last_name: target.last_name,
    }));
  });

  bot.command("stats", async (ctx) => {
    if (!(await requireGroup(ctx, safeReply))) return;

    const chatId = String(ctx.chat.id);
    const users = db.prepare(`SELECT COUNT(*) as count FROM users WHERE chat_id = ?`).get(chatId);
    const total = db.prepare(`SELECT SUM(total_messages) as total FROM users WHERE chat_id = ?`).get(chatId);
    const today = db.prepare(`SELECT SUM(today_messages) as total FROM users WHERE chat_id = ? AND today_date = ?`).get(chatId, todayKey());
    const activeToday = db.prepare(`SELECT COUNT(*) as count FROM users WHERE chat_id = ? AND today_messages > 0 AND today_date = ?`).get(chatId, todayKey());

    return safeReply(
      ctx,
      "📊 Статистика группы\n\n" +
        `Пользователей в базе: ${users.count || 0}\n` +
        `Сообщений всего: ${total.total || 0}\n` +
        `Сообщений сегодня: ${today.total || 0}\n` +
        `Активных сегодня: ${activeToday.count || 0}`
    );
  });

  bot.command("top", async (ctx) => {
    if (!(await requireGroup(ctx, safeReply))) return;

    const rows = db.prepare(`
      SELECT * FROM users
      WHERE chat_id = ?
      ORDER BY total_messages DESC
      LIMIT 10
    `).all(String(ctx.chat.id));

    if (!rows.length) return safeReply(ctx, "Пока нет статистики.");

    const text = rows
      .map((u, i) => `${i + 1}. ${getDisplayName(u)} — ${u.total_messages || 0} сообщений`)
      .join("\n");

    return safeReply(ctx, "🏆 Топ активных пользователей:\n\n" + text);
  });

  bot.command("today", async (ctx) => {
    if (!(await requireGroup(ctx, safeReply))) return;

    const rows = db.prepare(`
      SELECT * FROM users
      WHERE chat_id = ? AND today_date = ?
      ORDER BY today_messages DESC
      LIMIT 10
    `).all(String(ctx.chat.id), todayKey());

    if (!rows.length) return safeReply(ctx, "Сегодня пока нет активности.");

    const text = rows
      .map((u, i) => `${i + 1}. ${getDisplayName(u)} — ${u.today_messages || 0} сообщений`)
      .join("\n");

    return safeReply(ctx, "🔥 Топ за сегодня:\n\n" + text);
  });

  bot.command("inactive", async (ctx) => {
    if (!(await requireGroup(ctx, safeReply))) return;

    const settings = db.prepare(`SELECT * FROM chat_settings WHERE chat_id = ?`).get(String(ctx.chat.id));
    const days = settings?.autokick_days || 2;
    const limit = now() - days * 24 * 60 * 60 * 1000;

    const rows = db.prepare(`
      SELECT * FROM users
      WHERE chat_id = ? AND last_active_at < ?
      ORDER BY last_active_at ASC
      LIMIT 20
    `).all(String(ctx.chat.id), limit);

    if (!rows.length) return safeReply(ctx, `Неактивных больше ${days} дней нет.`);

    const text = rows
      .map((u, i) => `${i + 1}. ${getDisplayName(u)} — последняя активность: ${formatDate(u.last_active_at)}`)
      .join("\n");

    return safeReply(ctx, `😴 Неактивные больше ${days} дней:\n\n${text}`);
  });

  bot.command("warn", async (ctx) => {
    if (!(await requireGroup(ctx, safeReply))) return;
    if (!(await requireAdmin(ctx, safeReply))) return;

    const args = parseArgs(ctx);
    const target = await resolveTarget(ctx, args, safeReply);
    if (!target) return;

    if (await isAdmin(ctx, target.id)) {
      return safeReply(ctx, "Нельзя выдавать варн администратору.");
    }

    const reason = getReason(args);
    upsertUser(ctx.chat.id, target, false);

    db.prepare(`
      UPDATE users SET warns = warns + 1
      WHERE chat_id = ? AND user_id = ?
    `).run(String(ctx.chat.id), String(target.id));

    const user = getUser(ctx.chat.id, target.id);
    saveModLog(ctx.chat.id, ctx.from.id, target.id, "WARN", reason);

    if ((user?.warns || 0) >= 3) {
      const until = Math.floor(Date.now() / 1000) + 24 * 60 * 60;

      try {
        await ctx.telegram.restrictChatMember(ctx.chat.id, target.id, {
          until_date: until,
          permissions: { can_send_messages: false },
        });

        saveModLog(ctx.chat.id, ctx.from.id, target.id, "AUTO_MUTE", "3 варна");
      } catch (e) {
        console.error("Ошибка авто-мута:", e.message);
      }

      return safeReply(
        ctx,
        `⚠️ ${getDisplayName(target)} получил варн.\nПричина: ${reason}\n\nВарнов: ${user.warns}/3\nПользователь автоматически замучен на 24 часа.`
      );
    }

    return safeReply(
      ctx,
      `⚠️ ${getDisplayName(target)} получил варн.\nПричина: ${reason}\nВарнов: ${user?.warns || 1}/3`
    );
  });

  bot.command("warns", async (ctx) => {
    if (!(await requireGroup(ctx, safeReply))) return;

    const args = parseArgs(ctx);
    const target = await resolveTarget(ctx, args, safeReply);
    if (!target) return;

    const user = getUser(ctx.chat.id, target.id);

    return safeReply(ctx, `⚠️ Варны ${getDisplayName(target)}: ${user?.warns || 0}/3`);
  });

  bot.command("clearwarns", async (ctx) => {
    if (!(await requireGroup(ctx, safeReply))) return;
    if (!(await requireAdmin(ctx, safeReply))) return;

    const args = parseArgs(ctx);
    const target = await resolveTarget(ctx, args, safeReply);
    if (!target) return;

    upsertUser(ctx.chat.id, target, false);

    db.prepare(`
      UPDATE users SET warns = 0
      WHERE chat_id = ? AND user_id = ?
    `).run(String(ctx.chat.id), String(target.id));

    saveModLog(ctx.chat.id, ctx.from.id, target.id, "CLEAR_WARNS", "");

    return safeReply(ctx, `✅ Варны пользователя ${getDisplayName(target)} очищены.`);
  });

  bot.command("kick", async (ctx) => {
    if (!(await requireGroup(ctx, safeReply))) return;
    if (!(await requireAdmin(ctx, safeReply))) return;

    const args = parseArgs(ctx);
    const target = await resolveTarget(ctx, args, safeReply);
    if (!target) return;

    if (await isAdmin(ctx, target.id)) {
      return safeReply(ctx, "Нельзя кикнуть администратора.");
    }

    const reason = getReason(args);

    try {
      await ctx.telegram.banChatMember(ctx.chat.id, target.id);
      await ctx.telegram.unbanChatMember(ctx.chat.id, target.id);

      saveModLog(ctx.chat.id, ctx.from.id, target.id, "KICK", reason);

      return safeReply(ctx, `👢 ${getDisplayName(target)} кикнут.\nПричина: ${reason}`);
    } catch (e) {
      return safeReply(ctx, "Не удалось кикнуть. Проверь, что бот админ и имеет право банить.");
    }
  });

  bot.command("ban", async (ctx) => {
    if (!(await requireGroup(ctx, safeReply))) return;
    if (!(await requireAdmin(ctx, safeReply))) return;

    const args = parseArgs(ctx);
    const target = await resolveTarget(ctx, args, safeReply);
    if (!target) return;

    if (await isAdmin(ctx, target.id)) {
      return safeReply(ctx, "Нельзя забанить администратора.");
    }

    const reason = getReason(args);

    try {
      await ctx.telegram.banChatMember(ctx.chat.id, target.id);

      saveModLog(ctx.chat.id, ctx.from.id, target.id, "BAN", reason);

      return safeReply(ctx, `⛔ ${getDisplayName(target)} забанен.\nПричина: ${reason}`);
    } catch {
      return safeReply(ctx, "Не удалось забанить. Проверь права бота.");
    }
  });

  bot.command("unban", async (ctx) => {
    if (!(await requireGroup(ctx, safeReply))) return;
    if (!(await requireAdmin(ctx, safeReply))) return;

    const args = parseArgs(ctx);
    const userId = args[0];

    if (!userId || !/^\d+$/.test(userId)) {
      return safeReply(ctx, "Укажи ID пользователя: /unban 123456789");
    }

    try {
      await ctx.telegram.unbanChatMember(ctx.chat.id, Number(userId));

      saveModLog(ctx.chat.id, ctx.from.id, userId, "UNBAN", "");

      return safeReply(ctx, `✅ Пользователь ${userId} разбанен.`);
    } catch {
      return safeReply(ctx, "Не удалось разбанить пользователя.");
    }
  });

  bot.command("mute", async (ctx) => {
    if (!(await requireGroup(ctx, safeReply))) return;
    if (!(await requireAdmin(ctx, safeReply))) return;

    const args = parseArgs(ctx);
    const target = await resolveTarget(ctx, args, safeReply);
    if (!target) return;

    if (await isAdmin(ctx, target.id)) {
      return safeReply(ctx, "Нельзя замутить администратора.");
    }

    const durationRaw = ctx.message?.reply_to_message ? args[0] : args[1];
    const seconds = parseDuration(durationRaw);

    if (!seconds) {
      return safeReply(ctx, "Укажи время: /mute @user 30m причина\nФорматы: 10m, 2h, 1d");
    }

    const reason = ctx.message?.reply_to_message ? getReason(args, 1) : getReason(args, 2);
    const until = Math.floor(Date.now() / 1000) + seconds;

    try {
      await ctx.telegram.restrictChatMember(ctx.chat.id, target.id, {
        until_date: until,
        permissions: { can_send_messages: false },
      });

      db.prepare(`
        UPDATE users SET muted_until = ?
        WHERE chat_id = ? AND user_id = ?
      `).run(until * 1000, String(ctx.chat.id), String(target.id));

      saveModLog(ctx.chat.id, ctx.from.id, target.id, "MUTE", `${durationRaw}; ${reason}`);

      return safeReply(ctx, `🔇 ${getDisplayName(target)} замучен на ${durationRaw}.\nПричина: ${reason}`);
    } catch {
      return safeReply(ctx, "Не удалось замутить. Проверь права бота.");
    }
  });

  bot.command("unmute", async (ctx) => {
    if (!(await requireGroup(ctx, safeReply))) return;
    if (!(await requireAdmin(ctx, safeReply))) return;

    const args = parseArgs(ctx);
    const target = await resolveTarget(ctx, args, safeReply);
    if (!target) return;

    try {
      await ctx.telegram.restrictChatMember(ctx.chat.id, target.id, {
        permissions: {
          can_send_messages: true,
          can_send_audios: true,
          can_send_documents: true,
          can_send_photos: true,
          can_send_videos: true,
          can_send_video_notes: true,
          can_send_voice_notes: true,
          can_send_polls: true,
          can_send_other_messages: true,
          can_add_web_page_previews: true,
          can_change_info: false,
          can_invite_users: true,
          can_pin_messages: false,
          can_manage_topics: false,
        },
      });

      db.prepare(`
        UPDATE users SET muted_until = 0
        WHERE chat_id = ? AND user_id = ?
      `).run(String(ctx.chat.id), String(target.id));

      saveModLog(ctx.chat.id, ctx.from.id, target.id, "UNMUTE", "");

      return safeReply(ctx, `🔊 ${getDisplayName(target)} размучен.`);
    } catch {
      return safeReply(ctx, "Не удалось снять мут.");
    }
  });

  bot.command("modlog", async (ctx) => {
    if (!(await requireGroup(ctx, safeReply))) return;
    if (!(await requireAdmin(ctx, safeReply))) return;

    const rows = db.prepare(`
      SELECT * FROM mod_logs
      WHERE chat_id = ?
      ORDER BY id DESC
      LIMIT 10
    `).all(String(ctx.chat.id));

    if (!rows.length) return safeReply(ctx, "Лог модерации пока пуст.");

    const text = rows
      .map(
        (log) =>
          `#${log.id} ${log.action}\nМодер: ${log.moderator_id}\nЦель: ${log.target_id}\nПричина: ${log.reason || "нет"}\n${formatDate(log.created_at)}`
      )
      .join("\n\n");

    return safeReply(ctx, "📜 Последние действия модерации:\n\n" + text);
  });

  bot.command("autokick_on", async (ctx) => {
    if (!(await requireGroup(ctx, safeReply))) return;
    if (!(await requireAdmin(ctx, safeReply))) return;

    ensureSettings(ctx.chat.id);

    db.prepare(`
      UPDATE chat_settings SET autokick_enabled = 1
      WHERE chat_id = ?
    `).run(String(ctx.chat.id));

    return safeReply(ctx, "✅ Авто-кик неактивных включён.");
  });

  bot.command("autokick_off", async (ctx) => {
    if (!(await requireGroup(ctx, safeReply))) return;
    if (!(await requireAdmin(ctx, safeReply))) return;

    ensureSettings(ctx.chat.id);

    db.prepare(`
      UPDATE chat_settings SET autokick_enabled = 0
      WHERE chat_id = ?
    `).run(String(ctx.chat.id));

    return safeReply(ctx, "✅ Авто-кик неактивных выключен.");
  });

  bot.command("autokick_days", async (ctx) => {
    if (!(await requireGroup(ctx, safeReply))) return;
    if (!(await requireAdmin(ctx, safeReply))) return;

    const days = Number(parseArgs(ctx)[0]);

    if (!Number.isInteger(days) || days < 1 || days > 30) {
      return safeReply(ctx, "Укажи число от 1 до 30. Например: /autokick_days 2");
    }

    ensureSettings(ctx.chat.id);

    db.prepare(`
      UPDATE chat_settings SET autokick_days = ?
      WHERE chat_id = ?
    `).run(days, String(ctx.chat.id));

    return safeReply(ctx, `✅ Теперь авто-кик срабатывает после ${days} дней неактива.`);
  });

  bot.command("settings", async (ctx) => {
    if (!(await requireGroup(ctx, safeReply))) return;

    ensureSettings(ctx.chat.id);

    const settings = db.prepare(`
      SELECT * FROM chat_settings WHERE chat_id = ?
    `).get(String(ctx.chat.id));

    return safeReply(
      ctx,
      "⚙️ Настройки группы\n\n" +
        `Авто-кик: ${settings.autokick_enabled ? "включён" : "выключен"}\n` +
        `Дней неактива: ${settings.autokick_days}`
    );
  });

  setInterval(async () => {
    const chats = db.prepare(`
      SELECT * FROM chat_settings WHERE autokick_enabled = 1
    `).all();

    for (const chat of chats) {
      const limit = now() - chat.autokick_days * 24 * 60 * 60 * 1000;

      const inactiveUsers = db.prepare(`
        SELECT * FROM users
        WHERE chat_id = ? AND last_active_at < ?
        LIMIT 20
      `).all(chat.chat_id, limit);

      for (const user of inactiveUsers) {
        try {
          const member = await bot.telegram.getChatMember(chat.chat_id, Number(user.user_id));

          if (member.status === "creator" || member.status === "administrator") {
            continue;
          }

          await bot.telegram.banChatMember(chat.chat_id, Number(user.user_id));
          await bot.telegram.unbanChatMember(chat.chat_id, Number(user.user_id));

          saveModLog(chat.chat_id, "AUTO", user.user_id, "AUTO_KICK", `${chat.autokick_days} дней неактива`);
        } catch (error) {
          console.error("Ошибка авто-кика:", error.message);
        }
      }
    }
  }, 60 * 60 * 1000);
}

module.exports = {
  registerModeration,
};