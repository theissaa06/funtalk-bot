function isGroup(ctx) {
  const type = ctx.chat?.type;
  return type === "group" || type === "supergroup";
}

function commandSections() {
  return {
    main: {
      title: "📌 Основные команды",
      commands: [
        ["/start", "запустить бота"],
        ["/help", "помощь"],
        ["/commands", "все команды по разделам"],
        ["/menu", "главное меню в личке"],
        ["/about", "о боте"],
        ["/ping", "проверка ответа"],
      ],
    },

    fun: {
      title: "💬 Общение и развлечения",
      commands: [
        ["/talk", "тема для общения"],
        ["/question", "вопрос для диалога"],
        ["/dating", "фраза для знакомства"],
        ["/meme", "мемный вопрос"],
        ["/hello", "приветствие"],
        ["/random", "случайная фраза"],
      ],
    },

    games: {
      title: "🎮 Игры",
      commands: [
        ["/games", "меню игр"],
        ["/guess", "угадай число"],
        ["/rps", "камень-ножницы-бумага"],
        ["/truth", "правда"],
        ["/dare", "действие"],
        ["/quiz", "быстрый вопрос"],
      ],
    },

    moderation: {
      title: "🛡 Модерация",
      commands: [
        ["/modhelp", "помощь по модерации"],
        ["/profile", "профиль пользователя"],
        ["/stats", "статистика группы"],
        ["/top", "топ активных"],
        ["/today", "топ за сегодня"],
        ["/inactive", "неактивные пользователи"],
        ["/warn", "выдать варн"],
        ["/warns", "показать варны"],
        ["/clearwarns", "очистить варны"],
        ["/mute", "выдать мут"],
        ["/unmute", "снять мут"],
        ["/kick", "кикнуть"],
        ["/ban", "забанить"],
        ["/unban", "разбанить"],
        ["/modlog", "лог модерации"],
      ],
    },

    security: {
      title: "🧩 Защита",
      commands: [
        ["/security", "настройки защиты"],
        ["/securitylog", "лог защиты"],
        ["/advanced_security", "расширенная защита"],
        ["/captcha_on", "включить капчу"],
        ["/captcha_off", "выключить капчу"],
        ["/antibot_on", "включить авто-бан новых ботов"],
        ["/antibot_off", "выключить авто-бан новых ботов"],
        ["/smartlinks_on", "умные ссылки"],
        ["/smartlinks_off", "выключить умные ссылки"],
        ["/whitelist_add domain.com", "добавить домен в whitelist"],
        ["/whitelist_remove domain.com", "удалить домен"],
        ["/whitelist", "список разрешённых доменов"],
        ["/captcha_log", "лог капчи"],
      ],
    },

    levels: {
      title: "🏆 Уровни и активность",
      commands: [
        ["/levels", "информация об уровнях"],
        ["/rank", "мой ранг"],
        ["/rank @user", "ранг пользователя"],
        ["/ranks", "система рангов администраторов"],
        ["/topxp", "топ по опыту"],
        ["/toprep", "топ по репутации"],
        ["/balance", "баланс монет"],
        ["/daily", "ежедневный бонус"],
        ["+реп", "дать репутацию ответом на сообщение"],
        ["-реп", "снять репутацию ответом на сообщение"],
      ],
    },

    economy: {
      title: "💰 Экономика",
      commands: [
        ["/shop", "магазин"],
        ["/buy item_id", "купить предмет"],
        ["/inventory", "инвентарь"],
        ["/inv", "инвентарь коротко"],
        ["/use_title item_id", "поставить титул"],
        ["/gift @user 100", "подарить монеты"],
        ["/duel @user 50", "вызвать на дуэль"],
        ["/acceptduel", "принять дуэль"],
        ["/declineduel", "отклонить дуэль"],
        ["/achievements", "достижения"],
        ["/economylog", "лог экономики"],
      ],
    },

    chat: {
      title: "⚙️ Инструменты чата",
      commands: [
        ["/chattools", "помощь по инструментам чата"],
        ["/rules", "правила"],
        ["/setrules текст", "установить правила"],
        ["/clearrules", "очистить правила"],
        ["/setwelcome текст", "текст приветствия"],
        ["/welcome_on", "включить приветствие"],
        ["/welcome_off", "выключить приветствие"],
        ["/setgoodbye текст", "текст прощания"],
        ["/goodbye_on", "включить прощание"],
        ["/goodbye_off", "выключить прощание"],
        ["/setlogchat", "установить текущий чат как лог-чат"],
        ["/logchat_off", "выключить лог-чат"],
        ["/cmd_add команда ответ", "добавить кастомную команду"],
        ["/cmd_del команда", "удалить кастомную команду"],
        ["/cmds", "список кастомных команд"],
      ],
    },

    autoresponder: {
      title: "🤖 Автоответчик",
      commands: [
        ["/autoresponder", "настройки автоответчика"],
        ["/triggers_on", "включить триггеры"],
        ["/triggers_off", "выключить триггеры"],
        ["/trigger_add слово | ответ", "добавить триггер"],
        ["/trigger_del ID", "удалить триггер"],
        ["/triggers", "список триггеров"],
        ["/miniai_on", "включить мини-AI"],
        ["/miniai_off", "выключить мини-AI"],
        ["/template_add имя | текст", "добавить шаблон админа"],
        ["/template_del имя", "удалить шаблон"],
        ["/templates", "список шаблонов"],
        ["/replytpl имя", "ответить шаблоном"],
        ["/autoresponderlog", "лог автоответчика"],
      ],
    },

    system: {
      title: "🧪 Диагностика и стабильность",
      commands: [
        ["/systemcheck", "полная проверка"],
        ["/botrights", "права бота"],
        ["/modules", "проверка файлов"],
        ["/dbcheck", "проверка базы"],
        ["/privacyinfo", "инструкция по Privacy Mode"],
        ["/adminhelp", "памятка админа"],
        ["/health", "состояние бота"],
        ["/runtime", "информация о запуске"],
        ["/lasterrors", "последние ошибки"],
        ["/clearerrors", "очистить ошибки"],
        ["/reloadinfo", "как перезапустить бота"],
        ["/safehelp", "помощь по стабильности"],
      ],
    },
  };
}

function sectionText(section) {
  return (
    `${section.title}\n\n` +
    section.commands.map(([cmd, desc]) => `${cmd} — ${desc}`).join("\n")
  );
}

function allCommandsText() {
  const sections = commandSections();

  return (
    "📚 Все команды FunTalk Bot\n\n" +
    "Разделы:\n" +
    "/commands_main — основные\n" +
    "/commands_fun — общение\n" +
    "/commands_games — игры\n" +
    "/commands_mod — модерация\n" +
    "/commands_security — защита\n" +
    "/commands_levels — уровни\n" +
    "/commands_economy — экономика\n" +
    "/commands_chat — инструменты чата\n" +
    "/commands_ai — автоответчик\n" +
    "/commands_system — диагностика\n\n" +
    "Быстрый старт для админа:\n" +
    "1. /systemcheck\n" +
    "2. /botrights\n" +
    "3. /privacyinfo\n" +
    "4. /adminhelp\n\n" +
    "Для полного списка по разделу напиши нужную команду выше."
  );
}

function registerCommandDocs(bot, helpers) {
  const { safeReply } = helpers;
  const sections = commandSections();

  bot.command("commands", async (ctx) => {
    return safeReply(ctx, allCommandsText());
  });

  bot.command("cmdhelp", async (ctx) => {
    return safeReply(ctx, allCommandsText());
  });

  bot.command("commands_main", async (ctx) => {
    return safeReply(ctx, sectionText(sections.main));
  });

  bot.command("commands_fun", async (ctx) => {
    return safeReply(ctx, sectionText(sections.fun));
  });

  bot.command("commands_games", async (ctx) => {
    return safeReply(ctx, sectionText(sections.games));
  });

  bot.command("commands_mod", async (ctx) => {
    return safeReply(ctx, sectionText(sections.moderation));
  });

  bot.command("commands_security", async (ctx) => {
    return safeReply(ctx, sectionText(sections.security));
  });

  bot.command("commands_levels", async (ctx) => {
    return safeReply(ctx, sectionText(sections.levels));
  });

  bot.command("commands_economy", async (ctx) => {
    return safeReply(ctx, sectionText(sections.economy));
  });

  bot.command("commands_chat", async (ctx) => {
    return safeReply(ctx, sectionText(sections.chat));
  });

  bot.command("commands_ai", async (ctx) => {
    return safeReply(ctx, sectionText(sections.autoresponder));
  });

  bot.command("commands_system", async (ctx) => {
    return safeReply(ctx, sectionText(sections.system));
  });

  bot.command("quickstart", async (ctx) => {
    const text =
      "🚀 Быстрый запуск FunTalk Bot\n\n" +
      "1. Сделай бота админом группы.\n" +
      "2. Дай права: удаление сообщений, бан, ограничения.\n" +
      "3. В @BotFather выключи Privacy Mode.\n" +
      "4. Напиши /systemcheck.\n" +
      "5. Напиши /botrights.\n\n" +
      "Быстрая настройка:\n" +
      "/security\n" +
      "/advanced_security\n" +
      "/modhelp\n" +
      "/chattools\n" +
      "/autoresponder\n\n" +
      "Проверка возможностей:\n" +
      "/rank\n" +
      "/daily\n" +
      "/shop\n" +
      "/games";

    return safeReply(ctx, text);
  });

  bot.command("admincommands", async (ctx) => {
    return safeReply(
      ctx,
      "🧑‍💻 Главные админ-команды\n\n" +
        "/systemcheck — полная проверка\n" +
        "/botrights — проверить права\n" +
        "/modhelp — модерация\n" +
        "/security — базовая защита\n" +
        "/advanced_security — капча и whitelist\n" +
        "/chattools — правила, приветствие, команды\n" +
        "/autoresponder — триггеры и мини-AI\n" +
        "/safehelp — стабильность\n\n" +
        "Полный список: /commands"
    );
  });
}

module.exports = {
  registerCommandDocs,
};