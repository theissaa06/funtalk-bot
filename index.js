require('dotenv').config();

const { Telegraf, Markup } = require('telegraf');
const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const { promisify } = require('util');

const execFileAsync = promisify(execFile);

const BOT_TOKEN = process.env.BOT_TOKEN;
const BOT_USERNAME = process.env.BOT_USERNAME || 'FunTalchik_Botik';
const OWNER_ID = Number(process.env.OWNER_ID || 0);

if (!BOT_TOKEN) {
  console.error('❌ BOT_TOKEN не найден. Добавь BOT_TOKEN в .env или Railway Variables.');
  process.exit(1);
}

const bot = new Telegraf(BOT_TOKEN);

const DATA_DIR = path.join(__dirname, 'data');
const DOWNLOAD_DIR = path.join(__dirname, 'downloads');
const DB_FILE = path.join(DATA_DIR, 'database.json');

fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(DOWNLOAD_DIR, { recursive: true });

const DEFAULT_RULES = `📜 Правила чата «Клуб случайных людей»\n\n1. Не оскорблять участников.\n2. Не спамить и не флудить.\n3. Не рекламировать без разрешения.\n4. Не провоцировать конфликты.\n5. Не отправлять запрещённый контент.\n6. Уважать администрацию.\n7. Не обходить наказания.\n\n⚠️ За нарушение правил: предупреждение, мут, кик или бан.`;

const DEFAULT_DB = {
  meta: { version: '4.0.0', createdAt: new Date().toISOString() },
  chats: {}
};

function safeReadJSON(filePath, fallback) {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    const raw = fs.readFileSync(filePath, 'utf8').trim();
    if (!raw) return fallback;
    return JSON.parse(raw);
  } catch (error) {
    const backup = `${filePath}.broken.${Date.now()}.json`;
    try { fs.copyFileSync(filePath, backup); } catch {}
    console.error('❌ database.json повреждён. Создан backup:', backup);
    return fallback;
  }
}

function ensureDBFile() {
  if (!fs.existsSync(DB_FILE)) {
    fs.writeFileSync(DB_FILE, JSON.stringify(DEFAULT_DB, null, 2));
  }
}

ensureDBFile();
let dbCache = safeReadJSON(DB_FILE, DEFAULT_DB);
let saveTimer = null;

function loadDB() {
  if (!dbCache || typeof dbCache !== 'object') dbCache = structuredCloneSafe(DEFAULT_DB);
  if (!dbCache.chats) dbCache.chats = {};
  return dbCache;
}

function saveDBNow() {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(dbCache, null, 2));
  } catch (error) {
    console.error('❌ Ошибка сохранения database.json:', error);
  }
}

function saveDB() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveDBNow, 300);
}

function structuredCloneSafe(obj) {
  return JSON.parse(JSON.stringify(obj));
}

function getChatDB(chatId) {
  const db = loadDB();
  const id = String(chatId);
  if (!db.chats[id]) {
    db.chats[id] = {
      settings: {
        antispam: false,
        antilinks: false,
        antimat: false,
        welcome: true,
        goodbye: false,
        rules: DEFAULT_RULES,
        logChatId: null,
        logThreadId: null
      },
      users: {},
      admins: {},
      friendships: {},
      couples: {},
      logs: [],
      tempActions: {},
      antispam: {}
    };
  }
  const chat = db.chats[id];
  chat.settings ||= {};
  chat.settings.rules ||= DEFAULT_RULES;
  chat.settings.antispam ??= false;
  chat.settings.antilinks ??= false;
  chat.settings.antimat ??= false;
  chat.settings.welcome ??= true;
  chat.settings.goodbye ??= false;
  chat.settings.logChatId ??= null;
  chat.settings.fridayPost ??= {
    enabled: false,
    time: '18:00',
    timezone: 'Asia/Almaty',
    text: '🎉 Пятница пришла! Всем хорошего настроения и лампового общения ❤️',
    lastSentDate: null
  };
  chat.users ||= {};
  chat.admins ||= {};
  chat.friendships ||= {};
  chat.couples ||= {};
  chat.logs ||= [];
  chat.tempActions ||= {};
  chat.antispam ||= {};
  return chat;
}

function getUserDB(chat, user) {
  const id = String(user.id || user.telegram_id);
  if (!chat.users[id]) {
    chat.users[id] = {
      id: Number(id),
      firstName: user.first_name || user.firstName || '',
      username: user.username || '',
      messages: 0,
      messagesDay: {},
      xp: 0,
      balance: 0,
      coins: 0,
      reputation: 0,
      title: null,
      role: null,
      adminRank: 0,
      warnings: 0,
      warns: [],
      history: [],
      inventory: {
        vip: false,
        premium: false,
        customTitle: false,
        warnShield: 0,
        coloredProfile: false
      },
      cooldowns: { daily: 0, rep: {} },
      joinedAt: new Date().toISOString(),
      lastMessageCoinAt: 0
    };
  }
  const u = chat.users[id];
  u.firstName = user.first_name || user.firstName || u.firstName || '';
  u.username = user.username || u.username || '';
  u.messagesDay ||= {};
  u.xp ??= 0;
  u.balance ??= u.coins ?? 0;
  u.coins ??= u.balance ?? 0;
  u.reputation ??= 0;
  u.adminRank ??= 0;
  u.warnings ??= Array.isArray(u.warns) ? u.warns.length : 0;
  u.warns ||= [];
  u.history ||= [];
  u.inventory ||= { vip: false, premium: false, customTitle: false, warnShield: 0, coloredProfile: false };
  u.cooldowns ||= { daily: 0, rep: {} };
  u.cooldowns.rep ||= {};
  return u;
}

const ADMIN_RANKS = {
  100: {
    title: '👑 Владелец',
    note: 'Главный владелец беседы/бота. Полный доступ ко всем функциям.',
    muteLimit: Infinity
  },
  95: {
    title: '🛡 Заместитель владельца',
    note: 'Правая рука владельца. Может управлять почти всем, кроме владельца.',
    muteLimit: Infinity
  },
  90: {
    title: '💎 Главный администратор',
    note: 'Главный админ. Управляет администрацией ниже себя, модерацией и настройками.',
    muteLimit: Infinity
  },
  80: {
    title: '🔥 Куратор администрации',
    note: 'Следит за администрацией, логами, наказаниями и порядком в беседе.',
    muteLimit: Infinity
  },
  70: {
    title: '⚡ Старший администратор',
    note: 'Старший админ. Может банить, мутить, кикать и выдавать предупреждения.',
    muteLimit: Infinity
  },
  60: {
    title: '🧩 Администратор',
    note: 'Админ беседы. Может мутить, кикать, выдавать предупреждения и смотреть историю.',
    muteLimit: 1440
  },
  50: {
    title: '🛠 Младший администратор',
    note: 'Младший админ. Может выдавать муты до 120 минут, преды и удалять сообщения.',
    muteLimit: 120
  },
  40: {
    title: '👮 Старший модератор',
    note: 'Старший модер. Может выдавать муты до 60 минут и предупреждения.',
    muteLimit: 60
  },
  30: {
    title: '🧹 Модератор',
    note: 'Модер. Может выдавать муты до 30 минут, преды и удалять сообщения.',
    muteLimit: 30
  },
  20: {
    title: '🤝 Помощник',
    note: 'Помощник администрации. Может смотреть профили, правила, преды и помогать с порядком.',
    muteLimit: 0
  },
  10: {
    title: '🌱 Стажёр',
    note: 'Начальный ранг администрации. Может смотреть базовую информацию.',
    muteLimit: 0
  },
  0: {
    title: '👤 Пользователь',
    note: 'Обычный участник беседы без административных прав.',
    muteLimit: 0
  }
};

const RANK_COMMANDS = {
  // 100 — Владелец
  owner: 100,
  владелец: 100,

  // 95 — Заместитель владельца
  deputy: 95,
  зам: 95,
  заместитель: 95,
  замвладельца: 95,

  // 90 — Главный администратор
  headadmin: 90,
  главныйадмин: 90,
  главадмин: 90,
  га: 90,

  // 80 — Куратор администрации
  curator: 80,
  куратор: 80,
  ка: 80,

  // 70 — Старший администратор
  senioradmin: 70,
  старшийадмин: 70,
  стадмин: 70,
  са: 70,

  // 60 — Администратор
  admin: 60,
  админ: 60,
  администратор: 60,

  // 50 — Младший администратор
  junioradmin: 50,
  младшийадмин: 50,
  младший: 50,
  ма: 50,

  // 40 — Старший модератор
  seniormoder: 40,
  старшиймодер: 40,
  стмодер: 40,
  см: 40,

  // 30 — Модератор
  moder: 30,
  модер: 30,
  модератор: 30,
  мд: 30,

  // 20 — Помощник
  helper: 20,
  хелпер: 20,
  помощник: 20,
  пом: 20,

  // 10 — Стажёр
  trainee: 10,
  стажер: 10,
  стажёр: 10,
  стаж: 10,

  // 0 — Пользователь
  user: 0,
  пользователь: 0,
  юзер: 0,
  снятьранг: 0
};

const ALIASES = {
  help: ['help', 'помощь', 'commands', 'команды'],
  basedb: ['база', 'db', 'бд', 'участникибаза'],
  setup: ['setup', 'настроить', 'стартгруппа', 'startgroup'],
  rules: ['rules', 'правила'],
  setrules: ['setrules', 'установитьправила'],
  mute: ['mute', 'мут'],
  unmute: ['unmute', 'унмут'],
  ban: ['ban', 'бан'],
  unban: ['unban', 'разбан'],
  kick: ['kick', 'кик'],
  warn: ['warn', 'пред'],
  unwarn: ['unwarn', 'унпред'],
  warns: ['warns', 'преды'],
  punishments: ['punishments', 'наказания'],
  rank: ['rank', 'ранг'],
  ranks: ['ranks', 'ранги'],
  setrank: ['setrank', 'выдатьранг'],
  delrank: ['delrank', 'снятьранг'],
  admins: ['admins', 'админы'],
  actions: ['actions', 'действия'],
  history: ['history', 'история'],
  profile: ['profile', 'профиль', 'me'],
  top: ['top', 'топ'],
  level: ['level', 'уровень'],
  balance: ['balance', 'баланс', 'coins', 'монеты'],
  daily: ['daily', 'ежедневно', 'bonus', 'бонус'],
  give: ['give', 'передать', 'gift', 'подарить'],
  shop: ['shop', 'магазин'],
  buy: ['buy', 'купить'],
  title: ['title', 'титул'],
  removetitle: ['removetitle', 'снятьтитул'],
  rep: ['rep', 'реп', 'respect'],
  minusrep: ['minusrep', 'минусреп'],
  myrep: ['myrep', 'мояреп'],
  settings: ['settings', 'настройки'],
  setlog: ['setlog', 'сетлог'],
  logs: ['logs', 'логи'],
  antispam: ['antispam', 'антиспам'],
  antilinks: ['antilinks', 'ссылки'],
  antimat: ['antimat', 'антимат'],
  badwords: ['badwords', 'матлист'],
  addbadword: ['addbadword', 'добавитьмат'],
  delbadword: ['delbadword', 'удалитьмат'],
  welcome: ['welcome', 'приветствие'],
  setwelcome: ['setwelcome', 'сетпривет'],
  goodbye: ['goodbye', 'прощание'],
  setgoodbye: ['setgoodbye', 'сетпрощание'],
  del: ['del', 'удалить'],
  id: ['id', 'айди'],
  transferowner: ['transferowner', 'передатьвладельца'],
  confirmowner: ['confirmowner', 'подтвердитьвладельца'],
  call: ['call', 'калл', 'созыв'],
  love: ['love', 'любовь'],
  couple: ['couple', 'пара'],
  breakup: ['breakup', 'расстаться'],
  hug: ['hug', 'обнять'],
  kiss: ['kiss', 'поцеловать'],
  slap: ['slap', 'шлепнуть', 'шлёпнуть'],
  pat: ['pat', 'погладить'],
  bite: ['bite', 'укусить'],
  poke: ['poke', 'тыкнуть'],
  feed: ['feed', 'покормить'],
  tea: ['tea', 'чай'],
  flower: ['flower', 'цветок'],
  compliment: ['compliment', 'комплимент'],
  fridaypost: ['fridaypost', 'пятница'],
  setfriday: ['setfriday', 'сетпятница'],
  setfridaytime: ['setfridaytime', 'сетвремяпятницы'],
  fridaynow: ['fridaynow', 'пятницасейчас']
};

const REVERSE_ALIASES = new Map();
for (const [key, list] of Object.entries(ALIASES)) {
  for (const alias of list) REVERSE_ALIASES.set(alias.toLowerCase(), key);
}
for (const alias of Object.keys(RANK_COMMANDS)) REVERSE_ALIASES.set(alias.toLowerCase(), 'rankShortcut');

const pendingOwnerTransfers = new Map();

function escapeHtml(text = '') {
  return String(text).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}
function cleanCommandName(text = '') {
  return String(text).split('@')[0].toLowerCase();
}
function parseCommand(ctx) {
  const text = (ctx.message?.text || '').trim();
  if (!text) return null;

  const hasSlash = text.startsWith('/');
  const cleanText = hasSlash ? text.slice(1).trim() : text;

  const parts = cleanText.split(/\s+/);
  const [raw, ...args] = parts;

  const first = cleanCommandName(raw);
  const second = (args[0] || '').toLowerCase();

  // ВАЖНО:
  // "я" и "я тут" — обычные сообщения, НЕ команда.
  // Работает только "я профиль" или "/я профиль".
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

  const command = REVERSE_ALIASES.get(first) || null;
  if (!command) return null;

  return {
    raw: first,
    command,
    args,
    argText: args.join(' ')
  };
}

function isGroup(ctx) {
  return ['group', 'supergroup'].includes(ctx.chat?.type);
}
function mentionById(id, name = 'Пользователь') {
  return `<a href="tg://user?id=${id}">${escapeHtml(name)}</a>`;
}
function mentionUser(user) {
  return mentionById(user.id, user.first_name || user.username || 'Пользователь');
}
function usernameText(userLike) {
  if (!userLike) return 'Пользователь';
  if (userLike.username) return `@${escapeHtml(userLike.username)}`;
  return escapeHtml(userLike.firstName || userLike.first_name || `ID ${userLike.id}`);
}
function rankInfo(rank) {
  return ADMIN_RANKS[Number(rank)] || ADMIN_RANKS[0];
}
function levelFromXp(xp) {
  return Math.floor(Math.sqrt((xp || 0) / 10)) + 1;
}
function levelTitle(level) {
  if (level >= 50) return 'Король чата';
  if (level >= 30) return 'Душа беседы';
  if (level >= 20) return 'Легенда чата';
  if (level >= 10) return 'Свой человек';
  if (level >= 5) return 'Активный';
  return 'Новичок';
}
function todayKey() { return new Date().toISOString().slice(0, 10); }
function nowTs() { return Date.now(); }
function pushHistory(chat, userId, item) {
  const user = chat.users[String(userId)];
  if (!user) return;
  user.history ||= [];
  user.history.unshift({ date: new Date().toISOString(), ...item });
  user.history = user.history.slice(0, 50);
}
async function logAction(ctx, text) {
  try {
    const chat = getChatDB(ctx.chat.id);
    chat.logs.unshift({ date: new Date().toISOString(), text: text.replace(/<[^>]*>/g, '') });
    chat.logs = chat.logs.slice(0, 100);
    saveDB();
    if (chat.settings.logChatId) {
      await ctx.telegram.sendMessage(chat.settings.logChatId, `📢 <b>Лог действия</b>\n\n${text}`, { parse_mode: 'HTML' }).catch(() => {});
    }
  } catch (error) {
    console.error('logAction error:', error);
  }
}
async function getTelegramRank(ctx, userId) {
  try {
    const member = await ctx.telegram.getChatMember(ctx.chat.id, userId);
    if (member.status === 'creator') return 100;
    return null;
  } catch { return null; }
}
async function getUserAdminRank(ctx, userId) {
  if (OWNER_ID && Number(userId) === OWNER_ID) return 100;
  const tgRank = await getTelegramRank(ctx, userId);
  if (tgRank === 100) return 100;
  const chat = getChatDB(ctx.chat.id);
  const u = chat.users[String(userId)];
  const stored = Number(u?.adminRank || chat.admins[String(userId)] || 0);
  return stored;
}
async function isTelegramAdmin(ctx, userId) {
  try {
    const member = await ctx.telegram.getChatMember(ctx.chat.id, userId);
    return ['creator', 'administrator'].includes(member.status);
  } catch { return false; }
}
async function requireGroup(ctx) {
  if (!isGroup(ctx)) {
    await ctx.reply('❌ Эта команда работает только в группе.');
    return false;
  }
  return true;
}
async function requireRank(ctx, minRank) {
  const rank = await getUserAdminRank(ctx, ctx.from.id);
  if (rank < minRank) {
    return ctx.reply(`❌ Недостаточно прав.\n\nТвой ранг: ${rankInfo(rank).title}\nНужный ранг: ${rankInfo(minRank).title}`), false;
  }
  return true;
}
async function canManageTarget(ctx, actorId, targetId, action = 'наказать') {
  const actorRank = await getUserAdminRank(ctx, actorId);
  const targetRank = await getUserAdminRank(ctx, targetId);
  if (Number(actorId) === Number(targetId)) return { ok: false, reason: '❌ Нельзя применить действие к самому себе.' };
  if (targetRank >= actorRank && actorRank < 100) {
    return { ok: false, reason: `❌ Нельзя ${action} пользователя с рангом выше или равным твоему.\n\nТвой ранг: ${rankInfo(actorRank).title}\nРанг цели: ${rankInfo(targetRank).title}` };
  }
  return { ok: true, actorRank, targetRank };
}
async function getBotMember(ctx) {
  return ctx.telegram.getChatMember(ctx.chat.id, ctx.botInfo.id);
}
async function checkBotAdmin(ctx) {
  try {
    const member = await getBotMember(ctx);
    if (!['administrator', 'creator'].includes(member.status)) {
      await ctx.reply('❌ Бот должен быть администратором группы.');
      return false;
    }
    return true;
  } catch {
    await ctx.reply('❌ Не удалось проверить права бота.');
    return false;
  }
}
function resolveTarget(ctx, args, options = {}) {
  const reply = ctx.message?.reply_to_message?.from;
  if (reply && !reply.is_bot) {
    return { id: reply.id, user: reply, rest: args, source: 'reply' };
  }
  const first = args[0];
  if (first && /^-?\d+$/.test(first)) {
    return { id: Number(first), user: null, rest: args.slice(1), source: 'id' };
  }
  if (options.self) return { id: ctx.from.id, user: ctx.from, rest: args, source: 'self' };
  return null;
}
function durationToText(minutes) {
  if (minutes >= 1440) return `${Math.round(minutes / 1440)} дн.`;
  if (minutes >= 60) return `${Math.round(minutes / 60)} ч.`;
  return `${minutes} мин.`;
}
async function muteUser(ctx, targetId, minutes = 60, reason = 'без причины', admin = ctx.from) {
  if (!(await checkBotAdmin(ctx))) return;
  const actorRank = await getUserAdminRank(ctx, admin.id);
  const limit = rankInfo(actorRank).muteLimit;
  if (Number.isFinite(limit) && minutes > limit) {
    return ctx.reply(`❌ Ты не можешь выдать мут на такой срок.\n\nТвой лимит: ${limit} минут\nТы указал: ${minutes} минут`);
  }
  const can = await canManageTarget(ctx, admin.id, targetId, 'замутить');
  if (!can.ok) return ctx.reply(can.reason);
  const untilDate = Math.floor(Date.now() / 1000) + Number(minutes) * 60;
  await ctx.telegram.restrictChatMember(ctx.chat.id, targetId, {
    until_date: untilDate,
    permissions: {
      can_send_messages: false,
      can_send_audios: false,
      can_send_documents: false,
      can_send_photos: false,
      can_send_videos: false,
      can_send_video_notes: false,
      can_send_voice_notes: false,
      can_send_polls: false,
      can_send_other_messages: false,
      can_add_web_page_previews: false
    }
  });
  const chat = getChatDB(ctx.chat.id);
  if (!chat.users[String(targetId)]) getUserDB(chat, { id: targetId, first_name: `ID ${targetId}` });
  pushHistory(chat, targetId, { type: 'mute', minutes, reason, adminId: admin.id });
  saveDB();
  const text = `🔇 <b>Мут выдан</b>\n\n👤 Пользователь: ${mentionById(targetId, `ID ${targetId}`)}\n🆔 ID: <code>${targetId}</code>\n⏱ Срок: <b>${durationToText(minutes)}</b>\n📌 Причина: <b>${escapeHtml(reason)}</b>\n👮 Выдал: ${mentionUser(admin)}\n\n✅ Мут будет снят автоматически.`;
  await ctx.reply(text, { parse_mode: 'HTML' });
  await logAction(ctx, text);
}
async function unmuteUser(ctx, targetId) {
  if (!(await checkBotAdmin(ctx))) return;
  const can = await canManageTarget(ctx, ctx.from.id, targetId, 'размутить');
  if (!can.ok) return ctx.reply(can.reason);
  await ctx.telegram.restrictChatMember(ctx.chat.id, targetId, {
    permissions: {
      can_send_messages: true,
      can_send_audios: true,
      can_send_documents: true,
      can_send_photos: true,
      can_send_videos: true,
      can_send_video_notes: true,
      can_send_voice_notes: true,
      can_send_polls: true,
      can_send_other_messages: true,
      can_add_web_page_previews: true
    }
  });
  const chat = getChatDB(ctx.chat.id);
  pushHistory(chat, targetId, { type: 'unmute', adminId: ctx.from.id });
  saveDB();
  const text = `🔊 <b>Мут снят</b>\n\n👤 Пользователь: ${mentionById(targetId, `ID ${targetId}`)}\n🆔 ID: <code>${targetId}</code>\n👮 Снял: ${mentionUser(ctx.from)}\n\n✅ Пользователь снова может писать в чат.`;
  await ctx.reply(text, { parse_mode: 'HTML' });
  await logAction(ctx, text);
}
async function banUser(ctx, targetId, reason = 'без причины') {
  if (!(await checkBotAdmin(ctx))) return;
  const can = await canManageTarget(ctx, ctx.from.id, targetId, 'забанить');
  if (!can.ok) return ctx.reply(can.reason);
  await ctx.telegram.banChatMember(ctx.chat.id, targetId);
  const chat = getChatDB(ctx.chat.id);
  pushHistory(chat, targetId, { type: 'ban', reason, adminId: ctx.from.id });
  saveDB();
  const text = `🚫 <b>Пользователь забанен</b>\n\n👤 Пользователь: ${mentionById(targetId, `ID ${targetId}`)}\n🆔 ID: <code>${targetId}</code>\n📌 Причина: <b>${escapeHtml(reason)}</b>\n👮 Выдал: ${mentionUser(ctx.from)}`;
  await ctx.reply(text, { parse_mode: 'HTML' });
  await logAction(ctx, text);
}
async function kickUser(ctx, targetId, reason = 'без причины') {
  if (!(await checkBotAdmin(ctx))) return;
  const can = await canManageTarget(ctx, ctx.from.id, targetId, 'кикнуть');
  if (!can.ok) return ctx.reply(can.reason);
  await ctx.telegram.banChatMember(ctx.chat.id, targetId);
  await ctx.telegram.unbanChatMember(ctx.chat.id, targetId);
  const chat = getChatDB(ctx.chat.id);
  pushHistory(chat, targetId, { type: 'kick', reason, adminId: ctx.from.id });
  saveDB();
  const text = `👢 <b>Пользователь кикнут</b>\n\n👤 Пользователь: ${mentionById(targetId, `ID ${targetId}`)}\n🆔 ID: <code>${targetId}</code>\n📌 Причина: <b>${escapeHtml(reason)}</b>\n👮 Выдал: ${mentionUser(ctx.from)}`;
  await ctx.reply(text, { parse_mode: 'HTML' });
  await logAction(ctx, text);
}
async function warnUser(ctx, targetId, reason = 'без причины') {
  const can = await canManageTarget(ctx, ctx.from.id, targetId, 'выдать предупреждение');
  if (!can.ok) return ctx.reply(can.reason);
  const chat = getChatDB(ctx.chat.id);
  if (!chat.users[String(targetId)]) getUserDB(chat, { id: targetId, first_name: `ID ${targetId}` });
  const user = chat.users[String(targetId)];
  user.inventory ||= {};
  if ((user.inventory.warnShield || 0) > 0) {
    user.inventory.warnShield -= 1;
    saveDB();
    return ctx.reply(`🛡 У пользователя была защита от предупреждения. Защита использована.`, { parse_mode: 'HTML' });
  }
  user.warns ||= [];
  user.warns.push({ reason, adminId: ctx.from.id, date: new Date().toISOString() });
  user.warnings = user.warns.length;
  pushHistory(chat, targetId, { type: 'warn', reason, adminId: ctx.from.id });
  saveDB();
  const count = user.warns.length;
  await ctx.reply(`⚠️ <b>Предупреждение выдано</b>\n\n👤 Пользователь: ${mentionById(targetId, `ID ${targetId}`)}\n🆔 ID: <code>${targetId}</code>\n📌 Причина: <b>${escapeHtml(reason)}</b>\n📊 Предупреждений: <b>${count}/5</b>\n👮 Выдал: ${mentionUser(ctx.from)}`, { parse_mode: 'HTML' });
  await logAction(ctx, `⚠️ ${mentionById(targetId, `ID ${targetId}`)} получил предупреждение. Причина: ${escapeHtml(reason)}`);
  if (count === 2) await muteUser(ctx, targetId, 30, '2 предупреждения', ctx.from);
  else if (count === 3) await muteUser(ctx, targetId, 120, '3 предупреждения', ctx.from);
  else if (count === 4) await kickUser(ctx, targetId, '4 предупреждения');
  else if (count >= 5) await banUser(ctx, targetId, '5 предупреждений');
}
async function setRank(ctx, targetId, newRank) {
  const actorRank = await getUserAdminRank(ctx, ctx.from.id);
  const currentTargetRank = await getUserAdminRank(ctx, targetId);
  if (newRank >= actorRank && actorRank < 100) {
    return ctx.reply(`❌ Ты не можешь выдать ранг выше или равный своему.\n\nТвой ранг: ${rankInfo(actorRank).title}\nЗапрошенный ранг: ${rankInfo(newRank).title}`);
  }
  if (currentTargetRank >= actorRank && actorRank < 100) {
    return ctx.reply(`❌ Ты не можешь управлять пользователем с рангом выше или равным своему.`);
  }
  const chat = getChatDB(ctx.chat.id);
  if (!chat.users[String(targetId)]) getUserDB(chat, { id: targetId, first_name: `ID ${targetId}` });
  chat.users[String(targetId)].adminRank = Number(newRank);
  if (newRank > 0) chat.admins[String(targetId)] = Number(newRank);
  else delete chat.admins[String(targetId)];
  pushHistory(chat, targetId, { type: 'rank', newRank, adminId: ctx.from.id });
  saveDB();
  const text = newRank > 0
    ? `👑 <b>Новый ранг выдан</b>\n\n👤 Пользователь: ${mentionById(targetId, `ID ${targetId}`)}\n🆔 ID: <code>${targetId}</code>\n🎚 Новый ранг: <b>${rankInfo(newRank).title}</b>\n📊 Уровень: <b>${newRank}</b>\n👮 Выдал: ${mentionUser(ctx.from)}\n\n✅ Пользователь получил новые права администрации.`
    : `👤 <b>Ранг снят</b>\n\n👤 Пользователь: ${mentionById(targetId, `ID ${targetId}`)}\n🆔 ID: <code>${targetId}</code>\n📉 Новый статус: <b>обычный пользователь</b>\n👮 Снял: ${mentionUser(ctx.from)}`;
  await ctx.reply(text, { parse_mode: 'HTML' });
  await logAction(ctx, text);
}
function normalizeUrl(text) {
  const match = String(text || '').match(/https?:\/\/[^\s]+/i);
  return match ? match[0].replace(/[)\]}>,.!?]+$/g, '').trim() : null;
}
function isVideoLink(text) {
  const url = normalizeUrl(text);
  return url && /(tiktok\.com|vm\.tiktok\.com|vt\.tiktok\.com|youtube\.com|youtu\.be|instagram\.com)/i.test(url);
}
function hasLink(text) { return /(https?:\/\/|t\.me\/|telegram\.me\/|www\.)/i.test(text || ''); }
function isAllowedVideoLink(text) { return /(youtube\.com|youtu\.be|tiktok\.com|vm\.tiktok\.com|vt\.tiktok\.com)/i.test(text || ''); }
async function runYtDlp(command, args) {
  return execFileAsync(command, args, { timeout: 180000, maxBuffer: 1024 * 1024 * 20 });
}
function findDownloadedFile(prefix) {
  const files = fs.readdirSync(DOWNLOAD_DIR);
  const found = files.find(f => f.startsWith(prefix));
  return found ? path.join(DOWNLOAD_DIR, found) : null;
}
async function downloadVideo(url) {
  const prefix = `video_${Date.now()}_${Math.floor(Math.random() * 99999)}`;
  const outputTemplate = path.join(DOWNLOAD_DIR, `${prefix}.%(ext)s`);
  const baseArgs = ['--no-playlist', '--no-check-certificates', '--force-overwrites', '--no-warnings', '-f', 'best[ext=mp4]/best', '--merge-output-format', 'mp4', '-o', outputTemplate, url];
  const attempts = [
    { command: 'py', args: ['-m', 'yt_dlp', ...baseArgs] },
    { command: 'python', args: ['-m', 'yt_dlp', ...baseArgs] },
    { command: 'python3', args: ['-m', 'yt_dlp', ...baseArgs] },
    { command: 'yt-dlp', args: baseArgs }
  ];
  const errors = [];
  for (const a of attempts) {
    try {
      await runYtDlp(a.command, a.args);
      const file = findDownloadedFile(prefix);
      if (file && fs.existsSync(file)) return file;
      errors.push(`${a.command}: файл не найден`);
    } catch (e) { errors.push(`${a.command}: ${e.stderr || e.message}`); }
  }
  throw new Error(errors.join('\n'));
}

function weekKey(date = new Date()) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  return `${d.getUTCFullYear()}-${String(weekNo).padStart(2, '0')}`;
}
function monthKey(date = new Date()) {
  return date.toISOString().slice(0, 7);
}
function ensurePeriodStats(user) {
  user.messagesDay ||= {};
  user.messagesWeek ||= {};
  user.messagesMonth ||= {};
}
function callKeyboard(actorId) {
  return Markup.inlineKeyboard([
    [Markup.button.callback('👥 Все', `call:all:${actorId}`), Markup.button.callback('🛡 Админы', `call:admins:${actorId}`)],
    [Markup.button.callback('👑 Владельцы', `call:owners:${actorId}`), Markup.button.callback('❌ Отмена', `cancel:${actorId}`)]
  ]);
}
function fridayParts(timezone = 'Asia/Almaty') {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    weekday: 'short',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).formatToParts(new Date());
  const data = {};
  for (const part of parts) data[part.type] = part.value;
  return {
    weekday: data.weekday,
    date: `${data.year}-${data.month}-${data.day}`,
    time: `${data.hour}:${data.minute}`
  };
}
async function sendFridayPost(chatId) {
  const chat = getChatDB(chatId);
  const cfg = chat.settings.fridayPost;
  await bot.telegram.sendMessage(chatId, cfg.text || '🎉 Пятница пришла! Всем хорошего настроения ❤️', { parse_mode: 'HTML' }).catch(console.error);
}
function startFridayScheduler() {
  setInterval(async () => {
    try {
      const db = loadDB();
      for (const chatId of Object.keys(db.chats || {})) {
        const chat = getChatDB(chatId);
        const cfg = chat.settings.fridayPost;
        if (!cfg?.enabled) continue;
        const now = fridayParts(cfg.timezone || 'Asia/Almaty');
        if (now.weekday !== 'Fri') continue;
        if (now.time !== (cfg.time || '18:00')) continue;
        if (cfg.lastSentDate === now.date) continue;
        cfg.lastSentDate = now.date;
        saveDB();
        await sendFridayPost(chatId);
      }
    } catch (error) {
      console.error('friday scheduler error:', error);
    }
  }, 60 * 1000);
}


async function sendCallByMode(ctx, mode) {
  const chat = getChatDB(ctx.chat.id);

  let minRank = 40;
  if (mode === 'all') minRank = 60;
  if (mode === 'admins') minRank = 40;
  if (mode === 'owners') minRank = 80;

  if (!(await requireRank(ctx, minRank))) return;

  const now = nowTs();
  const lastCall = chat.lastCallAt || 0;
  const cooldown = 10 * 60 * 1000;

  if (now - lastCall < cooldown) {
    const left = Math.ceil((cooldown - (now - lastCall)) / 60000);
    return ctx.reply(`⏳ Созыв уже был недавно. Подожди ещё ${left} мин.`);
  }

  let users = Object.values(chat.users || {});

  if (mode === 'admins') {
    users = users.filter((u) => Number(u.adminRank || chat.admins[String(u.id)] || 0) >= 10);
  }

  if (mode === 'owners') {
    users = users.filter((u) => {
      const rank = Number(u.adminRank || chat.admins[String(u.id)] || 0);
      return rank >= 95 || Number(u.id) === OWNER_ID;
    });
  }

  if (mode === 'all') {
    users = users.filter((u) => !u.is_bot);
  }

  users = users.filter((u) => u && u.id && !u.is_bot);

  if (!users.length) {
    return ctx.reply('❌ Некого созывать. Бот ещё не знает участников этой категории.');
  }

  chat.lastCallAt = now;
  saveDB();

  const title =
    mode === 'all'
      ? '👥 Все участники'
      : mode === 'admins'
        ? '🛡 Администрация'
        : '👑 Владельцы';

  await ctx.reply(
    `📢 <b>Созыв: ${title}</b>\n\n👮 Созвал: ${mentionUser(ctx.from)}`,
    { parse_mode: 'HTML' }
  );

  for (let i = 0; i < users.length; i += 25) {
    const chunk = users.slice(i, i + 25);
    const mentions = chunk
      .map((u) => mentionById(u.id, u.firstName || u.username || `ID ${u.id}`))
      .join(' ');

    await ctx.reply(mentions, { parse_mode: 'HTML' });
  }
}


function rememberChatUserForCalls(ctx, userLike) {
  if (!ctx || !ctx.chat || !userLike || userLike.is_bot) return null;

  const chat = getChatDB(ctx.chat.id);
  const user = getUserDB(chat, userLike);

  user.id = Number(userLike.id);
  user.firstName = userLike.first_name || userLike.firstName || user.firstName || '';
  user.username = userLike.username || user.username || '';
  user.isBot = Boolean(userLike.is_bot);
  user.canCall = true;
  user.leftChat = false;
  user.chatId = ctx.chat.id;
  user.chatTitle = ctx.chat.title || chat.title || 'эта беседа';
  user.lastSeenAt = new Date().toISOString();

  if (!user.firstSeenAt) {
    user.firstSeenAt = new Date().toISOString();
  }

  return user;
}

function markUserLeftChat(ctx, userLike) {
  if (!ctx || !ctx.chat || !userLike) return;

  const chat = getChatDB(ctx.chat.id);
  const user = getUserDB(chat, userLike);

  user.leftChat = true;
  user.canCall = false;
  user.leftAt = new Date().toISOString();

  saveDB();
}

function getCallableUsersFromDB(chat, mode = 'all') {
  let users = Object.values(chat.users || {});

  users = users.filter((u) => {
    if (!u) return false;
    if (!u.id) return false;
    if (u.isBot) return false;
    if (u.leftChat) return false;
    if (u.canCall === false) return false;
    return true;
  });

  if (mode === 'admins') {
    users = users.filter((u) => {
      const rank = Number(u.adminRank || chat.admins[String(u.id)] || 0);
      return rank >= 10;
    });
  }

  if (mode === 'owners') {
    users = users.filter((u) => {
      const rank = Number(u.adminRank || chat.admins[String(u.id)] || 0);
      return rank >= 95 || Number(u.id) === OWNER_ID;
    });
  }

  const unique = new Map();

  for (const user of users) {
    unique.set(String(user.id), user);
  }

  return Array.from(unique.values());
}


function ensureAutoFeatures(chat) {
  if (!chat.settings) chat.settings = {};

  if (!chat.settings.autoFeatures) {
    chat.settings.autoFeatures = {
      enabled: true,
      timezone: 'Asia/Almaty',
      birthdayTime: '09:00',
      weeklyReportTime: '20:00',
      lastWeeklyReportDate: null
    };
  }

  if (!chat.reminders) chat.reminders = [];
  return chat.settings.autoFeatures;
}

function getAutoTimeParts(timezone = 'Asia/Almaty') {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    weekday: 'short',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).formatToParts(new Date());

  const data = {};
  for (const part of parts) data[part.type] = part.value;

  return {
    weekday: data.weekday,
    date: data.year + '-' + data.month + '-' + data.day,
    monthDay: data.day + '.' + data.month,
    time: data.hour + ':' + data.minute
  };
}

function normalizeBirthdayDayMonth(day, month) {
  const d = Number(day);
  const m = Number(month);

  if (!d || !m) return null;
  if (d < 1 || d > 31) return null;
  if (m < 1 || m > 12) return null;

  return {
    day: String(d).padStart(2, '0'),
    month: String(m).padStart(2, '0')
  };
}

async function tryAutoSaveBirthday(ctx, text, user) {
  const lower = String(text || '').toLowerCase();

  const hasBirthdayWords =
    lower.includes('др') ||
    lower.includes('днюха') ||
    lower.includes('день рождения') ||
    lower.includes('родился') ||
    lower.includes('родилась');

  if (!hasBirthdayWords) return false;

  const match = lower.match(/(\d{1,2})[\.\/-](\d{1,2})/);

  if (!match) return false;

  const date = normalizeBirthdayDayMonth(match[1], match[2]);
  if (!date) return false;

  user.birthday = {
    day: date.day,
    month: date.month,
    setAt: new Date().toISOString()
  };

  if (!user.achievements) user.achievements = [];

  if (!user.achievements.includes('birthday_set')) {
    user.achievements.push('birthday_set');
  }

  saveDB();

  await ctx.reply(
    `🎂 <b>День рождения запомнил!</b>

👤 Пользователь: ${mentionUser(ctx.from)}
📅 Дата: <b>${date.day}.${date.month}</b>

В этот день бот поздравит тебя в беседе 🥳`,
    { parse_mode: 'HTML' }
  );

  return true;
}

function parseNaturalReminder(text) {
  const raw = String(text || '').trim();
  const lower = raw.toLowerCase();

  if (!lower.startsWith('напомни')) return null;

  let match = lower.match(/^напомни\s+через\s+(\d+)\s*(минут|минуту|минуты|мин|час|часа|часов)\s+(.+)/i);

  if (match) {
    const amount = Number(match[1]);
    const unit = match[2];
    const reminderText = raw.slice(match[0].indexOf(match[3])).trim();

    let ms = 0;

    if (unit.startsWith('мин')) ms = amount * 60 * 1000;
    else ms = amount * 60 * 60 * 1000;

    return {
      dueAt: Date.now() + ms,
      text: reminderText,
      human: 'через ' + amount + ' ' + unit
    };
  }

  match = lower.match(/^напомни\s+завтра\s+в\s+(\d{1,2}):(\d{2})\s+(.+)/i);

  if (match) {
    const hour = Number(match[1]);
    const minute = Number(match[2]);

    if (hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59) {
      const due = new Date();
      due.setDate(due.getDate() + 1);
      due.setHours(hour, minute, 0, 0);

      const reminderText = raw.slice(match[0].indexOf(match[3])).trim();

      return {
        dueAt: due.getTime(),
        text: reminderText,
        human: 'завтра в ' + String(hour).padStart(2, '0') + ':' + String(minute).padStart(2, '0')
      };
    }
  }

  return null;
}

async function tryAutoCreateReminder(ctx, text) {
  const reminder = parseNaturalReminder(text);
  if (!reminder) return false;

  const chat = getChatDB(ctx.chat.id);
  ensureAutoFeatures(chat);

  chat.reminders.push({
    id: 'rem_' + Date.now() + '_' + Math.floor(Math.random() * 99999),
    userId: ctx.from.id,
    userName: ctx.from.first_name || ctx.from.username || 'Пользователь',
    text: reminder.text,
    dueAt: reminder.dueAt,
    createdAt: new Date().toISOString(),
    done: false
  });

  saveDB();

  await ctx.reply(
    `⏰ <b>Напоминание создано!</b>

👤 Для: ${mentionUser(ctx.from)}
📝 Текст: <b>${escapeHtml(reminder.text)}</b>
⏳ Когда: <b>${escapeHtml(reminder.human)}</b>`,
    { parse_mode: 'HTML' }
  );

  return true;
}

async function checkAutoAchievements(ctx, user) {
  if (!user.achievements) user.achievements = [];

  const earned = [];

  function addAchievement(id, text) {
    if (!user.achievements.includes(id)) {
      user.achievements.push(id);
      earned.push(text);
    }
  }

  if ((user.messages || 0) >= 1) addAchievement('first_message', '🏆 Первое сообщение');
  if ((user.messages || 0) >= 100) addAchievement('messages_100', '💬 100 сообщений');
  if ((user.messages || 0) >= 500) addAchievement('messages_500', '🔥 500 сообщений');
  if ((user.messages || 0) >= 1000) addAchievement('messages_1000', '👑 1000 сообщений');
  if ((user.reputation || 0) >= 10) addAchievement('rep_10', '⭐ 10 репутации');
  if (user.birthday) addAchievement('birthday_set', '🎂 Указал день рождения');
  if ((user.warns?.length || 0) === 0 && (user.messages || 0) >= 100) {
    addAchievement('clean_100', '🛡 100 сообщений без предупреждений');
  }

  if (earned.length) {
    saveDB();

    await ctx.reply(
      `🎉 <b>Новое достижение!</b>

👤 ${mentionUser(ctx.from)}

${earned.join('\n')}`,
      { parse_mode: 'HTML' }
    );
  }
}

async function processAutoFeaturesForMessage(ctx, text, user) {
  if (!ctx.chat || !ctx.from || ctx.from.is_bot) return;

  const chat = getChatDB(ctx.chat.id);
  const cfg = ensureAutoFeatures(chat);

  if (!cfg.enabled) return;

  const birthdaySaved = await tryAutoSaveBirthday(ctx, text, user);
  if (birthdaySaved) return;

  const reminderCreated = await tryAutoCreateReminder(ctx, text);
  if (reminderCreated) return;

  await checkAutoAchievements(ctx, user);
}

function getWeeklyStats(chat) {
  const now = new Date();
  const days = [];

  for (let i = 0; i < 7; i++) {
    const d = new Date(now);
    d.setDate(now.getDate() - i);
    days.push(d.toISOString().slice(0, 10));
  }

  let totalMessages = 0;
  let activeUsers = 0;
  let topUser = null;
  let topScore = 0;
  let topRepUser = null;
  let topRep = -999999;
  let warns = 0;

  for (const user of Object.values(chat.users || {})) {
    let userWeekMessages = 0;

    for (const day of days) {
      userWeekMessages += user.messagesDay?.[day] || 0;
    }

    if (userWeekMessages > 0) activeUsers++;
    totalMessages += userWeekMessages;

    if (userWeekMessages > topScore) {
      topScore = userWeekMessages;
      topUser = user;
    }

    if ((user.reputation || 0) > topRep) {
      topRep = user.reputation || 0;
      topRepUser = user;
    }

    warns += user.warns?.length || 0;
  }

  return {
    totalMessages,
    activeUsers,
    topUser,
    topScore,
    topRepUser,
    topRep,
    warns
  };
}

async function sendWeeklyReport(chatId) {
  const chat = getChatDB(chatId);
  const stats = getWeeklyStats(chat);

  const topName = stats.topUser
    ? usernameText(stats.topUser)
    : 'пока нет';

  const repName = stats.topRepUser
    ? usernameText(stats.topRepUser)
    : 'пока нет';

  await bot.telegram.sendMessage(
    chatId,
    `📊 <b>Итоги недели</b>

💬 Сообщений за неделю: <b>${stats.totalMessages}</b>
👥 Активных участников: <b>${stats.activeUsers}</b>
🏆 Самый активный: <b>${topName}</b> — <b>${stats.topScore}</b>
⭐ Больше всего репутации: <b>${repName}</b>
⚠️ Предупреждений в базе: <b>${stats.warns}</b>

━━━━━━━━━━━━━━
🚀 Новая неделя — новый топ!`,
    { parse_mode: 'HTML' }
  );
}

function startAutoFeaturesScheduler() {
  setInterval(async () => {
    try {
      const db = loadDB();

      for (const chatId of Object.keys(db.chats || {})) {
        const chat = db.chats[chatId];
        const cfg = ensureAutoFeatures(chat);
        const now = getAutoTimeParts(cfg.timezone || 'Asia/Almaty');

        // Напоминания
        const reminders = chat.reminders || [];

        for (const reminder of reminders) {
          if (reminder.done) continue;
          if (Date.now() < reminder.dueAt) continue;

          reminder.done = true;
          saveDB();

          await bot.telegram.sendMessage(
            chatId,
            `🔔 <b>Напоминание</b>

${mentionById(reminder.userId, reminder.userName)}, ты просил напомнить:

📝 <b>${escapeHtml(reminder.text)}</b>`,
            { parse_mode: 'HTML' }
          ).catch((error) => console.error('reminder send error:', error.message));
        }

        chat.reminders = reminders.filter((r) => !r.done);

        // Дни рождения
        if (now.time === cfg.birthdayTime) {
          for (const user of Object.values(chat.users || {})) {
            if (!user.birthday) continue;

            const md = user.birthday.day + '.' + user.birthday.month;
            const key = now.date + ':' + user.id;

            if (md === now.monthDay && user.lastBirthdayCongrats !== key) {
              user.lastBirthdayCongrats = key;
              saveDB();

              await bot.telegram.sendMessage(
                chatId,
                `🎉 <b>Сегодня день рождения!</b>

Поздравляем ${mentionById(user.id, user.firstName || user.username || 'пользователя')} 🥳

Желаем счастья, здоровья, хорошего настроения и много крутых моментов в жизни 🎂✨`,
                { parse_mode: 'HTML' }
              ).catch((error) => console.error('birthday send error:', error.message));
            }
          }
        }

        // Еженедельный отчёт — воскресенье 20:00
        if (now.weekday === 'Sun' && now.time === cfg.weeklyReportTime && cfg.lastWeeklyReportDate !== now.date) {
          cfg.lastWeeklyReportDate = now.date;
          saveDB();

          await sendWeeklyReport(chatId).catch((error) => {
            console.error('weekly report error:', error.message);
          });
        }
      }

      saveDB();
    } catch (error) {
      console.error('auto features scheduler error:', error);
    }
  }, 60 * 1000);
}

function mainMenuKeyboard() {
  return Markup.inlineKeyboard([
    [Markup.button.callback('🛡 Модерация', 'help:mod'), Markup.button.callback('👑 Ранги', 'help:ranks')],
    [Markup.button.callback('👤 Профиль', 'help:profile'), Markup.button.callback('📜 Правила', 'help:rules')],
    [Markup.button.callback('⚙️ Настройки', 'help:settings'), Markup.button.callback('🎁 Магазин', 'help:shop')]
  ]);
}
function settingsKeyboard(chat) {
  const s = chat.settings;
  return Markup.inlineKeyboard([
    [Markup.button.callback(`🛡 Антиспам: ${s.antispam ? 'ON' : 'OFF'}`, 'set:antispam')],
    [Markup.button.callback(`🔗 Ссылки: ${s.antilinks ? 'ON' : 'OFF'}`, 'set:antilinks')],
    [Markup.button.callback(`🤬 Антимат: ${s.antimat ? 'ON' : 'OFF'}`, 'set:antimat')],
    [Markup.button.callback(`👋 Приветствие: ${s.welcome ? 'ON' : 'OFF'}`, 'set:welcome')],
    [Markup.button.callback(`👋 Прощание: ${s.goodbye ? 'ON' : 'OFF'}`, 'set:goodbye')]
  ]);
}
function muteKeyboard(targetId, actorId) {
  return Markup.inlineKeyboard([
    [Markup.button.callback('5 минут', `mute:${actorId}:${targetId}:5`), Markup.button.callback('10 минут', `mute:${actorId}:${targetId}:10`)],
    [Markup.button.callback('30 минут', `mute:${actorId}:${targetId}:30`), Markup.button.callback('60 минут', `mute:${actorId}:${targetId}:60`)],
    [Markup.button.callback('❌ Отмена', `cancel:${actorId}`)]
  ]);
}
function reasonKeyboard(action, actorId, targetId, minutes = 0) {
  return Markup.inlineKeyboard([
    [Markup.button.callback('Мат', `${action}r:${actorId}:${targetId}:${minutes}:Мат`), Markup.button.callback('Флуд', `${action}r:${actorId}:${targetId}:${minutes}:Флуд`)],
    [Markup.button.callback('Спам', `${action}r:${actorId}:${targetId}:${minutes}:Спам`), Markup.button.callback('Оскорбление', `${action}r:${actorId}:${targetId}:${minutes}:Оскорбление`)],
    [Markup.button.callback('Реклама', `${action}r:${actorId}:${targetId}:${minutes}:Реклама`), Markup.button.callback('Провокация', `${action}r:${actorId}:${targetId}:${minutes}:Провокация`)],
    [Markup.button.callback('❌ Отмена', `cancel:${actorId}`)]
  ]);
}
function actionsKeyboard(targetId, actorId) {
  return Markup.inlineKeyboard([
    [Markup.button.callback('🔇 Мут', `act:mute:${actorId}:${targetId}`), Markup.button.callback('🚫 Бан', `act:ban:${actorId}:${targetId}`)],
    [Markup.button.callback('👢 Кик', `act:kick:${actorId}:${targetId}`), Markup.button.callback('⚠️ Пред', `act:warn:${actorId}:${targetId}`)],
    [Markup.button.callback('📂 История', `act:history:${actorId}:${targetId}`), Markup.button.callback('🗑 Удалить', `act:del:${actorId}:${targetId}`)],
    [Markup.button.callback('❌ Отмена', `cancel:${actorId}`)]
  ]);
}

async function handleCommand(ctx, parsed) {
  const { command, raw, args, argText } = parsed;
  const chat = getChatDB(ctx.chat.id);
  if (isGroup(ctx)) getUserDB(chat, ctx.from);

  if (command === 'setup') {
    if (!(await requireGroup(ctx))) return;

    const isTgAdmin = await isTelegramAdmin(ctx, ctx.from.id);
    const currentRank = await getUserAdminRank(ctx, ctx.from.id);

    if (!isTgAdmin && currentRank < 80) {
      return ctx.reply('❌ Настроить бота может только администратор этой беседы.');
    }

    const chatTitle = ctx.chat.title || 'эта беседа';
    const chat = getChatDB(ctx.chat.id);
    const user = rememberChatUserForCalls(ctx, ctx.from) || getUserDB(chat, ctx.from);

    chat.title = chatTitle;
    chat.type = ctx.chat.type;
    chat.updatedAt = new Date().toISOString();

    const member = await ctx.telegram.getChatMember(ctx.chat.id, ctx.from.id).catch(() => null);

    if (member?.status === 'creator' || (OWNER_ID && ctx.from.id === OWNER_ID)) {
      user.adminRank = 100;
      chat.admins[String(ctx.from.id)] = 100;
    } else if ((user.adminRank || 0) < 60) {
      user.adminRank = 60;
      chat.admins[String(ctx.from.id)] = 60;
    }

    if (!chat.settings.rules || chat.settings.rules === DEFAULT_RULES) {
      chat.settings.rules = `📜 Правила беседы «${chatTitle}»

1. Уважай участников.
2. Не спамь и не флуди.
3. Не рекламируй без разрешения администрации.
4. Не провоцируй конфликты.
5. Не отправляй запрещённый контент.
6. Уважай администрацию.
7. Не обходи наказания.

⚠️ За нарушение: предупреждение, мут, кик или бан.`;
    }

    if (!chat.settings.welcomeText) {
      chat.settings.welcomeText = '👋 Добро пожаловать, {user}!\n\nТы попал в «{chat}». Перед общением прочитай /правила.';
    }

    saveDB();

    return ctx.reply(
      `✅ <b>Бот настроен для этой беседы</b>

🏠 Беседа: <b>${escapeHtml(chatTitle)}</b>
🆔 Chat ID: <code>${ctx.chat.id}</code>
👤 Настроил: ${mentionUser(ctx.from)}
👑 Твой ранг: <b>${rankInfo(user.adminRank).title}</b>

Теперь у этой беседы свои:
• правила;
• админ-ранги;
• настройки;
• топы;
• предупреждения;
• созывы;
• логи.

Команды:
• /правила
• /настройки
• /ранги
• /помощь`,
      { parse_mode: 'HTML' }
    );
  }

  if (command === 'help') {
    return ctx.reply(`🤖 <b>FulTalchik_botik — меню команд</b>\n\n🌐 Бот работает отдельно для каждой беседы.\nДля первичной настройки напиши: /настроить\n\nВыбери раздел ниже или используй команды:\n/help /помощь\n/rules /правила\n/profile /профиль\n/shop /магазин`, { parse_mode: 'HTML', ...mainMenuKeyboard() });
  }
  if (command === 'rules') return ctx.reply(escapeHtml(chat.settings.rules), { parse_mode: 'HTML' });
  if (command === 'setrules') {
    if (!(await requireGroup(ctx)) || !(await requireRank(ctx, 80))) return;
    if (!argText) return ctx.reply('❌ Напиши текст правил: /setrules текст');
    chat.settings.rules = argText;
    saveDB();
    await ctx.reply('✅ Правила обновлены.');
    return logAction(ctx, `📜 ${mentionUser(ctx.from)} обновил правила чата.`);
  }
  if (command === 'profile') {
    const target = resolveTarget(ctx, args, { self: true });

    const user = target.user
      ? getUserDB(chat, target.user)
      : chat.users[String(target.id)] || getUserDB(chat, {
          id: target.id,
          first_name: `ID ${target.id}`
        });

    const level = levelFromXp(user.xp);
    const status = user.inventory?.premium
      ? '💎 Premium'
      : user.inventory?.vip
        ? '⭐ VIP'
        : 'обычный';

    const username = user.username ? '@' + escapeHtml(user.username) : 'нет';
    const nick = escapeHtml(user.firstName || user.first_name || 'Пользователь');
    const title = user.title ? escapeHtml(user.title) : 'нет';
    const adminRank = rankInfo(user.adminRank).title;
    const warnsCount = user.warns?.length || 0;

    return ctx.reply(
`👤 <b>Профиль пользователя</b>

<b>Основное:</b>
👤 Ник: <b>${nick}</b>
🆔 ID: <code>${user.id}</code>
🔗 Username: <b>${username}</b>

<b>Активность:</b>
💬 Сообщений: <b>${user.messages}</b>
🎚 Уровень: <b>${level}</b>
🏆 Ранг активности: <b>${levelTitle(level)}</b>

<b>Статистика:</b>
⭐ Репутация: <b>${user.reputation}</b>
⚠️ Предупреждения: <b>${warnsCount}/5</b>
🪙 Баланс: <b>${user.balance}</b> монет

<b>Статус:</b>
🏷 Титул: <b>${title}</b>
👑 Админ-ранг: <b>${adminRank}</b>
🎁 Статус: <b>${status}</b>`,
      { parse_mode: 'HTML' }
    );
  }

  if (command === 'id') return ctx.reply(`🆔 Твой ID: <code>${ctx.from.id}</code>`, { parse_mode: 'HTML' });
  if (command === 'top') {
    const period = (args[0] || 'all').toLowerCase();

    let mode = 'all';

    if (['day', 'день', 'today', 'сегодня'].includes(period)) {
      mode = 'day';
    }

    if (['week', 'неделя', 'weeks', 'недели'].includes(period)) {
      mode = 'week';
    }

    if (['month', 'месяц', 'months', 'месяца'].includes(period)) {
      mode = 'month';
    }

    if (['all', 'все', 'всё'].includes(period)) {
      mode = 'all';
    }

    const now = new Date();

    function sameDay(dateKey) {
      return dateKey === todayKey();
    }

    function sameMonth(dateKey) {
      return dateKey.slice(0, 7) === now.toISOString().slice(0, 7);
    }

    function sameWeek(dateKey) {
      const date = new Date(dateKey + 'T00:00:00');
      const current = new Date(now.getFullYear(), now.getMonth(), now.getDate());

      const day = current.getDay() || 7;

      const monday = new Date(current);
      monday.setDate(current.getDate() - day + 1);
      monday.setHours(0, 0, 0, 0);

      const sunday = new Date(monday);
      sunday.setDate(monday.getDate() + 6);
      sunday.setHours(23, 59, 59, 999);

      return date >= monday && date <= sunday;
    }

    function getScore(user) {
      if (mode === 'all') {
        return user.messages || 0;
      }

      const days = user.messagesDay || {};
      let total = 0;

      for (const [dateKey, count] of Object.entries(days)) {
        if (mode === 'day' && sameDay(dateKey)) total += count;
        if (mode === 'week' && sameWeek(dateKey)) total += count;
        if (mode === 'month' && sameMonth(dateKey)) total += count;
      }

      return total;
    }

    function getTopName(user) {
      if (user.username) {
        return '@' + escapeHtml(user.username);
      }

      return escapeHtml(user.firstName || user.first_name || 'Участник');
    }

    function medal(index) {
      if (index === 0) return '🥇';
      if (index === 1) return '🥈';
      if (index === 2) return '🥉';
      return '▫️';
    }

    const titles = {
      day: '🏆 Топ дня',
      week: '🏆 Топ недели',
      month: '🏆 Топ месяца',
      all: '🏆 Топ за всё время'
    };

    const users = Object.values(chat.users || {})
      .map((user) => ({
        ...user,
        score: getScore(user)
      }))
      .filter((user) => user.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 10);

    if (!users.length) {
      return ctx.reply(titles[mode] + '\n\nПока нет статистики для этого периода.');
    }

    const lines = users.map((user, index) => {
      return medal(index) + ' ' + (index + 1) + '. ' + getTopName(user) + ' — <b>' + user.score + '</b>';
    });

    const text = titles[mode] + '\n\n' + lines.join('\n');

    return ctx.reply(text, {
      parse_mode: 'HTML'
    });
  }

  if (command === 'level') {
    const u = getUserDB(chat, ctx.from);
    const level = levelFromXp(u.xp);
    return ctx.reply(`🎚 <b>Твой уровень:</b> ${level}\n🏷 Ранг активности: <b>${levelTitle(level)}</b>\nXP: <b>${u.xp}</b>`, { parse_mode: 'HTML' });
  }
  if (command === 'balance') {
    const u = getUserDB(chat, ctx.from);
    return ctx.reply(`🪙 У тебя <b>${u.balance}</b> монет.`, { parse_mode: 'HTML' });
  }
  if (command === 'daily') {
    const u = getUserDB(chat, ctx.from);
    const last = u.cooldowns.daily || 0;
    if (nowTs() - last < 24 * 60 * 60 * 1000) return ctx.reply('⏳ Ты уже забирал daily. Приходи позже.');
    u.cooldowns.daily = nowTs();
    u.balance += 250;
    saveDB();
    return ctx.reply(`🎁 Daily получен!\n\n🪙 +250 монет\n💰 Баланс: <b>${u.balance}</b>`, { parse_mode: 'HTML' });
  }
  if (command === 'give') {
    const target = resolveTarget(ctx, args);
    if (!target) return ctx.reply('❌ Использование: /give ID сумма или reply → /give сумма');
    const amount = Number(target.rest[0]);
    if (!amount || amount <= 0) return ctx.reply('❌ Укажи сумму.');
    const from = getUserDB(chat, ctx.from);
    const to = target.user ? getUserDB(chat, target.user) : chat.users[String(target.id)] || getUserDB(chat, { id: target.id, first_name: `ID ${target.id}` });
    if (from.balance < amount) return ctx.reply('❌ Недостаточно монет.');
    from.balance -= amount; to.balance += amount; saveDB();
    return ctx.reply(`🎁 ${mentionUser(ctx.from)} передал ${mentionById(target.id, usernameText(to))} <b>${amount}</b> монет.`, { parse_mode: 'HTML' });
  }
  if (command === 'shop') {
    return ctx.reply(`🎁 <b>Магазин ролей</b>\n\n⭐ VIP-роль — 5000 монет → /buy vip\n💎 Premium-роль — 10000 монет → /buy premium\n🏷 Кастомный титул — 7000 монет → /buy title\n🛡 Защита от 1 преда — 12000 монет → /buy shield\n🎨 Цветной профиль — 3000 монет → /buy color\n⭐ Буст репутации +5 — 4000 монет → /buy repboost`, { parse_mode: 'HTML' });
  }
  if (command === 'buy') {
    const item = (args[0] || '').toLowerCase();
    const prices = { vip: 5000, premium: 10000, title: 7000, shield: 12000, color: 3000, repboost: 4000 };
    if (!prices[item]) return ctx.reply('❌ Товар не найден. Открой /shop');
    const u = getUserDB(chat, ctx.from);
    if (u.balance < prices[item]) return ctx.reply(`❌ Недостаточно монет. Нужно: ${prices[item]}`);
    u.balance -= prices[item];
    if (item === 'vip') u.inventory.vip = true;
    if (item === 'premium') u.inventory.premium = true;
    if (item === 'title') u.inventory.customTitle = true;
    if (item === 'shield') u.inventory.warnShield = (u.inventory.warnShield || 0) + 1;
    if (item === 'color') u.inventory.coloredProfile = true;
    if (item === 'repboost') u.reputation += 5;
    saveDB();
    return ctx.reply(`✅ Покупка успешна: <b>${escapeHtml(item)}</b>\n💰 Остаток: <b>${u.balance}</b>`, { parse_mode: 'HTML' });
  }
  if (command === 'title') {
    const u = getUserDB(chat, ctx.from);
    if (!u.inventory.customTitle) return ctx.reply('❌ Сначала купи кастомный титул: /buy title');
    if (!argText) return ctx.reply('❌ Напиши титул: /title Легенда чата');
    u.title = argText.slice(0, 40); saveDB();
    return ctx.reply(`🏷 Титул установлен: <b>${escapeHtml(u.title)}</b>`, { parse_mode: 'HTML' });
  }
  if (command === 'removetitle') { const u = getUserDB(chat, ctx.from); u.title = null; saveDB(); return ctx.reply('✅ Титул снят.'); }
  if (command === 'rep' || command === 'minusrep') {
    const target = resolveTarget(ctx, args);
    if (!target || target.id === ctx.from.id) return ctx.reply('❌ Используй reply или ID, себе репутацию менять нельзя.');
    const from = getUserDB(chat, ctx.from);
    const key = `${target.id}:${command}`;
    if (nowTs() - (from.cooldowns.rep[key] || 0) < 12 * 60 * 60 * 1000) return ctx.reply('⏳ Этому пользователю ты уже менял репутацию недавно.');
    const to = target.user ? getUserDB(chat, target.user) : chat.users[String(target.id)] || getUserDB(chat, { id: target.id, first_name: `ID ${target.id}` });
    to.reputation += command === 'rep' ? 1 : -1;
    from.cooldowns.rep[key] = nowTs(); saveDB();
    return ctx.reply(`${command === 'rep' ? '⭐ Репутация повышена' : '➖ Репутация понижена'}\n\n👤 Пользователь: ${mentionById(target.id, usernameText(to))}\n⭐ Репутация: <b>${to.reputation}</b>`, { parse_mode: 'HTML' });
  }
  if (command === 'myrep') { const u = getUserDB(chat, ctx.from); return ctx.reply(`⭐ Твоя репутация: <b>${u.reputation}</b>`, { parse_mode: 'HTML' }); }


  if (command === 'basedb') {
    if (!(await requireGroup(ctx))) return;

    const users = getCallableUsersFromDB(chat, 'all');
    const admins = getCallableUsersFromDB(chat, 'admins');
    const owners = getCallableUsersFromDB(chat, 'owners');

    return ctx.reply(
      `📦 <b>База этой беседы</b>\n\n👥 Всего для созыва: <b>${users.length}</b>\n🛡 Админов: <b>${admins.length}</b>\n👑 Владельцев: <b>${owners.length}</b>\n\nЕсли человек написал хоть 1 сообщение — он автоматически сохраняется в БД и его можно созывать даже оффлайн.`,
      { parse_mode: 'HTML' }
    );
  }

  if (command === 'call') {
    if (!(await requireGroup(ctx))) return;

    const modeRaw = (args[0] || '').toLowerCase();

    if (['all', 'все', 'всех'].includes(modeRaw)) {
      return sendCallByMode(ctx, 'all');
    }

    if (['admins', 'админы', 'админов'].includes(modeRaw)) {
      return sendCallByMode(ctx, 'admins');
    }

    if (['owners', 'владельцы', 'владельцев'].includes(modeRaw)) {
      return sendCallByMode(ctx, 'owners');
    }

    if (!(await requireRank(ctx, 40))) return;

    return ctx.reply('📢 <b>Выбери тип созыва:</b>', {
      parse_mode: 'HTML',
      ...Markup.inlineKeyboard([
        [
          Markup.button.callback('👥 Все', `call:all:${ctx.from.id}`),
          Markup.button.callback('🛡 Админы', `call:admins:${ctx.from.id}`)
        ],
        [
          Markup.button.callback('👑 Владельцы', `call:owners:${ctx.from.id}`),
          Markup.button.callback('❌ Отмена', `call:cancel:${ctx.from.id}`)
        ]
      ])
    });
  }

  if (command === 'mute') {
    if (!(await requireRank(ctx, 30))) return;
    const target = resolveTarget(ctx, args);
    if (!target) return ctx.reply('❌ Использование: /мут ID минуты причина\nИли reply → /мут 60 причина');
    if (target.source === 'reply' && target.rest.length === 0) return ctx.reply('🔇 Выберите срок мута:', muteKeyboard(target.id, ctx.from.id));
    const minutes = Number(target.rest[0]) || 60;
    const reason = target.rest.slice(Number(target.rest[0]) ? 1 : 0).join(' ') || 'без причины';
    return muteUser(ctx, target.id, minutes, reason);
  }
  if (command === 'unmute') { if (!(await requireRank(ctx, 30))) return; const t = resolveTarget(ctx,args); if(!t) return ctx.reply('❌ /унмут ID или reply → /унмут'); return unmuteUser(ctx,t.id); }
  if (command === 'ban') { if (!(await requireRank(ctx, 70))) return; const t = resolveTarget(ctx,args); if(!t) return ctx.reply('❌ /бан ID причина или reply → /бан причина'); return banUser(ctx,t.id,t.rest.join(' ') || 'без причины'); }
  if (command === 'unban') { if (!(await requireRank(ctx, 70))) return; const t = resolveTarget(ctx,args); if(!t) return ctx.reply('❌ /разбан ID'); await ctx.telegram.unbanChatMember(ctx.chat.id, t.id); await ctx.reply(`✅ Пользователь <code>${t.id}</code> разбанен.`, { parse_mode: 'HTML' }); return logAction(ctx, `✅ ${mentionUser(ctx.from)} разбанил ID ${t.id}`); }
  if (command === 'kick') { if (!(await requireRank(ctx, 50))) return; const t = resolveTarget(ctx,args); if(!t) return ctx.reply('❌ /кик ID причина или reply → /кик причина'); return kickUser(ctx,t.id,t.rest.join(' ') || 'без причины'); }
  if (command === 'warn') { if (!(await requireRank(ctx, 30))) return; const t = resolveTarget(ctx,args); if(!t) return ctx.reply('❌ /пред ID причина или reply → /пред причина'); return warnUser(ctx,t.id,t.rest.join(' ') || 'без причины'); }
  if (command === 'unwarn') { if (!(await requireRank(ctx, 30))) return; const t = resolveTarget(ctx,args); if(!t) return ctx.reply('❌ /унпред ID или reply → /унпред'); const u = chat.users[String(t.id)]; if(!u || !u.warns?.length) return ctx.reply('✅ У пользователя нет предупреждений.'); u.warns.pop(); u.warnings = u.warns.length; pushHistory(chat,t.id,{type:'unwarn',adminId:ctx.from.id}); saveDB(); return ctx.reply(`✅ Предупреждение снято. Осталось: <b>${u.warns.length}</b>`, { parse_mode: 'HTML' }); }
  if (command === 'warns') { if (!(await requireRank(ctx, 10))) return; const t = resolveTarget(ctx,args,{self:true}); const u = chat.users[String(t.id)]; const warns = u?.warns || []; const list = warns.slice(-5).map((w,i)=>`${i+1}. ${escapeHtml(w.reason)} — ${new Date(w.date).toLocaleString('ru-RU')}`).join('\n') || 'нет'; return ctx.reply(`⚠️ <b>Предупреждения</b>\n\nID: <code>${t.id}</code>\nВсего: <b>${warns.length}/5</b>\n\n${list}`, { parse_mode: 'HTML' }); }
  if (command === 'history') { if (!(await requireRank(ctx, 30))) return; const t = resolveTarget(ctx,args,{self:true}); const u = chat.users[String(t.id)]; const h = u?.history || []; const list = h.slice(0,10).map((x,i)=>`${i+1}. ${x.type} — ${escapeHtml(x.reason || '')} ${x.minutes ? `(${x.minutes} мин.)` : ''}`).join('\n') || 'История пустая.'; return ctx.reply(`📂 <b>История пользователя</b>\n\nID: <code>${t.id}</code>\n⚠️ Предов: <b>${u?.warns?.length || 0}</b>\n⭐ Репутация: <b>${u?.reputation || 0}</b>\n💬 Сообщений: <b>${u?.messages || 0}</b>\n\n${list}`, { parse_mode: 'HTML' }); }
  if (command === 'actions') { if (!(await requireRank(ctx, 30))) return; const reply = ctx.message?.reply_to_message?.from; if(!reply) return ctx.reply('❌ Ответь на сообщение пользователя и напиши /действия'); return ctx.reply('👤 Действия с пользователем:', actionsKeyboard(reply.id, ctx.from.id)); }
  if (command === 'del') { if (!(await requireRank(ctx, 20))) return; const reply = ctx.message?.reply_to_message; if(!reply) return ctx.reply('❌ Ответь на сообщение, которое надо удалить.'); await ctx.telegram.deleteMessage(ctx.chat.id, reply.message_id).catch(()=>{}); await ctx.telegram.deleteMessage(ctx.chat.id, ctx.message.message_id).catch(()=>{}); return; }

  if (command === 'rank') { const t = resolveTarget(ctx,args,{self:true}); const r = await getUserAdminRank(ctx, t.id); return ctx.reply(`👑 Ранг: <b>${rankInfo(r).title}</b>\n📊 Уровень: <b>${r}</b>\n📝 ${rankInfo(r).note}`, { parse_mode: 'HTML' }); }
  if (command === 'ranks') {
    const list = Object.entries(ADMIN_RANKS).sort((a,b)=>b[0]-a[0]).map(([lvl,r])=>`<b>${lvl}</b> — ${r.title}\n${r.note}`).join('\n\n');
    return ctx.reply(`👑 <b>Ранги администрации</b>\n\n${list}\n\n<b>Команды выдачи:</b>\n/владелец — Владелец\n/зам — Заместитель владельца\n/га — Главный администратор\n/куратор — Куратор администрации\n/са — Старший администратор\n/админ — Администратор\n/ма — Младший администратор\n/см — Старший модератор\n/модер — Модератор\n/помощник — Помощник\n/стажер — Стажёр\n/юзер — снять ранг\n\n<b>Пример:</b>\n/админ 123456789\nили reply → /модер`, { parse_mode: 'HTML' });
  }
  if (command === 'admins') {
    const admins = Object.entries(chat.admins).filter(([,r])=>Number(r)>0).sort((a,b)=>b[1]-a[1]);
    const list = admins.map(([id,r],i)=>`${i+1}. ${mentionById(id, chat.users[id]?.firstName || `ID ${id}`)} — <b>${rankInfo(r).title}</b>`).join('\n') || 'Администрация не назначена.';
    return ctx.reply(`👑 <b>Администрация чата</b>\n\n${list}`, { parse_mode: 'HTML' });
  }
  if (command === 'setrank') { if (!(await requireRank(ctx, 20))) return; const t = resolveTarget(ctx,args); const newRank = Number(t?.rest?.[0]); if(!t || Number.isNaN(newRank)) return ctx.reply('❌ /setrank ID ранг или reply → /setrank ранг'); return setRank(ctx,t.id,newRank); }
  if (command === 'delrank') { if (!(await requireRank(ctx, 20))) return; const t = resolveTarget(ctx,args); if(!t) return ctx.reply('❌ /delrank ID или reply → /delrank'); return setRank(ctx,t.id,0); }
  if (command === 'rankShortcut') { if (!(await requireRank(ctx, 20))) return; const newRank = RANK_COMMANDS[raw]; const t = resolveTarget(ctx,args); if(!t) return ctx.reply(`❌ Использование: /${raw} ID или reply → /${raw}`); if (newRank === 100) { const actorRank = await getUserAdminRank(ctx, ctx.from.id); if (actorRank < 100) return ctx.reply('❌ Владельца может назначать только владелец/creator.'); } return setRank(ctx,t.id,newRank); }
  if (command === 'transferowner') { if (!(await requireRank(ctx,100))) return; const t = resolveTarget(ctx,args); if(!t) return ctx.reply('❌ /transferowner ID или reply'); pendingOwnerTransfers.set(String(ctx.chat.id), { from: ctx.from.id, to: t.id, ts: nowTs() }); return ctx.reply(`⚠️ Подтверди передачу владельца командой /confirmowner в течение 2 минут.`); }
  if (command === 'confirmowner') { if (!(await requireRank(ctx,100))) return; const p = pendingOwnerTransfers.get(String(ctx.chat.id)); if(!p || p.from !== ctx.from.id || nowTs()-p.ts>120000) return ctx.reply('❌ Нет активной передачи владельца.'); await setRank(ctx,p.to,100); pendingOwnerTransfers.delete(String(ctx.chat.id)); return; }

  if (command === 'settings') { if (!(await requireRank(ctx,80))) return; return ctx.reply('⚙️ Настройки чата', settingsKeyboard(chat)); }
  if (command === 'setlog') { if (!(await requireRank(ctx,80))) return; chat.settings.logChatId = ctx.chat.id; saveDB(); return ctx.reply('✅ Этот чат установлен как лог-чат.'); }
  if (command === 'logs') { if (!(await requireRank(ctx,80))) return; const list = chat.logs.slice(0,10).map((l,i)=>`${i+1}. ${escapeHtml(l.text)}`).join('\n') || 'Логов пока нет.'; return ctx.reply(`📢 <b>Последние логи</b>\n\n${list}`, { parse_mode: 'HTML' }); }
  if (['antispam','antilinks','antimat','welcome','goodbye'].includes(command)) { if (!(await requireRank(ctx,80))) return; const value = args[0]?.toLowerCase(); if(!['on','off','вкл','выкл'].includes(value)) return ctx.reply(`❌ Использование: /${raw} on или /${raw} off`); chat.settings[command] = ['on','вкл'].includes(value); saveDB(); return ctx.reply(`✅ ${command}: ${chat.settings[command] ? 'ON' : 'OFF'}`); }
  if (command === 'setwelcome') { if (!(await requireRank(ctx,80))) return; chat.settings.welcomeText = argText; saveDB(); return ctx.reply('✅ Приветствие обновлено.'); }
  if (command === 'setgoodbye') { if (!(await requireRank(ctx,80))) return; chat.settings.goodbyeText = argText; saveDB(); return ctx.reply('✅ Прощание обновлено.'); }
  if (command === 'badwords') { if (!(await requireRank(ctx,80))) return; return ctx.reply(`🤬 Матлист:\n${(chat.settings.badwords || []).join(', ') || 'пусто'}`); }
  if (command === 'addbadword') { if (!(await requireRank(ctx,80))) return; chat.settings.badwords ||= []; if(argText) chat.settings.badwords.push(argText.toLowerCase()); saveDB(); return ctx.reply('✅ Слово добавлено.'); }
  if (command === 'delbadword') { if (!(await requireRank(ctx,80))) return; chat.settings.badwords = (chat.settings.badwords || []).filter(w=>w!==argText.toLowerCase()); saveDB(); return ctx.reply('✅ Слово удалено.'); }
  if (command === 'punishments') return ctx.reply('📕 <b>Система наказаний</b>\n\n1 пред — предупреждение\n2 преда — мут 30 минут\n3 преда — мут 2 часа\n4 преда — кик\n5 предов — бан\n\nЗа рекламу — мут/бан по решению администрации.', { parse_mode: 'HTML' });
}


bot.use(async (ctx, next) => {
  try {
    if (ctx.chat) {
      const chat = getChatDB(ctx.chat.id);

      chat.title = ctx.chat.title || chat.title || 'Личная переписка';
      chat.type = ctx.chat.type || chat.type || 'unknown';
      chat.updatedAt = new Date().toISOString();

      if (!chat.settings) chat.settings = {};
      if (!chat.settings.rules) chat.settings.rules = DEFAULT_RULES;
      if (chat.settings.welcomeText === undefined) {
        chat.settings.welcomeText = '👋 Добро пожаловать, {user}!\n\nТы попал в «{chat}». Перед общением прочитай /правила.';
      }

      saveDB();
    }
  } catch (error) {
    console.error('sync chat info error:', error);
  }

  return next();
});

bot.start(async (ctx) => ctx.reply(`🤖 Привет, ${escapeHtml(ctx.from.first_name || 'друг')}!\n\nЯ FulTalchik_botik — универсальный бот для Telegram-бесед. Добавь меня в группу и напиши /настроить.`));

bot.on('new_chat_members', async (ctx) => {
  try {
    const chat = getChatDB(ctx.chat.id);
    if (!chat.settings.welcome) return;
    for (const member of ctx.message.new_chat_members || []) {
      if (member.is_bot) continue;
      const u = rememberChatUserForCalls(ctx, member) || getUserDB(chat, member); u.canCall = true; u.leftChat = false; u.balance += 25; saveDB();
      const text = chat.settings.welcomeText || '👋 Добро пожаловать, {user}!\n\nТы попал в «Клуб случайных людей». Перед общением прочитай /правила.';
      await ctx.reply(text.replace('{user}', mentionUser(member)).replace('{chat}', escapeHtml(ctx.chat.title || chat.title || 'эта беседа')), { parse_mode: 'HTML' });
    }
  } catch (e) { console.error('welcome error:', e); }
});

bot.on('left_chat_member', async (ctx) => {
  try {
    const chat = getChatDB(ctx.chat.id);
    if (!chat.settings.goodbye) return;
    const member = ctx.message.left_chat_member;
    markUserLeftChat(ctx, member);
    const text = chat.settings.goodbyeText || '👋 {user} покинул чат.';
    await ctx.reply(text.replace('{user}', mentionUser(member)), { parse_mode: 'HTML' });
  } catch (e) { console.error('goodbye error:', e); }
});


async function sendCallByModeButton(ctx, mode) {
  const chatId = ctx.chat.id;
  const chat = getChatDB(chatId);

  let minRank = 40;

  if (mode === 'all') minRank = 60;
  if (mode === 'admins') minRank = 40;
  if (mode === 'owners') minRank = 80;

  const userRank = await getUserAdminRank(ctx, ctx.from.id);

  if (userRank < minRank) {
    return ctx.telegram.sendMessage(
      chatId,
      `❌ Недостаточно прав.\n\nТвой ранг: ${rankInfo(userRank).title}\nНужный ранг: ${rankInfo(minRank).title}`,
      { parse_mode: 'HTML' }
    );
  }

  const now = nowTs();
  const lastCall = chat.lastCallAt || 0;
  const cooldown = 10 * 60 * 1000;

  if (now - lastCall < cooldown) {
    const left = Math.ceil((cooldown - (now - lastCall)) / 60000);

    return ctx.telegram.sendMessage(
      chatId,
      `⏳ Созыв уже был недавно. Подожди ещё ${left} мин.`
    );
  }

  // Берём людей из БД:
  // написал сообщение / вошёл в чат / добавлен через запомнить / админ после обновитьадминов
  let users = getCallableUsersFromDB(chat, mode);

  if (!users.length) {
    return ctx.telegram.sendMessage(
      chatId,
      '❌ Некого созывать.\n\nБот ещё не знает участников этой категории.\n\nЧтобы бот запомнил человека:\n• человек должен написать любое сообщение;\n• или ответь на его сообщение: запомнить;\n• или добавь по ID: запомнить 123456789 Имя;\n• для админов: обновитьадминов'
    );
  }

  chat.lastCallAt = now;
  saveDB();

  const title =
    mode === 'all'
      ? '👥 Все участники из базы'
      : mode === 'admins'
        ? '🛡 Администрация из базы'
        : '👑 Владельцы из базы';

  await ctx.telegram.sendMessage(
    chatId,
    `📢 <b>Созыв: ${title}</b>\n\n👮 Созвал: ${mentionUser(ctx.from)}\n👥 Найдено в БД: <b>${users.length}</b>`,
    { parse_mode: 'HTML' }
  );

  for (let i = 0; i < users.length; i += 25) {
    const chunk = users.slice(i, i + 25);

    const mentions = chunk
      .map((u) => {
        const name = u.firstName || u.username || `ID ${u.id}`;
        return mentionById(u.id, name);
      })
      .join(' ');

    await ctx.telegram.sendMessage(chatId, mentions, { parse_mode: 'HTML' });
  }
}

bot.action(/^call:(all|admins|owners|cancel):(\d+)$/, async (ctx) => {
  try {
    const mode = ctx.match[1];
    const actorId = Number(ctx.match[2]);

    if (ctx.from.id !== actorId) {
      return ctx.answerCbQuery('❌ Эта кнопка не для тебя.');
    }

    await ctx.answerCbQuery();

    if (mode === 'cancel') {
      return ctx.editMessageText('❌ Созыв отменён.').catch(() => {});
    }

    await ctx.editMessageText('⏳ Выполняю созыв...').catch(() => {});

    return sendCallByModeButton(ctx, mode);
  } catch (error) {
    console.error('call button error:', error);
    return ctx.answerCbQuery('Ошибка при созыве.').catch(() => {});
  }
});


bot.on('callback_query', async (ctx) => {
  try {
    const data = ctx.callbackQuery.data || '';
    const parts = data.split(':');
    if (parts[0] === 'cancel') {
      if (Number(parts[1]) !== ctx.from.id) return ctx.answerCbQuery('❌ Эта кнопка не для тебя.');
      await ctx.editMessageText('❌ Действие отменено.').catch(()=>{});
      return ctx.answerCbQuery();
    }
    if (data.startsWith('help:')) {
      const section = parts[1];
      const texts = {
        mod: '🛡 <b>Модерация</b>\n/mute /мут\n/unmute /унмут\n/ban /бан\n/unban /разбан\n/kick /кик\n/warn /пред\n/unwarn /унпред\n/actions /действия',
        ranks: `👑 <b>Ранги администрации</b>

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
reply → /юзер`,
        profile: '👤 <b>Профиль</b>\n/profile /профиль\n/top /топ\n/level /уровень\n/balance /баланс\n/rep /реп\n/myrep /мояреп',
        rules: '📜 <b>Правила</b>\n/rules /правила\n/setrules /установитьправила',
        settings: '⚙️ <b>Настройки</b>\n/settings /настройки\n/antispam /антиспам\n/antilinks /ссылки\n/antimat /антимат\n/setlog /сетлог',
        shop: '🎁 <b>Магазин</b>\n/shop /магазин\n/buy /купить\n/title /титул\n/daily /ежедневно'
      };
      await ctx.editMessageText(texts[section] || 'Раздел не найден.', { parse_mode: 'HTML', ...mainMenuKeyboard() }).catch(()=>{});
      return ctx.answerCbQuery();
    }
    if (parts[0] === 'set') {
      if (!(await requireRank(ctx, 80))) return ctx.answerCbQuery('Недостаточно прав');
      const chat = getChatDB(ctx.chat.id);
      const key = parts[1];
      chat.settings[key] = !chat.settings[key]; saveDB();
      await ctx.editMessageText('⚙️ Настройки чата', settingsKeyboard(chat)).catch(()=>{});
      return ctx.answerCbQuery('Готово');
    }
    if (parts[0] === 'call') {
      const mode = parts[1];
      const actorId = Number(parts[2]);
      if (ctx.from.id !== actorId) return ctx.answerCbQuery('❌ Эта кнопка не для тебя.');
      await ctx.answerCbQuery();
      if (mode === 'cancel') {
        await ctx.editMessageText('❌ Созыв отменён.').catch(()=>{});
        return;
      }
      const fakeCtx = { ...ctx, message: { text: `/call ${mode}` }, chat: ctx.callbackQuery.message.chat };
      await handleCommand(fakeCtx, { command: 'call', raw: 'call', args: [mode], argText: mode });
      return;
    }
    if (parts[0] === 'mute') {
      const actorId = Number(parts[1]), targetId = Number(parts[2]), minutes = Number(parts[3]);
      if (ctx.from.id !== actorId) return ctx.answerCbQuery('❌ Эта кнопка не для тебя.');
      await ctx.editMessageText('📌 Выберите причину:', reasonKeyboard('mute', actorId, targetId, minutes)).catch(()=>{});
      return ctx.answerCbQuery();
    }
    if (parts[0] === 'muter') {
      const actorId = Number(parts[1]), targetId = Number(parts[2]), minutes = Number(parts[3]);
      const reason = parts.slice(4).join(':') || 'без причины';
      if (ctx.from.id !== actorId) return ctx.answerCbQuery('❌ Эта кнопка не для тебя.');
      await ctx.deleteMessage().catch(()=>{});
      await muteUser(ctx, targetId, minutes, reason);
      return ctx.answerCbQuery('Мут выдан');
    }
    if (parts[0] === 'act') {
      const action = parts[1], actorId = Number(parts[2]), targetId = Number(parts[3]);
      if (ctx.from.id !== actorId) return ctx.answerCbQuery('❌ Эта кнопка не для тебя.');
      if (action === 'mute') { await ctx.editMessageText('🔇 Выберите срок мута:', muteKeyboard(targetId, actorId)).catch(()=>{}); return ctx.answerCbQuery(); }
      if (action === 'ban') { await ctx.editMessageText('📌 Выберите причину:', reasonKeyboard('ban', actorId, targetId, 0)).catch(()=>{}); return ctx.answerCbQuery(); }
      if (action === 'kick') { await kickUser(ctx, targetId, 'быстрое действие'); return ctx.answerCbQuery('Кик'); }
      if (action === 'warn') { await warnUser(ctx, targetId, 'быстрое действие'); return ctx.answerCbQuery('Пред'); }
      if (action === 'history') { const hctx = { ...ctx, message: { text: `/history ${targetId}` } }; await handleCommand(hctx, { command: 'history', raw: 'history', args: [String(targetId)], argText: String(targetId) }); return ctx.answerCbQuery(); }
      if (action === 'del') { return ctx.answerCbQuery('Удаление работает через reply → /del'); }
    }
    if (parts[0] === 'banr') {
      const actorId = Number(parts[1]), targetId = Number(parts[2]);
      const reason = parts.slice(4).join(':') || 'без причины';
      if (ctx.from.id !== actorId) return ctx.answerCbQuery('❌ Эта кнопка не для тебя.');
      await banUser(ctx, targetId, reason); return ctx.answerCbQuery('Бан выдан');
    }
  } catch (error) {
    console.error('callback error:', error);
    await ctx.answerCbQuery('Ошибка').catch(()=>{});
  }
});

bot.on('text', async (ctx, next) => {
  try {
    const text = ctx.message.text || '';
    const parsed = parseCommand(ctx);
    if (isGroup(ctx)) {
      const chat = getChatDB(ctx.chat.id);
      const user = getUserDB(chat, ctx.from);
      const day = todayKey();
      ensurePeriodStats(user); const week = weekKey(); const month = monthKey(); user.messages += 1; user.xp += 1; user.messagesDay[day] = (user.messagesDay[day] || 0) + 1; user.messagesWeek[week] = (user.messagesWeek[week] || 0) + 1; user.messagesMonth[month] = (user.messagesMonth[month] || 0) + 1;
      if (nowTs() - (user.lastMessageCoinAt || 0) > 30000) { user.balance += 1; user.lastMessageCoinAt = nowTs(); }
      saveDB();
      const rank = await getUserAdminRank(ctx, ctx.from.id);
      if (!parsed && rank < 30) {
        if (chat.settings.antilinks && hasLink(text) && !isAllowedVideoLink(text)) {
          await ctx.deleteMessage().catch(()=>{});
          await warnUser(ctx, ctx.from.id, 'запрещённая ссылка');
          return;
        }
        if (chat.settings.antimat) {
          const words = chat.settings.badwords || ['мат', 'оскорбление'];
          if (words.some(w => w && text.toLowerCase().includes(w.toLowerCase()))) {
            await ctx.deleteMessage().catch(()=>{});
            await warnUser(ctx, ctx.from.id, 'запрещённое слово');
            return;
          }
        }
        if (chat.settings.antispam) {
          const key = String(ctx.from.id);
          const now = nowTs();
          chat.antispam[key] ||= [];
          chat.antispam[key] = chat.antispam[key].filter(t => now - t < 10000);
          chat.antispam[key].push(now); saveDB();
          if (chat.antispam[key].length >= 10) { await muteUser(ctx, ctx.from.id, 30, 'антиспам'); return; }
          if (chat.antispam[key].length >= 5) { await muteUser(ctx, ctx.from.id, 5, 'антиспам'); return; }
        }
      }
    }
    if (!parsed && isGroup(ctx)) {
      const autoChat = getChatDB(ctx.chat.id);
      const autoUser = getUserDB(autoChat, ctx.from);
      await processAutoFeaturesForMessage(ctx, text, autoUser);
    }

    if (parsed) return handleCommand(ctx, parsed);
    if (isVideoLink(text)) {
      const url = normalizeUrl(text);
      let msg, file;
      try {
        msg = await ctx.reply('⏳ Скачиваю видео...');
        file = await downloadVideo(url);
        await ctx.telegram.deleteMessage(ctx.chat.id, msg.message_id).catch(()=>{});
        await ctx.replyWithVideo({ source: file }, { caption: `👉 Скачано через @${BOT_USERNAME}`, supports_streaming: true });
      } catch (error) {
        await ctx.telegram.deleteMessage(ctx.chat.id, msg?.message_id).catch(()=>{});
        await ctx.reply(`❌ Не получилось скачать видео.\n\n<code>${escapeHtml(String(error.message || error).slice(0, 800))}</code>`, { parse_mode: 'HTML' });
      } finally { if (file && fs.existsSync(file)) fs.unlinkSync(file); }
    }
  } catch (error) {
    console.error('text handler error:', error);
    await ctx.reply('❌ Произошла ошибка, но бот продолжает работать.').catch(()=>{});
  }
});

process.on('unhandledRejection', (reason) => console.error('unhandledRejection:', reason));
process.on('uncaughtException', (error) => console.error('uncaughtException:', error));

bot.catch((error) => console.error('Глобальная ошибка Telegraf:', error));

startFridayScheduler();

startAutoFeaturesScheduler();

bot.launch({ dropPendingUpdates: true });
console.log('✅ FulTalchik_botik запущен!');
console.log('🤖 Клуб случайных людей работает');
console.log('🚀 GitHub/Railway ready');

process.once('SIGINT', () => { saveDBNow(); bot.stop('SIGINT'); });
process.once('SIGTERM', () => { saveDBNow(); bot.stop('SIGTERM'); });
