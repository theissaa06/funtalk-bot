// ============================================================
// src/database/db.js
// Простое JSON-хранилище без native-зависимостей.
// Так проект легче запускается на Windows без ошибок better-sqlite3/node-gyp.
// ============================================================

const fs = require('fs');
const path = require('path');
require('dotenv').config();

const dbPath = path.resolve(process.env.DATABASE_URL || path.join(__dirname, '../../data/database.json'));

const defaultData = {
  counters: {
    users: 0,
    profiles: 0,
    settings: 0,
    reports: 0,
    ai_messages: 0,
    coin_logs: 0,
    members: 0,
    user_achievements: 0,
  },
  users: [],
  profiles: [],
  settings: [],
  reports: [],
  ai_messages: [],
  coin_logs: [], // Логирование всех операций с монетами
  members: [], // Данные участников per-чат (userId + chatId)
  user_achievements: [], // Достижения per-чат (userId + chatId + achievementId)
};

function ensureDbFile() {
  const dir = path.dirname(dbPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(dbPath)) {
    fs.writeFileSync(dbPath, JSON.stringify(defaultData, null, 2), 'utf8');
  }
}

function loadDb() {
  ensureDbFile();
  try {
    const raw = fs.readFileSync(dbPath, 'utf8');
    const data = JSON.parse(raw || '{}');
    return {
      ...defaultData,
      ...data,
      counters: { ...defaultData.counters, ...(data.counters || {}) },
      users: Array.isArray(data.users) ? data.users : [],
      profiles: Array.isArray(data.profiles) ? data.profiles : [],
      settings: Array.isArray(data.settings) ? data.settings : [],
      reports: Array.isArray(data.reports) ? data.reports : [],
      ai_messages: Array.isArray(data.ai_messages) ? data.ai_messages : [],
      coin_logs: Array.isArray(data.coin_logs) ? data.coin_logs : [],
      members: Array.isArray(data.members) ? data.members : [],
      user_achievements: Array.isArray(data.user_achievements) ? data.user_achievements : [],
    };
  } catch (error) {
    console.error('[DB] Файл базы повреждён. Создаю новый database.json:', error.message);
    fs.writeFileSync(dbPath, JSON.stringify(defaultData, null, 2), 'utf8');
    return JSON.parse(JSON.stringify(defaultData));
  }
}

function saveDb(data) {
  fs.writeFileSync(dbPath, JSON.stringify(data, null, 2), 'utf8');
}

function now() {
  return new Date().toISOString();
}

function nextId(data, table) {
  data.counters[table] = (data.counters[table] || 0) + 1;
  return data.counters[table];
}

function clone(value) {
  return value ? JSON.parse(JSON.stringify(value)) : value;
}

function upsertUser(telegramId, username, firstName) {
  const data = loadDb();
  let user = data.users.find((u) => String(u.telegram_id) === String(telegramId));

  if (user) {
    user.username = username || null;
    user.first_name = firstName || null;
    user.updated_at = now();
  } else {
    user = {
      id: nextId(data, 'users'),
      telegram_id: telegramId,
      username: username || null,
      first_name: firstName || null,
      created_at: now(),
      updated_at: now(),
    };
    data.users.push(user);
  }

  saveDb(data);
  return clone(user);
}

function upsertSettings(userId) {
  const data = loadDb();
  let settings = data.settings.find((s) => s.user_id === userId);

  if (!settings) {
    settings = {
      id: nextId(data, 'settings'),
      user_id: userId,
      language: 'ru',
      style: 'friendly',
      meme_topic: 'all',
      notifications_enabled: 1,
      ai_mode: 'general',
      created_at: now(),
      updated_at: now(),
    };
    data.settings.push(settings);
    saveDb(data);
  }

  return clone(settings);
}

const allowedSettingFields = new Set([
  'language',
  'style',
  'meme_topic',
  'notifications_enabled',
  'ai_mode',
]);

function updateSetting(userId, field, value) {
  if (!allowedSettingFields.has(field)) {
    throw new Error(`Недопустимое поле настроек: ${field}`);
  }

  const data = loadDb();
  let settings = data.settings.find((s) => s.user_id === userId);
  if (!settings) {
    settings = upsertSettings(userId);
    const freshData = loadDb();
    settings = freshData.settings.find((s) => s.user_id === userId);
    settings[field] = value;
    settings.updated_at = now();
    saveDb(freshData);
    return;
  }

  settings[field] = value;
  settings.updated_at = now();
  saveDb(data);
}

function getProfile(userId) {
  const data = loadDb();
  return clone(data.profiles.find((p) => p.user_id === userId));
}

function upsertProfile(userId, profileData) {
  const data = loadDb();
  let profile = data.profiles.find((p) => p.user_id === userId);

  if (profile) {
    Object.assign(profile, {
      name: profileData.name,
      age: profileData.age,
      city: profileData.city,
      interests: profileData.interests,
      goal: profileData.goal,
      description: profileData.description,
      is_visible: profileData.is_visible ?? 1,
      updated_at: now(),
    });
  } else {
    profile = {
      id: nextId(data, 'profiles'),
      user_id: userId,
      name: profileData.name,
      age: profileData.age,
      city: profileData.city,
      interests: profileData.interests,
      goal: profileData.goal,
      description: profileData.description,
      is_visible: profileData.is_visible ?? 1,
      created_at: now(),
      updated_at: now(),
    };
    data.profiles.push(profile);
  }

  saveDb(data);
  return clone(profile);
}

function deleteProfile(userId) {
  const data = loadDb();
  data.profiles = data.profiles.filter((p) => p.user_id !== userId);
  saveDb(data);
}

function saveReport(fromUserId, reason) {
  const data = loadDb();
  data.reports.push({
    id: nextId(data, 'reports'),
    from_user_id: fromUserId,
    reason: String(reason || '').slice(0, 1000),
    created_at: now(),
  });
  saveDb(data);
}

function saveAiMessage(userId, role, message) {
  const data = loadDb();
  data.ai_messages.push({
    id: nextId(data, 'ai_messages'),
    user_id: userId,
    role,
    message: String(message || '').slice(0, 4000),
    created_at: now(),
  });

  const userMessages = data.ai_messages
    .filter((m) => m.user_id === userId)
    .sort((a, b) => b.id - a.id)
    .slice(0, 10)
    .map((m) => m.id);

  data.ai_messages = data.ai_messages.filter(
    (m) => m.user_id !== userId || userMessages.includes(m.id)
  );

  saveDb(data);
}

function getAiHistory(userId) {
  const data = loadDb();
  return data.ai_messages
    .filter((m) => m.user_id === userId)
    .sort((a, b) => a.id - b.id)
    .map((m) => ({ role: m.role, message: m.message }));
}

function clearAiHistory(userId) {
  const data = loadDb();
  data.ai_messages = data.ai_messages.filter((m) => m.user_id !== userId);
  saveDb(data);
}

// ── Функции для магазина и инвентаря ────────────────────────
function getInventory(telegramId) {
  const data = loadDb();
  const user = data.users.find((u) => String(u.telegram_id) === String(telegramId));
  if (!user) return [];
  return user.inventory || [];
}

function addToInventory(telegramId, itemId) {
  const data = loadDb();
  const user = data.users.find((u) => String(u.telegram_id) === String(telegramId));
  if (!user) return;
  if (!user.inventory) user.inventory = [];
  if (!user.inventory.includes(itemId)) user.inventory.push(itemId);
  saveDb(data);
}

function getCoins(telegramId) {
  const data = loadDb();
  const user = data.users.find((u) => String(u.telegram_id) === String(telegramId));
  return user?.coins || 0;
}

function setCoins(telegramId, amount) {
  const data = loadDb();
  const user = data.users.find((u) => String(u.telegram_id) === String(telegramId));
  if (!user) return;
  user.coins = Math.max(0, amount);
  user.updated_at = now();
  saveDb(data);
}

function addCoins(telegramId, amount) {
  const data = loadDb();
  const user = data.users.find((u) => String(u.telegram_id) === String(telegramId));
  if (!user) return;
  user.coins = (user.coins || 0) + amount;
  user.updated_at = now();
  saveDb(data);
}

function removeCoins(telegramId, amount) {
  addCoins(telegramId, -amount);
}

function getActiveTitle(telegramId) {
  const data = loadDb();
  const user = data.users.find((u) => String(u.telegram_id) === String(telegramId));
  return user?.active_title || null;
}

function setActiveTitle(telegramId, titleId) {
  const data = loadDb();
  const user = data.users.find((u) => String(u.telegram_id) === String(telegramId));
  if (!user) return;
  user.active_title = titleId;
  user.updated_at = now();
  saveDb(data);
}

function hasInventoryItem(telegramId, itemId) {
  const inv = getInventory(telegramId);
  return inv.includes(itemId);
}

// ── Функции для members (per-чат данные) ─────────────────────
function getMember(userId, chatId) {
  const data = loadDb();
  return clone(data.members.find(m => 
    String(m.user_id) === String(userId) && String(m.chat_id) === String(chatId)
  ));
}

function upsertMember(userId, chatId) {
  const data = loadDb();
  let member = data.members.find(m => 
    String(m.user_id) === String(userId) && String(m.chat_id) === String(chatId)
  );

  if (member) {
    member.last_active = now();
  } else {
    member = {
      id: nextId(data, 'members'),
      user_id: userId,
      chat_id: chatId,
      coins: 0,
      message_count: 0,
      sticker_count: 0,
      reply_count: 0,
      level: 1,
      xp: 0,
      current_streak: 0,
      last_active: now(),
      joined_at: now(),
    };
    data.members.push(member);
  }

  saveDb(data);
  return clone(member);
}

function incrementMemberField(userId, chatId, field, amount = 1) {
  const data = loadDb();
  const member = data.members.find(m => 
    String(m.user_id) === String(userId) && String(m.chat_id) === String(chatId)
  );
  
  if (!member) return;
  
  member[field] = (member[field] || 0) + amount;
  member.last_active = now();
  
  saveDb(data);
  return clone(member);
}

function setMemberField(userId, chatId, field, value) {
  const data = loadDb();
  const member = data.members.find(m => 
    String(m.user_id) === String(userId) && String(m.chat_id) === String(chatId)
  );
  
  if (!member) return;
  
  member[field] = value;
  member.last_active = now();
  
  saveDb(data);
  return clone(member);
}

// ── Функции для user_achievements (per-чат достижения) ─────────
function getUserAchievements(userId, chatId) {
  const data = loadDb();
  return data.user_achievements
    .filter(ua => String(ua.user_id) === String(userId) && String(ua.chat_id) === String(chatId))
    .map(ua => ua.achievement_id);
}

function grantUserAchievement(userId, chatId, achievementId) {
  const data = loadDb();
  
  // Проверяем, не выдано ли уже
  const existing = data.user_achievements.find(ua => 
    String(ua.user_id) === String(userId) && 
    String(ua.chat_id) === String(chatId) && 
    ua.achievement_id === achievementId
  );
  
  if (existing) return false;
  
  data.user_achievements.push({
    id: nextId(data, 'user_achievements'),
    user_id: userId,
    chat_id: chatId,
    achievement_id: achievementId,
    unlocked_at: now(),
  });
  
  saveDb(data);
  return true;
}

function hasUserAchievement(userId, chatId, achievementId) {
  const data = loadDb();
  return data.user_achievements.some(ua => 
    String(ua.user_id) === String(userId) && 
    String(ua.chat_id) === String(chatId) && 
    ua.achievement_id === achievementId
  );
}

module.exports = {
  dbPath,
  loadDb,
  saveDb,
  now,
  upsertUser,
  upsertSettings,
  updateSetting,
  getProfile,
  upsertProfile,
  deleteProfile,
  saveReport,
  saveAiMessage,
  getAiHistory,
  clearAiHistory,
  // Функции магазина
  getInventory,
  addToInventory,
  getCoins,
  setCoins,
  addCoins,
  removeCoins,
  getActiveTitle,
  setActiveTitle,
  hasInventoryItem,
  // Функции для members (per-чат)
  getMember,
  upsertMember,
  incrementMemberField,
  setMemberField,
  // Функции для user_achievements (per-чат)
  getUserAchievements,
  grantUserAchievement,
  hasUserAchievement,
};
