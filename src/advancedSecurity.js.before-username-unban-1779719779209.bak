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
CREATE TABLE IF NOT EXISTS advanced_security_settings (
  chat_id TEXT PRIMARY KEY,
  captcha_enabled INTEGER DEFAULT 1,
  antibot_enabled INTEGER DEFAULT 1,
  smart_links_enabled INTEGER DEFAULT 1,
  captcha_minutes INTEGER DEFAULT 3,
  captcha_attempts INTEGER DEFAULT 3,
  updated_at INTEGER
);

CREATE TABLE IF NOT EXISTS link_whitelist (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  chat_id TEXT NOT NULL,
  domain TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS captcha_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  chat_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  action TEXT NOT NULL,
  details TEXT,
  created_at INTEGER NOT NULL
);
`);

const captchaSessions = new Map();

function now() {
  return Date.now();
}

function isGroup(ctx) {
  const type = ctx.chat?.type;
  return type === "group" || type === "supergroup";
}

function normalizeText(text) {
  return String(text || "")
    .toLowerCase()
    .replaceAll("ё", "е")
    .trim();
}

function normalizeDomain(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/\/.*$/, "")
    .trim();
}

function userName(user) {
  if (!user) return "участник";
  if (user.username) return `@${user.username}`;
  return user.first_name || "участник";
}

function ensureSettings(chatId) {
  db.prepare(`
    INSERT OR IGNORE INTO advanced_security_settings (
      chat_id,
      captcha_enabled,
      antibot_enabled,
      smart_links_enabled,
      captcha_minutes,
      captcha_attempts,
      updated_at
    )
    VALUES (?, 1, 1, 1, 3, 3, ?)
  `).run(String(chatId), now());
}

function getSettings(chatId) {
  ensureSettings(chatId);

  return db.prepare(`
    SELECT * FROM advanced_security_settings
    WHERE chat_id = ?
  `).get(String(chatId));
}

function saveLog(chatId, userId, action, details = "") {
  db.prepare(`
    INSERT INTO captcha_logs (chat_id, user_id, action, details, created_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(String(chatId), String(userId), action, details, now());
}

function parseArgs(ctx) {
  const text = ctx.message?.text || "";
  return text.split(/\s+/).slice(1);
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
  if (!isGroup(ctx)) {
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

function generateCaptcha() {
  const a = Math.floor(Math.random() * 8) + 2;
  const b = Math.floor(Math.random() * 8) + 2;

  return {
    question: `${a} + ${b}`,
    answer: String(a + b),
  };
}

function captchaKey(chatId, userId) {
  return `${chatId}:${userId}`;
}

async function restrictNewUser(ctx, userId) {
  try {
    await ctx.telegram.restrictChatMember(ctx.chat.id, userId, {
      permissions: {
        can_send_messages: false,
      },
    });
  } catch (error) {
    console.error("Ошибка ограничения новичка:", error.message);
  }
}

async function unrestrictUser(ctx, userId) {
  try {
    await ctx.telegram.restrictChatMember(ctx.chat.id, userId, {
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
        can_invite_users: true,
      },
    });
  } catch (error) {
    console.error("Ошибка снятия ограничения:", error.message);
  }
}

async function kickUser(ctx, userId) {
  try {
    await ctx.telegram.banChatMember(ctx.chat.id, userId);
    await ctx.telegram.unbanChatMember(ctx.chat.id, userId);
  } catch (error) {
    console.error("Ошибка кика:", error.message);
  }
}

function hasLink(text) {
  const value = normalizeText(text);

  return (
    value.includes("http://") ||
    value.includes("https://") ||
    value.includes("t.me/") ||
    value.includes("telegram.me/") ||
    value.includes("www.") ||
    /[a-z0-9-]+\.(com|ru|kz|net|org|io|gg|me|info|site|online|app|dev)/i.test(value)
  );
}

function extractDomains(text) {
  const value = normalizeText(text);
  const domains = new Set();

  const regex =
    /(https?:\/\/)?(www\.)?([a-z0-9-]+\.(com|ru|kz|net|org|io|gg|me|info|site|online|app|dev))/gi;

  let match;

  while ((match = regex.exec(value)) !== null) {
    domains.add(normalizeDomain(match[3]));
  }

  if (value.includes("t.me/")) {
    domains.add("t.me");
  }

  if (value.includes("telegram.me/")) {
    domains.add("telegram.me");
  }

  return Array.from(domains);
}

function isWhitelisted(chatId, text) {
  const domains = extractDomains(text);

  if (!domains.length) return false;

  const rows = db.prepare(`
    SELECT domain FROM link_whitelist
    WHERE chat_id = ?
  `).all(String(chatId));

  const whitelist = rows.map((row) => normalizeDomain(row.domain));

  return domains.some((domain) => {
    return whitelist.some((allowed) => {
      return domain === allowed || domain.endsWith("." + allowed);
    });
  });
}

async function safeDelete(ctx) {
  try {
    await ctx.deleteMessage();
  } catch {
    // нет прав или сообщение уже удалено
  }
}

async function muteForLink(ctx, userId) {
  try {
    const until = Math.floor(Date.now() / 1000) + 10 * 60;

    await ctx.telegram.restrictChatMember(ctx.chat.id, userId, {
      until_date: until,
      permissions: {
        can_send_messages: false,
      },
    });

    await ctx.reply("🔇 Ссылка удалена. Пользователь получил мут на 10 минут.");
  } catch {
    await ctx.reply("⚠️ Ссылка найдена, но я не смог выдать мут. Проверь права бота.").catch(() => {});
  }
}

function onOff(value) {
  return value ? "включено ✅" : "выключено ❌";
}

function registerAdvancedSecurity(bot, helpers) {
  const { safeReply } = helpers;

  bot.on("new_chat_members", async (ctx) => {
    try {
      if (!isGroup(ctx)) return;

      ensureSettings(ctx.chat.id);

      const settings = getSettings(ctx.chat.id);
      const members = ctx.message?.new_chat_members || [];

      for (const member of members) {
        if (member.id === ctx.botInfo?.id) continue;

        if (member.is_bot && settings.antibot_enabled) {
          await ctx.telegram.banChatMember(ctx.chat.id, member.id);
          saveLog(ctx.chat.id, member.id, "BOT_BAN", "Новый бот был автоматически забанен");

          await ctx.reply(`🤖 Бот ${userName(member)} автоматически забанен.`);
          continue;
        }

        if (!member.is_bot && settings.captcha_enabled) {
          const captcha = generateCaptcha();
          const key = captchaKey(ctx.chat.id, member.id);

          captchaSessions.set(key, {
            chatId: ctx.chat.id,
            userId: member.id,
            answer: captcha.answer,
            attempts: settings.captcha_attempts,
            expiresAt: now() + settings.captcha_minutes * 60 * 1000,
          });

          await restrictNewUser(ctx, member.id);

          saveLog(ctx.chat.id, member.id, "CAPTCHA_START", captcha.question);

          await ctx.reply(
            `🧩 Проверка новичка\n\n` +
              `${userName(member)}, чтобы писать в чат, реши пример:\n\n` +
              `${captcha.question} = ?\n\n` +
              `Попыток: ${settings.captcha_attempts}\n` +
              `Время: ${settings.captcha_minutes} мин.`
          );

          setTimeout(async () => {
            const session = captchaSessions.get(key);

            if (!session) return;

            if (now() >= session.expiresAt) {
              captchaSessions.delete(key);
              saveLog(ctx.chat.id, member.id, "CAPTCHA_TIMEOUT", "Время вышло");

              await kickUser(ctx, member.id);

              await ctx.reply(`⏳ ${userName(member)} не прошёл капчу и был кикнут.`).catch(() => {});
            }
          }, settings.captcha_minutes * 60 * 1000 + 3000);
        }
      }
    } catch (error) {
      console.error("Ошибка advanced new_chat_members:", error.message);
    }
  });

  bot.use(async (ctx, next) => {
    try {
      if (!isGroup(ctx)) return next();

      const message = ctx.message;
      const user = ctx.from;

      if (!message || !user || user.is_bot) return next();

      ensureSettings(ctx.chat.id);

      const settings = getSettings(ctx.chat.id);
      const text = message.text || message.caption || "";

      const key = captchaKey(ctx.chat.id, user.id);
      const session = captchaSessions.get(key);

      if (session) {
        if (!text) {
          await safeDelete(ctx);
          return;
        }

        if (now() > session.expiresAt) {
          captchaSessions.delete(key);
          await safeDelete(ctx);
          await kickUser(ctx, user.id);

          saveLog(ctx.chat.id, user.id, "CAPTCHA_TIMEOUT", "Время вышло");

          await ctx.reply(`⏳ ${userName(user)} не прошёл капчу и был кикнут.`).catch(() => {});
          return;
        }

        if (normalizeText(text) === normalizeText(session.answer)) {
          captchaSessions.delete(key);
          await safeDelete(ctx);
          await unrestrictUser(ctx, user.id);

          saveLog(ctx.chat.id, user.id, "CAPTCHA_SUCCESS", "Капча пройдена");

          await ctx.reply(`✅ ${userName(user)} прошёл проверку. Добро пожаловать!`);
          return;
        }

        session.attempts -= 1;

        if (session.attempts <= 0) {
          captchaSessions.delete(key);
          await safeDelete(ctx);
          await kickUser(ctx, user.id);

          saveLog(ctx.chat.id, user.id, "CAPTCHA_FAIL", "Попытки закончились");

          await ctx.reply(`❌ ${userName(user)} не прошёл капчу и был кикнут.`).catch(() => {});
          return;
        }

        captchaSessions.set(key, session);
        await safeDelete(ctx);

        await ctx.reply(
          `❌ Неверно, ${userName(user)}.\n` +
            `Осталось попыток: ${session.attempts}`
        ).catch(() => {});

        return;
      }

      if (settings.smart_links_enabled && text && hasLink(text)) {
        if (await isAdmin(ctx, user.id)) return next();

        if (isWhitelisted(ctx.chat.id, text)) {
          return next();
        }

        await safeDelete(ctx);
        saveLog(ctx.chat.id, user.id, "SMART_LINK_BLOCK", text.slice(0, 120));

        await muteForLink(ctx, user.id);
        return;
      }
    } catch (error) {
      console.error("Ошибка advanced security middleware:", error.message);
    }

    return next();
  });

  bot.command("advanced_security", async (ctx) => {
    if (!(await requireGroup(ctx, safeReply))) return;

    const s = getSettings(ctx.chat.id);

    return safeReply(
      ctx,
      "🧠 Расширенная защита\n\n" +
        `Капча новичков: ${onOff(s.captcha_enabled)}\n` +
        `Авто-бан ботов: ${onOff(s.antibot_enabled)}\n` +
        `Умные ссылки: ${onOff(s.smart_links_enabled)}\n` +
        `Время капчи: ${s.captcha_minutes} мин.\n` +
        `Попыток капчи: ${s.captcha_attempts}\n\n` +
        "Команды:\n" +
        "/captcha_on /captcha_off\n" +
        "/antibot_on /antibot_off\n" +
        "/smartlinks_on /smartlinks_off\n" +
        "/captcha_time 3\n" +
        "/captcha_attempts 3\n" +
        "/whitelist_add domain.com\n" +
        "/whitelist_remove domain.com\n" +
        "/whitelist\n" +
        "/captcha_log"
    );
  });

  bot.command("captcha_on", async (ctx) => {
    if (!(await requireGroup(ctx, safeReply))) return;
    if (!(await requireAdmin(ctx, safeReply))) return;

    db.prepare(`
      UPDATE advanced_security_settings
      SET captcha_enabled = 1, updated_at = ?
      WHERE chat_id = ?
    `).run(now(), String(ctx.chat.id));

    return safeReply(ctx, "✅ Капча для новичков включена.");
  });

  bot.command("captcha_off", async (ctx) => {
    if (!(await requireGroup(ctx, safeReply))) return;
    if (!(await requireAdmin(ctx, safeReply))) return;

    db.prepare(`
      UPDATE advanced_security_settings
      SET captcha_enabled = 0, updated_at = ?
      WHERE chat_id = ?
    `).run(now(), String(ctx.chat.id));

    return safeReply(ctx, "✅ Капча для новичков выключена.");
  });

  bot.command("antibot_on", async (ctx) => {
    if (!(await requireGroup(ctx, safeReply))) return;
    if (!(await requireAdmin(ctx, safeReply))) return;

    db.prepare(`
      UPDATE advanced_security_settings
      SET antibot_enabled = 1, updated_at = ?
      WHERE chat_id = ?
    `).run(now(), String(ctx.chat.id));

    return safeReply(ctx, "✅ Авто-бан новых ботов включён.");
  });

  bot.command("antibot_off", async (ctx) => {
    if (!(await requireGroup(ctx, safeReply))) return;
    if (!(await requireAdmin(ctx, safeReply))) return;

    db.prepare(`
      UPDATE advanced_security_settings
      SET antibot_enabled = 0, updated_at = ?
      WHERE chat_id = ?
    `).run(now(), String(ctx.chat.id));

    return safeReply(ctx, "✅ Авто-бан новых ботов выключен.");
  });

  bot.command("smartlinks_on", async (ctx) => {
    if (!(await requireGroup(ctx, safeReply))) return;
    if (!(await requireAdmin(ctx, safeReply))) return;

    db.prepare(`
      UPDATE advanced_security_settings
      SET smart_links_enabled = 1, updated_at = ?
      WHERE chat_id = ?
    `).run(now(), String(ctx.chat.id));

    // Отключаем старую анти-ссылку из security.js, чтобы не было конфликта с whitelist
    db.prepare(`
      CREATE TABLE IF NOT EXISTS security_settings (
        chat_id TEXT PRIMARY KEY,
        antilink_enabled INTEGER DEFAULT 1,
        antiflood_enabled INTEGER DEFAULT 1,
        badwords_enabled INTEGER DEFAULT 1,
        delete_violations INTEGER DEFAULT 1,
        automute_enabled INTEGER DEFAULT 1,
        flood_limit INTEGER DEFAULT 5,
        flood_seconds INTEGER DEFAULT 8,
        mute_minutes INTEGER DEFAULT 10
      )
    `).run();

    db.prepare(`
      INSERT OR IGNORE INTO security_settings (chat_id)
      VALUES (?)
    `).run(String(ctx.chat.id));

    db.prepare(`
      UPDATE security_settings
      SET antilink_enabled = 0
      WHERE chat_id = ?
    `).run(String(ctx.chat.id));

    return safeReply(
      ctx,
      "✅ Умная проверка ссылок включена.\n\nСтарая анти-ссылка автоматически выключена, чтобы работал whitelist."
    );
  });

  bot.command("smartlinks_off", async (ctx) => {
    if (!(await requireGroup(ctx, safeReply))) return;
    if (!(await requireAdmin(ctx, safeReply))) return;

    db.prepare(`
      UPDATE advanced_security_settings
      SET smart_links_enabled = 0, updated_at = ?
      WHERE chat_id = ?
    `).run(now(), String(ctx.chat.id));

    return safeReply(ctx, "✅ Умная проверка ссылок выключена.");
  });

  bot.command("captcha_time", async (ctx) => {
    if (!(await requireGroup(ctx, safeReply))) return;
    if (!(await requireAdmin(ctx, safeReply))) return;

    const minutes = Number(parseArgs(ctx)[0]);

    if (!Number.isInteger(minutes) || minutes < 1 || minutes > 15) {
      return safeReply(ctx, "Укажи время от 1 до 15 минут. Например: /captcha_time 3");
    }

    db.prepare(`
      UPDATE advanced_security_settings
      SET captcha_minutes = ?, updated_at = ?
      WHERE chat_id = ?
    `).run(minutes, now(), String(ctx.chat.id));

    return safeReply(ctx, `✅ Время на капчу: ${minutes} мин.`);
  });

  bot.command("captcha_attempts", async (ctx) => {
    if (!(await requireGroup(ctx, safeReply))) return;
    if (!(await requireAdmin(ctx, safeReply))) return;

    const attempts = Number(parseArgs(ctx)[0]);

    if (!Number.isInteger(attempts) || attempts < 1 || attempts > 10) {
      return safeReply(ctx, "Укажи число попыток от 1 до 10. Например: /captcha_attempts 3");
    }

    db.prepare(`
      UPDATE advanced_security_settings
      SET captcha_attempts = ?, updated_at = ?
      WHERE chat_id = ?
    `).run(attempts, now(), String(ctx.chat.id));

    return safeReply(ctx, `✅ Попыток капчи: ${attempts}`);
  });

  bot.command("whitelist_add", async (ctx) => {
    if (!(await requireGroup(ctx, safeReply))) return;
    if (!(await requireAdmin(ctx, safeReply))) return;

    const domain = normalizeDomain(parseArgs(ctx)[0]);

    if (!domain || !domain.includes(".")) {
      return safeReply(ctx, "Укажи домен. Например: /whitelist_add youtube.com");
    }

    db.prepare(`
      INSERT INTO link_whitelist (chat_id, domain)
      VALUES (?, ?)
    `).run(String(ctx.chat.id), domain);

    return safeReply(ctx, `✅ Домен добавлен в whitelist: ${domain}`);
  });

  bot.command("whitelist_remove", async (ctx) => {
    if (!(await requireGroup(ctx, safeReply))) return;
    if (!(await requireAdmin(ctx, safeReply))) return;

    const domain = normalizeDomain(parseArgs(ctx)[0]);

    if (!domain) {
      return safeReply(ctx, "Укажи домен. Например: /whitelist_remove youtube.com");
    }

    const result = db.prepare(`
      DELETE FROM link_whitelist
      WHERE chat_id = ? AND domain = ?
    `).run(String(ctx.chat.id), domain);

    if (!result.changes) {
      return safeReply(ctx, "Такого домена нет в whitelist.");
    }

    return safeReply(ctx, `✅ Домен удалён из whitelist: ${domain}`);
  });

  bot.command("whitelist", async (ctx) => {
    if (!(await requireGroup(ctx, safeReply))) return;

    const rows = db.prepare(`
      SELECT domain FROM link_whitelist
      WHERE chat_id = ?
      ORDER BY domain ASC
    `).all(String(ctx.chat.id));

    if (!rows.length) {
      return safeReply(ctx, "Whitelist ссылок пуст.");
    }

    const text = rows.map((row, index) => `${index + 1}. ${row.domain}`).join("\n");

    return safeReply(ctx, "✅ Разрешённые домены:\n\n" + text);
  });

  bot.command("captcha_log", async (ctx) => {
    if (!(await requireGroup(ctx, safeReply))) return;
    if (!(await requireAdmin(ctx, safeReply))) return;

    const rows = db.prepare(`
      SELECT * FROM captcha_logs
      WHERE chat_id = ?
      ORDER BY id DESC
      LIMIT 10
    `).all(String(ctx.chat.id));

    if (!rows.length) {
      return safeReply(ctx, "Лог расширенной защиты пуст.");
    }

    const text = rows
      .map((log) => {
        const date = new Date(Number(log.created_at)).toLocaleString("ru-RU");

        return (
          `#${log.id} ${log.action}\n` +
          `User ID: ${log.user_id}\n` +
          `Детали: ${log.details || "нет"}\n` +
          `${date}`
        );
      })
      .join("\n\n");

    return safeReply(ctx, "🧩 Лог расширенной защиты:\n\n" + text);
  });
}

module.exports = {
  registerAdvancedSecurity,
};