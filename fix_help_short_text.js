const fs = require("fs");

const path = "index.js";
let code = fs.readFileSync(path, "utf8");

const niceHelpText = `🤖 <b>FulTalchik_Botik — меню команд</b>

⚙️ Все команды работают со слешем и без!

Выбери раздел:`;

// Меняем все варианты главного help-текста на красивый короткий
code = code.replace(
  /`🤖 <b>FulTalchik_Botik[\s\S]*?Выбери раздел:`/g,
  "`" + niceHelpText + "`"
);

// На всякий случай чиним кнопку Назад,
// чтобы она не попадала в обычный раздел help:*
code = code.replace(
  "if (data.startsWith('help:')) {",
  "if (data.startsWith('help:') && data !== 'help:back') {"
);

code = code.replace(
  "if (data.startsWith('help:') && data !== 'help:back' && data !== 'help:back') {",
  "if (data.startsWith('help:') && data !== 'help:back') {"
);

fs.writeFileSync(path, code, "utf8");

console.log("✅ Красивый короткий текст помощи восстановлен");
console.log("✅ Кнопка Назад исправлена");
