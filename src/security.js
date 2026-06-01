const path = require("path");

const db = require("./db");

const floodMap = new Map();

const defaultBadWords = [
  "дурак",
  "лох",
  "идиот",
  "тупой",
  "дебил",
];

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

function ensureSettings(chatId) {
  db.prepare(`
    INSERT OR IGNORE INTO security_settings (
      chat_id,
      antilink_enabled,
      antiflood_enabled,
      badwords_enabled,
      delete_violations,
      automute_enabled,
      flood_limit,
      flood_seconds,
      mute_minutes
    )
    VALUES (?, 1, 1, 1, 1, 1, 5, 8, 10)
  `).run(String(chatId));
}

function getSettings(chatId) {
  ensureSettings(chatId);

  return db.prepare(`
    SELECT * FROM security_settings WHERE chat_id = ?
  `).get(String(chatId));
}

function saveSecurityLog(chatId, userId, action, reason = "") {
  db.prepare(`
    INSERT INTO security_logs (chat_id, user_id, action, reason, created_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(String(chatId), String(userId), action, reason, now());
}

async function isAdmin(ctx, userId) {
  try {
    const member = await ctx.telegram.getChatMember(ctx.chat.id, userId);
    return member.status === "creator" || member.status === "administrator";
  } catch {
    return false;
  }
}

async function safeDelete(ctx) {
  try {
    await ctx.deleteMessage();
  } catch {
    // Может не быть прав на удаление сообщений
  }
}

async function muteUser(ctx, userId, minutes, reason) {
  try {
    const until = Math.floor(Date.now() / 1000) + minutes * 60;

    await ctx.telegram.restrictChatMember(ctx.chat.id, userId, {
      until_date: until,
      permissions: {
        can_send_messages: false,
      },
    });

    saveSecurityLog(ctx.chat.id, userId, "AUTO_MUTE", reason);

    await ctx.reply(
      `🔇 Пользователь получил мут на ${minutes} мин.\nПричина: ${reason}`
    );
  } catch {
    await ctx.reply(
      "⚠️ Нарушение найдено, но я не смог выдать мут. Проверь права бота."
    ).catch(() => {});
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
    /[a-z0-9-]+\.(com|ru|kz|net|org|io|gg|me|info|site|online)/i.test(value)
  );
}

function getChatBadWords(chatId) {
  const rows = db.prepare(`
    SELECT word FROM bad_words WHERE chat_id = ?
  `).all(String(chatId));

  const custom = rows.map((row) => normalizeText(row.word)).filter(Boolean);

  return [...defaultBadWords, ...custom];
}

function hasBadWord(chatId, text) {
  const value = normalizeText(text);
  const words = getChatBadWords(chatId);

  return words.find((word) => {
    if (!word) return false;
    const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const regex = new RegExp(`(^|\\s|[^а-яa-z0-9])${escaped}($|\\s|[^а-яa-z0-9])`, "i");
    return regex.test(value);
  });
}

function checkFlood(chatId, userId, settings) {
  const key = `${chatId}:${userId}`;
  const currentTime = now();

  const data = floodMap.get(key) || [];
  const fresh = data.filter(
    (timestamp) => currentTime - timestamp <= settings.flood_seconds * 1000
  );

  fresh.push(currentTime);
  floodMap.set(key, fresh);

  return fresh.length > settings.flood_limit;
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

async function requireAdmin(ctx, safeReply) {
  const ok = await isAdmin(ctx, ctx.from.id);

  if (!ok) {
    await safeReply(ctx, "⛔ Эту команду может использовать только админ.");
    return false;
  }

  return true;
}

function onOff(value) {
  return value ? "включено ✅" : "выключено ❌";
}

function registerSecurity(bot, helpers) {
  const { safeReply } = helpers;

  bot.use(async (ctx, next) => {
    try {
      // Пропускаем callback_query (нажатия кнопок)
      if (ctx.callbackQuery) return next();

      if (!isGroup(ctx)) return next();

      const message = ctx.message;
      const user = ctx.from;

      if (!message || !user || user.is_bot) return next();

      ensureSettings(ctx.chat.id);

      const settings = getSettings(ctx.chat.id);

      const text =
        message.text ||
        message.caption ||
        "";

      if (!text) return next();

      if (await isAdmin(ctx, user.id)) {
        return next();
      }

      // Антифлуд
      if (settings.antiflood_enabled && checkFlood(ctx.chat.id, user.id, settings)) {
        saveSecurityLog(ctx.chat.id, user.id, "FLOOD", "Флуд сообщениями");

        if (settings.delete_violations) {
          await safeDelete(ctx);
        }

        if (settings.automute_enabled) {
          await muteUser(ctx, user.id, settings.mute_minutes, "флуд");
        } else {
          await ctx.reply("⚠️ Обнаружен флуд.").catch(() => {});
        }

        return;
      }

      // Анти-ссылки
      if (settings.antilink_enabled && hasLink(text)) {
        saveSecurityLog(ctx.chat.id, user.id, "LINK", text.slice(0, 120));

        if (settings.delete_violations) {
          await safeDelete(ctx);
        }

        if (settings.automute_enabled) {
          await muteUser(ctx, user.id, settings.mute_minutes, "запрещённая ссылка");
        } else {
          await ctx.reply("⚠️ Ссылки в чате запрещены.").catch(() => {});
        }

        return;
      }

      // Антимат / запрещённые слова
      if (settings.badwords_enabled) {
        const badWord = hasBadWord(ctx.chat.id, text);

        if (badWord) {
          saveSecurityLog(ctx.chat.id, user.id, "BAD_WORD", badWord);

          if (settings.delete_violations) {
            await safeDelete(ctx);
          }

          if (settings.automute_enabled) {
            await muteUser(ctx, user.id, settings.mute_minutes, "запрещённое слово");
          } else {
            await ctx.reply("⚠️ Сообщение нарушает правила чата.").catch(() => {});
          }

          return;
        }
      }
    } catch (error) {
      console.error("Ошибка security middleware:", error.message);
    }

    return next();
  });

  bot.command("security", async (ctx) => {
    if (!(await requireGroup(ctx, safeReply))) return;

    const s = getSettings(ctx.chat.id);

    return safeReply(
      ctx,
      "🛡 Защита чата\n\n" +
        `Анти-ссылки: ${onOff(s.antilink_enabled)}\n` +
        `Антифлуд: ${onOff(s.antiflood_enabled)}\n` +
        `Антимат: ${onOff(s.badwords_enabled)}\n` +
        `Удалять нарушения: ${onOff(s.delete_violations)}\n` +
        `Авто-мут: ${onOff(s.automute_enabled)}\n\n` +
        `Лимит флуда: ${s.flood_limit} сообщений за ${s.flood_seconds} сек.\n` +
        `Мут за нарушение: ${s.mute_minutes} мин.\n\n` +
        "Команды:\n" +
        "/antilink_on /antilink_off\n" +
        "/antiflood_on /antiflood_off\n" +
        "/badwords_on /badwords_off\n" +
        "/automute_on /automute_off\n" +
        "/deleteviolations_on /deleteviolations_off\n" +
        "/floodlimit 5 8\n" +
        "/mutetime 10\n" +
        "/badword_add слово\n" +
        "/badword_list\n" +
        "/badword_remove слово\n" +
        "/securitylog"
    );
  });

  bot.command("antilink_on", async (ctx) => {
    if (!(await requireGroup(ctx, safeReply))) return;
    if (!(await requireAdmin(ctx, safeReply))) return;

    ensureSettings(ctx.chat.id);
    db.prepare(`UPDATE security_settings SET antilink_enabled = 1 WHERE chat_id = ?`)
      .run(String(ctx.chat.id));

    return safeReply(ctx, "✅ Анти-ссылки включены.");
  });

  bot.command("antilink_off", async (ctx) => {
    if (!(await requireGroup(ctx, safeReply))) return;
    if (!(await requireAdmin(ctx, safeReply))) return;

    ensureSettings(ctx.chat.id);
    db.prepare(`UPDATE security_settings SET antilink_enabled = 0 WHERE chat_id = ?`)
      .run(String(ctx.chat.id));

    return safeReply(ctx, "✅ Анти-ссылки выключены.");
  });

  bot.command("antiflood_on", async (ctx) => {
    if (!(await requireGroup(ctx, safeReply))) return;
    if (!(await requireAdmin(ctx, safeReply))) return;

    ensureSettings(ctx.chat.id);
    db.prepare(`UPDATE security_settings SET antiflood_enabled = 1 WHERE chat_id = ?`)
      .run(String(ctx.chat.id));

    return safeReply(ctx, "✅ Антифлуд включён.");
  });

  bot.command("antiflood_off", async (ctx) => {
    if (!(await requireGroup(ctx, safeReply))) return;
    if (!(await requireAdmin(ctx, safeReply))) return;

    ensureSettings(ctx.chat.id);
    db.prepare(`UPDATE security_settings SET antiflood_enabled = 0 WHERE chat_id = ?`)
      .run(String(ctx.chat.id));

    return safeReply(ctx, "✅ Антифлуд выключен.");
  });

  bot.command("badwords_on", async (ctx) => {
    if (!(await requireGroup(ctx, safeReply))) return;
    if (!(await requireAdmin(ctx, safeReply))) return;

    ensureSettings(ctx.chat.id);
    db.prepare(`UPDATE security_settings SET badwords_enabled = 1 WHERE chat_id = ?`)
      .run(String(ctx.chat.id));

    return safeReply(ctx, "✅ Антимат включён.");
  });

  bot.command("badwords_off", async (ctx) => {
    if (!(await requireGroup(ctx, safeReply))) return;
    if (!(await requireAdmin(ctx, safeReply))) return;

    ensureSettings(ctx.chat.id);
    db.prepare(`UPDATE security_settings SET badwords_enabled = 0 WHERE chat_id = ?`)
      .run(String(ctx.chat.id));

    return safeReply(ctx, "✅ Антимат выключен.");
  });

  bot.command("automute_on", async (ctx) => {
    if (!(await requireGroup(ctx, safeReply))) return;
    if (!(await requireAdmin(ctx, safeReply))) return;

    ensureSettings(ctx.chat.id);
    db.prepare(`UPDATE security_settings SET automute_enabled = 1 WHERE chat_id = ?`)
      .run(String(ctx.chat.id));

    return safeReply(ctx, "✅ Авто-мут включён.");
  });

  bot.command("automute_off", async (ctx) => {
    if (!(await requireGroup(ctx, safeReply))) return;
    if (!(await requireAdmin(ctx, safeReply))) return;

    ensureSettings(ctx.chat.id);
    db.prepare(`UPDATE security_settings SET automute_enabled = 0 WHERE chat_id = ?`)
      .run(String(ctx.chat.id));

    return safeReply(ctx, "✅ Авто-мут выключен.");
  });

  bot.command("deleteviolations_on", async (ctx) => {
    if (!(await requireGroup(ctx, safeReply))) return;
    if (!(await requireAdmin(ctx, safeReply))) return;

    ensureSettings(ctx.chat.id);
    db.prepare(`UPDATE security_settings SET delete_violations = 1 WHERE chat_id = ?`)
      .run(String(ctx.chat.id));

    return safeReply(ctx, "✅ Удаление нарушений включено.");
  });

  bot.command("deleteviolations_off", async (ctx) => {
    if (!(await requireGroup(ctx, safeReply))) return;
    if (!(await requireAdmin(ctx, safeReply))) return;

    ensureSettings(ctx.chat.id);
    db.prepare(`UPDATE security_settings SET delete_violations = 0 WHERE chat_id = ?`)
      .run(String(ctx.chat.id));

    return safeReply(ctx, "✅ Удаление нарушений выключено.");
  });

  bot.command("floodlimit", async (ctx) => {
    if (!(await requireGroup(ctx, safeReply))) return;
    if (!(await requireAdmin(ctx, safeReply))) return;

    const args = parseArgs(ctx);
    const limit = Number(args[0]);
    const seconds = Number(args[1]);

    if (!Number.isInteger(limit) || !Number.isInteger(seconds) || limit < 2 || seconds < 2) {
      return safeReply(ctx, "Используй так: /floodlimit 5 8\nЭто значит 5 сообщений за 8 секунд.");
    }

    ensureSettings(ctx.chat.id);

    db.prepare(`
      UPDATE security_settings
      SET flood_limit = ?, flood_seconds = ?
      WHERE chat_id = ?
    `).run(limit, seconds, String(ctx.chat.id));

    return safeReply(ctx, `✅ Новый лимит флуда: ${limit} сообщений за ${seconds} сек.`);
  });

  bot.command("mutetime", async (ctx) => {
    if (!(await requireGroup(ctx, safeReply))) return;
    if (!(await requireAdmin(ctx, safeReply))) return;

    const minutes = Number(parseArgs(ctx)[0]);

    if (!Number.isInteger(minutes) || minutes < 1 || minutes > 1440) {
      return safeReply(ctx, "Укажи время от 1 до 1440 минут. Например: /mutetime 10");
    }

    ensureSettings(ctx.chat.id);

    db.prepare(`
      UPDATE security_settings
      SET mute_minutes = ?
      WHERE chat_id = ?
    `).run(minutes, String(ctx.chat.id));

    return safeReply(ctx, `✅ Мут за нарушение теперь: ${minutes} мин.`);
  });

  bot.command("badword_add", async (ctx) => {
    if (!(await requireGroup(ctx, safeReply))) return;
    if (!(await requireAdmin(ctx, safeReply))) return;

    const word = normalizeText(parseArgs(ctx).join(" "));

    if (!word || word.length < 2) {
      return safeReply(ctx, "Напиши слово: /badword_add слово");
    }

    db.prepare(`
      INSERT INTO bad_words (chat_id, word)
      VALUES (?, ?)
    `).run(String(ctx.chat.id), word);

    return safeReply(ctx, `✅ Слово добавлено в фильтр: ${word}`);
  });

  bot.command("badword_list", async (ctx) => {
    if (!(await requireGroup(ctx, safeReply))) return;

    const rows = db.prepare(`
      SELECT word FROM bad_words
      WHERE chat_id = ?
      ORDER BY id DESC
      LIMIT 50
    `).all(String(ctx.chat.id));

    if (!rows.length) {
      return safeReply(ctx, "Пользовательский список запрещённых слов пуст.");
    }

    const text = rows.map((row, index) => `${index + 1}. ${row.word}`).join("\n");

    return safeReply(ctx, "🚫 Запрещённые слова:\n\n" + text);
  });

  bot.command("badword_remove", async (ctx) => {
    if (!(await requireGroup(ctx, safeReply))) return;
    if (!(await requireAdmin(ctx, safeReply))) return;

    const word = normalizeText(parseArgs(ctx).join(" "));

    if (!word) {
      return safeReply(ctx, "Напиши слово: /badword_remove слово");
    }

    const result = db.prepare(`
      DELETE FROM bad_words
      WHERE chat_id = ? AND lower(word) = ?
    `).run(String(ctx.chat.id), word);

    if (result.changes === 0) {
      return safeReply(ctx, "Такого слова нет в списке.");
    }

    return safeReply(ctx, `✅ Слово удалено из фильтра: ${word}`);
  });

  bot.command("securitylog", async (ctx) => {
    if (!(await requireGroup(ctx, safeReply))) return;
    if (!(await requireAdmin(ctx, safeReply))) return;

    const rows = db.prepare(`
      SELECT * FROM security_logs
      WHERE chat_id = ?
      ORDER BY id DESC
      LIMIT 10
    `).all(String(ctx.chat.id));

    if (!rows.length) {
      return safeReply(ctx, "Лог защиты пока пуст.");
    }

    const text = rows
      .map((log) => {
        const date = new Date(Number(log.created_at)).toLocaleString("ru-RU");
        return `#${log.id} ${log.action}\nUser ID: ${log.user_id}\nПричина: ${log.reason || "нет"}\n${date}`;
      })
      .join("\n\n");

    return safeReply(ctx, "🛡 Последние срабатывания защиты:\n\n" + text);
  });
}

module.exports = {
  registerSecurity,
};