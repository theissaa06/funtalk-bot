const fs = require("fs");

const path = "index.js";
let code = fs.readFileSync(path, "utf8");

// ======================================================
// FIX DUPLICATE RELATIONSHIP REQUESTS
// Убираем старый bot.onText отношений, который дублирует FINAL hook
// ======================================================

// 1. Удаляем старый отдельный bot.onText для отношений, если он есть
const oldRelOnTextRegex = /\/\/ Ловим отношения отдельным обработчиком,[\s\S]*?bot\.onText\(\s*\/\^\\\/\?\(\?:отношения\|отношение\|любовь\|love\)[\s\S]*?\n\}\);\n/s;

if (oldRelOnTextRegex.test(code)) {
  code = code.replace(oldRelOnTextRegex, "");
  console.log("✅ Удалён старый bot.onText обработчик отношений");
} else {
  console.log("ℹ️ Старый bot.onText отношений не найден или уже удалён");
}

// 2. Удаляем второй возможный bot.onText отношений без комментария
const oldRelOnTextRegex2 = /bot\.onText\(\s*\/\^\\\/\?\(\?:отношения\|отношение\|любовь\|love\)[\s\S]*?\n\}\);\n/s;

if (oldRelOnTextRegex2.test(code)) {
  code = code.replace(oldRelOnTextRegex2, "");
  console.log("✅ Удалён дополнительный bot.onText обработчик отношений");
}

// 3. Добавляем защиту в finalRelationshipRequest по message_id
const target = "async function finalRelationshipRequest(msg, argText = '') {\n  try {";

if (!code.includes("RELATIONSHIP MESSAGE DEDUPE")) {
  if (!code.includes(target)) {
    console.error("❌ Не нашёл finalRelationshipRequest");
    process.exit(1);
  }

  const guard = `async function finalRelationshipRequest(msg, argText = '') {
  try {
    // RELATIONSHIP MESSAGE DEDUPE
    const chatForDedupe = getChat(msg.chat.id, msg.chat.title, msg.chat.type);
    if (!chatForDedupe.relationshipMessageLocks) chatForDedupe.relationshipMessageLocks = {};

    const lockKey = String(msg.message_id);

    if (chatForDedupe.relationshipMessageLocks[lockKey]) {
      return true;
    }

    chatForDedupe.relationshipMessageLocks[lockKey] = Date.now();

    const lockIds = Object.keys(chatForDedupe.relationshipMessageLocks);
    if (lockIds.length > 300) {
      lockIds
        .sort((a, b) => chatForDedupe.relationshipMessageLocks[a] - chatForDedupe.relationshipMessageLocks[b])
        .slice(0, lockIds.length - 300)
        .forEach((id) => delete chatForDedupe.relationshipMessageLocks[id]);
    }

    saveDB();
`;

  code = code.replace(target, guard);
  console.log("✅ Добавлена защита от двойной заявки по message_id");
}

// 4. На всякий случай убираем старый hard_fix файл из проекта, если он был добавлен
code = code.replaceAll("RELATIONSHIP REQUEST FIX V2", "RELATIONSHIP REQUEST FIX V2 DISABLED");

fs.writeFileSync(path, code, "utf8");

console.log("✅ Дубли заявок отношений исправлены");
