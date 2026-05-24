const fs = require("fs");

const path = "index.js";
let code = fs.readFileSync(path, "utf8");

// 1. Добавляем алиасы команды монет
if (!code.includes("devcoins: ['devcoins'")) {
  code = code.replace(
    "help: ['help', 'помощь', 'commands', 'команды'],",
    "help: ['help', 'помощь', 'commands', 'команды'],\n  devcoins: ['devcoins', 'coins', 'монеты', 'выдатьмонеты', 'датьмонеты'],"
  );
}

// 2. Добавляем функцию выдачи монет перед handleCommand
const handleMarker = "async function handleCommand(ctx, parsed) {";

if (!code.includes("async function handleDeveloperCoins(ctx, args)")) {
  const func = `
async function handleDeveloperCoins(ctx, args) {
  if (!(await requireGroup(ctx))) return;

  if (!OWNER_ID || Number(ctx.from.id) !== Number(OWNER_ID)) {
    return ctx.reply('❌ Эта команда доступна только разработчику бота.');
  }

  const target = resolveTarget(ctx, args);

  if (!target) {
    return ctx.reply(
      '❌ Использование:\\n\\nмонеты ID сумма\\n/coins ID сумма\\n\\nИли по reply:\\nмонеты сумма\\n/coins сумма'
    );
  }

  const amount = Number(target.rest[0]);

  if (!Number.isFinite(amount) || amount === 0) {
    return ctx.reply('❌ Укажи сумму монет. Например: монеты 1000');
  }

  const chat = getChatDB(ctx.chat.id);

  let user;

  if (target.user) {
    user = getUserDB(chat, target.user);
  } else {
    user = chat.users[String(target.id)] || getUserDB(chat, {
      id: target.id,
      first_name: \`ID \${target.id}\`
    });
  }

  user.balance = Number(user.balance || 0) + amount;
  user.coins = user.balance;

  if (!user.history) user.history = [];

  user.history.unshift({
    type: amount > 0 ? 'dev_coins_add' : 'dev_coins_remove',
    amount,
    adminId: ctx.from.id,
    date: new Date().toISOString()
  });

  user.history = user.history.slice(0, 50);

  saveDB();

  const actionText = amount > 0 ? 'выданы' : 'сняты';
  const amountText = amount > 0 ? '+' + amount : String(amount);

  return ctx.reply(
    \`🪙 <b>Монеты \${actionText}</b>

👤 Пользователь: \${mentionById(target.id, user.firstName || user.username || \`ID \${target.id}\`)}
🆔 ID: <code>\${target.id}</code>
💰 Изменение: <b>\${amountText}</b>
🏦 Новый баланс: <b>\${user.balance}</b> монет

👨‍💻 Выдал разработчик: \${mentionUser(ctx.from)}\`,
    { parse_mode: 'HTML' }
  );
}

`;

  if (!code.includes(handleMarker)) {
    console.error("❌ Не нашёл handleCommand");
    process.exit(1);
  }

  code = code.replace(handleMarker, func + handleMarker);
}

// 3. Добавляем обработку команды перед balance
const balanceMarker = "  if (command === 'balance') {";

if (!code.includes("if (command === 'devcoins') {")) {
  const commandBlock = `  if (command === 'devcoins') {
    return handleDeveloperCoins(ctx, args);
  }

`;

  if (!code.includes(balanceMarker)) {
    console.error("❌ Не нашёл блок balance");
    process.exit(1);
  }

  code = code.replace(balanceMarker, commandBlock + balanceMarker);
}

// 4. Добавляем в help
code = code.replace(
  "🎁 <b>Магазин</b>",
  "👨‍💻 <b>Разработчик</b>\\n/coins ID сумма — выдать/снять монеты\\nмонеты ID сумма — без слеша\\nreply → монеты сумма\\n\\n🎁 <b>Магазин</b>"
);

fs.writeFileSync(path, code, "utf8");

console.log("✅ Команда разработчика для монет добавлена");
console.log("✅ Работает: /coins ID сумма");
console.log("✅ Работает: монеты ID сумма");
console.log("✅ По reply: монеты сумма");
console.log("✅ Доступ только OWNER_ID");
