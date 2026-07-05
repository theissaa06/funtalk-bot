const fs = require('fs');
const path = require('path');
const { clone } = require('../storage/jsonFileStore');
const { nowIso } = require('../format');

function nextId(data, counterName) {
  data.counters[counterName] = (data.counters[counterName] || 0) + 1;
  return data.counters[counterName];
}

function sameId(left, right) {
  return String(left) === String(right);
}

function compactUser(user = {}) {
  return {
    telegramId: Number(user.id || user.telegramId),
    username: user.username || null,
    firstName: user.first_name || user.firstName || null,
    lastName: user.last_name || user.lastName || null,
    isBot: Boolean(user.is_bot || user.isBot),
  };
}

function readJsonFile(filePath) {
  try {
    const fullPath = path.resolve(filePath);
    if (!fs.existsSync(fullPath)) return null;
    return JSON.parse(fs.readFileSync(fullPath, 'utf8'));
  } catch {
    return null;
  }
}

function legacyUserFromChatUser(chatId, user = {}) {
  const telegramId = Number(user.id || user.telegramId || user.telegram_id);
  if (!telegramId) return null;
  const warnings = Array.isArray(user.warns)
    ? user.warns.length
    : Array.isArray(user.warnings)
      ? user.warnings.length
      : Number(user.warnings || 0);
  return {
    chatId: Number(chatId),
    telegramId,
    username: user.username || null,
    firstName: user.firstName || user.first_name || null,
    lastName: user.lastName || user.last_name || null,
    coins: Number(user.coins ?? user.balance ?? 0),
    xp: Number(user.xp || 0),
    level: Number(user.level || 1),
    inventory: user.inventory,
    achievements: user.achievements,
    messageCount: Number(user.messages ?? user.messages_count ?? user.messageCount ?? 0),
    warnings,
    status: user.status || 'active',
    joinedAt: user.joined_at || user.firstSeenAt ? new Date(user.joined_at || user.firstSeenAt).toISOString() : nowIso(),
    lastActive: user.last_active || user.lastSeenAt ? new Date(user.last_active || user.lastSeenAt).toISOString() : nowIso(),
  };
}

function collectLegacyRows(legacyPaths = []) {
  const chats = [];
  const users = [];

  for (const legacyPath of legacyPaths) {
    const data = readJsonFile(legacyPath);
    if (!data) continue;

    if (data.chats && !Array.isArray(data.chats)) {
      for (const [chatId, chat] of Object.entries(data.chats)) {
        chats.push({
          chatId: Number(chatId),
          title: chat.title || null,
          type: chat.type || 'group',
        });
        for (const user of Object.values(chat.users || {})) {
          const row = legacyUserFromChatUser(chatId, user);
          if (row) users.push(row);
        }
      }
    }

    if (Array.isArray(data.chats)) {
      for (const chat of data.chats) {
        if (!chat.chatId && !chat.id) continue;
        chats.push({
          chatId: Number(chat.chatId || chat.id),
          title: chat.title || chat.name || null,
          type: chat.type || 'group',
        });
      }
    }

    if (Array.isArray(data.users)) {
      for (const user of data.users) {
        const chatId = user.chat_id || user.chatId || null;
        const row = legacyUserFromChatUser(chatId, {
          ...user,
          id: user.id || user.telegram_id || user.telegramId,
          firstName: user.first_name || user.firstName,
          lastName: user.last_name || user.lastName,
          messages_count: user.messages_count || user.messageCount,
        });
        if (row) users.push(row);
      }
    }
  }

  return { chats, users };
}

function normalizeInventory(inventory) {
  if (!Array.isArray(inventory)) return [];
  const map = new Map();
  for (const item of inventory) {
    const id = typeof item === 'string' ? item : item?.id;
    const qty = typeof item === 'string' ? 1 : Math.max(1, Number(item?.qty) || 1);
    if (!id) continue;
    map.set(id, (map.get(id) || 0) + qty);
  }
  return [...map.entries()].map(([id, qty]) => ({ id, qty }));
}

function normalizeAchievements(achievements) {
  if (!achievements) return [];
  if (Array.isArray(achievements)) {
    return achievements
      .map(item => (typeof item === 'string' ? { id: item } : item))
      .filter(item => item?.id)
      .map(item => ({
        id: String(item.id),
        grantedAt: item.grantedAt || item.createdAt || nowIso(),
      }));
  }
  if (typeof achievements === 'object') {
    return Object.keys(achievements).map(id => ({
      id,
      grantedAt: achievements[id]?.grantedAt || achievements[id]?.createdAt || nowIso(),
    }));
  }
  return [];
}

function defaultEconomyUser(telegramId, seed = {}, legacy = {}) {
  return {
    telegramId: Number(telegramId),
    coins: Number(seed.coins ?? legacy.coins ?? 0),
    premiumCoins: Number(seed.premiumCoins ?? legacy.premiumCoins ?? 0),
    xp: Number(seed.xp ?? legacy.xp ?? 0),
    level: Number(seed.level ?? legacy.level ?? 1),
    inventory: normalizeInventory(seed.inventory || legacy.inventory),
    activeBadge: legacy.activeBadge || seed.activeBadge || null,
    activeTitle: legacy.activeTitle || seed.activeTitle || null,
    achievements: normalizeAchievements(seed.achievements || legacy.achievements),
    achievementStats: { ...(legacy.achievementStats || {}), ...(seed.achievementStats || {}) },
    daily: {
      lastClaimAt: null,
      streak: 0,
      ...(legacy.daily || {}),
      ...(seed.daily || {}),
    },
    effects: { ...(legacy.effects || {}), ...(seed.effects || {}) },
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
}

class UsersRepository {
  constructor(store) {
    this.store = store;
  }

  upsertTelegramUser(from) {
    const input = compactUser(from);
    if (!input.telegramId) return null;
    return this.store.mutate(data => {
      let user = data.users.find(item => sameId(item.telegramId, input.telegramId));
      if (!user) {
        user = {
          id: nextId(data, 'users'),
          ...input,
          supportMode: false,
          createdAt: nowIso(),
          updatedAt: nowIso(),
        };
        data.users.push(user);
      } else {
        Object.assign(user, {
          username: input.username || user.username || null,
          firstName: input.firstName || user.firstName || null,
          lastName: input.lastName || user.lastName || null,
          isBot: input.isBot,
          updatedAt: nowIso(),
        });
      }
      return user;
    });
  }

  getByTelegramId(telegramId) {
    const data = this.store.read();
    return clone(data.users.find(user => sameId(user.telegramId, telegramId)) || null);
  }

  findByUsername(username) {
    const needle = String(username || '').replace(/^@/, '').toLowerCase();
    const data = this.store.read();
    return clone(data.users.find(user => user.username && user.username.toLowerCase() === needle) || null);
  }

  setSupportMode(telegramId, enabled) {
    return this.store.mutate(data => {
      const user = data.users.find(item => sameId(item.telegramId, telegramId));
      if (!user) return null;
      user.supportMode = Boolean(enabled);
      user.updatedAt = nowIso();
      return user;
    });
  }

  migrateLegacyUsers(legacyUsers = []) {
    return this.store.mutate(data => {
      let migrated = 0;
      for (const legacy of legacyUsers) {
        if (!legacy.telegramId) continue;
        let user = data.users.find(item => sameId(item.telegramId, legacy.telegramId));
        if (!user) {
          user = {
            id: nextId(data, 'users'),
            telegramId: Number(legacy.telegramId),
            username: legacy.username || null,
            firstName: legacy.firstName || null,
            lastName: legacy.lastName || null,
            isBot: false,
            supportMode: false,
            createdAt: nowIso(),
            updatedAt: nowIso(),
          };
          data.users.push(user);
          migrated += 1;
        } else {
          user.username = user.username || legacy.username || null;
          user.firstName = user.firstName || legacy.firstName || null;
          user.lastName = user.lastName || legacy.lastName || null;
        }
      }
      return migrated;
    });
  }
}

class UiRepository {
  constructor(store) {
    this.store = store;
  }

  isReplyKeyboardClean(chatId, telegramId = null) {
    const data = this.store.read();
    return (data.uiCleanup || []).some(row =>
      sameId(row.chatId, chatId) && sameId(row.telegramId || 0, telegramId || 0)
    );
  }

  markReplyKeyboardClean(chatId, telegramId = null) {
    return this.store.mutate(data => {
      data.uiCleanup = data.uiCleanup || [];
      let row = data.uiCleanup.find(item =>
        sameId(item.chatId, chatId) && sameId(item.telegramId || 0, telegramId || 0)
      );
      if (!row) {
        row = {
          chatId,
          telegramId: telegramId || null,
          cleanedAt: nowIso(),
        };
        data.uiCleanup.push(row);
      } else {
        row.cleanedAt = nowIso();
      }
      return row;
    });
  }
}

class ChatsRepository {
  constructor(store, legacyPaths = []) {
    this.store = store;
    this.legacyPaths = legacyPaths;
  }

  upsertChat(chat) {
    if (!chat?.id) return null;
    return this.store.mutate(data => {
      let row = data.chats.find(item => sameId(item.chatId, chat.id));
      if (!row) {
        row = {
          id: nextId(data, 'chats'),
          chatId: chat.id,
          type: chat.type || 'unknown',
          title: chat.title || chat.username || null,
          settings: {
            greetingsEnabled: true,
            captchaEnabled: false,
            fridayMemesEnabled: false,
            autoDownloaderEnabled: false,
            activityRewardsEnabled: true,
          },
          createdAt: nowIso(),
          updatedAt: nowIso(),
        };
        data.chats.push(row);
      } else {
        row.type = chat.type || row.type;
        row.title = chat.title || chat.username || row.title || null;
        row.updatedAt = nowIso();
      }
      return row;
    });
  }

  getSettings(chatId) {
    const data = this.store.read();
    const chat = data.chats.find(item => sameId(item.chatId, chatId));
    return clone(chat?.settings || {});
  }

  listChats() {
    const data = this.store.read();
    return clone(data.chats || []);
  }

  updateSetting(chatId, key, value) {
    return this.store.mutate(data => {
      const chat = data.chats.find(item => sameId(item.chatId, chatId));
      if (!chat) return null;
      chat.settings = chat.settings || {};
      chat.settings[key] = value;
      chat.updatedAt = nowIso();
      return chat.settings;
    });
  }

  migrateLegacyChats(legacyChats = []) {
    return this.store.mutate(data => {
      let migrated = 0;
      for (const legacy of legacyChats) {
        if (!legacy.chatId || data.chats.some(item => sameId(item.chatId, legacy.chatId))) continue;
        data.chats.push({
          id: nextId(data, 'chats'),
          chatId: Number(legacy.chatId),
          type: legacy.type || 'group',
          title: legacy.title || null,
          settings: {
            greetingsEnabled: true,
            captchaEnabled: false,
            fridayMemesEnabled: false,
            autoDownloaderEnabled: false,
            activityRewardsEnabled: true,
          },
          createdAt: nowIso(),
          updatedAt: nowIso(),
        });
        migrated += 1;
      }
      return migrated;
    });
  }
}

class EconomyRepository {
  constructor(store, legacyPaths = []) {
    this.store = store;
    this.legacyPaths = legacyPaths;
  }

  ensureUser(telegramId, seed = {}) {
    if (!telegramId) return null;
    return this.store.mutate(data => {
      let user = data.users.find(item => sameId(item.telegramId, telegramId));
      if (!user) {
        const legacy = this.readLegacyEconomy(telegramId);
        user = defaultEconomyUser(telegramId, seed, legacy);
        data.users.push(user);
      } else {
        user.inventory = normalizeInventory(user.inventory);
        user.achievements = normalizeAchievements(user.achievements);
        user.achievementStats = user.achievementStats || {};
        user.effects = user.effects || {};
        user.daily = user.daily || { lastClaimAt: null, streak: 0 };
      }
      return user;
    });
  }

  getUser(telegramId) {
    this.ensureUser(telegramId);
    const data = this.store.read();
    return clone(data.users.find(user => sameId(user.telegramId, telegramId)) || null);
  }

  getCoins(telegramId) {
    return this.getUser(telegramId)?.coins || 0;
  }

  addCoins(telegramId, amount, meta = {}) {
    const value = Number(amount) || 0;
    return this.store.mutate(data => {
      let user = data.users.find(item => sameId(item.telegramId, telegramId));
      if (!user) {
        user = defaultEconomyUser(telegramId);
        data.users.push(user);
      }
      user.coins = Math.max(0, (Number(user.coins) || 0) + value);
      user.updatedAt = nowIso();
      data.transactions.push({
        id: nextId(data, 'transactions'),
        telegramId: Number(telegramId),
        amount: value,
        balanceAfter: user.coins,
        type: meta.type || 'manual',
        reason: meta.reason || null,
        byTelegramId: meta.byTelegramId || null,
        chatId: meta.chatId || null,
        createdAt: nowIso(),
      });
      return user;
    });
  }

  getAchievementStat(telegramId, key) {
    const user = this.getUser(telegramId);
    return Number(user?.achievementStats?.[key]) || 0;
  }

  incrementAchievementStat(telegramId, key, amount = 1) {
    return this.store.mutate(data => {
      let user = data.users.find(item => sameId(item.telegramId, telegramId));
      if (!user) {
        user = defaultEconomyUser(telegramId);
        data.users.push(user);
      }
      user.achievementStats = user.achievementStats || {};
      user.achievementStats[key] = (Number(user.achievementStats[key]) || 0) + Number(amount || 0);
      user.updatedAt = nowIso();
      return user.achievementStats[key];
    });
  }

  listAchievements(telegramId) {
    const user = this.getUser(telegramId);
    return normalizeAchievements(user?.achievements);
  }

  hasAchievement(telegramId, achievementId) {
    return this.listAchievements(telegramId).some(item => item.id === achievementId);
  }

  grantAchievement(telegramId, achievementId) {
    return this.store.mutate(data => {
      let user = data.users.find(item => sameId(item.telegramId, telegramId));
      if (!user) {
        user = defaultEconomyUser(telegramId);
        data.users.push(user);
      }
      user.achievements = normalizeAchievements(user.achievements);
      if (user.achievements.some(item => item.id === achievementId)) return null;
      const grant = { id: achievementId, grantedAt: nowIso() };
      user.achievements.push(grant);
      user.updatedAt = nowIso();
      return grant;
    });
  }

  transferCoins(fromTelegramId, toTelegramId, amount, meta = {}) {
    const value = Math.max(0, Number(amount) || 0);
    if (!value) return { ok: false, error: 'Сумма должна быть больше нуля.' };
    const from = this.getUser(fromTelegramId);
    if ((from?.coins || 0) < value) return { ok: false, error: 'Недостаточно FunMoney.' };
    this.addCoins(fromTelegramId, -value, { ...meta, type: meta.type || 'transfer_out' });
    this.addCoins(toTelegramId, value, { ...meta, type: meta.type || 'transfer_in' });
    return { ok: true };
  }

  setDailyClaim(telegramId, bonus, claimedAt = new Date()) {
    return this.store.mutate(data => {
      const user = data.users.find(item => sameId(item.telegramId, telegramId));
      if (!user) return null;
      const last = user.daily?.lastClaimAt ? new Date(user.daily.lastClaimAt) : null;
      const dayMs = 24 * 60 * 60 * 1000;
      const streak = last && claimedAt - last < dayMs * 2 ? (Number(user.daily.streak) || 0) + 1 : 1;
      user.daily = {
        lastClaimAt: claimedAt.toISOString(),
        streak,
      };
      user.coins = Math.max(0, (Number(user.coins) || 0) + Number(bonus || 0));
      user.updatedAt = nowIso();
      data.transactions.push({
        id: nextId(data, 'transactions'),
        telegramId: Number(telegramId),
        amount: Number(bonus || 0),
        balanceAfter: user.coins,
        type: 'daily',
        reason: `daily streak ${streak}`,
        byTelegramId: null,
        chatId: null,
        createdAt: nowIso(),
      });
      return user;
    });
  }

  resetDailyCooldown(telegramId) {
    return this.store.mutate(data => {
      const user = data.users.find(item => sameId(item.telegramId, telegramId));
      if (!user) return null;
      user.daily = user.daily || {};
      user.daily.lastClaimAt = null;
      user.updatedAt = nowIso();
      return user;
    });
  }

  addXp(telegramId, amount) {
    return this.store.mutate(data => {
      const user = data.users.find(item => sameId(item.telegramId, telegramId));
      if (!user) return null;
      user.xp = (Number(user.xp) || 0) + Math.max(0, Number(amount) || 0);
      user.level = Math.max(1, Math.floor(user.xp / 100) + 1);
      user.updatedAt = nowIso();
      return user;
    });
  }

  addInventoryItem(telegramId, itemId, qty = 1) {
    return this.store.mutate(data => {
      const user = data.users.find(item => sameId(item.telegramId, telegramId));
      if (!user) return null;
      user.inventory = normalizeInventory(user.inventory);
      const existing = user.inventory.find(item => item.id === itemId);
      if (existing) existing.qty += Math.max(1, Number(qty) || 1);
      else user.inventory.push({ id: itemId, qty: Math.max(1, Number(qty) || 1) });
      user.updatedAt = nowIso();
      return user.inventory;
    });
  }

  removeInventoryItem(telegramId, itemId, qty = 1) {
    return this.store.mutate(data => {
      const user = data.users.find(item => sameId(item.telegramId, telegramId));
      if (!user) return false;
      user.inventory = normalizeInventory(user.inventory);
      const existing = user.inventory.find(item => item.id === itemId);
      if (!existing || existing.qty < qty) return false;
      existing.qty -= qty;
      user.inventory = user.inventory.filter(item => item.qty > 0);
      user.updatedAt = nowIso();
      return true;
    });
  }

  hasInventoryItem(telegramId, itemId) {
    const user = this.getUser(telegramId);
    return normalizeInventory(user?.inventory).some(item => item.id === itemId && item.qty > 0);
  }

  setActiveCosmetic(telegramId, type, itemId) {
    return this.store.mutate(data => {
      const user = data.users.find(item => sameId(item.telegramId, telegramId));
      if (!user) return null;
      if (type === 'badge') user.activeBadge = itemId;
      if (type === 'title') user.activeTitle = itemId;
      user.updatedAt = nowIso();
      return user;
    });
  }

  topByCoins(limit = 10) {
    const data = this.store.read();
    return clone([...data.users]
      .filter(user => (Number(user.coins) || 0) > 0)
      .sort((left, right) => (Number(right.coins) || 0) - (Number(left.coins) || 0))
      .slice(0, limit));
  }

  migrateLegacyUsers(legacyUsers = []) {
    return this.store.mutate(data => {
      let migrated = 0;
      for (const legacy of legacyUsers) {
        if (!legacy.telegramId) continue;
        let user = data.users.find(item => sameId(item.telegramId, legacy.telegramId));
        if (!user) {
          user = defaultEconomyUser(legacy.telegramId, legacy, legacy);
          data.users.push(user);
          migrated += 1;
        } else {
          user.username = user.username || legacy.username || null;
          user.firstName = user.firstName || legacy.firstName || null;
          user.lastName = user.lastName || legacy.lastName || null;
          user.inventory = normalizeInventory(user.inventory?.length ? user.inventory : legacy.inventory);
          user.achievements = normalizeAchievements(user.achievements?.length ? user.achievements : legacy.achievements);
          user.xp = Math.max(Number(user.xp) || 0, Number(legacy.xp) || 0);
          user.level = Math.max(Number(user.level) || 1, Number(legacy.level) || 1);
          if ((Number(user.coins) || 0) === 0 && Number(legacy.coins) > 0) user.coins = Number(legacy.coins);
          user.updatedAt = nowIso();
        }
      }
      return migrated;
    });
  }

  readLegacyEconomy(telegramId) {
    for (const legacyPath of this.legacyPaths) {
      try {
        const fullPath = path.resolve(legacyPath);
        if (!fs.existsSync(fullPath)) continue;
        const data = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
        const user = (data.users || []).find(item => sameId(item.telegram_id || item.id, telegramId));
        if (user) {
          return {
            coins: user.coins,
            xp: user.xp,
            level: user.level,
            inventory: user.inventory,
            achievements: user.achievements,
            achievementStats: user.achievementStats,
            activeBadge: user.active_badge || user.activeBadge,
            activeTitle: user.active_title || user.activeTitle,
          };
        }
      } catch {}
    }
    return {};
  }
}

class ModerationRepository {
  constructor(store, legacyPaths = []) {
    this.store = store;
    this.legacyPaths = legacyPaths;
  }

  upsertMember(chatId, user) {
    const input = compactUser(user);
    if (!chatId || !input.telegramId) return null;
    return this.store.mutate(data => {
      let member = data.members.find(item => sameId(item.chatId, chatId) && sameId(item.telegramId, input.telegramId));
      if (!member) {
        member = {
          id: nextId(data, 'members'),
          chatId,
          telegramId: input.telegramId,
          username: input.username,
          firstName: input.firstName,
          lastName: input.lastName,
          messageCount: 0,
          xp: 0,
          level: 1,
          warnings: 0,
          status: 'active',
          shields: {},
          joinedAt: nowIso(),
          lastActive: nowIso(),
        };
        data.members.push(member);
      } else {
        member.username = input.username || member.username || null;
        member.firstName = input.firstName || member.firstName || null;
        member.lastName = input.lastName || member.lastName || null;
        member.lastActive = nowIso();
      }
      return member;
    });
  }

  recordMessage(chatId, user, xp = 1) {
    return this.store.mutate(data => {
      const input = compactUser(user);
      let member = data.members.find(item => sameId(item.chatId, chatId) && sameId(item.telegramId, input.telegramId));
      if (!member) {
        member = {
          id: nextId(data, 'members'),
          chatId,
          telegramId: input.telegramId,
          username: input.username,
          firstName: input.firstName,
          lastName: input.lastName,
          messageCount: 0,
          xp: 0,
          level: 1,
          warnings: 0,
          status: 'active',
          shields: {},
          joinedAt: nowIso(),
          lastActive: nowIso(),
        };
        data.members.push(member);
      }
      member.messageCount += 1;
      member.xp += Math.max(0, Number(xp) || 0);
      member.level = Math.max(1, Math.floor(member.xp / 100) + 1);
      member.lastActive = nowIso();
      return member;
    });
  }

  findMember(chatId, query) {
    const needle = String(query || '').replace(/^@/, '').toLowerCase();
    const data = this.store.read();
    const members = data.members.filter(item => sameId(item.chatId, chatId));
    if (/^-?\d+$/.test(needle)) {
      const byId = members.find(item => sameId(item.telegramId, needle));
      if (byId) return clone(byId);
    }
    return clone(members.find(item => item.username && item.username.toLowerCase() === needle) || null);
  }

  getMember(chatId, telegramId) {
    const data = this.store.read();
    return clone(data.members.find(item => sameId(item.chatId, chatId) && sameId(item.telegramId, telegramId)) || null);
  }

  addWarning(chatId, telegramId, reason, byTelegramId) {
    return this.store.mutate(data => {
      const member = data.members.find(item => sameId(item.chatId, chatId) && sameId(item.telegramId, telegramId));
      if (member?.shields?.warn) {
        member.shields.warn = false;
        this.pushLog(data, chatId, telegramId, 'warn_blocked', 'Щит от варна', byTelegramId);
        return { blocked: true, warnings: member.warnings || 0 };
      }

      data.warnings.push({
        id: nextId(data, 'warnings'),
        chatId,
        telegramId: Number(telegramId),
        reason: reason || 'нарушение правил',
        byTelegramId: byTelegramId || null,
        active: true,
        createdAt: nowIso(),
      });
      if (member) {
        member.warnings = (Number(member.warnings) || 0) + 1;
        member.lastActive = nowIso();
      }
      this.pushLog(data, chatId, telegramId, 'warn', reason, byTelegramId);
      return { blocked: false, warnings: member?.warnings || this.countWarningsRaw(data, chatId, telegramId) };
    });
  }

  removeWarning(chatId, telegramId, count = 1, byTelegramId = null) {
    return this.store.mutate(data => {
      let left = Math.max(1, Number(count) || 1);
      for (const warning of data.warnings) {
        if (!left) break;
        if (warning.active && sameId(warning.chatId, chatId) && sameId(warning.telegramId, telegramId)) {
          warning.active = false;
          warning.closedAt = nowIso();
          warning.closedByTelegramId = byTelegramId;
          left -= 1;
        }
      }
      const member = data.members.find(item => sameId(item.chatId, chatId) && sameId(item.telegramId, telegramId));
      if (member) member.warnings = this.countWarningsRaw(data, chatId, telegramId);
      this.pushLog(data, chatId, telegramId, 'warn_removed', `${count - left} предупреждений`, byTelegramId);
      return { removed: count - left, warnings: member?.warnings || 0 };
    });
  }

  clearWarnings(chatId, telegramId, byTelegramId = null) {
    return this.store.mutate(data => {
      let removed = 0;
      for (const warning of data.warnings) {
        if (warning.active && sameId(warning.chatId, chatId) && sameId(warning.telegramId, telegramId)) {
          warning.active = false;
          warning.closedAt = nowIso();
          warning.closedByTelegramId = byTelegramId;
          removed += 1;
        }
      }
      const member = data.members.find(item => sameId(item.chatId, chatId) && sameId(item.telegramId, telegramId));
      if (member) member.warnings = 0;
      this.pushLog(data, chatId, telegramId, 'warns_cleared', `${removed} предупреждений`, byTelegramId);
      return { removed };
    });
  }

  countWarnings(chatId, telegramId) {
    const data = this.store.read();
    return this.countWarningsRaw(data, chatId, telegramId);
  }

  setShield(chatId, telegramId, shieldType, enabled = true) {
    return this.store.mutate(data => {
      let member = data.members.find(item => sameId(item.chatId, chatId) && sameId(item.telegramId, telegramId));
      if (!member) {
        member = {
          id: nextId(data, 'members'),
          chatId,
          telegramId: Number(telegramId),
          username: null,
          firstName: null,
          lastName: null,
          messageCount: 0,
          xp: 0,
          level: 1,
          warnings: 0,
          status: 'active',
          shields: {},
          joinedAt: nowIso(),
          lastActive: nowIso(),
        };
        data.members.push(member);
      }
      member.shields = member.shields || {};
      member.shields[shieldType] = Boolean(enabled);
      member.lastActive = nowIso();
      return member;
    });
  }

  markAction(chatId, telegramId, action, reason, byTelegramId = null) {
    return this.store.mutate(data => {
      const member = data.members.find(item => sameId(item.chatId, chatId) && sameId(item.telegramId, telegramId));
      if (member) {
        member.status = action === 'ban' ? 'banned' : action === 'mute' ? 'muted' : 'active';
        member.lastActive = nowIso();
      }
      this.pushLog(data, chatId, telegramId, action, reason, byTelegramId);
      return member || null;
    });
  }

  latestLogs(chatId, limit = 10) {
    const data = this.store.read();
    return clone([...data.modLog]
      .filter(item => sameId(item.chatId, chatId))
      .sort((left, right) => String(right.createdAt).localeCompare(String(left.createdAt)))
      .slice(0, limit));
  }

  topActivity(chatId, limit = 10) {
    const data = this.store.read();
    return clone([...data.members]
      .filter(item => sameId(item.chatId, chatId))
      .sort((left, right) => (Number(right.messageCount) || 0) - (Number(left.messageCount) || 0))
      .slice(0, limit));
  }

  migrateLegacyMembers(legacyUsers = []) {
    return this.store.mutate(data => {
      let migrated = 0;
      for (const legacy of legacyUsers) {
        if (!legacy.chatId || !legacy.telegramId) continue;
        let member = data.members.find(item => sameId(item.chatId, legacy.chatId) && sameId(item.telegramId, legacy.telegramId));
        if (!member) {
          member = {
            id: nextId(data, 'members'),
            chatId: Number(legacy.chatId),
            telegramId: Number(legacy.telegramId),
            username: legacy.username || null,
            firstName: legacy.firstName || null,
            lastName: legacy.lastName || null,
            messageCount: Number(legacy.messageCount || 0),
            xp: Number(legacy.xp || 0),
            level: Number(legacy.level || 1),
            warnings: Number(legacy.warnings || 0),
            status: legacy.status || 'active',
            shields: {},
            joinedAt: legacy.joinedAt || nowIso(),
            lastActive: legacy.lastActive || nowIso(),
          };
          data.members.push(member);
          migrated += 1;
        } else {
          member.username = member.username || legacy.username || null;
          member.firstName = member.firstName || legacy.firstName || null;
          member.lastName = member.lastName || legacy.lastName || null;
          member.messageCount = Math.max(Number(member.messageCount) || 0, Number(legacy.messageCount) || 0);
          member.xp = Math.max(Number(member.xp) || 0, Number(legacy.xp) || 0);
          member.level = Math.max(Number(member.level) || 1, Number(legacy.level) || 1);
          member.warnings = Math.max(Number(member.warnings) || 0, Number(legacy.warnings) || 0);
          member.lastActive = nowIso();
        }
      }
      return migrated;
    });
  }

  setPinnedLeaderboard(chatId, messageId, type = 'activity') {
    return this.store.mutate(data => {
      data.pinnedLeaderboards = data.pinnedLeaderboards || [];
      let row = data.pinnedLeaderboards.find(item => sameId(item.chatId, chatId) && item.type === type);
      if (!row) {
        row = { chatId, type, messageId: Number(messageId), createdAt: nowIso(), updatedAt: nowIso() };
        data.pinnedLeaderboards.push(row);
      } else {
        row.messageId = Number(messageId);
        row.updatedAt = nowIso();
      }
      return row;
    });
  }

  getPinnedLeaderboard(chatId, type = 'activity') {
    const data = this.store.read();
    return clone((data.pinnedLeaderboards || []).find(item => sameId(item.chatId, chatId) && item.type === type) || null);
  }

  countWarningsRaw(data, chatId, telegramId) {
    return data.warnings.filter(item => item.active && sameId(item.chatId, chatId) && sameId(item.telegramId, telegramId)).length;
  }

  pushLog(data, chatId, telegramId, action, reason, byTelegramId) {
    data.modLog.push({
      id: nextId(data, 'modLog'),
      chatId,
      telegramId: telegramId ? Number(telegramId) : null,
      action,
      reason: reason || null,
      byTelegramId: byTelegramId || null,
      createdAt: nowIso(),
    });
  }
}

class SupportRepository {
  constructor(store) {
    this.store = store;
  }

  createTicket(fromUser, sourceChatId, text) {
    const input = compactUser(fromUser);
    return this.store.mutate(data => {
      const ticket = {
        id: nextId(data, 'supportTickets'),
        telegramId: input.telegramId,
        username: input.username,
        firstName: input.firstName,
        sourceChatId: sourceChatId || null,
        status: 'open',
        text: String(text || '').slice(0, 3000),
        createdAt: nowIso(),
        updatedAt: nowIso(),
      };
      data.supportTickets.push(ticket);
      return ticket;
    });
  }

  bindForwardedMessage(ticketId, supportChatId, messageId) {
    return this.store.mutate(data => {
      const ticket = data.supportTickets.find(item => item.id === ticketId);
      if (!ticket) return null;
      ticket.supportChatId = supportChatId;
      ticket.supportMessageId = messageId;
      ticket.updatedAt = nowIso();
      data.supportMessages.push({
        id: nextId(data, 'supportMessages'),
        ticketId,
        supportChatId,
        supportMessageId: messageId,
        createdAt: nowIso(),
      });
      return ticket;
    });
  }

  findBySupportReply(supportChatId, replyMessageId) {
    const data = this.store.read();
    return clone(data.supportTickets.find(ticket =>
      sameId(ticket.supportChatId, supportChatId) && sameId(ticket.supportMessageId, replyMessageId)
    ) || null);
  }

  close(ticketId) {
    return this.store.mutate(data => {
      const ticket = data.supportTickets.find(item => item.id === ticketId);
      if (!ticket) return null;
      ticket.status = 'closed';
      ticket.updatedAt = nowIso();
      return ticket;
    });
  }
}

function createRepositories(stores, config) {
  const legacyPaths = [
    path.join(config.dataDir, 'database.json'),
    path.join(config.dataDir, 'bot_data.json'),
    path.join(config.dataDir, '..', 'database.json'),
  ];
  const legacy = config.isTest ? { chats: [], users: [] } : collectLegacyRows(legacyPaths);
  const repos = {
    ui: new UiRepository(stores.app),
    users: new UsersRepository(stores.app),
    chats: new ChatsRepository(stores.app, legacyPaths),
    economy: new EconomyRepository(stores.economy, legacyPaths),
    moderation: new ModerationRepository(stores.moderation, legacyPaths),
    support: new SupportRepository(stores.app),
  };
  repos.chats.migrateLegacyChats(legacy.chats);
  repos.users.migrateLegacyUsers(legacy.users);
  repos.economy.migrateLegacyUsers(legacy.users);
  repos.moderation.migrateLegacyMembers(legacy.users);
  return repos;
}

module.exports = {
  createRepositories,
  normalizeInventory,
  normalizeAchievements,
  collectLegacyRows,
};
