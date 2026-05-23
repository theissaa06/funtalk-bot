// ============================================================
// src/pin.js
// Закреп / откреп сообщений
//
// Команды:
// /pin, /закреп — закрепить сообщение по reply
// /unpin, /откреп — открепить последнее закреплённое
// /unpinall, /открепвсе — открепить все сообщения
// ============================================================

async function isChatAdmin(ctx, userId) {
  try {
    const member = await ctx.telegram.getChatMember(ctx.chat.id, userId);
    return member.status === "creator" || member.status === "administrator";
  } catch (err) {
    console.error("[pin:isChatAdmin]", err.message);
    return false;
  }
}

async function canBotPin(ctx) {
  try {
    const botInfo = await ctx.telegram.getMe();
    const botMember = await ctx.telegram.getChatMember(ctx.chat.id, botInfo.id);

    if (botMember.status === "creator") return true;

    return (
      botMember.status === "administrator" &&
      botMember.can_pin_messages === true
    );
  } catch (err) {
    console.error("[pin:canBotPin]", err.message);
    return false;
  }
}

async function checkBase(ctx) {
  if (!ctx.chat || ctx.chat.type === "private") {
    await ctx.reply("📌 Эта команда работает только в группах.");
    return false;
  }

  const adminOk = await isChatAdmin(ctx, ctx.from.id);

  if (!adminOk) {
    await ctx.reply("⛔ Эту команду могут использовать только администраторы чата.");
    return false;
  }

  const botCanPin = await canBotPin(ctx);

  if (!botCanPin) {
    await ctx.reply(
      "⚠️ Я не могу закреплять сообщения.\n\n" +
      "Сделай меня админом и включи право «Закреплять сообщения»."
    );
    return false;
  }

  return true;
}

function register(bot) {
  bot.command(["pin", "закреп"], async (ctx) => {
    try {
      const ok = await checkBase(ctx);
      if (!ok) return;

      const reply = ctx.message.reply_to_message;

      if (!reply) {
        return ctx.reply(
          "📌 Чтобы закрепить сообщение, ответь на нужное сообщение командой:\n\n" +
          "/pin\n" +
          "или\n" +
          "/закреп"
        );
      }

      await ctx.telegram.pinChatMessage(ctx.chat.id, reply.message_id, {
        disable_notification: false,
      });

      return ctx.reply("✅ Сообщение закреплено.");
    } catch (err) {
      console.error("[pin]", err.message);
      return ctx.reply(
        "❌ Не получилось закрепить сообщение.\n\n" +
        "Проверь, что бот админ и у него есть право «Закреплять сообщения»."
      );
    }
  });

  bot.command(["unpin", "откреп"], async (ctx) => {
    try {
      const ok = await checkBase(ctx);
      if (!ok) return;

      await ctx.telegram.unpinChatMessage(ctx.chat.id);

      return ctx.reply("✅ Последнее закреплённое сообщение откреплено.");
    } catch (err) {
      console.error("[unpin]", err.message);
      return ctx.reply("❌ Не получилось открепить сообщение. Проверь права бота.");
    }
  });

  bot.command(["unpinall", "открепвсе", "открепитьвсе"], async (ctx) => {
    try {
      const ok = await checkBase(ctx);
      if (!ok) return;

      await ctx.telegram.unpinAllChatMessages(ctx.chat.id);

      return ctx.reply("✅ Все закреплённые сообщения откреплены.");
    } catch (err) {
      console.error("[unpinall]", err.message);
      return ctx.reply("❌ Не получилось открепить все сообщения. Проверь права бота.");
    }
  });

  console.log("✅ Модуль pin подключён");
}

module.exports = { register };
