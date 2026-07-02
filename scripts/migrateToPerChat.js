// ============================================================
// scripts/migrateToPerChat.js
// Миграция данных из старой структуры в per-чат модель
// data/database.json -> database.json
// Создаёт members и user_achievements таблицы
// ============================================================

const fs = require('fs');
const path = require('path');

const oldDbPath = path.join(__dirname, '../data/database.json');
const newDbPath = path.join(__dirname, '../database.json');

console.log('🔄 Начинаю миграцию в per-чат модель...\n');

// Загружаем старую базу
let oldDb;
try {
  oldDb = JSON.parse(fs.readFileSync(oldDbPath, 'utf8'));
  console.log('✅ Загружена старая база data/database.json');
} catch (err) {
  console.error('❌ Ошибка загрузки старой базы:', err.message);
  process.exit(1);
}

// Загружаем новую базу
let newDb;
try {
  const raw = fs.readFileSync(newDbPath, 'utf8');
  newDb = JSON.parse(raw);
  console.log('✅ Загружена новая база database.json');
} catch (err) {
  console.error('❌ Ошибка загрузки новой базы:', err.message);
  process.exit(1);
}

// Убеждаемся что таблицы существуют
if (!newDb.members) newDb.members = [];
if (!newDb.user_achievements) newDb.user_achievements = [];
if (!newDb.counters) newDb.counters = {};
if (!newDb.counters.members) newDb.counters.members = 0;
if (!newDb.counters.user_achievements) newDb.counters.user_achievements = 0;

let membersCreated = 0;
let membersUpdated = 0;
let achievementsMigrated = 0;

// Мигрируем пользователей из каждого чата
for (const chatId of Object.keys(oldDb.chats || {})) {
  const chat = oldDb.chats[chatId];
  console.log(`\n📋 Обработка чата ${chatId} (${chat.title || 'без названия'})`);
  
  for (const userId of Object.keys(chat.users || {})) {
    const oldUser = chat.users[userId];
    
    // Ищем существующего member
    let member = newDb.members.find(m => 
      String(m.user_id) === String(userId) && String(m.chat_id) === String(chatId)
    );
    
    if (member) {
      // Обновляем существующего
      member.message_count = oldUser.messages || 0;
      member.coins = oldUser.balance || 0;
      member.xp = oldUser.xp || 0;
      member.sticker_count = oldUser.msgTypes?.sticker || 0;
      member.last_active = new Date(oldUser.lastSeenAt || Date.now()).toISOString();
      member.joined_at = new Date(oldUser.firstSeenAt || Date.now()).toISOString();
      membersUpdated++;
      console.log(`  🔄 Обновлён member: ${userId} в чате ${chatId}`);
    } else {
      // Создаём нового member
      member = {
        id: ++newDb.counters.members,
        user_id: Number(userId),
        chat_id: Number(chatId),
        coins: oldUser.balance || 0,
        message_count: oldUser.messages || 0,
        sticker_count: oldUser.msgTypes?.sticker || 0,
        reply_count: 0,
        level: 1,
        xp: oldUser.xp || 0,
        current_streak: 0,
        last_active: new Date(oldUser.lastSeenAt || Date.now()).toISOString(),
        joined_at: new Date(oldUser.firstSeenAt || Date.now()).toISOString(),
      };
      newDb.members.push(member);
      membersCreated++;
      console.log(`  ➕ Создан member: ${userId} в чате ${chatId}`);
    }
    
    // Мигрируем достижения
    if (oldUser.achievements && typeof oldUser.achievements === 'object') {
      for (const achievementId of Object.keys(oldUser.achievements)) {
        // Проверяем, не существует ли уже
        const existing = newDb.user_achievements.find(ua =>
          String(ua.user_id) === String(userId) &&
          String(ua.chat_id) === String(chatId) &&
          ua.achievement_id === achievementId
        );
        
        if (!existing) {
          newDb.user_achievements.push({
            id: ++newDb.counters.user_achievements,
            user_id: Number(userId),
            chat_id: Number(chatId),
            achievement_id: achievementId,
            unlocked_at: new Date(oldUser.lastSeenAt || Date.now()).toISOString(),
          });
          achievementsMigrated++;
          console.log(`    🏆 Мигрировано достижение: ${achievementId}`);
        }
      }
    }
  }
}

// Сохраняем новую базу
fs.writeFileSync(newDbPath, JSON.stringify(newDb, null, 2), 'utf8');

console.log(`\n📊 Результаты миграции:`);
console.log(`   Создано members: ${membersCreated}`);
console.log(`   Обновлено members: ${membersUpdated}`);
console.log(`   Мигрировано достижений: ${achievementsMigrated}`);
console.log(`   Всего members в базе: ${newDb.members.length}`);
console.log(`   Всего user_achievements в базе: ${newDb.user_achievements.length}`);
console.log(`\n✅ Миграция завершена успешно!`);
