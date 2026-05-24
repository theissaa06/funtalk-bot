const fs = require("fs");

const path = "index.js";
let code = fs.readFileSync(path, "utf8");

// Убираем "я" из алиасов профиля, чтобы "я тут" не вызывало профиль
code = code.replace(
  "profile: ['profile', 'профиль', 'me', 'я'],",
  "profile: ['profile', 'профиль', 'me'],"
);

// Если вдруг другой вариант алиасов
code = code.replace(
  'profile: ["profile", "профиль", "me", "я"],',
  'profile: ["profile", "профиль", "me"],'
);

// Исправляем parseCommand: обычное "я" или "я тут" НЕ команда, только "я профиль"
const parserStart = code.indexOf("function parseCommand(ctx) {");
const parserEnd = code.indexOf("function isGroup(ctx) {", parserStart);

if (parserStart === -1 || parserEnd === -1) {
  console.error("❌ Не нашёл parseCommand в index.js");
  process.exit(1);
}

const newParser = `function parseCommand(ctx) {
  const text = (ctx.message?.text || '').trim();
  if (!text) return null;

  const hasSlash = text.startsWith('/');
  const cleanText = hasSlash ? text.slice(1).trim() : text;

  const parts = cleanText.split(/\\s+/);
  const [raw, ...args] = parts;

  const first = cleanCommandName(raw);
  const second = (args[0] || '').toLowerCase();

  // ВАЖНО:
  // "я" и "я тут" — обычные сообщения, НЕ команда.
  // Работает только "я профиль" или "/я профиль".
  if (first === 'я') {
    if (['профиль', 'profile'].includes(second)) {
      return {
        raw: 'я профиль',
        command: 'profile',
        args: args.slice(1),
        argText: args.slice(1).join(' ')
      };
    }

    return null;
  }

  const command = REVERSE_ALIASES.get(first) || null;
  if (!command) return null;

  return {
    raw: first,
    command,
    args,
    argText: args.join(' ')
  };
}

`;

code = code.slice(0, parserStart) + newParser + code.slice(parserEnd);

// Исправляем красивый текст профиля
const profileStart = code.indexOf("  if (command === 'profile') {");
const profileEnd = code.indexOf("  if (command === 'id')", profileStart);

if (profileStart === -1 || profileEnd === -1) {
  console.error("❌ Не нашёл блок profile в index.js");
  process.exit(1);
}

const newProfileBlock = `  if (command === 'profile') {
    const target = resolveTarget(ctx, args, { self: true });

    const user = target.user
      ? getUserDB(chat, target.user)
      : chat.users[String(target.id)] || getUserDB(chat, {
          id: target.id,
          first_name: \`ID \${target.id}\`
        });

    const level = levelFromXp(user.xp);
    const status = user.inventory?.premium
      ? '💎 Premium'
      : user.inventory?.vip
        ? '⭐ VIP'
        : 'обычный';

    const username = user.username ? '@' + escapeHtml(user.username) : 'нет';
    const nick = escapeHtml(user.firstName || user.first_name || 'Пользователь');
    const title = user.title ? escapeHtml(user.title) : 'нет';
    const adminRank = rankInfo(user.adminRank).title;
    const warnsCount = user.warns?.length || 0;

    return ctx.reply(
\`👤 <b>Профиль пользователя</b>

<b>Основное:</b>
👤 Ник: <b>\${nick}</b>
🆔 ID: <code>\${user.id}</code>
🔗 Username: <b>\${username}</b>

<b>Активность:</b>
💬 Сообщений: <b>\${user.messages}</b>
🎚 Уровень: <b>\${level}</b>
🏆 Ранг активности: <b>\${levelTitle(level)}</b>

<b>Статистика:</b>
⭐ Репутация: <b>\${user.reputation}</b>
⚠️ Предупреждения: <b>\${warnsCount}/5</b>
🪙 Баланс: <b>\${user.balance}</b> монет

<b>Статус:</b>
🏷 Титул: <b>\${title}</b>
👑 Админ-ранг: <b>\${adminRank}</b>
🎁 Статус: <b>\${status}</b>\`,
      { parse_mode: 'HTML' }
    );
  }

`;

code = code.slice(0, profileStart) + newProfileBlock + code.slice(profileEnd);

fs.writeFileSync(path, code, "utf8");

console.log("✅ Исправлено: обычное 'я' больше не вызывает профиль");
console.log("✅ Профиль теперь красиво оформлен");
