const fs = require("fs");

const path = "index.js";
let code = fs.readFileSync(path, "utf8");

// 1) Добавляем функцию отправки созыва, если её нет
const insertBefore = "function mainMenuKeyboard() {";

if (!code.includes("async function sendCallByMode(ctx, mode)")) {
  const callFunction = `
async function sendCallByMode(ctx, mode) {
  const chat = getChatDB(ctx.chat.id);

  let minRank = 40;
  if (mode === 'all') minRank = 60;
  if (mode === 'admins') minRank = 40;
  if (mode === 'owners') minRank = 80;

  if (!(await requireRank(ctx, minRank))) return;

  const now = nowTs();
  const lastCall = chat.lastCallAt || 0;
  const cooldown = 10 * 60 * 1000;

  if (now - lastCall < cooldown) {
    const left = Math.ceil((cooldown - (now - lastCall)) / 60000);
    return ctx.reply(\`⏳ Созыв уже был недавно. Подожди ещё \${left} мин.\`);
  }

  let users = Object.values(chat.users || {});

  if (mode === 'admins') {
    users = users.filter((u) => Number(u.adminRank || chat.admins[String(u.id)] || 0) >= 10);
  }

  if (mode === 'owners') {
    users = users.filter((u) => {
      const rank = Number(u.adminRank || chat.admins[String(u.id)] || 0);
      return rank >= 95 || Number(u.id) === OWNER_ID;
    });
  }

  if (mode === 'all') {
    users = users.filter((u) => !u.is_bot);
  }

  users = users.filter((u) => u && u.id && !u.is_bot);

  if (!users.length) {
    return ctx.reply('❌ Некого созывать. Бот ещё не знает участников этой категории.');
  }

  chat.lastCallAt = now;
  saveDB();

  const title =
    mode === 'all'
      ? '👥 Все участники'
      : mode === 'admins'
        ? '🛡 Администрация'
        : '👑 Владельцы';

  await ctx.reply(
    \`📢 <b>Созыв: \${title}</b>\\n\\n👮 Созвал: \${mentionUser(ctx.from)}\`,
    { parse_mode: 'HTML' }
  );

  for (let i = 0; i < users.length; i += 25) {
    const chunk = users.slice(i, i + 25);
    const mentions = chunk
      .map((u) => mentionById(u.id, u.firstName || u.username || \`ID \${u.id}\`))
      .join(' ');

    await ctx.reply(mentions, { parse_mode: 'HTML' });
  }
}

`;

  if (!code.includes(insertBefore)) {
    console.error("❌ Не нашёл место для вставки sendCallByMode");
    process.exit(1);
  }

  code = code.replace(insertBefore, callFunction + insertBefore);
}

// 2) Исправляем команду call, чтобы кнопки были с callback call:...
const oldCallBlockStart = code.indexOf("  if (command === 'call') {");
const oldCallBlockEnd = code.indexOf("  if (command === 'mute')", oldCallBlockStart);

if (oldCallBlockStart === -1 || oldCallBlockEnd === -1) {
  console.error("❌ Не нашёл блок command === 'call'");
  process.exit(1);
}

const newCallBlock = `  if (command === 'call') {
    if (!(await requireGroup(ctx))) return;

    const modeRaw = (args[0] || '').toLowerCase();

    if (['all', 'все', 'всех'].includes(modeRaw)) {
      return sendCallByMode(ctx, 'all');
    }

    if (['admins', 'админы', 'админов'].includes(modeRaw)) {
      return sendCallByMode(ctx, 'admins');
    }

    if (['owners', 'владельцы', 'владельцев'].includes(modeRaw)) {
      return sendCallByMode(ctx, 'owners');
    }

    if (!(await requireRank(ctx, 40))) return;

    return ctx.reply('📢 <b>Выбери тип созыва:</b>', {
      parse_mode: 'HTML',
      ...Markup.inlineKeyboard([
        [
          Markup.button.callback('👥 Все', \`call:all:\${ctx.from.id}\`),
          Markup.button.callback('🛡 Админы', \`call:admins:\${ctx.from.id}\`)
        ],
        [
          Markup.button.callback('👑 Владельцы', \`call:owners:\${ctx.from.id}\`),
          Markup.button.callback('❌ Отмена', \`call:cancel:\${ctx.from.id}\`)
        ]
      ])
    });
  }

`;

code = code.slice(0, oldCallBlockStart) + newCallBlock + code.slice(oldCallBlockEnd);

// 3) Добавляем обработчик callback call:...
const callbackMarker = "    if (parts[0] === 'cancel') {";

if (!code.includes("if (parts[0] === 'call')")) {
  const callCallback = `    if (parts[0] === 'call') {
      const mode = parts[1];
      const actorId = Number(parts[2]);

      if (ctx.from.id !== actorId) {
        return ctx.answerCbQuery('❌ Эта кнопка не для тебя.');
      }

      await ctx.answerCbQuery();

      if (mode === 'cancel') {
        await ctx.editMessageText('❌ Созыв отменён.').catch(() => {});
        return;
      }

      await ctx.editMessageText('⏳ Выполняю созыв...').catch(() => {});

      return sendCallByMode(ctx, mode);
    }

`;

  if (!code.includes(callbackMarker)) {
    console.error("❌ Не нашёл callback marker");
    process.exit(1);
  }

  code = code.replace(callbackMarker, callCallback + callbackMarker);
}

fs.writeFileSync(path, code, "utf8");

console.log("✅ Кнопки созыва исправлены");
