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
  100: { title: '👑 Владелец', note: 'Может абсолютно всё.', muteLimit: Infinity },
  95: { title: '🛡 Заместитель владельца', note: 'Всё, кроме управления владельцем.', muteLimit: Infinity },
  90: { title: '💎 Главный администратор', note: 'Выдаёт ранги до 80, управляет модерацией и настройками.', muteLimit: Infinity },
  80: { title: '🔥 Куратор администрации', note: 'Контроль админов, наказания, логи, настройки.', muteLimit: Infinity },
  70: { title: '⚡ Старший администратор', note: 'Бан, мут, кик, предупреждения, история.', muteLimit: Infinity },
  60: { title: '🧩 Администратор', note: 'Мут до 24 часов, кик, предупреждения.', muteLimit: 1440 },
  50: { title: '🛠 Младший администратор', note: 'Мут до 120 минут, преды, удаление сообщений.', muteLimit: 120 },
  40: { title: '👮 Старший модератор', note: 'Мут до 60 минут, преды, действия.', muteLimit: 60 },
  30: { title: '🧹 Модератор', note: 'Мут до 30 минут, преды, удаление.', muteLimit: 30 },
  20: { title: '🤝 Помощник', note: 'Правила, профили, преды, удаление.', muteLimit: 0 },
  10: { title: '🌱 Стажёр', note: 'Просмотр профиля, правил, рангов и предов.', muteLimit: 0 },
  0: { title: '👤 Пользователь', note: 'Обычные команды.', muteLimit: 0 }
};

const RANK_COMMANDS = {
  owner: 100, владелец: 100,
  deputy: 95, зам: 95, заместитель: 95,
  headadmin: 90, главныйадмин: 90, главадмин: 90,
  curator: 80, куратор: 80,
  senioradmin: 70, старшийадмин: 70, стадмин: 70,
  admin: 60, админ: 60,
  junioradmin: 50, младшийадмин: 50, младший: 50,
  seniormoder: 40, старшиймодер: 40, стмодер: 40,
  moder: 30, модер: 30, модератор: 30,
  helper: 20, хелпер: 20, помощник: 20,
  trainee: 10, стажер: 10, стажёр: 10,
  user: 0, пользователь: 0
};

const ALIASES = {
  help: ['help', 'помощь', 'commands', 'команды'],
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

  if (command === 'help') {
    return ctx.reply(`🤖 <b>FulTalchik_botik — меню команд</b>\n\nВыбери раздел ниже или используй команды:\n/help /помощь\n/rules /правила\n/profile /профиль\n/shop /магазин`, { parse_mode: 'HTML', ...mainMenuKeyboard() });
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
    const period = args[0]?.toLowerCase() || 'all';
    const day = todayKey();
    const week = weekKey();
    const month = monthKey();

    const users = Object.values(chat.users).map(u => {
      ensurePeriodStats(u);
      let score = u.messages || 0;
      let title = '🏆 Топ за всё время';
      if (['day', 'день', 'today', 'сегодня'].includes(period)) {
        score = u.messagesDay?.[day] || 0;
        title = '🏆 Топ дня';
      } else if (['week', 'неделя'].includes(period)) {
        score = u.messagesWeek?.[week] || 0;
        title = '🏆 Топ недели';
      } else if (['month', 'месяц'].includes(period)) {
        score = u.messagesMonth?.[month] || 0;
        title = '🏆 Топ месяца';
      }
      return { ...u, score, topTitle: title };
    }).filter(u => u.score > 0).sort((a,b)=>b.score-a.score);

    const title = users[0]?.topTitle || '🏆 Топ активных участников';
    const list = users.slice(0, 10).map((u, i) => `${i + 1}. ${usernameText(u)} — <b>${u.score}</b>`).join('\\n') || 'Пока нет статистики.';
    return ctx.reply(`<b>${title}</b>\\n\\n${list}`, { parse_mode: 'HTML' });
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
    return ctx.reply(`👑 <b>Ранги администрации</b>\n\n${list}\n\n<b>Команды рангов:</b>\n/owner /deputy /headadmin /curator /senioradmin /admin /junioradmin /seniormoder /moder /helper /trainee /user\nРусские: /владелец /зам /главадмин /куратор /старшийадмин /админ /младшийадмин /старшиймодер /модер /помощник /стажер /пользователь`, { parse_mode: 'HTML' });
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

bot.start(async (ctx) => ctx.reply(`🤖 Привет, ${escapeHtml(ctx.from.first_name || 'друг')}!\n\nЯ FulTalchik_botik для «Клуба случайных людей». Напиши /help.`));

bot.on('new_chat_members', async (ctx) => {
  try {
    const chat = getChatDB(ctx.chat.id);
    if (!chat.settings.welcome) return;
    for (const member of ctx.message.new_chat_members || []) {
      if (member.is_bot) continue;
      const u = getUserDB(chat, member); u.balance += 25; saveDB();
      const text = chat.settings.welcomeText || '👋 Добро пожаловать, {user}!\n\nТы попал в «Клуб случайных людей». Перед общением прочитай /правила.';
      await ctx.reply(text.replace('{user}', mentionUser(member)), { parse_mode: 'HTML' });
    }
  } catch (e) { console.error('welcome error:', e); }
});

bot.on('left_chat_member', async (ctx) => {
  try {
    const chat = getChatDB(ctx.chat.id);
    if (!chat.settings.goodbye) return;
    const member = ctx.message.left_chat_member;
    const text = chat.settings.goodbyeText || '👋 {user} покинул чат.';
    await ctx.reply(text.replace('{user}', mentionUser(member)), { parse_mode: 'HTML' });
  } catch (e) { console.error('goodbye error:', e); }
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
        ranks: '👑 <b>Ранги</b>\n/ranks /ранги\n/rank /ранг\n/setrank /выдатьранг\n/delrank /снятьранг\n/admins /админы\n\nКоманды рангов: /owner /deputy /headadmin /curator /senioradmin /admin /junioradmin /seniormoder /moder /helper /trainee /user',
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

bot.launch({ dropPendingUpdates: true });
console.log('✅ FulTalchik_botik запущен!');
console.log('🤖 Клуб случайных людей работает');
console.log('🚀 GitHub/Railway ready');

process.once('SIGINT', () => { saveDBNow(); bot.stop('SIGINT'); });
process.once('SIGTERM', () => { saveDBNow(); bot.stop('SIGTERM'); });
