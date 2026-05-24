const fs = require("fs");

const path = "index.js";
let code = fs.readFileSync(path, "utf8");

const marker = "bot.on('callback_query', async (ctx) => {";

if (!code.includes(marker)) {
  console.error("❌ Не нашёл bot.on('callback_query') в index.js");
  process.exit(1);
}

const actionCode = `
async function sendCallByModeButton(ctx, mode) {
  const chatId = ctx.chat.id;
  const chat = getChatDB(chatId);

  let minRank = 40;
  if (mode === 'all') minRank = 60;
  if (mode === 'admins') minRank = 40;
  if (mode === 'owners') minRank = 80;

  const userRank = await getUserAdminRank(ctx, ctx.from.id);

  if (userRank < minRank) {
    return ctx.telegram.sendMessage(
      chatId,
      \`❌ Недостаточно прав.\\n\\nТвой ранг: \${rankInfo(userRank).title}\\nНужный ранг: \${rankInfo(minRank).title}\`,
      { parse_mode: 'HTML' }
    );
  }

  const now = nowTs();
  const lastCall = chat.lastCallAt || 0;
  const cooldown = 10 * 60 * 1000;

  if (now - lastCall < cooldown) {
    const left = Math.ceil((cooldown - (now - lastCall)) / 60000);
    return ctx.telegram.sendMessage(chatId, \`⏳ Созыв уже был недавно. Подожди ещё \${left} мин.\`);
  }

  let users = Object.values(chat.users || {});

  users = users.filter((u) => u && u.id && !u.is_bot);

  if (mode === 'admins') {
    users = users.filter((u) => {
      const rank = Number(u.adminRank || chat.admins[String(u.id)] || 0);
      return rank >= 10;
    });
  }

  if (mode === 'owners') {
    users = users.filter((u) => {
      const rank = Number(u.adminRank || chat.admins[String(u.id)] || 0);
      return rank >= 95 || Number(u.id) === OWNER_ID;
    });
  }

  if (!users.length) {
    return ctx.telegram.sendMessage(
      chatId,
      '❌ Некого созывать. Бот ещё не знает участников этой категории.'
    );
  }

  chat.lastCallAt = now;
  saveDB();

  const title =
    mode === 'all'
      ? '👥 Все участники'
      : mode === 'admins'
        ? '🛡 Администрация'
        : '👑 Владельцы';

  await ctx.telegram.sendMessage(
    chatId,
    \`📢 <b>Созыв: \${title}</b>\\n\\n👮 Созвал: \${mentionUser(ctx.from)}\`,
    { parse_mode: 'HTML' }
  );

  for (let i = 0; i < users.length; i += 25) {
    const chunk = users.slice(i, i + 25);

    const mentions = chunk
      .map((u) => mentionById(u.id, u.firstName || u.username || \`ID \${u.id}\`))
      .join(' ');

    await ctx.telegram.sendMessage(chatId, mentions, { parse_mode: 'HTML' });
  }
}

bot.action(/^call:(all|admins|owners|cancel):(\\d+)$/, async (ctx) => {
  try {
    const mode = ctx.match[1];
    const actorId = Number(ctx.match[2]);

    if (ctx.from.id !== actorId) {
      return ctx.answerCbQuery('❌ Эта кнопка не для тебя.');
    }

    await ctx.answerCbQuery();

    if (mode === 'cancel') {
      return ctx.editMessageText('❌ Созыв отменён.').catch(() => {});
    }

    await ctx.editMessageText('⏳ Выполняю созыв...').catch(() => {});

    return sendCallByModeButton(ctx, mode);
  } catch (error) {
    console.error('call button error:', error);
    return ctx.answerCbQuery('Ошибка при созыве.').catch(() => {});
  }
});

`;

if (code.includes("async function sendCallByModeButton(ctx, mode)")) {
  console.log("⚠️ Фикс уже был добавлен ранее");
} else {
  code = code.replace(marker, actionCode + "\n" + marker);
  fs.writeFileSync(path, code, "utf8");
  console.log("✅ Обработчик кнопок калл добавлен");
}
