const fs = require("fs");

const path = "index.js";
let code = fs.readFileSync(path, "utf8");

// Исправляем баг: help:back не должен попадать в общий обработчик help:*
const oldText = "if (data.startsWith('help:')) {";
const newText = "if (data.startsWith('help:') && data !== 'help:back') {";

if (!code.includes(oldText)) {
  console.error("❌ Не нашёл строку: " + oldText);
  process.exit(1);
}

code = code.replace(oldText, newText);

fs.writeFileSync(path, code, "utf8");

console.log("✅ Исправлено: кнопка Назад больше не попадает в обычные help-разделы");
