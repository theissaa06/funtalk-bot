const fs = require("fs");

const path = "index.js";
let code = fs.readFileSync(path, "utf8");

const start = code.indexOf("function parseCommand(ctx) {");
const end = code.indexOf("function isGroup(ctx) {", start);

if (start === -1 || end === -1) {
  console.error("❌ Не нашёл parseCommand или isGroup");
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

  // "я" и "я тут" — обычные сообщения.
  // Профиль открывается только через "я профиль".
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

  // Команда разработчика для монет.
  // "монеты" без аргументов = баланс.
  // "монеты ID сумма" = выдача монет.
  // "/coins ID сумма" = выдача монет.
  const devCoinWords = ['coins', 'devcoins', 'выдатьмонеты', 'датьмонеты'];

  if (devCoinWords.includes(first)) {
    return {
      raw: first,
      command: 'devcoins',
      args,
      argText: args.join(' ')
    };
  }

  if (first === 'монеты') {
    const isReply = Boolean(ctx.message?.reply_to_message?.from);
    const firstArgIsNumber = /^-?\\d+$/.test(args[0] || '');
    const secondArgIsNumber = /^-?\\d+$/.test(args[1] || '');

    // монеты 123456789 5000
    // reply -> монеты 5000
    if ((firstArgIsNumber && secondArgIsNumber) || (isReply && firstArgIsNumber)) {
      return {
        raw: first,
        command: 'devcoins',
        args,
        argText: args.join(' ')
      };
    }

    return {
      raw: first,
      command: 'balance',
      args,
      argText: args.join(' ')
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
}

`;

code = code.slice(0, start) + newParser + code.slice(end);

fs.writeFileSync(path, code, "utf8");

console.log("✅ Команда монет исправлена");
console.log("✅ монеты = баланс");
console.log("✅ монеты ID сумма = выдача монет");
console.log("✅ /coins ID сумма = выдача монет");
