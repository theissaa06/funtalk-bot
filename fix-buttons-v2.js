const fs = require("fs");

const file = "index.js";

if (!fs.existsSync(file)) {
  console.log("❌ index.js не найден. Запусти из корня проекта funtalk-bot.");
  process.exit(1);
}

let code = fs.readFileSync(file, "utf8");

fs.writeFileSync("index.before-buttons-v2.js", code, "utf8");

const newPatch = `

/* ================= BUTTONS CALLBACK FIX START ================= */

if (typeof bot !== "undefined" && !global.__BUTTONS_CALLBACK_FIX_V2__) {
  global.__BUTTONS_CALLBACK_FIX_V2__ = true;

  console.log("✅ BUTTONS CALLBACK FIX V2 ACTIVE");

  bot.on("callback_query", async (query) => {
    try {
      const msg = query.message;
      const data = String(query.data || "").trim();

      if (!msg) {
        return bot.answerCallbackQuery(query.id, {
          text: "Сообщение не найдено",
          show_alert: false,
        });
      }

      await bot.answerCallbackQuery(query.id).catch(() => {});

      const chatId = msg.chat.id;

      console.log("🔘 Нажата кнопка:", data);

      if (
        data === "help:moder" ||
        data === "help:moderation" ||
        data === "moderation" ||
        data === "mod" ||
        data === "menu_moderation"
      ) {
        return bot.sendMessage(
          chatId,
          "🛡 Модерация\\n\\n" +
          "Команды:\\n" +
          "• /ban или /забанить — забанить пользователя\\n" +
          "• /unban или /разбанить — разбанить пользователя\\n" +
          "• /kick или /кик — кикнуть пользователя\\n" +
          "• /mute или /мут — выдать мут\\n" +
          "• /unmute или /размут — снять мут\\n" +
          "• /clear или /очистить — очистить чат\\n\\n" +
          "Примеры:\\n" +
          "/разбанить 588174634\\n" +
          "/разбанить @username\\n" +
          "/мут @username 10м причина"
        );
      }

      if (
        data === "help:ranks" ||
        data === "help:rank" ||
        data === "ranks" ||
        data === "rank" ||
        data === "menu_ranks"
      ) {
        return bot.sendMessage(
          chatId,
          "👑 Ранги\\n\\n" +
          "Команды:\\n" +
          "• /профиль — посмотреть профиль\\n" +
          "• /ранг — посмотреть свой ранг\\n" +
          "• /выдатьранг @username ранг — выдать ранг\\n" +
          "• /снятьранг @username — снять ранг\\n" +
          "• /topranks — топ рангов\\n\\n" +
          "Важно: повторно выдавать один и тот же ранг нельзя."
        );
      }

      if (
        data === "help:profile" ||
        data === "profile" ||
        data === "menu_profile"
      ) {
        return bot.sendMessage(
          chatId,
          "👤 Профиль\\n\\n" +
          "Команды:\\n" +
          "• /профиль\\n" +
          "• профиль\\n\\n" +
          "Профиль показывает ID, username, ранг, активность и статистику пользователя."
        );
      }

      if (
        data === "help:rules" ||
        data === "rules" ||
        data === "menu_rules"
      ) {
        return bot.sendMessage(
          chatId,
          "📜 Правила\\n\\n" +
          "Команды:\\n" +
          "• /rules\\n" +
          "• /правила\\n\\n" +
          "Администраторы могут обновлять правила через команду управления правилами."
        );
      }

      if (
        data === "help:settings" ||
        data === "settings" ||
        data === "menu_settings"
      ) {
        return bot.sendMessage(
          chatId,
          "⚙️ Настройки\\n\\n" +
          "Раздел для настроек беседы и функций бота.\\n\\n" +
          "Сюда можно добавить включение/выключение модулей, антиспам, приветствие и права."
        );
      }

      if (
        data === "help:shop" ||
        data === "shop" ||
        data === "menu_shop"
      ) {
        return bot.sendMessage(
          chatId,
          "🎁 Магазин\\n\\n" +
          "Раздел магазина пока в разработке.\\n\\n" +
          "Можно добавить покупку ролей, титулов, кейсов, монет и бонусов."
        );
      }

      if (
        data === "help:summon" ||
        data === "help:call" ||
        data === "summon" ||
        data === "call" ||
        data === "menu_summon"
      ) {
        return bot.sendMessage(
          chatId,
          "📣 Созыв\\n\\n" +
          "Команды:\\n" +
          "• /созыв — созвать участников\\n" +
          "• /call — созыв\\n\\n" +
          "Эту функцию лучше оставить только для админов, чтобы не было спама."
        );
      }

      if (
        data === "help:relations" ||
        data === "relations" ||
        data === "menu_relations"
      ) {
        return bot.sendMessage(
          chatId,
          "❤️ Отношения\\n\\n" +
          "Команды:\\n" +
          "• отношения\\n" +
          "• отношения @username\\n" +
          "• отношения reply\\n\\n" +
          "Можно сделать дружбу, пары, симпатии и статистику отношений."
        );
      }

      if (
        data === "help:tops" ||
        data === "tops" ||
        data === "top" ||
        data === "menu_tops"
      ) {
        return bot.sendMessage(
          chatId,
          "🏆 Топы\\n\\n" +
          "Команды:\\n" +
          "• /топ\\n" +
          "• /топ сообщений\\n" +
          "• /топ монет\\n" +
          "• /топ рангов"
        );
      }

      if (
        data === "help:friday" ||
        data === "friday" ||
        data === "menu_friday"
      ) {
        return bot.sendMessage(
          chatId,
          "🎉 Пятница\\n\\n" +
          "Раздел для развлекательных функций.\\n\\n" +
          "Можно добавить пятничные бонусы, активности, розыгрыши и мини-ивенты."
        );
      }

      if (
        data === "help:global_ranks" ||
        data === "help:global" ||
        data === "global_ranks" ||
        data === "menu_global_ranks"
      ) {
        return bot.sendMessage(
          chatId,
          "🌍 Глобальные ранги\\n\\n" +
          "Глобальные ранги могут работать между разными чатами.\\n\\n" +
          "Команды:\\n" +
          "• /глобранги\\n" +
          "• /globalranks"
        );
      }

      if (
        data === "help:coins" ||
        data === "coins" ||
        data === "money" ||
        data === "menu_coins"
      ) {
        return bot.sendMessage(
          chatId,
          "💰 Монеты\\n\\n" +
          "Команды:\\n" +
          "• /баланс\\n" +
          "• /монеты\\n" +
          "• /топмонет\\n\\n" +
          "Можно добавить награды за активность, магазин и переводы монет."
        );
      }

      return bot.sendMessage(
        chatId,
        "⚠️ Эта кнопка пока не настроена.\\n\\n" +
        "Callback data: " + data
      );
    } catch (error) {
      console.error("❌ BUTTONS CALLBACK FIX V2 ERROR:", error);

      try {
        await bot.answerCallbackQuery(query.id, {
          text: "Ошибка кнопки",
          show_alert: false,
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

// Удаляем старый BUTTONS CALLBACK FIX, чтобы не было дублей
code = code.replace(
  /\/\* ================= BUTTONS CALLBACK FIX START ================= \*\/[\s\S]*?\/\* ================= BUTTONS CALLBACK FIX END ================= \*\//g,
  ""
);

code += newPatch;

fs.writeFileSync(file, code, "utf8");

console.log("✅ Кнопки исправлены.");
console.log("✅ Старый обработчик кнопок удалён.");
console.log("✅ Новый обработчик: BUTTONS CALLBACK FIX V2 ACTIVE");
