// ============================================================
// src/database/db.js
// Простое JSON-хранилище без native-зависимостей.
// Так проект легче запускается на Windows без ошибок better-sqlite3/node-gyp.
// ============================================================

const fs = require('fs');
const path = require('path');
require('dotenv').config();

function resolveDbPath() {
  const explicitPath = process.env.JSON_DB_PATH || process.env.DATABASE_JSON_PATH;
  if (explicitPath) return path.resolve(explicitPath);

  const legacyPath = process.env.DATABASE_URL;
  if (legacyPath && /\.json$/i.test(legacyPath) && !/^[a-z][a-z\d+.-]*:\/\//i.test(legacyPath)) {
    return path.resolve(legacyPath);
  }

  return path.resolve(path.join(__dirname, '../../data/database.json'));
}

const dbPath = resolveDbPath();

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

function toNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function timestampToIso(value) {
  if (!value) return null;
  const number = Number(value);
  const date = Number.isFinite(number)
    ? new Date(number > 100000000000 ? number : number * 1000)
    : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function mergeMemberSeed(base, candidate) {
  if (!candidate) return base;

  return {
    coins: Math.max(toNumber(base.coins), toNumber(candidate.coins)),
    message_count: Math.max(toNumber(base.message_count), toNumber(candidate.message_count)),
    sticker_count: Math.max(toNumber(base.sticker_count), toNumber(candidate.sticker_count)),
    reply_count: Math.max(toNumber(base.reply_count), toNumber(candidate.reply_count)),
    level: Math.max(toNumber(base.level, 1), toNumber(candidate.level, 1)),
    xp: Math.max(toNumber(base.xp), toNumber(candidate.xp)),
    joined_at: base.joined_at || candidate.joined_at || now(),
    last_active: candidate.last_active || base.last_active || now(),
  };
}

function getLegacyMemberSeed(data, userId, chatId) {
  let seed = {
    coins: 0,
    message_count: 0,
    sticker_count: 0,
    reply_count: 0,
    level: 1,
    xp: 0,
    joined_at: null,
    last_active: null,
  };

  const legacyChatUser = data.chats?.[String(chatId)]?.users?.[String(userId)];
  if (legacyChatUser) {
    seed = mergeMemberSeed(seed, {
      coins: legacyChatUser.balance || legacyChatUser.coins || 0,
      message_count: legacyChatUser.messages || legacyChatUser.messages_count || 0,
      sticker_count: legacyChatUser.msgTypes?.sticker || legacyChatUser.sticker_count || 0,
      reply_count: legacyChatUser.reply_count || 0,
      level: legacyChatUser.level || 1,
      xp: legacyChatUser.xp || 0,
      joined_at: timestampToIso(legacyChatUser.firstSeenAt) || legacyChatUser.joined_at,
      last_active: timestampToIso(legacyChatUser.lastSeenAt) || legacyChatUser.last_active,
    });
  }

  const globalUser = (data.users || []).find((u) =>
    u.chat_id !== undefined &&
    String(u.chat_id) === String(chatId) &&
    (String(u.id) === String(userId) || String(u.telegram_id) === String(userId))
  );
  if (globalUser) {
    seed = mergeMemberSeed(seed, {
      coins: globalUser.coins || 0,
      message_count: globalUser.messages_count || globalUser.message_count || 0,
      sticker_count: globalUser.sticker_count || 0,
      reply_count: globalUser.reply_count || 0,
      level: globalUser.level || 1,
      xp: globalUser.xp || 0,
      joined_at: globalUser.joined_at || globalUser.created_at,
      last_active: globalUser.last_active || globalUser.updated_at,
    });
  }

  try {
    const legacyPath = process.env.DB_PATH
      ? path.resolve(process.env.DB_PATH)
      : path.resolve(__dirname, '../../data/bot_data.json');
    if (fs.existsSync(legacyPath)) {
      const legacyData = JSON.parse(fs.readFileSync(legacyPath, 'utf8'));
      const legacyUser = (legacyData.users || []).find((u) =>
        String(u.chat_id) === String(chatId) && String(u.id) === String(userId)
      );
      if (legacyUser) {
        seed = mergeMemberSeed(seed, {
          coins: legacyUser.coins || 0,
          message_count: legacyUser.messages_count || legacyUser.message_count || 0,
          sticker_count: legacyUser.sticker_count || 0,
          reply_count: legacyUser.reply_count || 0,
          level: legacyUser.level || 1,
          xp: legacyUser.xp || 0,
          joined_at: legacyUser.joined_at,
          last_active: legacyUser.last_active,
        });
      }
    }
  } catch {}

  return seed;
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
  
  // Если inventory ещё в старом формате (массив ID), конвертируем
  if (user.inventory && Array.isArray(user.inventory) && user.inventory.length > 0) {
    const firstItem = user.inventory[0];
    if (typeof firstItem === 'string') {
      // Конвертируем в новый формат [{id, qty}]
      const oldInventory = user.inventory;
      const newInventory = {};
      for (const id of oldInventory) {
        newInventory[id] = (newInventory[id] || 0) + 1;
      }
      user.inventory = Object.entries(newInventory).map(([id, qty]) => ({ id, qty }));
      saveDb(data);
    }
  }
  
  return user.inventory || [];
}

function addToInventory(telegramId, itemId) {
  const data = loadDb();
  const user = data.users.find((u) => String(u.telegram_id) === String(telegramId));
  if (!user) return;
  if (!user.inventory) user.inventory = [];
  
  // Конвертируем если в старом формате
  if (user.inventory.length > 0 && typeof user.inventory[0] === 'string') {
    const oldInventory = user.inventory;
    const newInventory = {};
    for (const id of oldInventory) {
      newInventory[id] = (newInventory[id] || 0) + 1;
    }
    user.inventory = Object.entries(newInventory).map(([id, qty]) => ({ id, qty }));
  }
  
  // Добавляем или увеличиваем qty
  const existing = user.inventory.find(i => i.id === itemId);
  if (existing) {
    existing.qty++;
  } else {
    user.inventory.push({ id: itemId, qty: 1 });
  }
  
  saveDb(data);
}

function removeFromInventory(telegramId, itemId, qty = 1) {
  const data = loadDb();
  const user = data.users.find((u) => String(u.telegram_id) === String(telegramId));
  if (!user || !user.inventory) return;
  
  // Конвертируем если в старом формате
  if (user.inventory.length > 0 && typeof user.inventory[0] === 'string') {
    const oldInventory = user.inventory;
    const newInventory = {};
    for (const id of oldInventory) {
      newInventory[id] = (newInventory[id] || 0) + 1;
    }
    user.inventory = Object.entries(newInventory).map(([id, qty]) => ({ id, qty }));
  }
  
  const existing = user.inventory.find(i => i.id === itemId);
  if (existing) {
    existing.qty -= qty;
    if (existing.qty <= 0) {
      user.inventory = user.inventory.filter(i => i.id !== itemId);
    }
  }
  
  saveDb(data);
}

function hasInventoryItem(telegramId, itemId) {
  const inventory = getInventory(telegramId);
  return inventory.some(i => (typeof i === 'string' ? i === itemId : i.id === itemId));
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
  
  // Применяем легендарный бонус +10%
  let finalAmount = amount;
  if (user.legendaryBonus) {
    finalAmount = Math.floor(amount * 1.1);
  }
  
  user.coins = (user.coins || 0) + finalAmount;
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
  const seed = getLegacyMemberSeed(data, userId, chatId);
  let member = data.members.find(m => 
    String(m.user_id) === String(userId) && String(m.chat_id) === String(chatId)
  );

  if (member) {
    member.coins = Math.max(toNumber(member.coins), toNumber(seed.coins));
    member.message_count = Math.max(toNumber(member.message_count), toNumber(seed.message_count));
    member.sticker_count = Math.max(toNumber(member.sticker_count), toNumber(seed.sticker_count));
    member.reply_count = Math.max(toNumber(member.reply_count), toNumber(seed.reply_count));
    member.level = Math.max(toNumber(member.level, 1), toNumber(seed.level, 1));
    member.xp = Math.max(toNumber(member.xp), toNumber(seed.xp));
    member.joined_at = member.joined_at || seed.joined_at || now();
    member.last_active = now();
  } else {
    member = {
      id: nextId(data, 'members'),
      user_id: userId,
      chat_id: chatId,
      coins: seed.coins || 0,
      message_count: seed.message_count || 0,
      sticker_count: seed.sticker_count || 0,
      reply_count: seed.reply_count || 0,
      level: seed.level || 1,
      xp: seed.xp || 0,
      current_streak: 0,
      last_active: seed.last_active || now(),
      joined_at: seed.joined_at || now(),
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

// ── Функции для иммунитетов (consumable) ───────────────────────
function hasShield(telegramId, shieldType) {
  const data = loadDb();
  const user = data.users.find(u => String(u.telegram_id) === String(telegramId));
  const field = shieldType === 'warn' ? 'warnShieldActive' : 'muteShieldActive';
  return !!(user && user[field]);
}

function consumeShield(telegramId, shieldType) {
  const data = loadDb();
  const user = data.users.find(u => String(u.telegram_id) === String(telegramId));
  const field = shieldType === 'warn' ? 'warnShieldActive' : 'muteShieldActive';
  if (user) {
    user[field] = false;
    user.updated_at = now();
    saveDb(data);
  }
}

function setShield(telegramId, shieldType, value) {
  const data = loadDb();
  const user = data.users.find(u => String(u.telegram_id) === String(telegramId));
  const field = shieldType === 'warn' ? 'warnShieldActive' : 'muteShieldActive';
  if (user) {
    user[field] = value;
    user.updated_at = now();
    saveDb(data);
  }
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
  removeFromInventory,
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
  // Функции для иммунитетов (consumable)
  hasShield,
  consumeShield,
  setShield,
};
