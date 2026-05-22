require("dotenv").config();

const { Telegraf, Markup } = require("telegraf");
const phrases = require("../data/phrases");
const { registerModeration } = require("./moderation");
const { registerSecurity } = require("./security");
const { registerAdvancedSecurity } = require("./advancedSecurity");
const { registerLevels } = require("./levels");
const { registerEconomy } = require("./economy");
const { registerChatTools } = require("./chatTools");
const { registerAutoResponder } = require("./autoResponder");
const { registerSystemTools } = require("./systemTools");
const { registerStability } = require("./stability");
const { registerCommandDocs } = require("./commandDocs");
const { registerAdminRanks } = require("./adminRanks");

const token = process.env.BOT_TOKEN;

if (!token) {
  console.error("❌ BOT_TOKEN не найден в .env");
  console.error("Создай файл .env и добавь туда:");
  console.error("BOT_TOKEN=твой_токен_от_BotFather");
  process.exit(1);
}

const bot = new Telegraf(token);

const userGames = new Map();

const truthQuestions = [
  "😄 Какой самый неловкий момент у тебя был?",
  "🤫 Какой секрет ты бы не рассказал всем?",
  "😂 Что последнее тебя сильно рассмешило?",
  "😏 Кто тебе сейчас симпатичен?",
  "🌙 О чём ты чаще всего думаешь ночью?",
  "📱 Кому ты чаще всего пишешь первым?",
  "😅 Какое сообщение ты когда-то отправил и пожалел?",
  "🎭 Какая твоя самая странная привычка?",
  "🔥 Что ты давно хочешь сделать, но всё откладываешь?",
  "💬 Какой вопрос тебе всегда сложно отвечать?",
];

const dareTasks = [
  "😂 Напиши другу: «У меня важный вопрос… ты тоже сегодня ел?»",
  "🎤 Запиши голосовое на 5 секунд с фразой: «Я легенда».",
  "😄 Отправь последний сохранённый мем другу.",
  "👋 Напиши кому-нибудь просто: «Йоу, как настроение?»",
  "🕺 Встань и сделай любой смешной жест.",
  "📸 Сделай фото с максимально серьёзным лицом.",
  "🔥 Напиши в чат: «Сегодня я официально в режиме продуктивности».",
  "😎 Сделай комплимент первому человеку в личке.",
  "🎲 Напиши кому-нибудь случайный смешной вопрос.",
  "🤖 Скажи вслух: «Я не завис, я думаю».",
];

const quickQuestions = [
  {
    q: "Что обычно открывают первым утром?",
    a: "телефон",
    hint: "📱 Это почти у всех рядом с кроватью.",
  },
  {
    q: "Что лучше всего спасает от скуки: мемы, сон или контрольная?",
    a: "мемы",
    hint: "😂 Это смешное.",
  },
  {
    q: "Как называется бот, с которым ты сейчас общаешься?",
    a: "funtalk",
    hint: "Название начинается на Fun...",
  },
  {
    q: "Что люди часто пишут в начале знакомства?",
    a: "привет",
    hint: "👋 Самое обычное первое слово.",
  },
  {
    q: "Что нужно нажать, чтобы начать бота?",
    a: "start",
    hint: "Команда начинается со слеша.",
  },
];

function isPrivateChat(ctx) {
  return ctx.chat && ctx.chat.type === "private";
}

function mainMenuKeyboard() {
  return Markup.keyboard([
    ["💬 Общение", "❤️ Знакомства"],
    ["😂 Мем", "👋 Приветствие"],
    ["🎮 Игры", "❓ Вопрос"],
    ["🎲 Рандом", "📋 Помощь"],
    ["ℹ️ О боте"],
  ]).resize();
}

function gamesKeyboard() {
  return Markup.keyboard([
    ["🔢 Угадай число", "✊ Камень-ножницы-бумага"],
    ["🎲 Правда или действие", "🧠 Быстрый вопрос"],
    ["⬅️ Главное меню"],
  ]).resize();
}

function getHello(name = "друг") {
  const hellos = [
    `👋 Привет, ${name}! Как настроение?`,
    `😄 Йоу, ${name}! Рад тебя видеть.`,
    `🔥 О, ${name} появился! День стал лучше.`,
    `✨ Привет, ${name}! Готов к нормальному разговору?`,
    `😎 Хей, ${name}! Ну что, общаемся?`,
  ];

  return hellos[Math.floor(Math.random() * hellos.length)];
}

function randomItem(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function normalizeAnswer(text) {
  return String(text || "").toLowerCase().trim().replaceAll("ё", "е");
}

function safeReply(ctx, text, extra = undefined) {
  return ctx.reply(text, extra).catch((err) => {
    console.error("Ошибка ответа:", err.message);
  });
}

/*
  Все модули:
  moderation — профили, статистика, варны, муты, баны.
  security — антифлуд, анти-ссылки, антимат.
  advancedSecurity — капча, авто-бан ботов, whitelist ссылок.
  levels — уровни, XP, репутация, монеты.
  economy — магазин, инвентарь, подарки, дуэли, достижения.
  chatTools — правила, приветствие, прощание, лог-чат, кастомные команды.
  autoResponder — триггеры, мини-AI, шаблоны админа.
  systemTools — диагностика, проверка прав, systemcheck.
  stability — защита от падений, health, runtime, ошибки.
  commandDocs — документация команд.
  adminRanks — call, внутренняя админка, ранги админов.
*/

registerStability(bot, { safeReply, isPrivateChat });
registerModeration(bot, { safeReply, isPrivateChat });
registerAdminRanks(bot, { safeReply, isPrivateChat });
registerSecurity(bot, { safeReply, isPrivateChat });
registerAdvancedSecurity(bot, { safeReply, isPrivateChat });
registerLevels(bot, { safeReply, isPrivateChat });
registerEconomy(bot, { safeReply, isPrivateChat });
registerChatTools(bot, { safeReply, isPrivateChat });
registerAutoResponder(bot, { safeReply, isPrivateChat });
registerSystemTools(bot, { safeReply, isPrivateChat });
registerCommandDocs(bot, { safeReply, isPrivateChat });

function helpText(isGroup = false) {
  if (isGroup) {
    return (
      "📋 FunTalk Bot — помощь\n\n" +
      "Главная команда со всеми разделами:\n" +
      "/commands\n\n" +
      "Быстрый старт:\n" +
      "/quickstart\n\n" +
      "Админ-команды:\n" +
      "/admincommands\n\n" +
      "Созыв и ранговая админка:\n" +
      "/adminroles — ранги\n" +
      "/myadmin — мой ранг\n" +
      "/admins — список админов\n" +
      "/setadmin роль — выдать админку ответом\n" +
      "/deladmin — снять админку ответом\n" +
      "/call текст — созвать всех известных пользователей\n" +
      "/calladmins текст — созвать админов\n" +
      "/callowners текст — созвать владельцев\n\n" +
      "Проверка системы:\n" +
      "/systemcheck\n" +
      "/botrights\n" +
      "/privacyinfo\n\n" +
      "Основные разделы:\n" +
      "/commands_fun — общение\n" +
      "/commands_games — игры\n" +
      "/commands_mod — модерация\n" +
      "/commands_security — защита\n" +
      "/commands_levels — уровни\n" +
      "/commands_economy — экономика\n" +
      "/commands_chat — чат\n" +
      "/commands_ai — автоответчик\n" +
      "/commands_system — диагностика"
    );
  }

  return (
    "📋 Команды FunTalk Bot:\n\n" +
    "/start — запустить бота\n" +
    "/menu — открыть меню\n" +
    "/help — помощь\n" +
    "/commands — все команды\n" +
    "/quickstart — быстрый старт\n" +
    "/talk — тема для общения\n" +
    "/question — вопрос для диалога\n" +
    "/dating — фраза для знакомства\n" +
    "/meme — мемный вопрос\n" +
    "/hello — приветствие\n" +
    "/random — случайная фраза\n" +
    "/games — открыть игры\n" +
    "/ping — проверка ответа\n" +
    "/health — состояние бота\n" +
    "/about — о боте\n\n" +
    "Также можно пользоваться кнопками ниже 👇"
  );
}

bot.start(async (ctx) => {
  const name = ctx.from?.first_name || "друг";

  const text =
    `👋 Привет, ${name}!\n\n` +
    "Я FunTalk Bot — многофункциональный бот для общения, знакомств, игр, модерации и активности.\n\n" +
    "Что умею:\n" +
    "💬 общение и вопросы\n" +
    "🎮 мини-игры\n" +
    "🛡 модерация и защита\n" +
    "🏛 call, созыв и ранговая админка\n" +
    "🧩 капча и whitelist ссылок\n" +
    "🏆 уровни, XP, репутация\n" +
    "💰 магазин, дуэли, достижения\n" +
    "⚙️ правила, приветствия, кастомные команды\n" +
    "🤖 автоответчик и мини-AI\n" +
    "🧪 диагностика и проверка прав\n" +
    "🧯 стабильность и логи ошибок\n\n" +
    "Главная команда:\n" +
    "/commands";

  if (isPrivateChat(ctx)) {
    return safeReply(ctx, text, mainMenuKeyboard());
  }

  return safeReply(ctx, text);
});

bot.command("menu", async (ctx) => {
  if (!isPrivateChat(ctx)) {
    return safeReply(ctx, helpText(true));
  }

  return safeReply(ctx, "📌 Главное меню:", mainMenuKeyboard());
});

bot.command("help", async (ctx) => {
  return safeReply(
    ctx,
    helpText(!isPrivateChat(ctx)),
    isPrivateChat(ctx) ? mainMenuKeyboard() : undefined
  );
});

bot.command("talk", async (ctx) =>
  safeReply(ctx, "💬 Тема для общения:\n\n" + phrases.getRandomPhrase())
);

bot.command("question", async (ctx) =>
  safeReply(ctx, "❓ Вопрос для диалога:\n\n" + phrases.getChatQuestion())
);

bot.command("dating", async (ctx) =>
  safeReply(ctx, "❤️ Фраза для знакомства:\n\n" + phrases.getDatingPhrase())
);

bot.command("meme", async (ctx) =>
  safeReply(ctx, "😂 Мемный вопрос:\n\n" + phrases.getMemeQuestion())
);

bot.command("hello", async (ctx) =>
  safeReply(ctx, getHello(ctx.from?.first_name || "друг"))
);

bot.command("random", async (ctx) =>
  safeReply(ctx, "🎲 Случайная фраза:\n\n" + phrases.getRandomPhrase())
);

bot.command("about", async (ctx) => {
  return safeReply(
    ctx,
    "ℹ️ FunTalk Bot\n\n" +
      "Многофункциональный Telegram-бот для общения, знакомств, игр, модерации, защиты, уровней, экономики, автоответов, диагностики, call-созыва и ранговой админки.\n\n" +
      "Главная команда со всеми возможностями:\n" +
      "/commands"
  );
});

bot.command("restart", async (ctx) => {
  userGames.delete(ctx.from.id);

  if (isPrivateChat(ctx)) {
    return safeReply(ctx, "🔄 Готово. Начинаем заново!", mainMenuKeyboard());
  }

  return safeReply(ctx, "🔄 Готово. Напиши /commands, чтобы увидеть все команды.");
});

/* Игры */

bot.command("games", async (ctx) => {
  if (!isPrivateChat(ctx)) {
    return safeReply(
      ctx,
      "🎮 Игры доступны командами:\n\n" +
        "/guess — угадать число\n" +
        "/rps — камень-ножницы-бумага\n" +
        "/truth — правда\n" +
        "/dare — действие\n" +
        "/quiz — быстрый вопрос"
    );
  }

  return safeReply(ctx, "🎮 Раздел игр\n\nВыбери игру ниже 👇", gamesKeyboard());
});

bot.command("guess", async (ctx) => {
  const number = Math.floor(Math.random() * 10) + 1;

  userGames.set(ctx.from.id, {
    type: "guess",
    number,
    attempts: 3,
  });

  return safeReply(
    ctx,
    "🔢 Я загадал число от 1 до 10.\n\nУ тебя есть 3 попытки. Напиши число 👇"
  );
});

bot.command("rps", async (ctx) => {
  userGames.set(ctx.from.id, { type: "rps" });

  return safeReply(
    ctx,
    "✊ Камень-ножницы-бумага\n\nНапиши один вариант:\nкамень\nножницы\nбумага"
  );
});

bot.command("truth", async (ctx) =>
  safeReply(ctx, "🎲 Правда:\n\n" + randomItem(truthQuestions))
);

bot.command("dare", async (ctx) =>
  safeReply(ctx, "🎲 Действие:\n\n" + randomItem(dareTasks))
);

bot.command("quiz", async (ctx) => {
  const question = randomItem(quickQuestions);

  userGames.set(ctx.from.id, {
    type: "quiz",
    answer: question.a,
    hint: question.hint,
  });

  return safeReply(
    ctx,
    "🧠 Быстрый вопрос:\n\n" + question.q + "\n\nНапиши ответ одним словом."
  );
});

/* Кнопки лички */

bot.hears("💬 Общение", async (ctx) => {
  if (!isPrivateChat(ctx)) return;
  return safeReply(ctx, "💬 Тема для общения:\n\n" + phrases.getRandomPhrase());
});

bot.hears("❤️ Знакомства", async (ctx) => {
  if (!isPrivateChat(ctx)) return;

  return safeReply(
    ctx,
    "❤️ Фраза для знакомства:\n\n" +
      phrases.getDatingPhrase() +
      "\n\n💡 Совет: пиши коротко, легко и с вопросом."
  );
});

bot.hears("😂 Мем", async (ctx) => {
  if (!isPrivateChat(ctx)) return;
  return safeReply(ctx, "😂 Мемный вопрос:\n\n" + phrases.getMemeQuestion());
});

bot.hears("👋 Приветствие", async (ctx) => {
  if (!isPrivateChat(ctx)) return;
  return safeReply(ctx, getHello(ctx.from?.first_name || "друг"));
});

bot.hears("🎮 Игры", async (ctx) => {
  if (!isPrivateChat(ctx)) return;

  return safeReply(
    ctx,
    "🎮 Выбери игру:\n\n" +
      "🔢 Угадай число\n" +
      "✊ Камень-ножницы-бумага\n" +
      "🎲 Правда или действие\n" +
      "🧠 Быстрый вопрос",
    gamesKeyboard()
  );
});

bot.hears("❓ Вопрос", async (ctx) => {
  if (!isPrivateChat(ctx)) return;
  return safeReply(ctx, "❓ Вопрос для диалога:\n\n" + phrases.getChatQuestion());
});

bot.hears("🎲 Рандом", async (ctx) => {
  if (!isPrivateChat(ctx)) return;
  return safeReply(ctx, "🎲 Случайная фраза:\n\n" + phrases.getRandomPhrase());
});

bot.hears("📋 Помощь", async (ctx) => {
  if (!isPrivateChat(ctx)) return;
  return safeReply(ctx, helpText(false), mainMenuKeyboard());
});

bot.hears("ℹ️ О боте", async (ctx) => {
  if (!isPrivateChat(ctx)) return;
  return safeReply(ctx, "ℹ️ FunTalk Bot — многофункциональный бот. Напиши /commands.");
});

bot.hears("🔢 Угадай число", async (ctx) => {
  if (!isPrivateChat(ctx)) return;

  const number = Math.floor(Math.random() * 10) + 1;

  userGames.set(ctx.from.id, {
    type: "guess",
    number,
    attempts: 3,
  });

  return safeReply(
    ctx,
    "🔢 Я загадал число от 1 до 10.\n\nУ тебя есть 3 попытки. Напиши число 👇"
  );
});

bot.hears("✊ Камень-ножницы-бумага", async (ctx) => {
  if (!isPrivateChat(ctx)) return;

  userGames.set(ctx.from.id, { type: "rps" });

  return safeReply(
    ctx,
    "✊ Камень-ножницы-бумага\n\nНапиши:\nкамень\nножницы\nбумага"
  );
});

bot.hears("🎲 Правда или действие", async (ctx) => {
  if (!isPrivateChat(ctx)) return;

  const choice = Math.random() > 0.5 ? "truth" : "dare";

  if (choice === "truth") {
    return safeReply(ctx, "🎲 Правда:\n\n" + randomItem(truthQuestions));
  }

  return safeReply(ctx, "🎲 Действие:\n\n" + randomItem(dareTasks));
});

bot.hears("🧠 Быстрый вопрос", async (ctx) => {
  if (!isPrivateChat(ctx)) return;

  const question = randomItem(quickQuestions);

  userGames.set(ctx.from.id, {
    type: "quiz",
    answer: question.a,
    hint: question.hint,
  });

  return safeReply(
    ctx,
    "🧠 Быстрый вопрос:\n\n" + question.q + "\n\nНапиши ответ одним словом."
  );
});

bot.hears("⬅️ Главное меню", async (ctx) => {
  if (!isPrivateChat(ctx)) return;

  userGames.delete(ctx.from.id);

  return safeReply(ctx, "📌 Главное меню:", mainMenuKeyboard());
});

/* Обычный текст + игры */

bot.on("text", async (ctx) => {
  const text = ctx.message.text;
  const userId = ctx.from.id;

  if (text.startsWith("/")) {
    return safeReply(ctx, "😅 Я не знаю такую команду. Напиши /commands");
  }

  const game = userGames.get(userId);

  if (game?.type === "guess") {
    const guess = Number(text);

    if (!Number.isInteger(guess) || guess < 1 || guess > 10) {
      return safeReply(ctx, "🔢 Нужно написать целое число от 1 до 10.");
    }

    if (guess === game.number) {
      userGames.delete(userId);

      return safeReply(
        ctx,
        `🎉 Угадал! Это было число ${game.number}.\n\nКрасавчик 😎`,
        isPrivateChat(ctx) ? gamesKeyboard() : undefined
      );
    }

    game.attempts -= 1;

    if (game.attempts <= 0) {
      const correct = game.number;
      userGames.delete(userId);

      return safeReply(
        ctx,
        `😅 Попытки закончились.\n\nЯ загадывал число ${correct}.`,
        isPrivateChat(ctx) ? gamesKeyboard() : undefined
      );
    }

    const hint = guess < game.number ? "больше" : "меньше";
    userGames.set(userId, game);

    return safeReply(
      ctx,
      `❌ Не угадал. Моё число ${hint}.\n\nОсталось попыток: ${game.attempts}`
    );
  }

  if (game?.type === "rps") {
    const userChoice = normalizeAnswer(text);
    const valid = ["камень", "ножницы", "бумага"];

    if (!valid.includes(userChoice)) {
      return safeReply(ctx, "✊ Напиши только: камень, ножницы или бумага.");
    }

    const botChoice = randomItem(valid);
    let result = "";

    if (userChoice === botChoice) {
      result = "🤝 Ничья!";
    } else if (
      (userChoice === "камень" && botChoice === "ножницы") ||
      (userChoice === "ножницы" && botChoice === "бумага") ||
      (userChoice === "бумага" && botChoice === "камень")
    ) {
      result = "🎉 Ты победил!";
    } else {
      result = "😎 Я победил!";
    }

    userGames.delete(userId);

    return safeReply(
      ctx,
      `✊ Камень-ножницы-бумага\n\n` +
        `Ты выбрал: ${userChoice}\n` +
        `Я выбрал: ${botChoice}\n\n` +
        `${result}`,
      isPrivateChat(ctx) ? gamesKeyboard() : undefined
    );
  }

  if (game?.type === "quiz") {
    const answer = normalizeAnswer(text);
    const correct = normalizeAnswer(game.answer);

    if (answer === correct) {
      userGames.delete(userId);

      return safeReply(
        ctx,
        "🎉 Правильно! Ты красавчик.\n\nХочешь ещё? Нажми «🧠 Быстрый вопрос».",
        isPrivateChat(ctx) ? gamesKeyboard() : undefined
      );
    }

    return safeReply(ctx, `❌ Не совсем.\n\nПодсказка: ${game.hint}\n\nПопробуй ещё раз.`);
  }

  if (!isPrivateChat(ctx)) return;

  return safeReply(
    ctx,
    "Я понял 👀\n\n" +
      "Могу помочь продолжить диалог. Вот вопрос:\n\n" +
      phrases.getChatQuestion(),
    mainMenuKeyboard()
  );
});

bot.catch((err, ctx) => {
  console.error(`Ошибка бота. Тип обновления: ${ctx.updateType}`, err.message);
});

bot.launch({
  dropPendingUpdates: true,
});

console.log("✅ FunTalk Bot запущен.");
console.log("Подключено: все модули + call и ранговая админка.");
console.log("Главная команда: /commands");
console.log("Для остановки нажми Ctrl+C.");

process.once("SIGINT", () => {
  bot.stop("SIGINT");
});

process.once("SIGTERM", () => {
  bot.stop("SIGTERM");
});