const fs = require("fs");

const file = "index.js";

if (!fs.existsSync(file)) {
  console.log("❌ index.js не найден. Ты не в корне funtalk-bot.");
  process.exit(1);
}

let code = fs.readFileSync(file, "utf8");
fs.writeFileSync("index.before-all-buttons-fix.js", code, "utf8");

// Удаляем старые наши фиксы кнопок, чтобы не было дублей
code = code.replace(
  /\/\* ================= BUTTONS CALLBACK FIX START ================= \*\/[\s\S]*?\/\* ================= BUTTONS CALLBACK FIX END ================= \*\//g,
  ""
);

const patch = `

/* ================= BUTTONS CALLBACK FIX START ================= */

if (typeof bot !== "undefined" && !global.__ALL_BUTTONS_FIX__) {
  global.__ALL_BUTTONS_FIX__ = true;

  console.log("✅ ALL BUTTONS FIX ACTIVE");

  bot.on("callback_query", async (query) => {
    try {
      const msg = query.message;
      const data = String(query.data || "").trim();

      if (!msg) {
        return bot.answerCallbackQuery(query.id, {
          text: "Сообщение не найдено",
          show_alert: false
        });
      }

      await bot.answerCallbackQuery(query.id).catch(() => {});

      const chatId = msg.chat.id;

      console.log("🔘 Callback:", data);

      const sections = {
        "help:moder": 
          "🛡 Модерация\\n\\n" +
          "Команды:\\n" +
          "• /бан @username причина\\n" +
          "• /разбанить @username\\n" +
          "• /кик @username причина\\n" +
          "• /мут @username 10м причина\\n" +
          "• /размут @username\\n" +
          "• /очистить 20\\n\\n" +
          "Также можно использовать команды reply на сообщение пользователя.",

        "help:ranks":
          "👑 Ранги\\n\\n" +
          "Команды:\\n" +
          "• /ранг\\n" +
          "• /профиль\\n" +
          "• /выдатьранг @username ранг\\n" +
          "• /снятьранг @username\\n" +
          "• /топрангов\\n\\n" +
          "Ранги помогают управлять правами пользователей.",

        "help:profile":
          "👤 Профиль\\n\\n" +
          "Команды:\\n" +
          "• /профиль\\n" +
          "• профиль\\n\\n" +
          "Показывает ID, username, ранг, активность и статистику.",

        "help:rules":
          "📜 Правила\\n\\n" +
          "Команды:\\n" +
          "• /правила\\n" +
          "• /rules\\n\\n" +
          "Здесь показываются правила чата и система наказаний.",

        "help:settings":
          "⚙️ Настройки\\n\\n" +
          "Раздел настроек беседы.\\n\\n" +
          "Сюда можно добавить:\\n" +
          "• антиспам\\n" +
          "• приветствие\\n" +
          "• права команд\\n" +
          "• включение/выключение модулей",

        "help:shop":
          "🎁 Магазин\\n\\n" +
          "Раздел магазина.\\n\\n" +
          "Можно добавить:\\n" +
          "• покупку ролей\\n" +
          "• титулы\\n" +
          "• кейсы\\n" +
          "• бонусы\\n" +
          "• обмен монет",

        "help:call":
          "📣 Созыв\\n\\n" +
          "Команды:\\n" +
          "• /созыв\\n" +
          "• /call\\n\\n" +
          "Лучше оставить только для админов, чтобы не было спама.",

        "help:summon":
          "📣 Созыв\\n\\n" +
          "Команды:\\n" +
          "• /созыв\\n" +
          "• /call\\n\\n" +
          "Лучше оставить только для админов, чтобы не было спама.",

        "help:social":
          "❤️ Отношения\\n\\n" +
          "Команды:\\n" +
          "• отношения\\n" +
          "• отношения @username\\n" +
          "• отношения reply\\n\\n" +
          "Можно добавить дружбу, пары, симпатии и статистику отношений.",

        "help:relations":
          "❤️ Отношения\\n\\n" +
          "Команды:\\n" +
          "• отношения\\n" +
          "• отношения @username\\n" +
          "• отношения reply\\n\\n" +
          "Можно добавить дружбу, пары, симпатии и статистику отношений.",

        "help:tops":
          "🏆 Топы\\n\\n" +
          "Команды:\\n" +
          "• /топ\\n" +
          "• /топ сообщений\\n" +
          "• /топ монет\\n" +
          "• /топ рангов",

        "help:friday":
          "🎉 Пятница\\n\\n" +
          "Развлекательный раздел.\\n\\n" +
          "Можно добавить:\\n" +
          "• пятничные бонусы\\n" +
          "• мини-ивенты\\n" +
          "• розыгрыши\\n" +
          "• активности",

        "help:global":
          "🌍 Глобальные ранги\\n\\n" +
          "Глобальные ранги работают между разными чатами.\\n\\n" +
          "Команды:\\n" +
          "• /глобранги\\n" +
          "• /globalranks",

        "help:global_ranks":
          "🌍 Глобальные ранги\\n\\n" +
          "Глобальные ранги работают между разными чатами.\\n\\n" +
          "Команды:\\n" +
          "• /глобранги\\n" +
          "• /globalranks",

        "help:coins":
          "💰 Монеты\\n\\n" +
          "Команды:\\n" +
          "• /баланс\\n" +
          "• /монеты\\n" +
          "• /топмонет\\n\\n" +
          "Монеты можно выдавать за активность, использовать в магазине и переводить другим.",

        "help:money":
          "💰 Монеты\\n\\n" +
          "Команды:\\n" +
          "• /баланс\\n" +
          "• /монеты\\n" +
          "• /топмонет\\n\\n" +
          "Монеты можно выдавать за активность, использовать в магазине и переводить другим."
      };

      if (sections[data]) {
        return bot.sendMessage(chatId, sections[data]);
      }

      const normalized = data
        .replace("menu_", "help:")
        .replace("moderation", "moder")
        .replace("rank", "ranks")
        .replace("profile", "profile")
        .replace("rules", "rules")
        .replace("settings", "settings")
        .replace("shop", "shop")
        .replace("summon", "call")
        .replace("call", "call")
        .replace("relations", "social")
        .replace("tops", "tops")
        .replace("friday", "friday")
        .replace("global_ranks", "global")
        .replace("coins", "coins");

      if (sections[normalized]) {
        return bot.sendMessage(chatId, sections[normalized]);
      }

      return bot.sendMessage(
        chatId,
        "⚠️ Эта кнопка пока не привязана.\\n\\nCallback data: " + data
      );
    } catch (error) {
      console.error("❌ ALL BUTTONS FIX ERROR:", error);

      try {
        await bot.answerCallbackQuery(query.id, {
          text: "Ошибка кнопки",
          show_alert: false
        });
      } catch {}

      try {
        if (query.message && query.message.chat) {
          await bot.sendMessage(
            query.message.chat.id,
            "❌ Ошибка обработки кнопки. Проверь Railway Logs."
          );
        }
      } catch {}
    }
  });
}

/* ================= BUTTONS CALLBACK FIX END ================= */

`;

code += patch;

fs.writeFileSync(file, code, "utf8");

console.log("✅ Все кнопки help:* настроены.");
console.log("✅ При запуске должна быть строка: ALL BUTTONS FIX ACTIVE");
