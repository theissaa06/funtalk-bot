const fs = require("fs");

const path = "index.js";
let code = fs.readFileSync(path, "utf8");

// 1) Добавляем алиасы setup / настроить
code = code.replace(
  "help: ['help', 'помощь', 'commands', 'команды'],",
  "help: ['help', 'помощь', 'commands', 'команды'],\n  setup: ['setup', 'настроить', 'стартгруппа', 'startgroup'],"
);

// 2) Добавляем middleware, который запоминает каждую беседу отдельно
const startMarker = "bot.start(async (ctx) =>";
if (!code.includes("bot.use(async (ctx, next) => {\n  try {\n    if (ctx.chat) {")) {
  const universalMiddleware = `
bot.use(async (ctx, next) => {
  try {
    if (ctx.chat) {
      const chat = getChatDB(ctx.chat.id);

      chat.title = ctx.chat.title || chat.title || 'Личная переписка';
      chat.type = ctx.chat.type || chat.type || 'unknown';
      chat.updatedAt = new Date().toISOString();

      if (!chat.settings) chat.settings = {};
      if (!chat.settings.rules) chat.settings.rules = DEFAULT_RULES;
      if (chat.settings.welcomeText === undefined) {
        chat.settings.welcomeText = '👋 Добро пожаловать, {user}!\\n\\nТы попал в «{chat}». Перед общением прочитай /правила.';
      }

      saveDB();
    }
  } catch (error) {
    console.error('sync chat info error:', error);
  }

  return next();
});

`;

  if (!code.includes(startMarker)) {
    console.error("❌ Не нашёл bot.start");
    process.exit(1);
  }

  code = code.replace(startMarker, universalMiddleware + startMarker);
}

// 3) Добавляем обработку команды setup / настроить
const helpBlock = "  if (command === 'help') {";
if (!code.includes("if (command === 'setup') {")) {
  const setupBlock = `  if (command === 'setup') {
    if (!(await requireGroup(ctx))) return;

    const isTgAdmin = await isTelegramAdmin(ctx, ctx.from.id);
    const currentRank = await getUserAdminRank(ctx, ctx.from.id);

    if (!isTgAdmin && currentRank < 80) {
      return ctx.reply('❌ Настроить бота может только администратор этой беседы.');
    }

    const chatTitle = ctx.chat.title || 'эта беседа';
    const chat = getChatDB(ctx.chat.id);
    const user = getUserDB(chat, ctx.from);

    chat.title = chatTitle;
    chat.type = ctx.chat.type;
    chat.updatedAt = new Date().toISOString();

    const member = await ctx.telegram.getChatMember(ctx.chat.id, ctx.from.id).catch(() => null);

    if (member?.status === 'creator' || (OWNER_ID && ctx.from.id === OWNER_ID)) {
      user.adminRank = 100;
      chat.admins[String(ctx.from.id)] = 100;
    } else if ((user.adminRank || 0) < 60) {
      user.adminRank = 60;
      chat.admins[String(ctx.from.id)] = 60;
    }

    if (!chat.settings.rules || chat.settings.rules === DEFAULT_RULES) {
      chat.settings.rules = \`📜 Правила беседы «\${chatTitle}»

1. Уважай участников.
2. Не спамь и не флуди.
3. Не рекламируй без разрешения администрации.
4. Не провоцируй конфликты.
5. Не отправляй запрещённый контент.
6. Уважай администрацию.
7. Не обходи наказания.

⚠️ За нарушение: предупреждение, мут, кик или бан.\`;
    }

    if (!chat.settings.welcomeText) {
      chat.settings.welcomeText = '👋 Добро пожаловать, {user}!\\n\\nТы попал в «{chat}». Перед общением прочитай /правила.';
    }

    saveDB();

    return ctx.reply(
      \`✅ <b>Бот настроен для этой беседы</b>

🏠 Беседа: <b>\${escapeHtml(chatTitle)}</b>
🆔 Chat ID: <code>\${ctx.chat.id}</code>
👤 Настроил: \${mentionUser(ctx.from)}
👑 Твой ранг: <b>\${rankInfo(user.adminRank).title}</b>

Теперь у этой беседы свои:
• правила;
• админ-ранги;
• настройки;
• топы;
• предупреждения;
• созывы;
• логи.

Команды:
• /правила
• /настройки
• /ранги
• /помощь\`,
      { parse_mode: 'HTML' }
    );
  }

`;

  if (!code.includes(helpBlock)) {
    console.error("❌ Не нашёл место для setup");
    process.exit(1);
  }

  code = code.replace(helpBlock, setupBlock + helpBlock);
}

// 4) Делаем приветствие универсальным: {chat} заменяется на название группы
code = code.replace(
  "await ctx.reply(text.replace('{user}', mentionUser(member)), { parse_mode: 'HTML' });",
  "await ctx.reply(text.replace('{user}', mentionUser(member)).replace('{chat}', escapeHtml(ctx.chat.title || chat.title || 'эта беседа')), { parse_mode: 'HTML' });"
);

// 5) Убираем жёсткую фразу «Клуб случайных людей» из start
code = code.replace(
  "Я FulTalchik_botik для «Клуба случайных людей». Напиши /help.",
  "Я FulTalchik_botik — универсальный бот для Telegram-бесед. Добавь меня в группу и напиши /настроить."
);

// 6) Обновляем help, чтобы было понятно, что бот для всех бесед
code = code.replace(
  "🤖 <b>FulTalchik_botik — меню команд</b>",
  "🤖 <b>FulTalchik_botik — меню команд</b>\\n\\n🌐 Бот работает отдельно для каждой беседы.\\nДля первичной настройки напиши: /настроить"
);

// 7) Добавляем setup в README, если он есть
if (fs.existsSync("README.md")) {
  let readme = fs.readFileSync("README.md", "utf8");

  if (!readme.includes("/настроить")) {
    readme += `

## Универсальная работа в разных беседах

Бот работает отдельно для каждой Telegram-группы.

В каждой беседе отдельно хранятся:
- правила;
- настройки;
- админ-ранги;
- пользователи;
- топы;
- предупреждения;
- логи;
- созывы.

После добавления бота в новую группу напишите:

\`\`\`
/настроить
\`\`\`

или:

\`\`\`
настроить
\`\`\`

Команду должен выполнить администратор группы.
`;
    fs.writeFileSync("README.md", readme, "utf8");
  }
}

fs.writeFileSync(path, code, "utf8");

console.log("✅ Бот переделан под любые беседы");
console.log("✅ Добавлена команда /настроить");
console.log("✅ Название беседы теперь берётся автоматически");
console.log("✅ У каждой беседы свои настройки, правила, ранги и топы");
