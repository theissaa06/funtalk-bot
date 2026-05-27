const fs = require("fs");

const file = "index.js";

if (!fs.existsSync(file)) {
  console.log("❌ index.js не найден. Запусти команду из корня проекта funtalk-bot.");
  process.exit(1);
}

let code = fs.readFileSync(file, "utf8");
fs.writeFileSync("index.before-callback-buttons-fix.js", code, "utf8");

if (!code.includes("BUTTONS CALLBACK FIX START")) {
  code += `

/* ================= BUTTONS CALLBACK FIX START ================= */

if (typeof bot !== "undefined" && !global.__BUTTONS_CALLBACK_FIX__) {
  global.__BUTTONS_CALLBACK_FIX__ = true;

  console.log("✅ BUTTONS CALLBACK FIX ACTIVE");

  bot.on("callback_query", async (query) => {
    try {
      const msg = query.message;
      const data = query.data;

      if (!msg || !data) {
        return bot.answerCallbackQuery(query.id, {
          text: "Команда не найдена",
          show_alert: false,
        });
      }

      await bot.answerCallbackQuery(query.id);

      const chatId = msg.chat.id;

      if (data === "moderation" || data === "mod" || data === "menu_moderation") {
        return bot.sendMessage(
          chatId,
          "🛡 Модерация:\\n\\n" +
          "Бан: /ban или /забанить\\n" +
          "Разбан: /unban или /разбанить\\n" +
          "Кик: /kick или /кик\\n" +
          "Мут: /mute или /мут\\n" +
          "Размут: /unmute или /размут\\n" +
          "Очистка: /clear или /очистить"
        );
      }

      if (data === "ranks" || data === "rank" || data === "menu_ranks") {
        return bot.sendMessage(
          chatId,
          "👑 Ранги:\\n\\n" +
          "Профиль: /профиль\\n" +
          "Выдать ранг: /setrank или /выдатьранг\\n" +
          "Снять ранг: /removerank или /снятьранг\\n" +
          "Топ рангов: /topranks"
        );
      }

      if (data === "profile" || data === "menu_profile") {
        return bot.sendMessage(
          chatId,
          "👤 Профиль:\\n\\n" +
          "Напиши: /профиль"
        );
      }

      if (data === "rules" || data === "menu_rules") {
        return bot.sendMessage(
          chatId,
          "📜 Правила:\\n\\n" +
          "Напиши: /rules или /правила"
        );
      }

      if (data === "settings" || data === "menu_settings") {
        return bot.sendMessage(
          chatId,
          "⚙️ Настройки:\\n\\n" +
          "Доступные команды настроек будут здесь."
        );
      }

      if (data === "shop" || data === "menu_shop") {
        return bot.sendMessage(
          chatId,
          "🎁 Магазин:\\n\\n" +
          "Раздел магазина пока в разработке."
        );
      }

      if (data === "call" || data === "summon" || data === "menu_summon") {
        return bot.sendMessage(
          chatId,
          "📣 Созыв:\\n\\n" +
          "Напиши: /созыв"
        );
      }

      if (data === "relations" || data === "menu_relations") {
        return bot.sendMessage(
          chatId,
          "❤️ Отношения:\\n\\n" +
          "Команды отношений будут здесь."
        );
      }

      if (data === "tops" || data === "menu_tops") {
        return bot.sendMessage(
          chatId,
          "🏆 Топы:\\n\\n" +
          "Напиши: /топ"
        );
      }

      if (data === "friday" || data === "menu_friday") {
        return bot.sendMessage(
          chatId,
          "🎉 Пятница:\\n\\n" +
          "Раздел пятницы пока в разработке."
        );
      }

      if (data === "global_ranks" || data === "menu_global_ranks") {
        return bot.sendMessage(
          chatId,
          "🌍 Глобальные ранги:\\n\\n" +
          "Напиши: /глобранги"
        );
      }

      if (data === "coins" || data === "menu_coins") {
        return bot.sendMessage(
          chatId,
          "💰 Монеты:\\n\\n" +
          "Баланс: /баланс\\n" +
          "Топ монет: /топмонет"
        );
      }

      return bot.sendMessage(
        chatId,
        "⚠️ Эта кнопка пока не настроена.\\n\\nCallback data: " + data
      );
    } catch (error) {
      console.error("❌ BUTTONS CALLBACK FIX ERROR:", error);

      try {
        await bot.answerCallbackQuery(query.id, {
          text: "Ошибка кнопки",
          show_alert: false,
        });
      } catch {}

      try {
        await bot.sendMessage(
          query.message.chat.id,
          "❌ Ошибка обработки кнопки. Проверь Railway Logs."
        );
      } catch {}
    }
  });
}

/* ================= BUTTONS CALLBACK FIX END ================= */

`;
}

fs.writeFileSync(file, code, "utf8");

console.log("✅ Фикс кнопок добавлен в index.js");
console.log("✅ Теперь при запуске должна быть строка: BUTTONS CALLBACK FIX ACTIVE");
