const fs = require("fs");

const path = "index.js";
let code = fs.readFileSync(path, "utf8");

// 1) Убираем "я" из обычных алиасов профиля
code = code.replace(
  "profile: ['profile', 'профиль', 'me', 'я'],",
  "profile: ['profile', 'профиль', 'me'],"
);

// 2) Добавляем поддержку команды: "я профиль" и "/я профиль"
const oldParser = `function parseCommand(ctx) {
  const text = ctx.message?.text || '';
  if (!text.startsWith('/')) return null;
  const [raw, ...args] = text.slice(1).trim().split(/\\s+/);
  const alias = cleanCommandName(raw);
  const command = REVERSE_ALIASES.get(alias) || alias;
  return { raw: alias, command, args, argText: args.join(' ') };
}`;

const newParser = `function parseCommand(ctx) {
  const text = (ctx.message?.text || '').trim();
  if (!text) return null;

  const hasSlash = text.startsWith('/');
  const cleanText = hasSlash ? text.slice(1).trim() : text;
  const parts = cleanText.split(/\\s+/);
  const [raw, ...args] = parts;

  const first = cleanCommandName(raw);
  const second = (args[0] || '').toLowerCase();

  // Команда "я профиль" / "/я профиль"
  // Просто "я" НЕ считается командой, чтобы не мешать общению.
  if (first === 'я' && ['профиль', 'profile'].includes(second)) {
    return {
      raw: 'я профиль',
      command: 'profile',
      args: args.slice(1),
      argText: args.slice(1).join(' ')
    };
  }

  const command = REVERSE_ALIASES.get(first) || null;
  if (!command) return null;

  return {
    raw: first,
    command,
    args,
    argText: args.join(' ')
  };
}`;

if (!code.includes(oldParser)) {
  console.error("❌ Не нашёл старый parseCommand. Возможно, код уже изменён.");
  process.exit(1);
}

code = code.replace(oldParser, newParser);

fs.writeFileSync(path, code, "utf8");

console.log("✅ Исправлено: 'я' больше не вызывает профиль, работает 'я профиль'");
