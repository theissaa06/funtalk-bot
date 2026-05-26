// ============================================================
// src/removeUser.js
// Жёсткое удаление участников: ban/kick/unban
// Поддержка английских и русских команд:
// /ban, /бан
// /kick, /кик
// /unban, /разбан
// ============================================================

const db = require("./db");
const { isProtected } = require("./utils");

async function isChatAdmin(ctx, userId) {
  try {
    const member = await ctx.telegram.getChatMember(ctx.chat.id, userId);
    return member.status === "creator" || member.status === "administrator";
  } catch (err) {
    console.error("[removeUser:isChatAdmin]", err.message);
    return false;
  }
}

async function canBotRestrict(ctx) {
  try {
    const botInfo = await ctx.telegram.getMe();
    const botMember = await ctx.telegram.getChatMember(ctx.chat.id, botInfo.id);

    if (botMember.status === "creator") return true;

    return (
      botMember.status === "administrator" &&
      botMember.can_restrict_members === true
    );
  } catch (err) {
    console.error("[removeUser:canBotRestrict]", err.message);
    return false;
  }
}

function getCommandAndArgs(ctx) {
  const text = ctx.message?.text || "";
  const parts = text.trim().split(/\s+/);
  const command = (parts[0] || "").replace("/", "").split("@")[0].toLowerCase();
  const args = parts.slice(1);
  return { command, args, text };
}

function getTargetFromReplyOrArgs(ctx, args) {
  const replyUser = ctx.message?.reply_to_message?.from;

  if (replyUser && replyUser.id) {
    return {
      id: replyUser.id,
      username: replyUser.username,
      first_name: replyUser.first_name,
      is_bot: replyUser.is_bot,
      fromReply: true,
    };
  }

  const possibleId = args[0];

  if (possibleId && /^-?\d+$/.test(possibleId)) {
    return {
      id: Number(possibleId),
      username: null,
      first_name: null,
      is_bot: false,
      fromReply: false,
    };
  }

  return null;
}

function getReason(args, targetFromReply) {
  if (targetFromReply) {
    return args.join(" ").trim() || "Без причины";
  }

  return args.slice(1).join(" ").trim() || "Без причины";
}

function formatUser(user) {
  if (!user) return "пользователь";
  if (user.username) return `@${user.username}`;
  if (user.first_name) return user.first_name;
  return `ID ${user.id}`;
}

function removeFromLocalDb(userId, chatId) {
  try {
    db.prepare("DELETE FROM users WHERE id = ? AND chat_id = ?").run(userId, chatId);
  } catch (err) {
    console.error("[removeUser:removeFromLocalDb]", err.message);
  }
}

function logModAction(chatId, userId, action, reason, byUserId) {
  try {
    db.prepare(
      `INSERT INTO mod_log (chat_id, user_id, action, reason, by_user_id)
       VALUES (?, ?, ?, ?, ?)`
    ).run(chatId, userId, action, reason, byUserId);
  } catch (err) {
    console.error("[removeUser:logModAction]", err.message);
  }
}

async function baseChecks(ctx) {
  if (!ctx.chat || ctx.chat.type === "private") {
    await ctx.reply("🛡 Эта команда работает только в группах.");
    return false;
  }

  const senderAdmin = await isChatAdmin(ctx, ctx.from.id);

  if (!senderAdmin) {
    await ctx.reply("⛔ Команду могут использовать только администраторы чата.");
    return false;
  }

  const botCanRestrict = await canBotRestrict(ctx);

  if (!botCanRestrict) {
    await ctx.reply(
      "⚠️ Я не могу банить или кикать участников.\n\n" +
      "Сделай меня админом и включи право «Блокировать пользователей»."
    );
    return false;
  }

  return true;
}

async function banUser(ctx) {
  const ok = await baseChecks(ctx);
  if (!ok) return;

  const { args } = getCommandAndArgs(ctx);
  const target = getTargetFromReplyOrArgs(ctx, args);

  if (!target) {
    return ctx.reply(
      "🛡 Чтобы забанить пользователя:\n\n" +
      "1) Ответь на его сообщение командой:\n" +
      "/ban причина\n" +
      "или\n" +
      "/бан причина\n\n" +
      "2) Или укажи ID:\n" +
      "/ban 123456789 причина"
    );
  }

  if (target.id === ctx.from.id) {
    return ctx.reply("🤨 Самого себя банить не надо.");
  }

  // *** ЗАЩИТА: администраторы, владелец чата, владелец бота ***
  const guard = await isProtected(ctx, target.id);
  if (guard.protected) return ctx.reply(guard.reason);

  const reason = getReason(args, target.fromReply);

  try {
    await ctx.telegram.banChatMember(ctx.chat.id, target.id);

    removeFromLocalDb(target.id, ctx.chat.id);
    logModAction(ctx.chat.id, target.id, "ban", reason, ctx.from.id);

    return ctx.reply(
      `🔨 <b>${formatUser(target)} забанен и удалён из группы.</b>\n\n` +
      `📝 <b>Причина:</b> ${reason}`,
      { parse_mode: "HTML" }
    );
  } catch (err) {
    console.error("[removeUser:ban]", err.message);

    return ctx.reply(
      "❌ Не получилось забанить пользователя.\n\n" +
      "Проверь, что бот админ и у него есть право «Блокировать пользователей»."
    );
  }
}

async function kickUser(ctx) {
  const ok = await baseChecks(ctx);
  if (!ok) return;

  const { args } = getCommandAndArgs(ctx);
  const target = getTargetFromReplyOrArgs(ctx, args);

  if (!target) {
    return ctx.reply(
      "👢 Чтобы кикнуть пользователя:\n\n" +
      "1) Ответь на его сообщение командой:\n" +
      "/kick причина\n" +
      "или\n" +
      "/кик причина\n\n" +
      "2) Или укажи ID:\n" +
      "/kick 123456789 причина"
    );
  }

  if (target.id === ctx.from.id) {
    return ctx.reply("🤨 Самого себя кикать не надо.");
  }

  // *** ЗАЩИТА: администраторы, владелец чата, владелец бота ***
  const guard = await isProtected(ctx, target.id);
  if (guard.protected) return ctx.reply(guard.reason);

  const reason = getReason(args, target.fromReply);

  try {
    // Telegram не имеет отдельного kick.
    // Правильный кик = временно banChatMember + сразу unbanChatMember.
    // Пользователь удаляется из группы, но сможет вступить обратно.
    await ctx.telegram.banChatMember(ctx.chat.id, target.id);
    await ctx.telegram.unbanChatMember(ctx.chat.id, target.id, {
      only_if_banned: true,
    });

    removeFromLocalDb(target.id, ctx.chat.id);
    logModAction(ctx.chat.id, target.id, "kick", reason, ctx.from.id);

    return ctx.reply(
      `👢 <b>${formatUser(target)} кикнут из группы.</b>\n\n` +
      `📝 <b>Причина:</b> ${reason}`,
      { parse_mode: "HTML" }
    );
  } catch (err) {
    console.error("[removeUser:kick]", err.message);

    return ctx.reply(
      "❌ Не получилось кикнуть пользователя.\n\n" +
      "Проверь, что бот админ и у него есть право «Блокировать пользователей»."
    );
  }
}

async function unbanUser(ctx) {
  const ok = await baseChecks(ctx);
  if (!ok) return;

  const { args } = getCommandAndArgs(ctx);
  const userId = args[0];

  if (!userId || !/^-?\d+$/.test(userId)) {
    return ctx.reply(
      "🔓 Чтобы разбанить пользователя, укажи его ID:\n\n" +
      "/unban 123456789\n" +
      "или\n" +
      "/разбан 123456789"
    );
  }

  try {
    await ctx.telegram.unbanChatMember(ctx.chat.id, Number(userId), {
      only_if_banned: true,
    });

    logModAction(ctx.chat.id, Number(userId), "unban", "Разбан", ctx.from.id);

    return ctx.reply(`🔓 Пользователь <code>${userId}</code> разбанен.`, {
      parse_mode: "HTML",
    });
  } catch (err) {
    console.error("[removeUser:unban]", err.message);
    return ctx.reply("❌ Не получилось разбанить пользователя. Проверь ID и права бота.");
  }
}

function register(bot) {
  bot.command(["ban", "бан"], banUser);
  bot.command(["kick", "кик"], kickUser);
  bot.command(["unban", "разбан"], unbanUser);

  // Дополнительно ловим русские команды через hears,
  // если Telegram не распознает кириллицу как bot_command.
  bot.hears(/^\/(бан)(@\w+)?(\s|$)/i, banUser);
  bot.hears(/^\/(кик)(@\w+)?(\s|$)/i, kickUser);
  bot.hears(/^\/(разбан)(@\w+)?(\s|$)/i, unbanUser);

  console.log("✅ Модуль removeUser подключён");
}

module.exports = { register };

