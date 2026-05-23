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
CREATE TABLE IF NOT EXISTS bot_admins (
  chat_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  username TEXT,
  first_name TEXT,
  role TEXT NOT NULL,
  added_by TEXT,
  added_at INTEGER NOT NULL,
  PRIMARY KEY (chat_id, user_id)
);

CREATE TABLE IF NOT EXISTS call_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  chat_id TEXT NOT NULL,
  caller_id TEXT NOT NULL,
  call_type TEXT NOT NULL,
  text TEXT,
  mentions_count INTEGER DEFAULT 0,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS call_settings (
  chat_id TEXT PRIMARY KEY,
  call_cooldown_seconds INTEGER DEFAULT 60,
  call_max_users INTEGER DEFAULT 300,
  call_chunk_size INTEGER DEFAULT 35,
  updated_at INTEGER
);

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
`);

const CLUB_NAME = "Клуб случайных людей";

const roles = {
  owner: {
    title: "👑 Главный клуба",
    level: 100,
    canSetAdmin: true,
    canRemoveAdmin: true,
    canCallAll: true,
    canCallAdmins: true,
    canCallOwners: true,
    canManageCall: true,
  },
  deputy: {
    title: "💎 Правая рука клуба",
    level: 80,
    canSetAdmin: true,
    canRemoveAdmin: true,
    canCallAll: true,
    canCallAdmins: true,
    canCallOwners: false,
    canManageCall: true,
  },
  senior: {
    title: "🔥 Старшая администрация клуба",
    level: 60,
    canSetAdmin: false,
    canRemoveAdmin: false,
    canCallAll: true,
    canCallAdmins: true,
    canCallOwners: false,
    canManageCall: false,
  },
  admin: {
    title: "🛡 Администратор клуба",
    level: 40,
    canSetAdmin: false,
    canRemoveAdmin: false,
    canCallAll: false,
    canCallAdmins: true,
    canCallOwners: false,
    canManageCall: false,
  },
  moder: {
    title: "⚔️ Модератор клуба",
    level: 25,
    canSetAdmin: false,
    canRemoveAdmin: false,
    canCallAll: false,
    canCallAdmins: false,
    canCallOwners: false,
    canManageCall: false,
  },
  helper: {
    title: "🤝 Помощник клуба",
    level: 10,
    canSetAdmin: false,
    canRemoveAdmin: false,
    canCallAll: false,
    canCallAdmins: false,
    canCallOwners: false,
    canManageCall: false,
  },
};

const lastCalls = new Map();

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

function escapeHtml(text) {
  return String(text || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function normalizeRole(role) {
  const value = String(role || "").toLowerCase().trim();

  const aliases = {
    владелец: "owner",
    owner: "owner",
    создатель: "owner",
    главный: "owner",

    зам: "deputy",
    deputy: "deputy",
    заместитель: "deputy",

    старший: "senior",
    senior: "senior",
    старшийадмин: "senior",

    админ: "admin",
    admin: "admin",

    модер: "moder",
    moder: "moder",
    модератор: "moder",

    helper: "helper",
    хелпер: "helper",
    помощник: "helper",
  };

  return aliases[value] || "";
}

function botOwnerIds() {
  return String(process.env.BOT_OWNER_IDS || "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
}

function isGlobalBotOwner(userId) {
  return botOwnerIds().includes(String(userId));
}

function userName(user) {
  if (!user) return "Пользователь";
  if (user.username) return `@${String(user.username).replace("@", "")}`;

  return (
    [user.first_name, user.last_name].filter(Boolean).join(" ") ||
    `ID ${user.user_id || user.id}`
  );
}

/*
  Усиленное упоминание:
  1) если есть username — используем @username, это чаще всего даёт push-уведомление;
  2) если username нет — используем кликабельное упоминание по Telegram ID.
*/
function mentionUser(user) {
  const id = user.user_id || user.id;

  if (user.username) {
    return `@${String(user.username).replace("@", "")}`;
  }

  const name =
    user.first_name ||
    userName(user) ||
    `Участник ${id}`;

  return `<a href="tg://user?id=${id}">${escapeHtml(name)}</a>`;
}

function parseArgs(ctx) {
  const text = ctx.message?.text || "";
  return text.split(/\s+/).slice(1);
}

function parseText(ctx) {
  const text = ctx.message?.text || "";
  return text.split(/\s+/).slice(1).join(" ").trim();
}

function ensureCallSettings(chatId) {
  db.prepare(`
    INSERT OR IGNORE INTO call_settings (
      chat_id,
      call_cooldown_seconds,
      call_max_users,
      call_chunk_size,
      updated_at
    )
    VALUES (?, 60, 300, 35, ?)
  `).run(String(chatId), now());
}

function getCallSettings(chatId) {
  ensureCallSettings(chatId);

  return db.prepare(`
    SELECT * FROM call_settings
    WHERE chat_id = ?
  `).get(String(chatId));
}

async function isTelegramAdmin(ctx, userId) {
  try {
    const member = await ctx.telegram.getChatMember(ctx.chat.id, userId);
    return member.status === "creator" || member.status === "administrator";
  } catch {
    return false;
  }
}

async function isChatCreator(ctx, userId) {
  try {
    const member = await ctx.telegram.getChatMember(ctx.chat.id, userId);
    return member.status === "creator";
  } catch {
    return false;
  }
}

function upsertKnownUser(chatId, user, countMessage = false) {
  if (!chatId || !user || user.is_bot) return;

  const date = todayKey();

  const current = db.prepare(`
    SELECT * FROM users
    WHERE chat_id = ? AND user_id = ?
  `).get(String(chatId), String(user.id));

  if (!current) {
    db.prepare(`
      INSERT INTO users (
        chat_id,
        user_id,
        username,
        first_name,
        last_name,
        total_messages,
        today_messages,
        today_date,
        warns,
        joined_at,
        last_active_at,
        muted_until
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, 0)
    `).run(
      String(chatId),
      String(user.id),
      String(user.username || "").toLowerCase(),
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
    String(user.username || "").toLowerCase(),
    user.first_name || "",
    user.last_name || "",
    countMessage ? 1 : 0,
    todayMessages + (countMessage ? 1 : 0),
    date,
    now(),
    String(chatId),
    String(user.id)
  );
}

function getBotAdmin(chatId, userId) {
  return db.prepare(`
    SELECT * FROM bot_admins
    WHERE chat_id = ? AND user_id = ?
  `).get(String(chatId), String(userId));
}

async function getEffectiveRole(ctx, userId) {
  if (isGlobalBotOwner(userId)) {
    return {
      role: "owner",
      source: "BOT_OWNER_IDS",
      info: roles.owner,
    };
  }

  if (await isChatCreator(ctx, userId)) {
    return {
      role: "owner",
      source: "chat_creator",
      info: roles.owner,
    };
  }

  const admin = getBotAdmin(ctx.chat.id, userId);

  if (admin && roles[admin.role]) {
    return {
      role: admin.role,
      source: "bot_admins",
      info: roles[admin.role],
    };
  }

  if (await isTelegramAdmin(ctx, userId)) {
    return {
      role: "admin",
      source: "telegram_admin",
      info: roles.admin,
    };
  }

  return {
    role: "user",
    source: "none",
    info: null,
  };
}

async function hasPermission(ctx, userId, permission) {
  const effective = await getEffectiveRole(ctx, userId);
  return Boolean(effective.info && effective.info[permission]);
}

async function requireGroup(ctx, safeReply) {
  if (!isGroup(ctx)) {
    await safeReply(ctx, "Эта команда работает только в группе.");
    return false;
  }

  return true;
}

async function requirePermission(ctx, safeReply, permission) {
  const ok = await hasPermission(ctx, ctx.from.id, permission);

  if (!ok) {
    await safeReply(ctx, "⛔ У тебя нет прав на эту команду.");
    return false;
  }

  return true;
}

async function resolveTarget(ctx, args, safeReply) {
  const replyUser = ctx.message?.reply_to_message?.from;

  if (replyUser && !replyUser.is_bot) {
    upsertKnownUser(ctx.chat.id, replyUser, false);
    return replyUser;
  }

  const raw = args[0];

  if (!raw) {
    await safeReply(ctx, "Укажи пользователя ответом на сообщение, @username или ID.");
    return null;
  }

  if (/^\d+$/.test(raw)) {
    return {
      id: Number(raw),
      username: "",
      first_name: `ID ${raw}`,
      last_name: "",
    };
  }

  if (raw.startsWith("@")) {
    const username = raw.replace("@", "").toLowerCase();

    const found = db.prepare(`
      SELECT * FROM users
      WHERE chat_id = ? AND lower(username) = ?
    `).get(String(ctx.chat.id), username);

    if (!found) {
      await safeReply(
        ctx,
        "Я пока не знаю этого пользователя. Пусть он напишет сообщение, либо используй команду ответом на его сообщение."
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

  await safeReply(ctx, "Не понял пользователя. Используй Reply, @username или ID.");
  return null;
}

function saveCallLog(chatId, callerId, callType, text, count) {
  db.prepare(`
    INSERT INTO call_logs (chat_id, caller_id, call_type, text, mentions_count, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    String(chatId),
    String(callerId),
    callType,
    text || "",
    Number(count || 0),
    now()
  );
}

function splitMentions(users, maxPerMessage = 35) {
  const chunks = [];

  for (let i = 0; i < users.length; i += maxPerMessage) {
    chunks.push(users.slice(i, i + maxPerMessage));
  }

  return chunks;
}

function callCooldownKey(chatId, userId, type) {
  return `${chatId}:${userId}:${type}`;
}

function checkCooldown(ctx, type) {
  const settings = getCallSettings(ctx.chat.id);
  const key = callCooldownKey(ctx.chat.id, ctx.from.id, type);
  const last = lastCalls.get(key) || 0;
  const diff = Math.floor((now() - last) / 1000);

  if (diff < settings.call_cooldown_seconds) {
    return settings.call_cooldown_seconds - diff;
  }

  lastCalls.set(key, now());
  return 0;
}

/*
  Усиленный созыв:
  - отправка не тихая: disable_notification: false;
  - @username для тех, у кого есть username;
  - HTML mention по ID для тех, у кого username нет;
  - деление на части, чтобы Telegram не резал длинное сообщение;
  - задержка между сообщениями, чтобы не словить лимиты.
*/
async function sendCall(ctx, safeReply, users, title, text, type) {
  const settings = getCallSettings(ctx.chat.id);
  const cooldownLeft = checkCooldown(ctx, type);

  if (cooldownLeft > 0) {
    return safeReply(
      ctx,
      `⏳ Подожди ${cooldownLeft} сек. перед следующим созывом.`
    );
  }

  const unique = [];
  const seen = new Set();

  for (const user of users) {
    const id = String(user.user_id || user.id);

    if (!id || seen.has(id)) continue;
    if (String(id) === String(ctx.from.id)) continue;

    seen.add(id);
    unique.push(user);
  }

  const limited = unique.slice(0, settings.call_max_users);

  if (!limited.length) {
    return safeReply(
      ctx,
      "Некого созывать. Бот пока не знает пользователей этой категории.\n\n" +
        "Важно: бот узнаёт пользователей только после того, как они написали сообщение в группе."
    );
  }

  const chunks = splitMentions(limited, settings.call_chunk_size);
  let sent = 0;

  await ctx.reply(
    "📲 <b>Созыв запущен</b>\n\n" +
      `<b>Клуб:</b> ${escapeHtml(CLUB_NAME)}\n` +
      `<b>Созывает:</b> ${escapeHtml(userName(ctx.from))}\n` +
      `<b>Будет упомянуто:</b> ${limited.length}\n` +
      `<b>Сообщений:</b> ${chunks.length}\n\n` +
      "⚡ Сейчас участникам придут уведомления, если у них не выключены уведомления этой беседы.",
    {
      parse_mode: "HTML",
      disable_web_page_preview: true,
      disable_notification: false,
    }
  ).catch(() => {});

  for (let index = 0; index < chunks.length; index++) {
    const chunk = chunks[index];
    sent += chunk.length;

    const mentions = chunk.map(mentionUser).join(" ");

    const message =
      `🚨 <b>${escapeHtml(title)}</b>\n` +
      `<b>Клуб:</b> ${escapeHtml(CLUB_NAME)}\n` +
      `<b>Часть:</b> ${index + 1}/${chunks.length}\n\n` +
      (text
        ? `📢 <b>Сообщение:</b> ${escapeHtml(text)}\n\n`
        : "📢 <b>Сообщение:</b> срочный созыв участников.\n\n") +
      "👇 <b>Участники:</b>\n" +
      mentions;

    await ctx.reply(message, {
      parse_mode: "HTML",
      disable_web_page_preview: true,
      disable_notification: false,
    }).catch(async () => {
      await safeReply(
        ctx,
        `${title}\nКлуб: ${CLUB_NAME}\nЧасть: ${index + 1}/${chunks.length}\n\n` +
          chunk.map(userName).join(" ")
      );
    });

    await new Promise((resolve) => setTimeout(resolve, 900));
  }

  saveCallLog(ctx.chat.id, ctx.from.id, type, text, sent);

  return ctx.reply(
    "✅ <b>Созыв завершён</b>\n\n" +
      `<b>Клуб:</b> ${escapeHtml(CLUB_NAME)}\n` +
      `<b>Упомянуто:</b> ${sent}\n\n` +
      "📲 Уведомления должны прийти тем, у кого не отключены уведомления этой беседы.",
    {
      parse_mode: "HTML",
      disable_web_page_preview: true,
      disable_notification: false,
    }
  ).catch(() => {});
}

function getKnownUsers(chatId, limit = 300) {
  return db.prepare(`
    SELECT * FROM users
    WHERE chat_id = ?
    ORDER BY last_active_at DESC
    LIMIT ?
  `).all(String(chatId), limit);
}

function getActiveUsers(chatId, hours = 24, limit = 300) {
  const from = now() - hours * 60 * 60 * 1000;

  return db.prepare(`
    SELECT * FROM users
    WHERE chat_id = ? AND last_active_at >= ?
    ORDER BY last_active_at DESC
    LIMIT ?
  `).all(String(chatId), from, limit);
}

function getInactiveUsers(chatId, hours = 24, limit = 300) {
  const before = now() - hours * 60 * 60 * 1000;

  return db.prepare(`
    SELECT * FROM users
    WHERE chat_id = ? AND last_active_at < ?
    ORDER BY last_active_at ASC
    LIMIT ?
  `).all(String(chatId), before, limit);
}

async function getTelegramAdmins(ctx) {
  try {
    const admins = await ctx.telegram.getChatAdministrators(ctx.chat.id);

    return admins
      .filter((item) => item.user && !item.user.is_bot)
      .map((item) => ({
        id: item.user.id,
        username: item.user.username || "",
        first_name: item.user.first_name || "",
        last_name: item.user.last_name || "",
        status: item.status,
      }));
  } catch {
    return [];
  }
}

function getInternalAdmins(chatId) {
  return db.prepare(`
    SELECT * FROM bot_admins
    WHERE chat_id = ?
    ORDER BY
      CASE role
        WHEN 'owner' THEN 1
        WHEN 'deputy' THEN 2
        WHEN 'senior' THEN 3
        WHEN 'admin' THEN 4
        WHEN 'moder' THEN 5
        WHEN 'helper' THEN 6
        ELSE 7
      END ASC
  `).all(String(chatId));
}

function adminRolesText() {
  return (
    `🏛 Ранги клуба «${CLUB_NAME}»\n\n` +
    "👑 owner / владелец\n" +
    "Права: полный контроль клуба, админки и созывов.\n\n" +
    "💎 deputy / зам\n" +
    "Права: выдача младших рангов, созыв всех и созыв администрации.\n\n" +
    "🔥 senior / старший\n" +
    "Права: созыв всех участников и созыв администрации.\n\n" +
    "🛡 admin / админ\n" +
    "Права: созыв администрации и помощь в управлении клубом.\n\n" +
    "⚔️ moder / модер\n" +
    "Права: контроль порядка и помощь администрации.\n\n" +
    "🤝 helper / хелпер\n" +
    "Права: помощь новичкам и участникам клуба.\n\n" +
    "Команды:\n" +
    "/setadmin роль — выдать ранг ответом на сообщение\n" +
    "/deladmin — снять ранг ответом на сообщение\n" +
    "/admins — список администрации клуба\n" +
    "/myadmin — мой статус\n\n" +
    "Созыв:\n" +
    "/call текст — созыв всех известных пользователей\n" +
    "/callactive текст — созыв активных за 24 часа\n" +
    "/callinactive текст — созыв неактивных больше 24 часов\n" +
    "/calladmins текст — созыв администрации\n" +
    "/callowners текст — созыв главных"
  );
}

function registerAdminRanks(bot, helpers) {
  const { safeReply } = helpers;

  bot.use(async (ctx, next) => {
    try {
      if (isGroup(ctx) && ctx.from && !ctx.from.is_bot) {
        const text = ctx.message?.text || ctx.message?.caption || "";
        const countMessage = Boolean(text && !text.startsWith("/"));
        upsertKnownUser(ctx.chat.id, ctx.from, countMessage);
      }
    } catch (error) {
      console.error("adminRanks user save error:", error.message);
    }

    return next();
  });

  bot.command("adminroles", async (ctx) => {
    return safeReply(ctx, adminRolesText());
  });

  bot.command("callsettings", async (ctx) => {
    if (!(await requireGroup(ctx, safeReply))) return;

    const s = getCallSettings(ctx.chat.id);

    return safeReply(
      ctx,
      "⚙️ Настройки созыва\n\n" +
        `🏠 Клуб: ${CLUB_NAME}\n` +
        `Кулдаун: ${s.call_cooldown_seconds} сек.\n` +
        `Максимум пользователей: ${s.call_max_users}\n` +
        `Упоминаний в одном сообщении: ${s.call_chunk_size}\n\n` +
        "Команды:\n" +
        "/callcooldown 60\n" +
        "/callmax 300\n" +
        "/callchunk 35"
    );
  });

  bot.command("callcooldown", async (ctx) => {
    if (!(await requireGroup(ctx, safeReply))) return;
    if (!(await requirePermission(ctx, safeReply, "canManageCall"))) return;

    const seconds = Number(parseArgs(ctx)[0]);

    if (!Number.isInteger(seconds) || seconds < 10 || seconds > 3600) {
      return safeReply(ctx, "Укажи число от 10 до 3600. Например: /callcooldown 60");
    }

    ensureCallSettings(ctx.chat.id);

    db.prepare(`
      UPDATE call_settings
      SET call_cooldown_seconds = ?, updated_at = ?
      WHERE chat_id = ?
    `).run(seconds, now(), String(ctx.chat.id));

    return safeReply(ctx, `✅ Кулдаун созыва: ${seconds} сек.`);
  });

  bot.command("callmax", async (ctx) => {
    if (!(await requireGroup(ctx, safeReply))) return;
    if (!(await requirePermission(ctx, safeReply, "canManageCall"))) return;

    const max = Number(parseArgs(ctx)[0]);

    if (!Number.isInteger(max) || max < 10 || max > 1000) {
      return safeReply(ctx, "Укажи число от 10 до 1000. Например: /callmax 300");
    }

    ensureCallSettings(ctx.chat.id);

    db.prepare(`
      UPDATE call_settings
      SET call_max_users = ?, updated_at = ?
      WHERE chat_id = ?
    `).run(max, now(), String(ctx.chat.id));

    return safeReply(ctx, `✅ Максимум пользователей в созыве: ${max}`);
  });

  bot.command("callchunk", async (ctx) => {
    if (!(await requireGroup(ctx, safeReply))) return;
    if (!(await requirePermission(ctx, safeReply, "canManageCall"))) return;

    const chunk = Number(parseArgs(ctx)[0]);

    if (!Number.isInteger(chunk) || chunk < 5 || chunk > 50) {
      return safeReply(ctx, "Укажи число от 5 до 50. Например: /callchunk 35");
    }

    ensureCallSettings(ctx.chat.id);

    db.prepare(`
      UPDATE call_settings
      SET call_chunk_size = ?, updated_at = ?
      WHERE chat_id = ?
    `).run(chunk, now(), String(ctx.chat.id));

    return safeReply(ctx, `✅ Упоминаний в одном сообщении: ${chunk}`);
  });

  bot.command("myadmin", async (ctx) => {
    if (!(await requireGroup(ctx, safeReply))) return;

    const effective = await getEffectiveRole(ctx, ctx.from.id);

    if (!effective.info) {
      return safeReply(
        ctx,
        "👤 Твой статус в FunTalk\n\n" +
          `🏠 Клуб: ${CLUB_NAME}\n` +
          "🌱 Роль: Участник клуба\n\n" +
          "Твои возможности:\n" +
          "💬 общаться в беседе\n" +
          "🎮 играть в мини-игры\n" +
          "🏆 получать XP и уровни\n" +
          "💰 забирать ежедневный бонус\n" +
          "🌟 получать репутацию\n\n" +
          "Полезные команды:\n" +
          "/rank — твой ранг\n" +
          "/daily — ежедневный бонус\n" +
          "/shop — магазин\n" +
          "/commands — все команды"
      );
    }

    const roleDescriptions = {
      owner: "Ты управляешь клубом, админкой, созывами, настройками и защитой.",
      deputy: "Ты правая рука владельца: помогаешь управлять клубом, админкой и созывами.",
      senior: "Ты входишь в старший состав клуба: следишь за активностью, порядком и созывами.",
      admin: "Ты часть администрации клуба: помогаешь держать порядок и управлять участниками.",
      moder: "Ты следишь за порядком, сообщениями и помогаешь администрации.",
      helper: "Ты помогаешь новичкам, поддерживаешь активность и атмосферу в клубе.",
    };

    const roleAbilities = {
      owner:
        "👑 полный контроль клуба\n🏛 выдача и снятие админки\n📢 созыв всех участников\n🛡 созыв администрации\n👑 созыв главных\n⚙️ управление настройками",
      deputy:
        "🏛 выдача младших рангов\n📢 созыв всех участников\n🛡 созыв администрации\n⚙️ управление частью настроек",
      senior:
        "📢 созыв всех участников\n🛡 созыв администрации\n🔥 контроль активности клуба",
      admin:
        "🛡 созыв администрации\n👮 контроль порядка\n📌 помощь участникам клуба",
      moder:
        "⚔️ помощь с порядком\n👀 наблюдение за беседой\n🤝 поддержка администрации",
      helper:
        "🤝 помощь новичкам\n💬 поддержка общения\n📌 базовая помощь участникам",
    };

    const sourceNames = {
      BOT_OWNER_IDS: `главный владелец FunTalk в клубе «${CLUB_NAME}»`,
      chat_creator: `создатель клуба «${CLUB_NAME}»`,
      bot_admins: `назначен в команду клуба «${CLUB_NAME}»`,
      telegram_admin: `администратор клуба «${CLUB_NAME}»`,
    };

    return safeReply(
      ctx,
      "🏛 Твой статус в FunTalk\n\n" +
        `🏠 Клуб: ${CLUB_NAME}\n` +
        `${effective.info.title}\n\n` +
        `📌 ${roleDescriptions[effective.role] || "У тебя есть административный доступ."}\n\n` +
        "Твои возможности:\n" +
        (roleAbilities[effective.role] || "🛡 доступ к админским возможностям") +
        "\n\n" +
        `✨ Статус: ${sourceNames[effective.source] || `администрация клуба «${CLUB_NAME}»`}\n\n` +
        "Полезные команды:\n" +
        "/adminroles — ранги клуба\n" +
        "/admins — администрация клуба\n" +
        "/calladmins — созыв администрации\n" +
        "/commands — все команды"
    );
  });

  bot.command("setadmin", async (ctx) => {
    if (!(await requireGroup(ctx, safeReply))) return;
    if (!(await requirePermission(ctx, safeReply, "canSetAdmin"))) return;

    const args = parseArgs(ctx);
    const role = normalizeRole(args[0]);

    if (!role || !roles[role]) {
      return safeReply(
        ctx,
        "Укажи роль. Пример ответом на сообщение:\n/setadmin admin\n\nСписок: /adminroles"
      );
    }

    const target = await resolveTarget(ctx, args.slice(1), safeReply);
    if (!target) return;

    if (target.is_bot) {
      return safeReply(ctx, "Ботам нельзя выдавать админку.");
    }

    const actor = await getEffectiveRole(ctx, ctx.from.id);
    const targetCurrent = await getEffectiveRole(ctx, target.id);
    const newRole = roles[role];

    if (!actor.info || actor.info.level <= newRole.level) {
      return safeReply(ctx, "⛔ Нельзя выдать ранг равный или выше своего.");
    }

    if (targetCurrent.info && actor.info.level <= targetCurrent.info.level) {
      return safeReply(ctx, "⛔ Нельзя менять ранг пользователя равного или выше тебя.");
    }

    db.prepare(`
      INSERT INTO bot_admins (chat_id, user_id, username, first_name, role, added_by, added_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(chat_id, user_id)
      DO UPDATE SET username = excluded.username,
                    first_name = excluded.first_name,
                    role = excluded.role,
                    added_by = excluded.added_by,
                    added_at = excluded.added_at
    `).run(
      String(ctx.chat.id),
      String(target.id),
      String(target.username || "").toLowerCase(),
      target.first_name || "",
      role,
      String(ctx.from.id),
      now()
    );

    return safeReply(
      ctx,
      `✅ ${userName(target)} получил ранг: ${roles[role].title}`
    );
  });

  bot.command("deladmin", async (ctx) => {
    if (!(await requireGroup(ctx, safeReply))) return;
    if (!(await requirePermission(ctx, safeReply, "canRemoveAdmin"))) return;

    const target = await resolveTarget(ctx, parseArgs(ctx), safeReply);
    if (!target) return;

    const actor = await getEffectiveRole(ctx, ctx.from.id);
    const targetCurrent = await getEffectiveRole(ctx, target.id);

    if (targetCurrent.info && actor.info.level <= targetCurrent.info.level) {
      return safeReply(ctx, "⛔ Нельзя снять ранг у пользователя равного или выше тебя.");
    }

    const result = db.prepare(`
      DELETE FROM bot_admins
      WHERE chat_id = ? AND user_id = ?
    `).run(String(ctx.chat.id), String(target.id));

    if (!result.changes) {
      return safeReply(ctx, "У пользователя нет внутренней админки бота.");
    }

    return safeReply(ctx, `✅ Админка снята с ${userName(target)}.`);
  });

  bot.command("admins", async (ctx) => {
    if (!(await requireGroup(ctx, safeReply))) return;

    const internal = getInternalAdmins(ctx.chat.id);
    const telegramAdmins = await getTelegramAdmins(ctx);

    const statusNames = {
      creator: "👑 Создатель клуба",
      administrator: "🛡 Администратор клуба",
    };

    const internalText = internal.length
      ? internal
          .map((admin, i) => {
            const info = roles[admin.role];
            return `${i + 1}. ${userName(admin)} — ${info?.title || "Админ клуба"}`;
          })
          .join("\n")
      : "Пока нет назначенных рангов FunTalk.";

    const clubAdminsText = telegramAdmins.length
      ? telegramAdmins
          .map((admin, i) => {
            return `${i + 1}. ${userName(admin)} — ${statusNames[admin.status] || "Админ клуба"}`;
          })
          .join("\n")
      : "Не удалось получить администрацию клуба.";

    return safeReply(
      ctx,
      `🏛 Администрация «${CLUB_NAME}»\n\n` +
        "⭐ Ранговая команда FunTalk:\n" +
        internalText +
        "\n\n" +
        "🏠 Администрация клуба:\n" +
        clubAdminsText +
        "\n\n" +
        "Команды:\n" +
        "/myadmin — мой статус\n" +
        "/adminroles — список рангов\n" +
        "/setadmin роль — выдать ранг ответом\n" +
        "/deladmin — снять ранг ответом"
    );
  });

  bot.command(["call", "callall", "all", "tagall"], async (ctx) => {
    if (!(await requireGroup(ctx, safeReply))) return;
    if (!(await requirePermission(ctx, safeReply, "canCallAll"))) return;

    const text = parseText(ctx);
    const settings = getCallSettings(ctx.chat.id);
    const users = getKnownUsers(ctx.chat.id, settings.call_max_users);

    return sendCall(ctx, safeReply, users, "📢 Общий созыв", text, "all");
  });

  bot.command(["callactive", "tagactive"], async (ctx) => {
    if (!(await requireGroup(ctx, safeReply))) return;
    if (!(await requirePermission(ctx, safeReply, "canCallAll"))) return;

    const text = parseText(ctx);
    const settings = getCallSettings(ctx.chat.id);
    const users = getActiveUsers(ctx.chat.id, 24, settings.call_max_users);

    return sendCall(ctx, safeReply, users, "🔥 Созыв активных за 24 часа", text, "active");
  });

  bot.command(["callinactive", "taginactive"], async (ctx) => {
    if (!(await requireGroup(ctx, safeReply))) return;
    if (!(await requirePermission(ctx, safeReply, "canCallAll"))) return;

    const text = parseText(ctx);
    const settings = getCallSettings(ctx.chat.id);
    const users = getInactiveUsers(ctx.chat.id, 24, settings.call_max_users);

    return sendCall(ctx, safeReply, users, "😴 Созыв неактивных", text, "inactive");
  });

  bot.command(["calladmins", "tagadmins"], async (ctx) => {
    if (!(await requireGroup(ctx, safeReply))) return;
    if (!(await requirePermission(ctx, safeReply, "canCallAdmins"))) return;

    const text = parseText(ctx);

    const telegramAdmins = await getTelegramAdmins(ctx);
    const internalAdmins = getInternalAdmins(ctx.chat.id);

    return sendCall(
      ctx,
      safeReply,
      [...telegramAdmins, ...internalAdmins],
      "🛡 Созыв администрации",
      text,
      "admins"
    );
  });

  bot.command(["callowners", "tagowners"], async (ctx) => {
    if (!(await requireGroup(ctx, safeReply))) return;
    if (!(await requirePermission(ctx, safeReply, "canCallOwners"))) return;

    const text = parseText(ctx);

    const telegramAdmins = await getTelegramAdmins(ctx);
    const creators = telegramAdmins.filter((admin) => admin.status === "creator");
    const internalOwners = getInternalAdmins(ctx.chat.id).filter((admin) => admin.role === "owner");

    const globalOwners = botOwnerIds().map((id) => ({
      id: Number(id),
      first_name: `Главный ${id}`,
      username: "",
    }));

    return sendCall(
      ctx,
      safeReply,
      [...creators, ...internalOwners, ...globalOwners],
      "👑 Созыв главных клуба",
      text,
      "owners"
    );
  });

  bot.command("calllog", async (ctx) => {
    if (!(await requireGroup(ctx, safeReply))) return;
    if (!(await requirePermission(ctx, safeReply, "canCallAdmins"))) return;

    const rows = db.prepare(`
      SELECT * FROM call_logs
      WHERE chat_id = ?
      ORDER BY id DESC
      LIMIT 10
    `).all(String(ctx.chat.id));

    if (!rows.length) {
      return safeReply(ctx, "Лог созывов пуст.");
    }

    const text = rows
      .map((log) => {
        const date = new Date(Number(log.created_at)).toLocaleString("ru-RU");
        return (
          `#${log.id} ${log.call_type}\n` +
          `Кто: ${log.caller_id}\n` +
          `Упомянуто: ${log.mentions_count}\n` +
          `Текст: ${log.text || "нет"}\n` +
          `${date}`
        );
      })
      .join("\n\n");

    return safeReply(ctx, "📜 Лог созывов:\n\n" + text);
  });
}

module.exports = {
  registerAdminRanks,
};