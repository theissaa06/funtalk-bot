// ============================================================
// src/ruCommands.js
// Маппер русских команд в английские.
// Нужно, потому что Telegram/Telegraf не всегда видит кириллицу
// после "/" как bot_command.
// ============================================================

const commandMap = {
  // базовые
  "команды": "commands",
  "помощь": "commands",
  "хелп": "commands",
  "пинг": "ping",
  "инфо": "info",
  "айди": "id",
  "настройки": "settings",

  // правила
  "правила": "rules",

  // развлечения
  "мем": "meme",
  "мемы": "meme",
  "тема": "topic",
  "рандом": "random",
  "монета": "flip",
  "кубик": "dice",

  // созыв
  "калл": "call",
  "созыв": "call",
  "все": "call",
  "всех": "call",

  // закрепы
  "закреп": "pin",
  "закрепить": "pin",
  "откреп": "unpin",
  "открепить": "unpin",
  "открепвсе": "unpinall",
  "открепитьвсе": "unpinall",

  // модерация
  "мут": "mute",
  "замутить": "mute",
  "размут": "unmute",
  "размутить": "unmute",
  "бан": "ban",
  "забанить": "ban",
  "разбан": "unban",
  "разбанить": "unban",
  "кик": "kick",
  "кикнуть": "kick",
  "пред": "warn",
  "варн": "warn",
  "предупреждение": "warn",
  "преды": "warnings",
  "варны": "warnings",
  "сброспред": "clearwarns",
  "сброспредов": "clearwarns",
  "очиститьпреды": "clearwarns",
  "удалить": "del",
  "дел": "del",
  "лог": "modlog",
  "модлог": "modlog"
};

function normalizeCommand(text) {
  if (!text || !text.startsWith("/")) return text;

  const parts = text.trim().split(/\s+/);
  const rawCommand = parts[0].slice(1).toLowerCase();

  // поддержка /команда@botname
  const commandOnly = rawCommand.split("@")[0];

  const mapped = commandMap[commandOnly];

  if (!mapped) return text;

  const rest = parts.slice(1).join(" ");
  return "/" + mapped + (rest ? " " + rest : "");
}

function register(bot) {
  bot.use(async (ctx, next) => {
    try {
      if (ctx.message && typeof ctx.message.text === "string") {
        const oldText = ctx.message.text;
        const newText = normalizeCommand(oldText);

        if (newText !== oldText) {
          ctx.message.text = newText;

          // Добавляем entity, чтобы bot.command точно увидел команду
          const firstPart = newText.split(/\s+/)[0];

          ctx.message.entities = [
            {
              type: "bot_command",
              offset: 0,
              length: firstPart.length
            }
          ];

          console.log(`[ruCommands] ${oldText} -> ${newText}`);
        }
      }
    } catch (err) {
      console.error("[ruCommands]", err.message);
    }

    return next();
  });

  console.log("✅ Модуль ruCommands подключён");
}

module.exports = { register };
