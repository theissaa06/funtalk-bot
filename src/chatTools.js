// ============================================================
// src/chatTools.js
// Инструменты чата: /commands, /info, /id, /ping и другие.
// ============================================================

const { formatName, isUserAdmin } = require("./utils");
const { getRandomMeme } = require("./data/memes");
const { getRandomTopic, getRandomPhrase } = require("./data/phrases");

function register(bot) {
  // ── /commands — список всех команд ───────────────────────────
  bot.command(["commands", "команды", "help", "помощь"], async (ctx) => {
    const isPrivate = ctx.chat.type === "private";

    await ctx.reply(
      `📋 <b>Команды FunTalk Bot</b>\n\n` +

        `<b>👤 Профиль и статистика:</b>\n` +
        `/rank — твой уровень и XP\n` +
        `/top — топ чата по XP\n` +
        `/coins — баланс монет\n` +
        `/daily — ежедневный бонус\n` +
        `/give — перевести монеты\n` +
        `/richest — топ по монетам\n\n` +

        `<b>😂 Развлечения:</b>\n` +
        `/meme — случайный мем\n` +
        `/topic или /тема — тема для разговора\n` +
        `/random или /рандом — случайная фраза\n` +
        `/flip или /монета — орёл или решка\n` +
        `/dice или /кубик — бросить кубик\n\n` +

        `<b>ℹ️ Информация:</b>\n` +
        `/id — твой Telegram ID\n` +
        `/info — информация о чате\n` +
        `/ping — проверить бота\n\n` +

        (isPrivate
          ? ""
          : `<b>🛡 Модерация:</b>\n` +
            `/mute или /мут — замутить\n` +
            `/unmute или /размут — снять мут\n` +
            `/ban или /бан — забанить\n` +
            `/unban или /разбан — разбанить\n` +
            `/kick или /кик — выгнать\n` +
            `/warn или /пред — предупреждение\n` +
            `/warnings — посмотреть предупреждения\n` +
            `/clearwarns — сбросить предупреждения\n` +
            `/del — удалить сообщение ответом\n` +
            `/modlog — лог модерации\n\n` +

            `<b>📢 Созыв:</b>\n` +
            `/call или /калл — созыв участников\n` +
            `/созыв или /все — созыв участников\n\n` +

            `<b>📌 Закрепы:</b>\n` +
            `/pin или /закреп — закрепить сообщение ответом\n` +
            `/unpin или /откреп — открепить последнее закреплённое\n` +
            `/unpinall или /открепвсе — открепить все закрепы\n\n`
        ) +

        `<b>📜 Правила:</b>\n` +
        `/rules или /правила — показать правила\n\n` +

        `<b>⚙️ Настройки:</b>\n` +
        `/settings — настройки бота`,
      { parse_mode: "HTML" }
    );
  });

  // ── /id — Telegram ID ─────────────────────────────────────────
  bot.command(["id", "айди"], async (ctx) => {
    let text = `🪪 <b>Твой ID:</b> <code>${ctx.from.id}</code>`;

    if (ctx.message.reply_to_message) {
      const t = ctx.message.reply_to_message.from;
      text += `\n👤 <b>ID ${formatName(t)}:</b> <code>${t.id}</code>`;
    }

    if (ctx.chat.type !== "private") {
      text += `\n💬 <b>ID чата:</b> <code>${ctx.chat.id}</code>`;
    }

    await ctx.reply(text, { parse_mode: "HTML" });
  });

  // ── /info — информация о чате ─────────────────────────────────
  bot.command(["info", "инфо"], async (ctx) => {
    if (ctx.chat.type === "private") {
      return ctx.reply(
        `👤 <b>О тебе:</b>\n\n` +
          `Имя: ${formatName(ctx.from)}\n` +
          `ID: <code>${ctx.from.id}</code>`,
        { parse_mode: "HTML" }
      );
    }

    const chat = ctx.chat;

    await ctx.reply(
      `💬 <b>Информация о чате:</b>\n\n` +
        `📌 Название: <b>${chat.title || "—"}</b>\n` +
        `🪪 ID: <code>${chat.id}</code>\n` +
        `🔗 Тип: <b>${chat.type}</b>\n` +
        (chat.username ? `🌐 Username: @${chat.username}\n` : ""),
      { parse_mode: "HTML" }
    );
  });

  // ── /ping ─────────────────────────────────────────────────────
  bot.command(["ping", "пинг"], async (ctx) => {
    const start = Date.now();
    const msg = await ctx.reply("🏓 Pong...");
    const ms = Date.now() - start;

    await ctx.telegram.editMessageText(
      ctx.chat.id,
      msg.message_id,
      null,
      `🏓 Pong! <b>${ms}ms</b>`,
      { parse_mode: "HTML" }
    );
  });

  // ── /meme ─────────────────────────────────────────────────────
  bot.command(["meme", "мем", "мемы"], async (ctx) => {
    await ctx.reply(`😂 ${getRandomMeme()}`);
  });

  // ── /topic — тема для общения ─────────────────────────────────
  bot.command(["topic", "тема"], async (ctx) => {
    await ctx.reply(`💬 <b>Тема для разговора:</b>\n\n${getRandomTopic()}`, {
      parse_mode: "HTML",
    });
  });

  // ── /random — случайная фраза ─────────────────────────────────
  bot.command(["random", "рандом"], async (ctx) => {
    await ctx.reply(`🎲 ${getRandomPhrase()}`);
  });

  // ── /flip — орёл/решка ───────────────────────────────────────
  bot.command(["flip", "монета"], async (ctx) => {
    const result = Math.random() < 0.5 ? "🦅 Орёл" : "🪙 Решка";

    await ctx.reply(`Бросаю монету...\n\n<b>${result}!</b>`, {
      parse_mode: "HTML",
    });
  });

  // ── /dice — кубик ────────────────────────────────────────────
  bot.command(["dice", "кубик"], async (ctx) => {
    await ctx.sendDice();
  });

  // ── /settings — настройки ─────────────────────────────────────
  bot.command(["settings", "настройки"], async (ctx) => {
    const isAdmin = await isUserAdmin(ctx, ctx.from.id);

    if (!isAdmin && ctx.chat.type !== "private") {
      return ctx.reply("⚙️ Настройки доступны только администраторам.");
    }

    await ctx.reply(
      `⚙️ <b>Настройки бота</b>\n\n` +
        `Управление через команды:\n` +
        `• Модерация включена по умолчанию\n` +
        `• Антифлуд активен\n` +
        `• Приветствие новых участников активно\n\n` +
        `Расширенные настройки — в разработке 🔧`,
      { parse_mode: "HTML" }
    );
  });

  console.log("✅ Модуль chatTools подключён");
}

module.exports = { register };
