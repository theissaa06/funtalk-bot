// ============================================================
// scripts/syncAchievements.js
// Скрипт для синхронизации пользователей с системой достижений
// Запуск: node scripts/syncAchievements.js
// ============================================================

const fs = require('fs');
const path = require('path');

// Используем ту же базу, что и бот (database.json в корне)
const dbPath = path.resolve(path.join(__dirname, '../database.json'));

console.log('🔄 Начинаю синхронизацию пользователей с системой достижений...\n');

let data;
try {
  const raw = fs.readFileSync(dbPath, 'utf8');
  data = JSON.parse(raw);
  console.log(`📁 Загружена база: ${dbPath}`);
  console.log(`👥 Пользователей в базе: ${data.users.length}\n`);
} catch (err) {
  console.error('❌ Ошибка загрузки базы:', err.message);
  process.exit(1);
}

let synced = 0;
let created = 0;
let updated = 0;

for (const user of data.users) {
  let changed = false;
  let isNew = false;
  
  // Проверяем наличие необходимых полей
  if (user.messages_count === undefined) {
    user.messages_count = 0;
    changed = true;
    isNew = true;
  }
  
  if (!user.achievements || !Array.isArray(user.achievements)) {
    user.achievements = [];
    changed = true;
    isNew = true;
  }
  
  if (user.coins === undefined) {
    user.coins = 0;
    changed = true;
    isNew = true;
  }
  
  if (changed) {
    user.updated_at = new Date().toISOString();
    if (isNew) {
      created++;
    } else {
      updated++;
    }
    synced++;
    console.log(`  ✅ Пользователь ${user.telegram_id} (@${user.username || 'no username'}) - ${isNew ? 'создан' : 'обновлён'}`);
  }
}

if (synced > 0) {
  fs.writeFileSync(dbPath, JSON.stringify(data, null, 2), 'utf8');
  console.log(`\n📊 Результаты синхронизации:`);
  console.log(`   Создано профилей: ${created}`);
  console.log(`   Обновлено профилей: ${updated}`);
  console.log(`   Всего обработано: ${synced}`);
  console.log(`   Всего пользователей в базе: ${data.users.length}`);
  console.log(`\n✅ Синхронизация завершена успешно!`);
} else {
  console.log(`✅ Все пользователи уже синхронизированы (${data.users.length} пользователей)`);
}
