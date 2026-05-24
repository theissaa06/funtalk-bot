const fs = require("fs");

const path = "index.js";
let code = fs.readFileSync(path, "utf8");

// Чиним сломанный блок ranks в help-меню
const start = code.indexOf("        ranks:");
const end = code.indexOf("        profile:", start);

if (start === -1 || end === -1) {
  console.error("❌ Не нашёл блок ranks/profile в help-меню");
  process.exit(1);
}

const fixedRanksBlock = `        ranks: \`👑 <b>Ранги администрации</b>

<b>Основные команды:</b>
/ranks /ранги — список рангов
/rank /ранг — посмотреть ранг
/setrank /выдатьранг — выдать ранг по уровню
/delrank /снятьранг — снять ранг
/admins /админы — список администрации

<b>Команды выдачи рангов:</b>
/владелец — 👑 Владелец
/зам — 🛡 Заместитель владельца
/га — 💎 Главный администратор
/куратор — 🔥 Куратор администрации
/са — ⚡ Старший администратор
/админ — 🧩 Администратор
/ма — 🛠 Младший администратор
/см — 👮 Старший модератор
/модер — 🧹 Модератор
/помощник — 🤝 Помощник
/стажер — 🌱 Стажёр
/юзер — 👤 Снять ранг

<b>Примеры:</b>
/админ 123456789
/модер 123456789
reply → /помощник
reply → /юзер\`,
`;

code = code.slice(0, start) + fixedRanksBlock + code.slice(end);

fs.writeFileSync(path, code, "utf8");

console.log("✅ Help-раздел рангов исправлен");
