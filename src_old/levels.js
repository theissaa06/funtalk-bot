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
CREATE TABLE IF NOT EXISTS user_levels (
  chat_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  username TEXT,
  first_name TEXT,
  last_name TEXT,
  xp INTEGER DEFAULT 0,
  level INTEGER DEFAULT 1,
  reputation INTEGER DEFAULT 0,
  coins INTEGER DEFAULT 0,
  messages INTEGER DEFAULT 0,
  last_xp_at INTEGER DEFAULT 0,
  updated_at INTEGER,
  PRIMARY KEY (chat_id, user_id)
);

CREATE TABLE IF NOT EXISTS daily_rewards (
  chat_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  date_key TEXT NOT NULL,
  claimed_at INTEGER NOT NULL,
  PRIMARY KEY (chat_id, user_id, date_key)
);

CREATE TABLE IF NOT EXISTS rep_cooldowns (
  chat_id TEXT NOT NULL,
  from_user_id TEXT NOT NULL,
  to_user_id TEXT NOT NULL,
  last_rep_at INTEGER NOT NULL,
  PRIMARY KEY (chat_id, from_user_id, to_user_id)
);

CREATE TABLE IF NOT EXISTS level_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  chat_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  action TEXT NOT NULL,
  amount INTEGER DEFAULT 0,
  reason TEXT,
  created_at INTEGER NOT NULL
);
`);

function now() {
  return Date.now();
}

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function isGroup(ctx) {
  const type = ctx.chat?.type;
  return type === "group" || type === "supergroup";
}

function normalizeUsername(username) {
  return String(username || "").replace("@", "").toLowerCase();
}

function getDisplayName(user) {
  if (!user) return "Неизвестно";
  if (user.username) return `@${String(user.username).replace("@", "")}`;
  return (
    [user.first_name, user.last_name].filter(Boolean).join(" ") ||
    `ID ${user.user_id || user.id}`
  );
}

function getLevelByXp(xp) {
  // Мягкая формула: чем выше уровень, тем больше нужно опыта
  return Math.max(1, Math.floor(Math.sqrt(Number(xp || 0) / 55)) + 1);
}

function getXpForNextLevel(level) {
  return Math.pow(level, 2) * 55;
}

function getRankTitle(level) {
  if (level >= 50) return "👑 Легенда чата";
  if (level >= 35) return "💎 Элита";
  if (level >= 25) return "🔥 Мастер общения";
  if (level >= 15) return "⚡ Активист";
  if (level >= 8) return "🌟 Постоянный участник";
  if (level >= 4) return "💬 Общительный";
  return "🌱 Новичок";
}

function randomXp() {
  return Math.floor(Math.random() * 8) + 5; // 5–12 XP
}

function randomDailyCoins() {
  return Math.floor(Math.random() * 51) + 30; // 30–80 монет
}

function saveLog(chatId, userId, action, amount = 0, reason = "") {
  db.prepare(`
    INSERT INTO level_logs (chat_id, user_id, action, amount, reason, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    String(chatId),
    String(userId),
    action,
    Number(amount || 0),
    reason,
    now()
  );
}

function upsertUser(chatId, user, options = {}) {
  if (!chatId || !user || user.is_bot) return null;

  const chat = String(chatId);
  const id = String(user.id);
  const currentTime = now();

  const current = db.prepare(`
    SELECT * FROM user_levels WHERE chat_id = ? AND user_id = ?
  `).get(chat, id);

  if (!current) {
    db.prepare(`
      INSERT INTO user_levels (
        chat_id,
        user_id,
        username,
        first_name,
        last_name,
        xp,
        level,
        reputation,
        coins,
        messages,
        last_xp_at,
        updated_at
      )
      VALUES (?, ?, ?, ?, ?, 0, 1, 0, 0, 0, 0, ?)
    `).run(
      chat,
      id,
      normalizeUsername(user.username),
      user.first_name || "",
      user.last_name || "",
      currentTime
    );

    return db.prepare(`
      SELECT * FROM user_levels WHERE chat_id = ? AND user_id = ?
    `).get(chat, id);
  }

  db.prepare(`
    UPDATE user_levels
    SET username = ?,
        first_name = ?,
        last_name = ?,
        updated_at = ?
    WHERE chat_id = ? AND user_id = ?
  `).run(
    normalizeUsername(user.username),
    user.first_name || "",
    user.last_name || "",
    currentTime,
    chat,
    id
  );

  return getUser(chatId, user.id);
}

function getUser(chatId, userId) {
  return db.prepare(`
    SELECT * FROM user_levels WHERE chat_id = ? AND user_id = ?
  `).get(String(chatId), String(userId));
}

function findUserByUsername(chatId, username) {
  return db.prepare(`
    SELECT * FROM user_levels
    WHERE chat_id = ? AND lower(username) = ?
  `).get(String(chatId), normalizeUsername(username));
}

function addXp(chatId, user, amount, reason = "activity") {
  const saved = upsertUser(chatId, user);
  if (!saved) return null;

  const oldLevel = saved.level || 1;
  const newXp = (saved.xp || 0) + amount;
  const newLevel = getLevelByXp(newXp);
  const coinsBonus = newLevel > oldLevel ? (newLevel - oldLevel) * 25 : 0;

  db.prepare(`
    UPDATE user_levels
    SET xp = ?,
        level = ?,
        coins = coins + ?,
        messages = messages + 1,
        last_xp_at = ?,
        updated_at = ?
    WHERE chat_id = ? AND user_id = ?
  `).run(
    newXp,
    newLevel,
    coinsBonus,
    now(),
    now(),
    String(chatId),
    String(user.id)
  );

  saveLog(chatId, user.id, "XP_ADD", amount, reason);

  return {
    oldLevel,
    newLevel,
    newXp,
    coinsBonus,
    leveledUp: newLevel > oldLevel,
  };
}

function parseArgs(ctx) {
  const text = ctx.message?.text || "";
  return text.split(/\s+/).slice(1);
}

async function requireGroup(ctx, safeReply) {
  if (!isGroup(ctx)) {
    await safeReply(ctx, "Эта команда работает только в группе.");
    return false;
  }

  return true;
}

async function isAdmin(ctx, userId) {
  try {
    const member = await ctx.telegram.getChatMember(ctx.chat.id, userId);
    return member.status === "creator" || member.status === "administrator";
  } catch {
    return false;
  }
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
    upsertUser(ctx.chat.id, replyUser);

    return {
      id: replyUser.id,
      username: replyUser.username || "",
      first_name: replyUser.first_name || "",
      last_name: replyUser.last_name || "",
    };
  }

  const raw = args[0];

  if (!raw) {
    return ctx.from;
  }

  if (raw.startsWith("@")) {
    const found = findUserByUsername(ctx.chat.id, raw);

    if (!found) {
      await safeReply(
        ctx,
        "Я пока не знаю этого пользователя. Пусть он напишет сообщение в группе, либо используй команду ответом на сообщение."
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

  await safeReply(ctx, "Не понял пользователя. Используй @username, ID или ответ на сообщение.");
  return null;
}

function rankText(user) {
  const xp = user.xp || 0;
  const level = user.level || 1;
  const nextXp = getXpForNextLevel(level);
  const currentLevelXp = getXpForNextLevel(level - 1);
  const progressTotal = Math.max(1, nextXp - currentLevelXp);
  const progressCurrent = Math.max(0, xp - currentLevelXp);
  const percent = Math.min(100, Math.round((progressCurrent / progressTotal) * 100));

  return (
    "🏅 Ранг пользователя\n\n" +
    `Пользователь: ${getDisplayName(user)}\n` +
    `Звание: ${getRankTitle(level)}\n` +
    `Уровень: ${level}\n` +
    `Опыт: ${xp} XP\n` +
    `До следующего уровня: ${Math.max(0, nextXp - xp)} XP\n` +
    `Прогресс: ${percent}%\n` +
    `Репутация: ${user.reputation || 0}\n` +
    `Монеты: ${user.coins || 0}\n` +
    `Сообщений учтено: ${user.messages || 0}`
  );
}

function levelsInfoText() {
  return (
    "🏆 Система уровней FunTalk\n\n" +
    "Как работает:\n" +
    "• За активность в группе начисляется XP.\n" +
    "• XP выдаётся не за каждое сообщение, а с задержкой, чтобы не было накрутки.\n" +
    "• За новые уровни выдаются монеты.\n" +
    "• Репутацию можно давать ответом на сообщение: +реп или -реп.\n\n" +
    "Команды:\n" +
    "/rank — мой ранг\n" +
    "/rank @user — ранг пользователя\n" +
    "/topxp — топ по опыту\n" +
    "/toprep — топ по репутации\n" +
    "/balance — баланс монет\n" +
    "/daily — ежедневный бонус\n" +
    "+реп — дать репутацию ответом на сообщение\n" +
    "-реп — снять репутацию ответом на сообщение"
  );
}

function canGiveRep(chatId, fromUserId, toUserId) {
  const row = db.prepare(`
    SELECT * FROM rep_cooldowns
    WHERE chat_id = ? AND from_user_id = ? AND to_user_id = ?
  `).get(String(chatId), String(fromUserId), String(toUserId));

  if (!row) return true;

  const cooldown = 6 * 60 * 60 * 1000; // 6 часов
  return now() - Number(row.last_rep_at) >= cooldown;
}

function touchRepCooldown(chatId, fromUserId, toUserId) {
  db.prepare(`
    INSERT INTO rep_cooldowns (chat_id, from_user_id, to_user_id, last_rep_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(chat_id, from_user_id, to_user_id)
    DO UPDATE SET last_rep_at = excluded.last_rep_at
  `).run(String(chatId), String(fromUserId), String(toUserId), now());
}

function registerLevels(bot, helpers) {
  const { safeReply } = helpers;

  bot.use(async (ctx, next) => {
    try {
      if (!isGroup(ctx)) return next();

      const user = ctx.from;
      const msg = ctx.message;

      if (!user || user.is_bot || !msg) return next();

      const text = msg.text || msg.caption || "";

      // Команды не качают XP
      if (text.startsWith("/")) return next();

      upsertUser(ctx.chat.id, user);

      const saved = getUser(ctx.chat.id, user.id);
      const cooldown = 30 * 1000;

      if (now() - Number(saved.last_xp_at || 0) >= cooldown) {
        const xp = randomXp();
        const result = addXp(ctx.chat.id, user, xp, "message");

        if (result?.leveledUp) {
          await ctx.reply(
            `🎉 ${getDisplayName(user)} получил новый уровень!\n\n` +
              `🏅 Уровень: ${result.newLevel}\n` +
              `Звание: ${getRankTitle(result.newLevel)}\n` +
              `Бонус: +${result.coinsBonus} монет`
          ).catch(() => {});
        }
      }
    } catch (error) {
      console.error("Ошибка levels middleware:", error.message);
    }

    return next();
  });

  bot.command("levels", async (ctx) => {
    return safeReply(ctx, levelsInfoText());
  });

  bot.command("rank", async (ctx) => {
    if (!(await requireGroup(ctx, safeReply))) return;

    const args = parseArgs(ctx);
    const target = await resolveTarget(ctx, args, safeReply);
    if (!target) return;

    upsertUser(ctx.chat.id, target);

    const user = getUser(ctx.chat.id, target.id);

    return safeReply(ctx, rankText(user));
  });

  bot.command("level", async (ctx) => {
    if (!(await requireGroup(ctx, safeReply))) return;

    const args = parseArgs(ctx);
    const target = await resolveTarget(ctx, args, safeReply);
    if (!target) return;

    upsertUser(ctx.chat.id, target);

    const user = getUser(ctx.chat.id, target.id);

    return safeReply(ctx, rankText(user));
  });

  bot.command("balance", async (ctx) => {
    if (!(await requireGroup(ctx, safeReply))) return;

    upsertUser(ctx.chat.id, ctx.from);
    const user = getUser(ctx.chat.id, ctx.from.id);

    return safeReply(
      ctx,
      "💰 Баланс\n\n" +
        `Пользователь: ${getDisplayName(user)}\n` +
        `Монеты: ${user.coins || 0}\n` +
        `Уровень: ${user.level || 1}\n` +
        `XP: ${user.xp || 0}`
    );
  });

  bot.command("daily", async (ctx) => {
    if (!(await requireGroup(ctx, safeReply))) return;

    upsertUser(ctx.chat.id, ctx.from);

    const chatId = String(ctx.chat.id);
    const userId = String(ctx.from.id);
    const date = todayKey();

    const already = db.prepare(`
      SELECT * FROM daily_rewards
      WHERE chat_id = ? AND user_id = ? AND date_key = ?
    `).get(chatId, userId, date);

    if (already) {
      return safeReply(ctx, "⏳ Ты уже забирал ежедневный бонус сегодня. Приходи завтра.");
    }

    const coins = randomDailyCoins();
    const xp = Math.floor(coins / 2);

    db.prepare(`
      INSERT INTO daily_rewards (chat_id, user_id, date_key, claimed_at)
      VALUES (?, ?, ?, ?)
    `).run(chatId, userId, date, now());

    db.prepare(`
      UPDATE user_levels
      SET coins = coins + ?,
          xp = xp + ?,
          level = ?,
          updated_at = ?
      WHERE chat_id = ? AND user_id = ?
    `).run(
      coins,
      xp,
      getLevelByXp((getUser(ctx.chat.id, ctx.from.id)?.xp || 0) + xp),
      now(),
      chatId,
      userId
    );

    saveLog(ctx.chat.id, ctx.from.id, "DAILY", coins, "daily reward");

    return safeReply(
      ctx,
      `🎁 Ежедневный бонус получен!\n\n+${coins} монет\n+${xp} XP`
    );
  });

  bot.command("topxp", async (ctx) => {
    if (!(await requireGroup(ctx, safeReply))) return;

    const rows = db.prepare(`
      SELECT * FROM user_levels
      WHERE chat_id = ?
      ORDER BY xp DESC
      LIMIT 10
    `).all(String(ctx.chat.id));

    if (!rows.length) {
      return safeReply(ctx, "Пока нет рейтинга по XP.");
    }

    const text = rows
      .map((u, i) => {
        return `${i + 1}. ${getDisplayName(u)} — ${u.xp || 0} XP, уровень ${u.level || 1}`;
      })
      .join("\n");

    return safeReply(ctx, "🏆 Топ по опыту:\n\n" + text);
  });

  bot.command("toprep", async (ctx) => {
    if (!(await requireGroup(ctx, safeReply))) return;

    const rows = db.prepare(`
      SELECT * FROM user_levels
      WHERE chat_id = ?
      ORDER BY reputation DESC
      LIMIT 10
    `).all(String(ctx.chat.id));

    if (!rows.length) {
      return safeReply(ctx, "Пока нет рейтинга по репутации.");
    }

    const text = rows
      .map((u, i) => {
        return `${i + 1}. ${getDisplayName(u)} — репутация ${u.reputation || 0}`;
      })
      .join("\n");

    return safeReply(ctx, "🌟 Топ по репутации:\n\n" + text);
  });

  bot.command("addxp", async (ctx) => {
    if (!(await requireGroup(ctx, safeReply))) return;
    if (!(await requireAdmin(ctx, safeReply))) return;

    const args = parseArgs(ctx);
    const target = await resolveTarget(ctx, args, safeReply);
    if (!target) return;

    const amountRaw = ctx.message?.reply_to_message ? args[0] : args[1];
    const amount = Number(amountRaw);

    if (!Number.isInteger(amount) || amount <= 0 || amount > 100000) {
      return safeReply(ctx, "Используй: /addxp @user 100 или ответом: /addxp 100");
    }

    const result = addXp(ctx.chat.id, target, amount, "admin addxp");

    return safeReply(
      ctx,
      `✅ ${getDisplayName(target)} получил +${amount} XP.\n` +
        `Теперь уровень: ${result.newLevel}`
    );
  });

  bot.command("setcoins", async (ctx) => {
    if (!(await requireGroup(ctx, safeReply))) return;
    if (!(await requireAdmin(ctx, safeReply))) return;

    const args = parseArgs(ctx);
    const target = await resolveTarget(ctx, args, safeReply);
    if (!target) return;

    const amountRaw = ctx.message?.reply_to_message ? args[0] : args[1];
    const amount = Number(amountRaw);

    if (!Number.isInteger(amount) || amount < 0 || amount > 10000000) {
      return safeReply(ctx, "Используй: /setcoins @user 1000 или ответом: /setcoins 1000");
    }

    upsertUser(ctx.chat.id, target);

    db.prepare(`
      UPDATE user_levels
      SET coins = ?, updated_at = ?
      WHERE chat_id = ? AND user_id = ?
    `).run(amount, now(), String(ctx.chat.id), String(target.id));

    saveLog(ctx.chat.id, target.id, "SET_COINS", amount, `admin ${ctx.from.id}`);

    return safeReply(ctx, `✅ Баланс ${getDisplayName(target)} установлен: ${amount} монет.`);
  });

  bot.hears(/^\+реп$/i, async (ctx) => {
    if (!(await requireGroup(ctx, safeReply))) return;

    const target = ctx.message?.reply_to_message?.from;

    if (!target || target.is_bot) {
      return safeReply(ctx, "Ответь на сообщение человека и напиши +реп.");
    }

    if (target.id === ctx.from.id) {
      return safeReply(ctx, "Самому себе репутацию давать нельзя 😅");
    }

    upsertUser(ctx.chat.id, ctx.from);
    upsertUser(ctx.chat.id, target);

    if (!canGiveRep(ctx.chat.id, ctx.from.id, target.id)) {
      return safeReply(ctx, "⏳ Ты уже недавно менял репутацию этому человеку. Подожди 6 часов.");
    }

    db.prepare(`
      UPDATE user_levels
      SET reputation = reputation + 1,
          coins = coins + 5,
          updated_at = ?
      WHERE chat_id = ? AND user_id = ?
    `).run(now(), String(ctx.chat.id), String(target.id));

    touchRepCooldown(ctx.chat.id, ctx.from.id, target.id);
    saveLog(ctx.chat.id, target.id, "REP_PLUS", 1, `from ${ctx.from.id}`);

    const user = getUser(ctx.chat.id, target.id);

    return safeReply(
      ctx,
      `🌟 ${getDisplayName(target)} получил +1 репутации.\n` +
        `Теперь репутация: ${user.reputation || 0}`
    );
  });

  bot.hears(/^-реп$/i, async (ctx) => {
    if (!(await requireGroup(ctx, safeReply))) return;

    const target = ctx.message?.reply_to_message?.from;

    if (!target || target.is_bot) {
      return safeReply(ctx, "Ответь на сообщение человека и напиши -реп.");
    }

    if (target.id === ctx.from.id) {
      return safeReply(ctx, "Самому себе репутацию снимать нельзя 😅");
    }

    upsertUser(ctx.chat.id, ctx.from);
    upsertUser(ctx.chat.id, target);

    if (!canGiveRep(ctx.chat.id, ctx.from.id, target.id)) {
      return safeReply(ctx, "⏳ Ты уже недавно менял репутацию этому человеку. Подожди 6 часов.");
    }

    db.prepare(`
      UPDATE user_levels
      SET reputation = reputation - 1,
          updated_at = ?
      WHERE chat_id = ? AND user_id = ?
    `).run(now(), String(ctx.chat.id), String(target.id));

    touchRepCooldown(ctx.chat.id, ctx.from.id, target.id);
    saveLog(ctx.chat.id, target.id, "REP_MINUS", -1, `from ${ctx.from.id}`);

    const user = getUser(ctx.chat.id, target.id);

    return safeReply(
      ctx,
      `📉 ${getDisplayName(target)} получил -1 репутации.\n` +
        `Теперь репутация: ${user.reputation || 0}`
    );
  });
}

module.exports = {
  registerLevels,
};