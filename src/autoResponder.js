const { getRandom } = require("./utils");

const AUTO_REPLY_CHANCE = 1; // 1 = всегда отвечать при явном обращении

const triggers = [
  [
    /\bпривет\b|\bхей\b|\bхай\b/i,
    [
      "👋 Привет!",
      "🎤 Хей!",
      "🔥 О, привет!",
      "✨ Приветики!",
    ],
  ],
  [
    /\bкак дела\b|\bкак ты\b|\bкак сам\b/i,
    [
      "🍀 Всё отлично, спасибо!",
      "🤖 Работаю в штатном режиме.",
      "📋 Заряжен на 100%, как обычно.",
      "🎤 Лучше всех! А ты?",
    ],
  ],
  [
    /\bспасибо\b|\bблагодарю\b|\bспс\b/i,
    [
      "🍀 Пожалуйста!",
      "🤝 Не за что!",
      "✨ Всегда пожалуйста!",
      "💫 Обращайся!",
    ],
  ],
  [
    /\bмем\b|\bпришли мем\b/i,
    [
      "🎭 Напиши /meme — дам текстовый мем!",
      "😂 Хочешь мем? Используй /meme",
      "🤖 Мой мем-банк доступен через /meme",
    ],
  ],
  [
    /\bскучно\b|\bнечего делать\b/i,
    [
      "🎲 Напиши /topic — дам тему для разговора!",
      "🎮 Брось кубик: /dice",
      "💬 Напиши /random — получишь случайную фразу.",
    ],
  ],
  [
    /\bбот\b.*\bспишь\b|\bты живой\b/i,
    [
      "🤖 Я живой, работаю.",
      "👁 Я тут.",
      "🎤 Боты не спят. Боты ждут команду.",
    ],
  ],
  [
    /\bумный\b.*\bбот\b|\bклёвый\b.*\bбот\b|\bкрутой\b.*\bбот\b/i,
    [
      "🍀 Спасибо, стараюсь!",
      "🙏 Приятно слышать!",
      "✨ Уважение принято.",
    ],
  ],
];

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

function isCommand(text) {
  return String(text || "").trim().startsWith("/");
}

function isExplicitBotCall(ctx, text) {
  const value = normalizeText(text);

  // Если пользователь отвечает на сообщение бота — это явное обращение
  const replyFrom = ctx.message?.reply_to_message?.from;
  if (replyFrom?.is_bot) {
    return true;
  }

  // Если пользователь написал "бот ..." или упомянул username бота
  const botUsername = ctx.botInfo?.username
    ? `@${ctx.botInfo.username}`.toLowerCase()
    : "";

  if (botUsername && value.includes(botUsername)) {
    return true;
  }

  return (
    value.startsWith("бот ") ||
    value.startsWith("бот,") ||
    value.startsWith("ботик ") ||
    value.startsWith("ботик,") ||
    value.startsWith("funbot ") ||
    value.startsWith("funtalk ")
  );
}

function cleanBotCall(text, ctx) {
  let value = String(text || "");

  const botUsername = ctx.botInfo?.username
    ? new RegExp(`@${ctx.botInfo.username}`, "gi")
    : null;

  if (botUsername) {
    value = value.replace(botUsername, "");
  }

  value = value
    .replace(/^ботик[, ]+/i, "")
    .replace(/^бот[, ]+/i, "")
    .replace(/^funbot[, ]+/i, "")
    .replace(/^funtalk[, ]+/i, "")
    .trim();

  return value;
}

function register(bot) {
  bot.on("text", async (ctx, next) => {
    try {
      if (!isGroup(ctx)) return next();

      const user = ctx.from;
      const text = ctx.message?.text || "";

      if (!user || user.is_bot) return next();
      if (!text) return next();
      if (isCommand(text)) return next();

      // Главное исправление:
      // бот больше НЕ отвечает на обычные сообщения.
      // Он отвечает только при явном обращении.
      if (!isExplicitBotCall(ctx, text)) {
        return next();
      }

      const cleanText = cleanBotCall(text, ctx);

      for (const [pattern, responses] of triggers) {
        if (pattern.test(cleanText)) {
          const reply = Array.isArray(responses) ? getRandom(responses) : responses;

          if (Math.random() <= AUTO_REPLY_CHANCE) {
            await ctx.reply(reply, {
              reply_to_message_id: ctx.message.message_id,
              allow_sending_without_reply: true,
            });
          }

          return next();
        }
      }

      // Если к боту обратились, но он не понял фразу, не отправляем подсказку.
      return next();
    } catch (error) {
      console.error("Ошибка autoResponder:", error.message);
      return next();
    }
  });

  console.log("✅ Модуль autoResponder подключён в безопасном режиме");
}

module.exports = { register };