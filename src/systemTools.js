const fs = require("fs");
const path = require("path");

const dbPath = process.env.DATABASE_PATH || "./data/bot.sqlite";

function isGroup(ctx) {
  const type = ctx.chat?.type;
  return type === "group" || type === "supergroup";
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

function checkFile(filePath) {
  try {
    return fs.existsSync(filePath);
  } catch {
    return false;
  }
}

function checkPackage(packageName) {
  try {
    require.resolve(packageName);
    return true;
  } catch {
    return false;
  }
}

function yesNo(value) {
  return value ? "✅" : "❌";
}

function getDbInfo() {
  const fullPath = path.resolve(dbPath);
  const exists = fs.existsSync(fullPath);

  if (!exists) {
    return {
      exists: false,
      path: fullPath,
      size: 0,
    };
  }

  const stat = fs.statSync(fullPath);

  return {
    exists: true,
    path: fullPath,
    size: stat.size,
  };
}

async function getBotRights(ctx) {
  const botInfo = await ctx.telegram.getMe();
  const member = await ctx.telegram.getChatMember(ctx.chat.id, botInfo.id);

  return {
    botInfo,
    status: member.status,
    canDeleteMessages: Boolean(member.can_delete_messages),
    canRestrictMembers: Boolean(member.can_restrict_members),
    canInviteUsers: Boolean(member.can_invite_users),
    canPinMessages: Boolean(member.can_pin_messages),
    canPromoteMembers: Boolean(member.can_promote_members),
    canManageChat: Boolean(member.can_manage_chat),
  };
}

function registerSystemTools(bot, helpers) {
  const { safeReply } = helpers;

  bot.command("ping", async (ctx) => {
    const start = Date.now();

    const msg = await ctx.reply("🏓 Проверяю задержку...").catch(() => null);

    const ms = Date.now() - start;

    if (msg) {
      return safeReply(ctx, `🏓 Pong!\nЗадержка: ${ms} ms`);
    }

    return safeReply(ctx, "🏓 Pong!");
  });

  bot.command("modules", async (ctx) => {
    const modules = [
      ["moderation.js", "./src/moderation.js"],
      ["security.js", "./src/security.js"],
      ["advancedSecurity.js", "./src/advancedSecurity.js"],
      ["levels.js", "./src/levels.js"],
      ["economy.js", "./src/economy.js"],
      ["chatTools.js", "./src/chatTools.js"],
      ["autoResponder.js", "./src/autoResponder.js"],
      ["systemTools.js", "./src/systemTools.js"],
      ["phrases.js", "./src/data/phrases.js"],
    ];

    const text = modules
      .map(([name, file]) => `${yesNo(checkFile(file))} ${name}`)
      .join("\n");

    return safeReply(ctx, "📦 Проверка модулей:\n\n" + text);
  });

  bot.command("dbcheck", async (ctx) => {
    const db = getDbInfo();

    return safeReply(
      ctx,
      "🗄 Проверка базы данных\n\n" +
        `Файл: ${db.exists ? "✅ найден" : "❌ не найден"}\n` +
        `Путь: ${db.path}\n` +
        `Размер: ${db.size} байт\n\n` +
        `DATABASE_PATH: ${process.env.DATABASE_PATH || "не указан, используется ./data/bot.sqlite"}`
    );
  });

  bot.command("botrights", async (ctx) => {
    if (!(await requireGroup(ctx, safeReply))) return;

    try {
      const rights = await getBotRights(ctx);

      return safeReply(
        ctx,
        "🛡 Права бота в группе\n\n" +
          `Бот: @${rights.botInfo.username}\n` +
          `Статус: ${rights.status}\n\n` +
          `${yesNo(rights.canManageChat)} Управление чатом\n` +
          `${yesNo(rights.canDeleteMessages)} Удаление сообщений\n` +
          `${yesNo(rights.canRestrictMembers)} Бан/мут/ограничения\n` +
          `${yesNo(rights.canInviteUsers)} Приглашение пользователей\n` +
          `${yesNo(rights.canPinMessages)} Закреп сообщений\n\n` +
          "Для полноценной работы нужны минимум:\n" +
          "✅ удаление сообщений\n" +
          "✅ бан/мут/ограничения"
      );
    } catch (error) {
      return safeReply(
        ctx,
        "❌ Не смог проверить права бота.\n\n" +
          "Проверь, что бот добавлен в группу и является администратором."
      );
    }
  });

  bot.command("privacyinfo", async (ctx) => {
    return safeReply(
      ctx,
      "🔐 Privacy Mode в Telegram\n\n" +
        "Чтобы бот видел все сообщения в группе и мог считать активность, антифлуд, уровни и автоответы, нужно выключить Privacy Mode:\n\n" +
        "1. Открой @BotFather\n" +
        "2. Напиши /mybots\n" +
        "3. Выбери своего бота\n" +
        "4. Bot Settings\n" +
        "5. Group Privacy\n" +
        "6. Turn off\n\n" +
        "После этого перезапусти бота и заново добавь его в группу, если нужно."
    );
  });

  bot.command("systemcheck", async (ctx) => {
    const isGroupChat = isGroup(ctx);

    const files = {
      moderation: checkFile("./src/moderation.js"),
      security: checkFile("./src/security.js"),
      advancedSecurity: checkFile("./src/advancedSecurity.js"),
      levels: checkFile("./src/levels.js"),
      economy: checkFile("./src/economy.js"),
      chatTools: checkFile("./src/chatTools.js"),
      autoResponder: checkFile("./src/autoResponder.js"),
      systemTools: checkFile("./src/systemTools.js"),
      phrases: checkFile("./src/data/phrases.js"),
    };

    const packages = {
      telegraf: checkPackage("telegraf"),
      dotenv: checkPackage("dotenv"),
      betterSqlite3: checkPackage("better-sqlite3"),
    };

    const db = getDbInfo();

    let rightsText = "Права бота: проверка доступна только в группе.";

    if (isGroupChat) {
      try {
        const rights = await getBotRights(ctx);

        rightsText =
          "Права бота:\n" +
          `Статус: ${rights.status}\n` +
          `${yesNo(rights.canDeleteMessages)} Удаление сообщений\n` +
          `${yesNo(rights.canRestrictMembers)} Бан/мут/ограничения\n` +
          `${yesNo(rights.canManageChat)} Управление чатом`;
      } catch {
        rightsText = "Права бота: ❌ не удалось проверить.";
      }
    }

    return safeReply(
      ctx,
      "🧪 System Check FunTalk Bot\n\n" +
        "📦 Модули:\n" +
        `${yesNo(files.moderation)} moderation\n` +
        `${yesNo(files.security)} security\n` +
        `${yesNo(files.advancedSecurity)} advancedSecurity\n` +
        `${yesNo(files.levels)} levels\n` +
        `${yesNo(files.economy)} economy\n` +
        `${yesNo(files.chatTools)} chatTools\n` +
        `${yesNo(files.autoResponder)} autoResponder\n` +
        `${yesNo(files.systemTools)} systemTools\n` +
        `${yesNo(files.phrases)} phrases\n\n` +
        "📚 Пакеты:\n" +
        `${yesNo(packages.telegraf)} telegraf\n` +
        `${yesNo(packages.dotenv)} dotenv\n` +
        `${yesNo(packages.betterSqlite3)} better-sqlite3\n\n` +
        "🗄 База данных:\n" +
        `${yesNo(db.exists)} ${db.path}\n` +
        `Размер: ${db.size} байт\n\n` +
        "🤖 BOT_TOKEN:\n" +
        `${process.env.BOT_TOKEN ? "✅ найден" : "❌ не найден"}\n\n` +
        rightsText +
        "\n\n" +
        "Дополнительно:\n" +
        "/botrights — проверить права\n" +
        "/privacyinfo — инструкция по Privacy Mode\n" +
        "/modules — проверить файлы\n" +
        "/dbcheck — проверить базу"
    );
  });

  bot.command("adminhelp", async (ctx) => {
    if (isGroup(ctx)) {
      if (!(await requireAdmin(ctx, safeReply))) return;
    }

    return safeReply(
      ctx,
      "🧑‍💻 Админ-памятка FunTalk Bot\n\n" +
        "1. Сделай бота админом группы.\n" +
        "2. Дай права: удалять сообщения, банить, ограничивать.\n" +
        "3. В @BotFather выключи Privacy Mode.\n" +
        "4. Проверь систему: /systemcheck\n" +
        "5. Проверь права: /botrights\n\n" +
        "Главные разделы:\n" +
        "/modhelp — модерация\n" +
        "/security — защита\n" +
        "/advanced_security — капча и whitelist\n" +
        "/levels — уровни\n" +
        "/shop — экономика\n" +
        "/chattools — правила и команды\n" +
        "/autoresponder — автоответчик\n\n" +
        "Для команд на пользователя лучше использовать Reply на сообщение."
    );
  });
}

module.exports = {
  registerSystemTools,
};