// ═══════════════════════════════════════════════════════════════
//  FulTalchik_Botik  v3.0  —  node-telegram-bot-api
//  Railway 24/7  |  data/database.json
// ═══════════════════════════════════════════════════════════════
'use strict';
require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const fs   = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const { promisify } = require('util');
const execFileAsync = promisify(execFile);

// ── ENV ──────────────────────────────────────────────────────────
const BOT_TOKEN    = process.env.BOT_TOKEN;
const BOT_USERNAME = (process.env.BOT_USERNAME || '').toLowerCase();
const OWNER_ID     = parseInt(process.env.OWNER_ID || '0', 10);

if (!BOT_TOKEN) {
  console.error('❌  BOT_TOKEN не найден. Добавь его в .env или Railway Variables.');
  process.exit(1);
}

// ── DATABASE ──────────────────────────────────────────────────────
const DB_DIR  = path.join(__dirname, 'data');
const DB_PATH = path.join(DB_DIR, 'database.json');
const DOWNLOAD_DIR = path.join(__dirname, 'downloads');

const mkDefaultChat = () => ({
  title: '',
  type: '',
  settings: {
    antispam: false, antilinks: false, antimat: false,
    welcome: true,  goodbye: false,
    welcomeText: null, goodbyeText: null,
    rules: '1. Не оскорблять участников.\n2. Не спамить и не флудить.\n3. Не рекламировать без разрешения.\n4. Не провоцировать конфликты.\n5. Не отправлять запрещённый контент.\n6. Уважать администрацию.\n7. Не обходить наказания.',
    logChatId: null,
    badwords: [],
    morningEnabled: true,  nightEnabled: true,
    weeklyReportEnabled: true,
    lastMorningDate: null, lastNightDate: null,
    lastWeeklyDate: null,
    callCooldown: 0,
    fridayPost: { enabled: false, time: '18:00', text: null, lastSentDate: null }
  },
  users: {},
  logs: [],
  reminders: [],
  pendingOwnerTransfer: null
});

const mkDefaultUser = (id, firstName, username) => ({
  id,
  firstName: firstName || 'Без имени',
  username:  username  || null,
  isBot: false,
  canCall: true,
  leftChat: false,
  firstSeenAt: Date.now(),
  lastSeenAt:  Date.now(),
  messages: 0,
  xp: 0,
  balance: 0,
  reputation: 0,
  title: null,
  adminRank: 0,
  warns: [],
  history: [],
  birthday: null,
  couple: null,
  inventory: { vip: false, premium: false, customTitle: false, warnShield: 0, coloredProfile: false },
  cooldowns:  { daily: 0, rep: {}, action: 0 },
  stats: { daily: {}, weekly: {}, monthly: {} },
  msgTypes: {
    text: 0, voice: 0, circle: 0, photo: 0, video: 0,
    sticker: 0, document: 0, audio: 0, animation: 0, other: 0
  },
  achievements: {}
});

let db = { meta: { version: '3.0' }, globalAdmins: {}, chats: {} };
let _saveTimer = null;

function loadDB() {
  try {
    if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, { recursive: true });
    if (!fs.existsSync(DOWNLOAD_DIR)) fs.mkdirSync(DOWNLOAD_DIR, { recursive: true });
    if (!fs.existsSync(DB_PATH)) { saveDB(true); console.log('📁  database.json создан.'); return; }
    const raw = fs.readFileSync(DB_PATH, 'utf8').trim();
    if (!raw) { saveDB(true); return; }
    const parsed = JSON.parse(raw);
    db = parsed;
    if (!db.meta)         db.meta         = { version: '3.0' };
    if (!db.globalAdmins) db.globalAdmins = {};
    if (!db.chats)        db.chats        = {};
  } catch (e) {
    const bak = `database.broken.${Date.now()}.json`;
    try { fs.renameSync(DB_PATH, path.join(DB_DIR, bak)); } catch (_) {}
    console.error(`⚠️  database.json повреждён → резервная копия: ${bak}`);
    db = { meta: { version: '3.0' }, globalAdmins: {}, chats: {} };
    saveDB(true);
  }
}

function saveDB(immediate = false) {
  const write = () => {
    try {
      if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, { recursive: true });
      fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2), 'utf8');
    } catch (e) { console.error('DB write error:', e.message); }
  };
  if (immediate) { write(); return; }
  if (_saveTimer) clearTimeout(_saveTimer);
  _saveTimer = setTimeout(write, 1500);
}

function getChat(chatId, title, type) {
  const cid = String(chatId);
  if (!db.chats[cid]) { db.chats[cid] = mkDefaultChat(); saveDB(); }
  const c = db.chats[cid];
  // migration guards
  if (!c.settings.fridayPost)  c.settings.fridayPost  = mkDefaultChat().settings.fridayPost;
  if (c.settings.morningEnabled === undefined) c.settings.morningEnabled = true;
  if (c.settings.nightEnabled   === undefined) c.settings.nightEnabled   = true;
  if (c.settings.weeklyReportEnabled === undefined) c.settings.weeklyReportEnabled = true;
  if (!c.reminders) c.reminders = [];
  if (title) c.title = title;
  if (type)  c.type  = type;
  return c;
}

function getUser(chatId, userId, firstName, username) {
  const chat = getChat(chatId);
  const uid  = String(userId);
  if (!chat.users[uid]) {
    chat.users[uid] = mkDefaultUser(userId, firstName, username);
    saveDB();
  }
  const u = chat.users[uid];
  if (firstName) u.firstName = firstName;
  if (username !== undefined) u.username = username;
  if (!u.stats)    u.stats    = { daily: {}, weekly: {}, monthly: {} };
  if (!u.msgTypes) u.msgTypes = { text:0, voice:0, circle:0, photo:0, video:0, sticker:0, document:0, audio:0, animation:0, other:0 };
  if (!u.achievements) u.achievements = {};
  if (!u.cooldowns)    u.cooldowns    = { daily: 0, rep: {}, action: 0 };
  if (u.couple === undefined)  u.couple  = null;
  if (u.birthday === undefined) u.birthday = null;
  u.lastSeenAt = Date.now();
  return u;
}

loadDB();

// ── BOT INIT ──────────────────────────────────────────────────────
const bot = new TelegramBot(BOT_TOKEN, { polling: { dropPendingUpdates: true } });

bot.on('polling_error', err => console.error('Polling error:', err.message));
process.on('unhandledRejection', r  => console.error('UnhandledRejection:', r));
process.on('uncaughtException',  e  => console.error('UncaughtException:',  e.message));

let _botId = 0, _botUser = null;
bot.getMe().then(me => { _botId = me.id; _botUser = me; }).catch(() => {});

// ── RANK SYSTEM ───────────────────────────────────────────────────
const RANKS = {
  100: { emoji: '👑', name: 'Владелец',                note: 'Полный доступ',            muteLimit: Infinity },
  95:  { emoji: '🛡', name: 'Заместитель владельца',   note: 'Всё кроме смены владельца', muteLimit: Infinity },
  90:  { emoji: '💎', name: 'Главный администратор',   note: 'Бан, мут, ранги до 80',     muteLimit: Infinity },
  80:  { emoji: '🔥', name: 'Куратор администрации',   note: 'Ранги до 70, бан, мут',     muteLimit: Infinity },
  70:  { emoji: '⚡', name: 'Старший администратор',   note: 'Ранги до 60, бан, мут',     muteLimit: Infinity },
  60:  { emoji: '🧩', name: 'Администратор',           note: 'Ранги до 50, мут, кик',     muteLimit: 1440 },
  50:  { emoji: '🛠', name: 'Младший администратор',   note: 'Мут до 2ч, предупреждения', muteLimit: 120 },
  40:  { emoji: '👮', name: 'Старший модератор',       note: 'Мут до 60мин',              muteLimit: 60 },
  30:  { emoji: '🧹', name: 'Модератор',               note: 'Мут до 30мин, удаление',    muteLimit: 30 },
  20:  { emoji: '🤝', name: 'Помощник',                note: 'Просмотр, удаление',        muteLimit: 0 },
  10:  { emoji: '🌱', name: 'Стажёр',                  note: 'Просмотр команд',           muteLimit: 0 },
  0:   { emoji: '👤', name: 'Пользователь',            note: 'Базовые команды',           muteLimit: 0 }
};

function getRankInfo(rank) {
  const keys = Object.keys(RANKS).map(Number).sort((a,b) => b - a);
  for (const k of keys) if (rank >= k) return { level: k, ...RANKS[k] };
  return { level: 0, ...RANKS[0] };
}

function getMuteLimit(rank) {
  if (rank >= 70) return Infinity;
  if (rank >= 60) return 1440;
  if (rank >= 50) return 120;
  if (rank >= 40) return 60;
  if (rank >= 30) return 30;
  return 0;
}

async function getEffectiveRank(chatId, userId) {
  const uid = parseInt(userId, 10);
  // OWNER_ID from env
  if (OWNER_ID && uid === OWNER_ID) return 100;
  // Telegram creator
  try {
    const m = await bot.getChatMember(chatId, uid);
    if (m.status === 'creator') return 100;
  } catch (_) {}
  // global admin
  const ga = db.globalAdmins[String(uid)];
  const globalRank = ga ? ga.rank : 0;
  // local admin
  const u = getUser(chatId, uid);
  const localRank = u.adminRank || 0;
  return Math.max(globalRank, localRank);
}

async function canManageTarget(chatId, actorId, targetId) {
  const aRank = await getEffectiveRank(chatId, actorId);
  const tRank = await getEffectiveRank(chatId, targetId);
  return aRank > tRank && aRank >= 30;
}

// ── HELPERS ───────────────────────────────────────────────────────
const esc = s => s ? String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;') : '';

function mention(user) {
  if (user.username) return `@${esc(user.username)}`;
  return esc(user.firstName || user.first_name || String(user.id));
}

function fmtDur(min) {
  if (!min || min === Infinity) return 'навсегда';
  if (min < 60)   return `${min} мин.`;
  if (min < 1440) return `${Math.round(min/60)} ч.`;
  return `${Math.round(min/1440)} д.`;
}

function todayKey()  { return new Date().toISOString().slice(0,10); }
function weekKey()   { const d=new Date(); const j=new Date(d.getFullYear(),0,1); return `${d.getFullYear()}-W${String(Math.ceil(((d-j)/86400000+j.getDay()+1)/7)).padStart(2,'0')}`; }
function monthKey()  { const d=new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`; }

function isVideoLink(text) {
  return /https?:\/\/(www\.)?(tiktok\.com|vm\.tiktok\.com|vt\.tiktok\.com|youtube\.com|youtu\.be|instagram\.com|www\.instagram\.com)/i.test(text || '');
}

function extractVideoUrl(text) {
  const match = String(text || '').match(/https?:\/\/\S+/i);
  return match ? match[0] : null;
}

async function downloadVideo(url) {
  if (!fs.existsSync(DOWNLOAD_DIR)) fs.mkdirSync(DOWNLOAD_DIR, { recursive: true });
  const outputPath = path.join(DOWNLOAD_DIR, `video_${Date.now()}.mp4`);

  await execFileAsync('yt-dlp', [
    '-f',
    'mp4/best',
    '--merge-output-format',
    'mp4',
    '-o',
    outputPath,
    url
  ], { timeout: 120000 });

  return outputPath;
}

async function handleVideoDownload(msg) {
  const url = extractVideoUrl(msg.text || msg.caption || '');
  if (!url) return false;

  let loadingMessage = null;
  let videoPath = null;

  try {
    loadingMessage = await bot.sendMessage(msg.chat.id, '⏳ Скачиваю видео, подожди немного...');
    videoPath = await downloadVideo(url);

    await bot.sendVideo(msg.chat.id, videoPath, {
      caption: '✅ Видео готово!'
    });

    if (loadingMessage) {
      await bot.deleteMessage(msg.chat.id, loadingMessage.message_id).catch(() => {});
    }

    if (videoPath && fs.existsSync(videoPath)) fs.unlinkSync(videoPath);
    return true;
  } catch (error) {
    console.error('Ошибка скачивания видео:', error.message);

    if (loadingMessage) {
      await bot.deleteMessage(msg.chat.id, loadingMessage.message_id).catch(() => {});
    }

    await bot.sendMessage(
      msg.chat.id,
      '❌ Не получилось скачать видео. Возможно, ссылка закрытая, видео защищено или yt-dlp не установлен.'
    );

    if (videoPath && fs.existsSync(videoPath)) fs.unlinkSync(videoPath);
    return true;
  }
}

async function tgReply(chatId, text, extra = {}) {
  try { return await bot.sendMessage(chatId, text, { parse_mode: 'HTML', ...extra }); }
  catch (e) { console.error('tgReply error:', e.message); }
}

async function replyTo(msg, text, extra = {}) {
  return tgReply(msg.chat.id, text, extra);
}

async function sendLog(chatId, text) {
  try {
    const chat = getChat(chatId);
    if (!chat.logs) chat.logs = [];
    chat.logs.push({ time: Date.now(), text: text.replace(/<[^>]+>/g,'') });
    if (chat.logs.length > 500) chat.logs = chat.logs.slice(-500);
    if (chat.settings.logChatId) {
      await bot.sendMessage(chat.settings.logChatId, `📋 <b>Лог</b>\n${text}`, { parse_mode: 'HTML' });
    }
    saveDB();
  } catch (_) {}
}

function addHistory(chatId, userId, action) {
  const u = getUser(chatId, userId);
  if (!u.history) u.history = [];
  u.history.push({ ...action, time: Date.now() });
  if (u.history.length > 100) u.history = u.history.slice(-100);
  saveDB();
}

async function resolveTarget(msg, args = [], chatId) {
  // 1) По ответу на сообщение
  if (msg.reply_to_message && msg.reply_to_message.from) {
    const u = msg.reply_to_message.from;

    return {
      id: Number(u.id),
      firstName: u.first_name || u.firstName || String(u.id),
      username: u.username || null,
      user: u,
      args
    };
  }

  const firstArg = String(args[0] || '').trim();

  if (!firstArg) return null;

  // 2) По Telegram ID
  if (/^\d+$/.test(firstArg)) {
    const id = Number(firstArg);
    const restArgs = args.slice(1);

    try {
      const member = await bot.getChatMember(chatId, id);

      if (member && member.user) {
        return {
          id: Number(member.user.id),
          firstName: member.user.first_name || String(id),
          username: member.user.username || null,
          user: member.user,
          args: restArgs
        };
      }
    } catch (_) {}

    const chat = getChat(chatId);
    const stored = chat.users?.[String(id)];

    if (stored) {
      return {
        id: Number(stored.id || id),
        firstName: stored.firstName || stored.first_name || stored.username || String(id),
        username: stored.username || null,
        user: null,
        args: restArgs
      };
    }

    return {
      id,
      firstName: String(id),
      username: null,
      user: null,
      args: restArgs
    };
  }

  // 3) По @username
  if (firstArg.startsWith('@') || /^[a-zA-Z0-9_]{5,32}$/.test(firstArg)) {
    const usernameRaw = firstArg.replace(/^@/, '').toLowerCase();

    if (/^[a-zA-Z0-9_]{5,32}$/.test(usernameRaw)) {
      const chat = getChat(chatId);

      const stored = Object.values(chat.users || {}).find((u) => {
        return String(u.username || '').toLowerCase() === usernameRaw;
      });

      if (stored && stored.id) {
        return {
          id: Number(stored.id),
          firstName: stored.firstName || stored.first_name || stored.username || String(stored.id),
          username: stored.username || usernameRaw,
          user: null,
          args: args.slice(1)
        };
      }

      return {
        notFoundUsername: usernameRaw,
        args: args.slice(1)
      };
    }
  }

  return null;
}

function isGroup(msg) { return msg.chat.type === 'group' || msg.chat.type === 'supergroup'; }

// ── COMMAND ALIASES & PARSER ──────────────────────────────────────
const CMD_ALIASES = {
  // core
  help:          ['help','помощь','команды','commands'],
  rules:         ['rules','правила'],
  setrules:      ['setrules','установитьправила'],
  setup:         ['setup','настроить'],
  profile:       ['profile','профиль','me','я профиль'],
  id:            ['id'],
  top:           ['top','топ'],
  level:         ['level','уровень'],
  history:       ['history','история'],
  actions:       ['actions','действия'],
  admins:        ['admins','админы'],
  rank:          ['rank','ранг'],
  ranks:         ['ranks','ранги'],
  db:            ['db','база','бд'],
  remember:      ['remember','запомнить'],
  friend:        ['friend','friendsend','дружба','подружиться'],
  friends:       ['friends','друзья','мойдрузья'],
  unfriend:      ['unfriend','удалитьдруга','раздружиться'],
  // moderation
  mute:          ['mute','мут'],
  unmute:        ['unmute','унмут','размут'],
  ban:           ['ban','бан'],
  unban:         ['unban','разбан'],
  kick:          ['kick','кик'],
  warn:          ['warn','пред'],
  unwarn:        ['unwarn','унпред'],
  warns:         ['warns','преды'],
  del:           ['del','удалить'],
  // rank assign
  setrank:       ['setrank','выдатьранг'],
  delrank:       ['delrank','снятьранг'],
  owner:         ['owner','владелец'],
  deputy:        ['deputy','зам','заместитель'],
  headadmin:     ['headadmin','га','главныйадмин','главадмин'],
  curator:       ['curator','куратор'],
  senioradmin:   ['senioradmin','са','старшийадмин','стадмин'],
  admin:         ['admin','админ'],
  junioradmin:   ['junioradmin','ма','младшийадмин','младший'],
  seniormoder:   ['seniormoder','см','старшиймодер','стмодер'],
  moder:         ['moder','модер','модератор'],
  helper:        ['helper','помощник'],
  trainee:       ['trainee','стажер','стажёр'],
  user:          ['user','юзер','пользователь'],
  transferowner: ['transferowner','передатьвладельца'],
  confirmowner:  ['confirmowner','подтвердитьвладельца'],
  // global ranks
  gsetrank:      ['gsetrank','глобалранг'],
  gdelrank:      ['gdelrank','снятьглобал'],
  globaladmins:  ['globaladmins','глобаладмины'],
  // settings
  antispam:      ['antispam','антиспам'],
  antilinks:     ['antilinks','ссылки'],
  antimat:       ['antimat','антимат'],
  welcome:       ['welcome','приветствие'],
  goodbye:       ['goodbye','прощание'],
  setwelcome:    ['setwelcome','сетпривет'],
  setgoodbye:    ['setgoodbye','сетпрощание'],
  settings:      ['settings','настройки'],
  setlog:        ['setlog','сетлог'],
  logs:          ['logs','логи'],
  badwords:      ['badwords','матлист'],
  addbadword:    ['addbadword','добавитьмат'],
  delbadword:    ['delbadword','удалитьмат'],
  // economy
  balance:       ['balance','баланс','монеты'],
  daily:         ['daily','ежедневно','бонус','bonus'],
  give:          ['give','передать'],
  coins:         ['coins','выдатьмонеты'],
  shop:          ['shop','магазин'],
  buy:           ['buy','купить'],
  title:         ['title','титул'],
  removetitle:   ['removetitle','снятьтитул'],
  // social
  rep:           ['rep','реп'],
  minusrep:      ['minusrep','минусреп'],
  myrep:         ['myrep','мояреп'],
  // call
  call:          ['call','калл','созыв'],
  // friday
  fridaypost:    ['fridaypost','пятница'],
  setfriday:     ['setfriday','сетпятница'],
  setfridaytime: ['setfridaytime','сетвремяпятницы'],
  fridaynow:     ['fridaynow','пятницасейчас'],
  // relations
  relationship:  ['relationship','relations','отношения','отношение','love','любовь'],
  couple:        ['couple','пара'],
  breakup:       ['breakup','расстаться','разрыв'],
  hug:           ['hug','обнять'],
  kiss:          ['kiss','поцеловать'],
  slap:          ['slap','шлепнуть','шлёпнуть'],
  pat:           ['pat','погладить'],
  bite:          ['bite','укусить'],
  poke:          ['poke','тыкнуть'],
  feed:          ['feed','покормить'],
  tea:           ['tea','чай'],
  flower:        ['flower','цветок'],
  compliment:    ['compliment','комплимент']
};

// reverse map
const CMD_MAP = {};
for (const [canon, list] of Object.entries(CMD_ALIASES)) {
  for (const a of list) CMD_MAP[a.toLowerCase()] = canon;
}
// Set of first-words for no-slash detection
const CMD_WORDS = new Set(Object.keys(CMD_MAP));

/**
 * parseCommand(text) → { command, raw, args, argText } | null
 * Works both with and without leading slash.
 * Ordinary messages like "привет" or "я тут" return null.
 * Special case: "я профиль" → profile (multi-word alias).
 */
function parseCommand(text) {
  if (!text) return null;
  const trimmed = text.trim();

  // multi-word aliases first
  const lower = trimmed.toLowerCase();
  for (const [alias, canon] of Object.entries(CMD_MAP)) {
    if (alias.includes(' ') && lower.startsWith(alias)) {
      const rest = trimmed.slice(alias.length).trim();
      return { command: canon, raw: alias, args: rest ? rest.split(/\s+/) : [], argText: rest };
    }
  }

  let raw;
  if (trimmed.startsWith('/')) {
    raw = trimmed.slice(1).split(/[\s@]/)[0].toLowerCase();
    if (BOT_USERNAME) raw = raw.replace(`@${BOT_USERNAME}`, '');
  } else {
    const firstWord = trimmed.split(/\s+/)[0].toLowerCase();
    if (!CMD_WORDS.has(firstWord)) return null;
    raw = firstWord;
  }

  const canon = CMD_MAP[raw];
  if (!canon) return null;
  const rest = trimmed.slice(trimmed.indexOf(raw) + raw.length).trim();
  const args = rest ? rest.split(/\s+/) : [];
  return { command: canon, raw, args, argText: rest };
}

// ── GUARD HELPERS ─────────────────────────────────────────────────
async function guardGroup(msg) {
  if (!isGroup(msg)) { await replyTo(msg, '❌ Команда работает только в группах.'); return false; }
  return true;
}

async function guardRank(msg, minRank, label) {
  const rank = await getEffectiveRank(msg.chat.id, msg.from.id);
  if (rank < minRank) {
    const ri = getRankInfo(rank);
    await replyTo(msg, `❌ <b>Недостаточно прав</b>\nТвой ранг: ${ri.emoji} ${ri.name} (${rank})\nТребуется: ${minRank}+`);
    return false;
  }
  return true;
}

async function guardTarget(msg, args, chatId) {
  const t = await resolveTarget(msg, args, chatId);

  if (t?.notFoundUsername) {
    await replyTo(
      msg,
      '❌ <b>Пользователь @' + esc(t.notFoundUsername) + ' не найден в БД этой беседы.</b>\n\n' +
      'Чтобы бот нашёл человека по username, он должен хотя бы 1 раз написать сообщение в чат.\n\n' +
      'Можно также использовать:\n' +
      '• reply на сообщение пользователя;\n' +
      '• TG ID пользователя.'
    );
    return null;
  }

  if (!t) {
    await replyTo(
      msg,
      '❌ <b>Пользователь не указан</b>\n\n' +
      'Можно использовать:\n' +
      '• reply на сообщение;\n' +
      '• TG ID;\n' +
      '• @username, если пользователь есть в БД.'
    );
    return null;
  }

  return t;
}

async function guardCanPunish(msg, targetId) {
  const chatId  = msg.chat.id;
  const actorId = msg.from.id;
  if (targetId === actorId)  { await replyTo(msg, '❌ Нельзя наказать самого себя.'); return false; }
  if (targetId === _botId)   { await replyTo(msg, '❌ Нельзя наказать бота.');         return false; }
  if (!await canManageTarget(chatId, actorId, targetId)) {
    const tr = getRankInfo(await getEffectiveRank(chatId, targetId));
    const ar = getRankInfo(await getEffectiveRank(chatId, actorId));
    await replyTo(msg, `❌ Нельзя наказать этого пользователя.\nТвой ранг: ${ar.emoji} ${ar.name}\nРанг цели: ${tr.emoji} ${tr.name}`);
    return false;
  }
  return true;
}

// ── CORE MOD ACTIONS ──────────────────────────────────────────────
async function doMute(chatId, targetId, minutes, reason, byName, silent = false) {
  try {
    const until = minutes === Infinity ? 0 : Math.floor(Date.now()/1000) + minutes * 60;
    await bot.restrictChatMember(chatId, targetId, {
      permissions: { can_send_messages: false, can_send_media_messages: false,
                     can_send_other_messages: false, can_add_web_page_previews: false },
      until_date: until
    });
    const u = getUser(chatId, targetId);
    addHistory(chatId, targetId, { type:'mute', reason, by: byName, duration: minutes });
    const log = `🔇 <b>Мут</b>\n👤 ${mention(u)}\n🆔 ${targetId}\n⏱ ${fmtDur(minutes)}\n📌 ${esc(reason)}\n👮 ${esc(byName)}`;
    await sendLog(chatId, log);
    return log;
  } catch (e) { if (!silent) throw e; console.error('doMute:', e.message); }
}

async function doUnmute(chatId, targetId, byName) {
  await bot.restrictChatMember(chatId, targetId, {
    permissions: { can_send_messages: true, can_send_media_messages: true,
                   can_send_other_messages: true, can_add_web_page_previews: true }
  });
  addHistory(chatId, targetId, { type:'unmute', by: byName });
  const u   = getUser(chatId, targetId);
  const log = `🔊 <b>Мут снят</b>\n👤 ${mention(u)}\n🆔 ${targetId}\n👮 ${esc(byName)}`;
  await sendLog(chatId, log);
  return log;
}

async function doBan(chatId, targetId, reason, byName) {
  await bot.banChatMember(chatId, targetId);
  const u = getUser(chatId, targetId);
  addHistory(chatId, targetId, { type:'ban', reason, by: byName });
  const log = `🚫 <b>Бан</b>\n👤 ${mention(u)}\n🆔 ${targetId}\n📌 ${esc(reason)}\n👮 ${esc(byName)}`;
  await sendLog(chatId, log);
  return log;
}

async function doUnban(chatId, targetId, byName) {
  await bot.unbanChatMember(chatId, targetId, { only_if_banned: true });
  const u = getUser(chatId, targetId);
  addHistory(chatId, targetId, { type:'unban', by: byName });
  const log = `✅ <b>Разбан</b>\n👤 ${mention(u)}\n🆔 ${targetId}\n👮 ${esc(byName)}`;
  await sendLog(chatId, log);
  return log;
}

async function doKick(chatId, targetId, reason, byName) {
  await bot.banChatMember(chatId, targetId);
  await bot.unbanChatMember(chatId, targetId);
  const u = getUser(chatId, targetId);
  addHistory(chatId, targetId, { type:'kick', reason, by: byName });
  const log = `👢 <b>Кик</b>\n👤 ${mention(u)}\n🆔 ${targetId}\n📌 ${esc(reason)}\n👮 ${esc(byName)}`;
  await sendLog(chatId, log);
  return log;
}

async function doWarn(chatId, targetId, reason, byName, replyMsg) {
  const u = getUser(chatId, targetId);
  if (!u.warns) u.warns = [];

  // warn shield
  if (u.inventory?.warnShield > 0) {
    u.inventory.warnShield--;
    saveDB();
    if (replyMsg) await replyTo(replyMsg, `🛡 Щит сработал! ${mention(u)} защищён. Щитов: ${u.inventory.warnShield}`);
    return;
  }

  u.warns.push({ reason, by: byName || 'Авто', time: Date.now() });
  const count = u.warns.length;
  saveDB();

  const log = `⚠️ <b>Предупреждение</b>\n👤 ${mention(u)}\n🆔 ${targetId}\n📌 ${esc(reason)}\n📊 ${count}/5\n👮 ${esc(byName || 'Авто')}`;
  await sendLog(chatId, log);

  let autoText = '';
  if (count === 2) autoText = '\n⏳ Автомут: 30 мин.';
  else if (count === 3) autoText = '\n⏳ Автомут: 2 часа.';
  else if (count === 4) autoText = '\n⏳ Автокик.';
  else if (count >= 5)  autoText = '\n⏳ Автобан.';
  if (replyMsg) await replyTo(replyMsg, log + autoText);

  if (count === 2) await doMute(chatId, targetId, 30,  'Авто: 2 преда',   'Бот', true);
  else if (count === 3) await doMute(chatId, targetId, 120, 'Авто: 3 преда',   'Бот', true);
  else if (count === 4) await doKick(chatId, targetId, 'Авто: 4 преда',   'Бот');
  else if (count >= 5)  await doBan(chatId,  targetId, 'Авто: 5 предов',  'Бот');
}

// ── QUICK RANK ────────────────────────────────────────────────────
async function quickRank(msg, args, targetRank, chatId) {
  if (!await guardGroup(msg)) return;
  const actorRank = await getEffectiveRank(chatId, msg.from.id);

  if (targetRank === 100) {
    const existing = Object.values(getChat(chatId).users).find(u => u.adminRank === 100);
    if (existing && String(existing.id) !== String(msg.from.id)) {
      await replyTo(msg, '❌ Владелец уже назначен. Используй /transferowner'); return;
    }
    if (actorRank < 100) {
      try { const m = await bot.getChatMember(chatId, msg.from.id); if (m.status !== 'creator') { await replyTo(msg, '❌ Только создатель группы.'); return; } }
      catch (_) { await replyTo(msg, '❌ Только создатель группы.'); return; }
    }
  } else if (targetRank >= actorRank) {
    await replyTo(msg, `❌ Нельзя выдать ранг ≥ своему (${actorRank}).`); return;
  }

  const t = await resolveTarget(msg, args, chatId);
  if (!t) { await replyTo(msg, '❌ Укажи пользователя (ID или reply).'); return; }

  const u  = getUser(chatId, t.id, t.firstName, t.username);
  u.adminRank = targetRank;
  saveDB();
  const ri = getRankInfo(targetRank);
  if (targetRank === 0) {
    await replyTo(msg, `👤 <b>Ранг снят</b>\n👤 ${mention(u)}\n🆔 <code>${t.id}</code>\n📉 Обычный пользователь\n👮 ${esc(msg.from.first_name)}`);
  } else {
    await replyTo(msg, `${ri.emoji} <b>Ранг выдан</b>\n\n👤 ${mention(u)}\n🆔 <code>${t.id}</code>\n🎚 ${ri.emoji} ${ri.name} (${targetRank})\n👮 ${esc(msg.from.first_name)}`);
  }
  await sendLog(chatId, `🎚 Ранг ${ri.name} (${targetRank}) → ${mention(u)} | ${msg.from.first_name}`);
}

// ── ACHIEVEMENTS ──────────────────────────────────────────────────
const ACHIEVEMENTS = [
  { id: 'msg100',  emoji: '💬', label: '100 сообщений',         reward: 300,  check: u => u.messages >= 100   },
  { id: 'msg500',  emoji: '🔥', label: '500 сообщений',         reward: 1000, check: u => u.messages >= 500   },
  { id: 'msg1000', emoji: '👑', label: '1000 сообщений',        reward: 2500, check: u => u.messages >= 1000  },
  { id: 'msg5000', emoji: '💎', label: '5000 сообщений',        reward: 7000, check: u => u.messages >= 5000  },
  { id: 'rep10',   emoji: '⭐', label: '10 репутации',          reward: 500,  check: u => u.reputation >= 10  },
  { id: 'clean100',emoji: '🛡', label: '100 сообщений без преда',reward: 700,
    check: u => u.messages >= 100 && (!u.warns || u.warns.length === 0) }
];

async function checkAchievements(chatId, userId) {
  try {
    const u    = getUser(chatId, userId);
    const hits = [];
    for (const a of ACHIEVEMENTS) {
      if (!u.achievements[a.id] && a.check(u)) {
        u.achievements[a.id] = Date.now();
        u.balance = (u.balance || 0) + a.reward;
        hits.push(a);
      }
    }
    if (!hits.length) { saveDB(); return; }
    saveDB();
    const total = hits.reduce((s, a) => s + a.reward, 0);
    const list  = hits.map(a => `✨ ${a.emoji} ${a.label}\n   🎁 +${a.reward} монет`).join('\n');
    const count = Object.keys(u.achievements).length;
    await tgReply(chatId,
      `🎉 <b>Новое крупное достижение!</b>\n\n👤 ${mention(u)}\n\n${list}\n\n━━━━━━━━━━━━━━\n💰 Итого: +${total} монет\n🏆 Крупных ачивок: ${count}\n🪙 Баланс: ${u.balance} монет`
    );
  } catch (_) {}
}

// ── ANTI-SPAM / LINKS / WORDS ────────────────────────────────────
const spamMap = {};
async function checkSpam(msg) {
  const chatId = msg.chat.id, userId = msg.from.id;
  if (!getChat(chatId).settings.antispam) return;
  if (await getEffectiveRank(chatId, userId) >= 30) return;
  const key = `${chatId}:${userId}`;
  if (!spamMap[key]) spamMap[key] = { times: [], last: null, same: 0 };
  const s = spamMap[key], now = Date.now();
  s.times.push(now); s.times = s.times.filter(t => now - t < 10000);
  const txt = msg.text || msg.sticker?.file_id || '';
  if (txt && txt === s.last) s.same++; else { s.same = 1; s.last = txt; }
  if (s.times.filter(t => now - t < 5000).length >= 5) { await doMute(chatId, userId, 5,  'Антиспам: быстро', 'Бот', true); return; }
  if (s.times.length >= 10)                             { await doMute(chatId, userId, 30, 'Антиспам: флуд',   'Бот', true); return; }
  if (s.same >= 3) { try { await bot.deleteMessage(chatId, msg.message_id); } catch (_) {} await doWarn(chatId, userId, 'Антиспам: повтор', null, msg); s.same = 0; }
}

const LINK_RE   = /(?:https?:\/\/|t\.me\/|(?:www\.)\S+\.\S+)/i;
const TG_INV_RE = /t\.me\/(?:joinchat\/|\+)\S+/i;
async function checkLinks(msg) {
  const chatId = msg.chat.id;
  if (!getChat(chatId).settings.antilinks) return;
  if (await getEffectiveRank(chatId, msg.from.id) >= 30) return;
  const txt = msg.text || msg.caption || '';
  if (TG_INV_RE.test(txt) || (LINK_RE.test(txt) && !/youtu\.?be|youtube\.com/i.test(txt))) {
    try { await bot.deleteMessage(chatId, msg.message_id); } catch (_) {}
    await doWarn(chatId, msg.from.id, 'Антиссылки', null, msg);
  }
}

async function checkBadWords(msg) {
  const chatId = msg.chat.id, chat = getChat(chatId);
  if (!chat.settings.antimat) return;
  if (await getEffectiveRank(chatId, msg.from.id) >= 30) return;
  const txt   = (msg.text || '').toLowerCase();
  const words = chat.settings.badwords || [];
  if (words.some(w => txt.includes(w.toLowerCase()))) {
    try { await bot.deleteMessage(chatId, msg.message_id); } catch (_) {}
    await doWarn(chatId, msg.from.id, 'Антимат', null, msg);
  }
}

// ── BIRTHDAY DETECTION ────────────────────────────────────────────
const BD_RE = /(?:у меня\s+)?(?:др|день\s*рождения|днюха|родился|родилась)\s+(\d{1,2})[.\-/](\d{1,2})/i;
async function checkBirthday(msg) {
  if (!msg.text) return;
  const m = msg.text.match(BD_RE);
  if (!m) return;
  const day = m[1].padStart(2,'0'), month = m[2].padStart(2,'0');
  const u = getUser(msg.chat.id, msg.from.id, msg.from.first_name, msg.from.username);
  u.birthday = { day, month, setAt: new Date().toISOString() };
  saveDB();
  await replyTo(msg, `🎂 Запомнил! Поздравлю тебя ${day}.${month} 🎉`);
}

// ── REMINDER DETECTION ────────────────────────────────────────────
const REM_RE_MIN  = /напомни\s+через\s+(\d+)\s*(?:мин|минут)/i;
const REM_RE_HOUR = /напомни\s+через\s+(\d+)\s*(?:ч|час)/i;
const REM_RE_TMRW = /напомни\s+завтра\s+в\s+(\d{1,2}):(\d{2})\s+(.*)/i;
async function checkReminder(msg) {
  if (!msg.text || !isGroup(msg)) return;
  const chat  = getChat(msg.chat.id);
  const txt   = msg.text;
  let dueAt = 0, text = '';

  const mMin  = txt.match(REM_RE_MIN);
  const mHour = txt.match(REM_RE_HOUR);
  const mTmrw = txt.match(REM_RE_TMRW);

  if (mMin) {
    dueAt = Date.now() + parseInt(mMin[1],10) * 60000;
    text  = txt.replace(REM_RE_MIN,'').trim();
  } else if (mHour) {
    dueAt = Date.now() + parseInt(mHour[1],10) * 3600000;
    text  = txt.replace(REM_RE_HOUR,'').trim();
  } else if (mTmrw) {
    const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(parseInt(mTmrw[1],10), parseInt(mTmrw[2],10), 0, 0);
    dueAt = tomorrow.getTime();
    text  = mTmrw[3].trim();
  } else return;

  if (!text) text = 'без текста';
  if (!chat.reminders) chat.reminders = [];
  chat.reminders.push({
    id: Date.now(), userId: msg.from.id,
    userName: msg.from.username || msg.from.first_name,
    text, dueAt, createdAt: Date.now(), done: false
  });
  saveDB();
  await replyTo(msg, `🔔 Напоминание создано!\n📝 ${esc(text)}\n⏰ ${new Date(dueAt).toLocaleString('ru')}`);
}

// ── SHOP ─────────────────────────────────────────────────────────
const SHOP = {
  vip:             { name: 'VIP-роль',               price: 5000,  desc: 'VIP-статус в профиле' },
  premium:         { name: 'Premium-роль',            price: 10000, desc: 'Premium-статус' },
  customtitle:     { name: 'Кастомный титул',         price: 7000,  desc: 'Установи свой титул' },
  warnshield:      { name: 'Защита от пред.',         price: 12000, desc: 'Спасает от 1 преда' },
  coloredprofile:  { name: 'Цветной профиль',         price: 3000,  desc: 'Украшает профиль' },
  reputationboost: { name: 'Буст репутации',          price: 4000,  desc: '+5 репутации сразу' }
};

// ── SOCIAL ACTIONS ────────────────────────────────────────────────
const SOCIAL = {
  hug:       { emoji:'🤗', verb:'обнял(а)',          coupleVerb:'нежно обнял(а) свою пару' },
  kiss:      { emoji:'😘', verb:'поцеловал(а)',       coupleVerb:'нежно поцеловал(а) свою пару' },
  slap:      { emoji:'👋', verb:'шлёпнул(а)',         coupleVerb:'шутливо шлёпнул(а) свою пару' },
  pat:       { emoji:'🫶', verb:'погладил(а)',        coupleVerb:'нежно погладил(а) свою пару' },
  bite:      { emoji:'🦷', verb:'укусил(а)',          coupleVerb:'игриво укусил(а) свою пару' },
  poke:      { emoji:'👉', verb:'ткнул(а)',           coupleVerb:'легко ткнул(а) свою пару' },
  feed:      { emoji:'🍡', verb:'покормил(а)',        coupleVerb:'заботливо покормил(а) свою пару' },
  tea:       { emoji:'🍵', verb:'налил(а) чай',      coupleVerb:'приготовил(а) чай паре' },
  flower:    { emoji:'🌸', verb:'подарил(а) цветок', coupleVerb:'подарил(а) цветок своей паре' },
  compliment:{ emoji:'💬', verb:'сделал(а) комплимент', coupleVerb:'сделал(а) комплимент своей паре' }
};
const COMPLIMENTS = ['Ты настоящий клад этого чата!','С тобой всегда весело!','Твоё присутствие делает чат лучше!','Ты очень позитивный человек!'];

async function handleSocial(cmd, msg) {
  const chatId = msg.chat.id;
  const actor  = getUser(chatId, msg.from.id, msg.from.first_name, msg.from.username);
  const act    = SOCIAL[cmd];
  if (!act) return;
  const now = Date.now();
  if (!actor.cooldowns) actor.cooldowns = {};
  if (actor.cooldowns.action && now - actor.cooldowns.action < 5000) { try { await bot.deleteMessage(chatId, msg.message_id); } catch (_) {} return; }
  actor.cooldowns.action = now; saveDB();

  let target = null;
  if (msg.reply_to_message?.from && !msg.reply_to_message.from.is_bot) {
    const tu = msg.reply_to_message.from;
    target = getUser(chatId, tu.id, tu.first_name, tu.username);
  } else if (actor.couple) {
    target = Object.values(getChat(chatId).users).find(u => String(u.id) === String(actor.couple)) || null;
  }
  if (!target) { await replyTo(msg, '❌ Ответь на сообщение пользователя или создай пару: любовь (reply)'); return; }

  const isCouple = actor.couple && String(actor.couple) === String(target.id);
  let text;
  if (cmd === 'compliment') {
    const c = COMPLIMENTS[Math.floor(Math.random() * COMPLIMENTS.length)];
    text = isCouple ? `${act.emoji} ${mention(actor)} ${act.coupleVerb} ${mention(target)}: «${c}»`
                    : `${act.emoji} ${mention(actor)} ${act.verb} ${mention(target)}: «${c}»`;
  } else {
    text = isCouple ? `❤️ ${mention(actor)} ${act.coupleVerb} ${mention(target)}`
                    : `${act.emoji} ${mention(actor)} ${act.verb} ${mention(target)}`;
  }
  await replyTo(msg, text);
}


function ensureSocialStorage(chat) {
  if (!chat.friendships) chat.friendships = {};
  if (!chat.pendingSocialRequests) chat.pendingSocialRequests = {};
  return chat;
}

function makePairKey(a, b) {
  return [String(a), String(b)].sort().join('_');
}

function mentionByIdSafe(id, name) {
  return '<a href="tg://user?id=' + id + '">' + esc(name || ('ID ' + id)) + '</a>';
}

function createSocialRequestId() {
  return Date.now().toString(36) + Math.floor(Math.random() * 99999).toString(36);
}

async function startSocialRequest(msg, args, type) {
  if (!await guardGroup(msg)) return;

  const chatId = msg.chat.id;
  const chat = ensureSocialStorage(getChat(chatId));

  const target = await resolveTarget(msg, args, chatId);

  if (target?.notFoundUsername) {
    await replyTo(
      msg,
      '❌ <b>Пользователь @' + esc(target.notFoundUsername) + ' не найден в базе этой беседы.</b>\n\n' +
      'Чтобы предложить дружбу/отношения по username, человек должен хотя бы 1 раз написать сообщение в этот чат.\n\n' +
      'Лучшие варианты:\n' +
      '• ответь на сообщение человека: <code>' + (type === 'relationship' ? 'отношения' : 'дружба') + '</code>\n' +
      '• или используй TG ID: <code>' + (type === 'relationship' ? 'отношения' : 'дружба') + ' 123456789</code>'
    );
    return;
  }

  if (!target || !target.id) {
    await replyTo(
      msg,
      type === 'relationship'
        ? '❌ <b>Укажи человека</b>\n\nМожно так:\n• reply → <code>отношения</code>\n• <code>отношения @username</code>\n• <code>отношения TG_ID</code>'
        : '❌ <b>Укажи человека</b>\n\nМожно так:\n• reply → <code>дружба</code>\n• <code>дружба @username</code>\n• <code>дружба TG_ID</code>'
    );
    return;
  }

  if (Number(target.id) === Number(msg.from.id)) {
    await replyTo(msg, type === 'relationship'
      ? '😅 С самим собой отношения создать нельзя.'
      : '😅 Сам с собой дружить нельзя.'
    );
    return;
  }

  if (Number(target.id) === Number(_botId)) {
    await replyTo(msg, '🤖 Со мной нельзя, я пока просто бот.');
    return;
  }

  const fromUser = getUser(chatId, msg.from.id, msg.from.first_name, msg.from.username);
  const toUser = getUser(chatId, target.id, target.firstName, target.username);

  ensureSocialStorage(chat);

  const toDisplayName = toUser.firstName || toUser.username || target.firstName || ('ID ' + target.id);

  if (type === 'relationship') {
    if (getStoredCoupleId(chat, fromUser)) {
      await replyTo(msg, '❌ У тебя уже есть пара. Сначала напиши: <code>расстаться</code>');
      return;
    }

    if (getStoredCoupleId(chat, toUser)) {
      await replyTo(msg, '❌ У этого пользователя уже есть пара.');
      return;
    }
  }

  if (type === 'friend') {
    if (areFriends(chat, fromUser.id, toUser.id)) {
      await replyTo(msg, '🤝 Вы уже друзья.');
      return;
    }
  }

  const requestId = createSocialRequestId();

  chat.pendingSocialRequests[requestId] = {
    id: requestId,
    type,
    chatId,
    fromId: Number(fromUser.id),
    toId: Number(toUser.id),
    fromName: fromUser.firstName || msg.from.first_name || 'Пользователь',
    toName: toDisplayName,
    createdAt: Date.now()
  };

  saveDB();

  const title = type === 'relationship'
    ? '❤️ <b>Предложение отношений</b>'
    : '🤝 <b>Предложение дружбы</b>';

  const question = type === 'relationship'
    ? 'согласна/согласен стать парой?'
    : 'согласна/согласен стать друзьями?';

  const text =
    title + '\n\n' +
    '👤 ' + mentionByIdPretty(fromUser.id, fromUser.firstName || fromUser.username || ('ID ' + fromUser.id)) + '\n' +
    '💌 предлагает ' + mentionByIdPretty(toUser.id, toDisplayName) + '\n\n' +
    '✨ <b>' + esc(toDisplayName) + '</b>, ' + question + '\n\n' +
    '💭 Решение только за тобой — можно принять или красиво отказаться.\n' +
    '⏳ Заявка активна 24 часа.\n' +
    '🔒 Нажать кнопки может только тот, кому отправили предложение.';

  const acceptText = type === 'relationship' ? '❤️ Принять отношения' : '🤝 Принять дружбу';
  const declineText = type === 'relationship' ? '💔 Отказаться' : '🙅 Отказаться';

  const kb = {
    inline_keyboard: [
      [{ text: acceptText, callback_data: 'soc:' + requestId + ':yes' }],
      [{ text: declineText, callback_data: 'soc:' + requestId + ':no' }]
    ]
  };

  if (typeof botInviteUrl === 'function') {
    kb.inline_keyboard.push([{ text: '➕ Добавить бота в чат', url: botInviteUrl() }]);
  }

  await replyTo(msg, text, { reply_markup: kb });
}

async function showFriendsList(msg) {
  if (!await guardGroup(msg)) return;

  const chat = ensureSocialStorage(getChat(msg.chat.id));
  const userId = String(msg.from.id);

  const friends = Object.values(chat.friendships || {})
    .filter((pair) => pair && Array.isArray(pair.users) && pair.users.includes(userId))
    .map((pair) => {
      const friendId = pair.users.find((id) => id !== userId);
      return chat.users[String(friendId)];
    })
    .filter(Boolean);

  if (!friends.length) {
    await replyTo(msg, '🤝 У тебя пока нет друзей в этой беседе.');
    return;
  }

  let text = '🤝 <b>Твои друзья</b>\n\n';

  friends.forEach((friend, index) => {
    text += (index + 1) + '. ' + mention(friend) + '\n';
  });

  await replyTo(msg, text);
}

async function removeFriendCommand(msg, args) {
  if (!await guardGroup(msg)) return;

  const chatId = msg.chat.id;
  const chat = ensureSocialStorage(getChat(chatId));
  const target = await resolveTarget(msg, args, chatId);

  if (!target) {
    await replyTo(
      msg,
      '❌ <b>Укажи друга</b>\n\nМожно так:\n• ответь на сообщение друга: <code>раздружиться</code>\n• или напиши: <code>раздружиться @username / ID</code>'
    );
    return;
  }

  if (Number(target.id) === Number(msg.from.id)) {
    await replyTo(msg, '😅 С самим собой дружбу завершить нельзя.');
    return;
  }

  const key = makePairKey(msg.from.id, target.id);

  if (!chat.friendships[key]) {
    await replyTo(msg, '❌ Вы и так не друзья.');
    return;
  }

  const actor = getUser(chatId, msg.from.id, msg.from.first_name, msg.from.username);
  const friend = getUser(chatId, target.id, target.firstName, target.username);

  const kb = {
    inline_keyboard: [
      [
        { text: '💔 Завершить дружбу', callback_data: 'unfriend:' + actor.id + ':' + friend.id + ':yes' }
      ],
      [
        { text: '🤝 Оставить дружбу', callback_data: 'unfriend:' + actor.id + ':' + friend.id + ':no' }
      ]
    ]
  };

  await replyTo(
    msg,
    '🤝 <b>Подтверждение дружбы</b>\n\n' +
    mentionByIdSafe(actor.id, actor.firstName) + ', ты точно хочешь завершить дружбу с ' +
    mentionByIdSafe(friend.id, friend.firstName || ('ID ' + friend.id)) + '?\n\n' +
    '━━━━━━━━━━━━━━\n' +
    'Это действие уберёт вас из списка друзей в этой беседе.',
    { reply_markup: kb }
  );
}

async function showCoupleCommand(msg) {
  if (!await guardGroup(msg)) return;

  const user = getUser(msg.chat.id, msg.from.id, msg.from.first_name, msg.from.username);

  if (!user.couple) {
    await replyTo(msg, '💔 У тебя пока нет пары.');
    return;
  }

  const partner = getUser(msg.chat.id, user.couple);

  await replyTo(
    msg,
    '❤️ <b>Твоя пара</b>\n\n' +
    mentionByIdSafe(user.id, user.firstName) + ' + ' + mentionByIdSafe(partner.id, partner.firstName || ('ID ' + partner.id)) +
    '\n\n💍 Берегите друг друга.'
  );
}

async function breakupCommand(msg) {
  if (!await guardGroup(msg)) return;

  const chatId = msg.chat.id;
  const user = getUser(chatId, msg.from.id, msg.from.first_name, msg.from.username);

  if (!user.couple) {
    await replyTo(msg, '💔 У тебя пока нет пары.');
    return;
  }

  const partner = getUser(chatId, user.couple);
  const partnerName = partner.firstName || partner.username || ('ID ' + partner.id);

  const kb = {
    inline_keyboard: [
      [
        { text: '💔 Расстаться', callback_data: 'break:' + user.id + ':' + partner.id + ':yes' }
      ],
      [
        { text: '❤️ Остаться вместе', callback_data: 'break:' + user.id + ':' + partner.id + ':no' }
      ]
    ]
  };

  await replyTo(
    msg,
    '💔 <b>Подтверждение расставания</b>\n\n' +
    mentionByIdSafe(user.id, user.firstName) + ', ты точно хочешь расстаться с ' +
    mentionByIdSafe(partner.id, partnerName) + '?\n\n' +
    '━━━━━━━━━━━━━━\n' +
    'Иногда лучше подумать ещё раз. Если уверен(а), нажми кнопку ниже.',
    { reply_markup: kb }
  );
}

// ── FRIDAY TEXTS ─────────────────────────────────────────────────
const FRIDAY_TEXTS = [
  '🎉 <b>Пятница пришла!</b>\n\nВсем хорошего настроения, отдыха и лампового общения в чате.\nНе забывайте соблюдать правила и уважать друг друга ❤️',
  '🥳 <b>ПЯТНИЦА!</b>\n\nДожили! Самый лучший день недели.\nОтдыхайте, общайтесь и будьте в хорошем настроении 😎',
  '🌅 <b>Пятничный вайб</b>\n\n«Пятница — это маленький Новый год!»\nХорошего вечера, чат! 🎊'
];

// ── PENDING ACTIONS (buttons state) ──────────────────────────────
const pending = {};

// ═══════════════════════════════════════════════════════════════
//  SCHEDULERS  (setInterval every minute)
// ═══════════════════════════════════════════════════════════════
setInterval(async () => {
  try {
    const now    = new Date();
    const todayS = now.toISOString().slice(0,10);
    const hh     = now.getHours();
    const mm     = now.getMinutes();
    const day    = now.getDay(); // 0=Sun, 5=Fri, 7=Sun

    for (const [chatId, chat] of Object.entries(db.chats)) {
      try {
        const s = chat.settings;

        // ── Morning (08:00)
        if (s.morningEnabled && hh === 8 && mm === 0 && s.lastMorningDate !== todayS) {
          s.lastMorningDate = todayS; saveDB();
          await tgReply(chatId,
            '☀️ <b>Доброе утро, беседа!</b>\n\n🌤 Новый день уже начался.\nПора просыпаться, улыбнуться и залетать в чат 😄\n\n✨ Пусть сегодня будет больше хороших новостей,\nменьше суеты и больше приятного общения.\n\n━━━━━━━━━━━━━━\n💬 Просыпаемся, активничаем и делаем этот день лучше!'
          );
        }

        // ── Night (00:00)
        if (s.nightEnabled && hh === 0 && mm === 0 && s.lastNightDate !== todayS) {
          s.lastNightDate = todayS; saveDB();
          await tgReply(chatId,
            '🌙 <b>Спокойной ночи, беседа!</b>\n\nНочь уже наступила, пора немного отдохнуть 😴\n\n✨ Пусть сон будет спокойным,\nутро — лёгким,\nа завтра будет ещё лучше, чем сегодня.\n\n━━━━━━━━━━━━━━\n💤 Не сидим всю ночь в телефоне, набираемся сил.'
          );
        }

        // ── Friday post
        const fp = s.fridayPost;
        if (fp?.enabled && day === 5 && fp.lastSentDate !== todayS) {
          const [fhh, fmm] = (fp.time || '18:00').split(':').map(Number);
          if (hh === fhh && mm === fmm) {
            fp.lastSentDate = todayS; saveDB();
            const txt = fp.text || FRIDAY_TEXTS[Math.floor(Math.random() * FRIDAY_TEXTS.length)];
            await tgReply(chatId, txt);
          }
        }

        // ── Weekly report (Sunday 20:00)
        if (s.weeklyReportEnabled && day === 0 && hh === 20 && mm === 0 && s.lastWeeklyDate !== todayS) {
          s.lastWeeklyDate = todayS; saveDB();
          const users    = Object.values(chat.users);
          const wk       = weekKey();
          const weekMsgs = users.reduce((s,u) => s + (u.stats?.weekly?.[wk] || 0), 0);
          const active   = users.filter(u => (u.stats?.weekly?.[wk] || 0) > 0).length;
          const topUser  = users.sort((a,b)=>(b.stats?.weekly?.[wk]||0)-(a.stats?.weekly?.[wk]||0))[0];
          const topRep   = users.sort((a,b)=>(b.reputation||0)-(a.reputation||0))[0];
          const totalWrn = users.reduce((s,u)=>s+(u.warns?.length||0),0);
          await tgReply(chatId,
            `📊 <b>Итоги недели</b>\n\n💬 Сообщений за неделю: ${weekMsgs}\n👥 Активных участников: ${active}\n🏆 Самый активный: ${topUser ? mention(topUser) : '—'} — ${topUser?.stats?.weekly?.[wk] || 0}\n⭐ Больше всего репутации: ${topRep ? mention(topRep) : '—'}\n⚠️ Предупреждений в базе: ${totalWrn}\n\n━━━━━━━━━━━━━━\n🚀 Новая неделя — новый топ!`
          );
        }

        // ── Birthdays (09:00)
        if (hh === 9 && mm === 0) {
          const dday  = String(now.getDate()).padStart(2,'0');
          const dmon  = String(now.getMonth()+1).padStart(2,'0');
          for (const u of Object.values(chat.users)) {
            if (u.birthday?.day === dday && u.birthday?.month === dmon) {
              const bdKey = `bd_${todayS}`;
              if (!u.achievements[bdKey]) {
                u.achievements[bdKey] = Date.now(); saveDB();
                await tgReply(chatId,
                  `🎉 <b>Сегодня день рождения!</b>\n\nПоздравляем ${mention(u)} 🥳\nЖелаем счастья, здоровья и хорошего настроения 🎂✨`
                );
              }
            }
          }
        }

        // ── Reminders
        if (chat.reminders?.length) {
          const nowMs = Date.now();
          for (const r of chat.reminders) {
            if (!r.done && r.dueAt <= nowMs) {
              r.done = true; saveDB();
              const name = r.userName ? `@${r.userName}` : 'пользователь';
              await tgReply(chatId,
                `🔔 <b>Напоминание</b>\n\n${name}, ты просил напомнить:\n\n📝 ${esc(r.text)}`
              );
            }
          }
        }
      } catch (_) {}
    }
  } catch (e) { console.error('Scheduler error:', e.message); }
}, 60000);

// ═══════════════════════════════════════════════════════════════
//  MESSAGE HANDLER  (activity tracking, automod, commands)
// ═══════════════════════════════════════════════════════════════

function getBotPublicUsername() {
  return String((_botUser && _botUser.username) || BOT_USERNAME || 'FunTalchik_Botik')
    .replace(/^@/, '')
    .trim();
}

function botInviteUrl() {
  return 'https://t.me/' + getBotPublicUsername() + '?startgroup=true';
}

function botMainPrivateMenuText() {
  return `🤖 <b>FulTalchik_Botik приветствует Вас!</b>

Я могу предложить следующие темы:

1️⃣ <b>общение</b> — профиль, топы, активность, монеты;
2️⃣ <b>знакомства</b> — дружба, отношения, пары и действия;
3️⃣ <b>приветствие</b> — встреча новых участников и правила;
4️⃣ <b>мем</b> — пятничные посты, комплименты и весёлые действия;
5️⃣ <b>игры</b> — простые развлечения для активности;
6️⃣ <b>вопрос</b> — как пользоваться ботом и что делать;
7️⃣ <b>помощь</b> — список основных команд;
8️⃣ <b>рандом</b> — случайные мини-функции.

━━━━━━━━━━━━━━
👥 <b>Бот работает в группах</b>
Добавьте меня в беседу и напишите там: <code>настроить</code>

📌 Для вызова меню напишите: <b>начать</b> или <b>помощь</b>.`;
}

function botMainInlineKeyboard() {
  return {
    inline_keyboard: [
      [
        { text: '💬 Общение', callback_data: 'topic:chat' },
        { text: '❤️ Знакомства', callback_data: 'topic:social' }
      ],
      [
        { text: '👋 Приветствие', callback_data: 'topic:welcome' },
        { text: '😂 Мем', callback_data: 'topic:meme' }
      ],
      [
        { text: '🎮 Игры', callback_data: 'topic:games' },
        { text: '❓ Вопрос', callback_data: 'topic:question' }
      ],
      [
        { text: '📋 Помощь', callback_data: 'topic:help' },
        { text: '🎲 Рандом', callback_data: 'topic:random' }
      ],
      [
        { text: '➕ Добавить в свой чат', url: botInviteUrl() }
      ]
    ]
  };
}

function botReplyKeyboard() {
  return {
    keyboard: [
      [{ text: '💬 Общение' }, { text: '❤️ Знакомства' }],
      [{ text: '👋 Приветствие' }, { text: '😂 Мем' }],
      [{ text: '🎮 Игры' }, { text: '❓ Вопрос' }],
      [{ text: '📋 Помощь' }, { text: '🎲 Рандом' }]
    ],
    resize_keyboard: true
  };
}

const PRIVATE_TOPIC_TEXTS = {
  chat: `💬 <b>Общение</b>

👤 <code>профиль</code> — профиль участника
🏆 <code>топ день</code> — топ активности за день
📊 <code>топ неделя</code> — топ за неделю
🪙 <code>монеты</code> — баланс
🎁 <code>магазин</code> — магазин ролей и бонусов

Бот считает текст, голосовые, фото, видео, стикеры и другую активность.`,

  social: `❤️ <b>Знакомства</b>

🤝 <code>дружба @username</code> — предложить дружбу
❤️ <code>отношения @username</code> — предложить отношения
💔 <code>расстаться</code> — расстаться через кнопку
🤝 <code>раздружиться @username</code> — завершить дружбу

Также работает через reply на сообщение пользователя.`,

  welcome: `👋 <b>Приветствие</b>

📜 <code>правила</code> — показать правила
⚙️ <code>настроить</code> — настроить бота в беседе
🛡 <code>настройки</code> — настройки группы

У каждой беседы свои правила, ранги, база и настройки.`,

  meme: `😂 <b>Мем и настроение</b>

🌸 <code>комплимент</code>
🤗 <code>обнять</code>
😘 <code>поцеловать</code>
🍵 <code>чай</code>
🎉 <code>пятница</code>

Команды можно писать со слешем и без слеша.`,

  games: `🎮 <b>Игры</b>

Можно добавить дальше:
🎲 кубик
🪙 монетка
🎯 дуэль
✊ камень-ножницы-бумага
🎁 розыгрыши

Этот раздел подготовлен под будущие мини-игры.`,

  question: `❓ <b>Вопросы</b>

1. Добавь бота в чат.
2. Дай права администратора.
3. Напиши в беседе: <code>настроить</code>
4. Отключи Privacy Mode у BotFather.
5. Используй <code>помощь</code> для списка команд.

Если бот не считает людей в БД — чаще всего включён Privacy Mode.`,

  help: `📋 <b>Помощь</b>

Основные команды:

<code>профиль</code>
<code>топ день</code>
<code>монеты</code>
<code>калл</code>
<code>база</code>
<code>правила</code>
<code>ранги</code>
<code>магазин</code>
<code>отношения</code>
<code>дружба</code>

Все команды работают со слешем и без слеша.`,

  random: `🎲 <b>Рандом</b>

Можно добавить:

🎲 случайное число
🪙 монетка
💬 случайная фраза
🎁 случайный бонус
😂 случайный комплимент

Раздел подготовлен для будущих функций.`
};

function topicBackKeyboard() {
  return {
    inline_keyboard: [
      [{ text: '🔙 Назад', callback_data: 'topic:back' }],
      [{ text: '➕ Добавить в свой чат', url: botInviteUrl() }]
    ]
  };
}

async function sendPrivateMainMenu(chatId) {
  await bot.sendMessage(chatId, botMainPrivateMenuText(), {
    parse_mode: 'HTML',
    reply_markup: botMainInlineKeyboard()
  });

  await bot.sendMessage(chatId, 'Выберите тему на клавиатуре ниже 👇', {
    reply_markup: botReplyKeyboard()
  });
}

async function sendPrivateTopic(chatId, topic) {
  const text = PRIVATE_TOPIC_TEXTS[topic];

  if (!text) {
    await bot.sendMessage(chatId, '❌ Раздел не найден.', {
      reply_markup: topicBackKeyboard()
    });
    return;
  }

  await bot.sendMessage(chatId, text, {
    parse_mode: 'HTML',
    reply_markup: topicBackKeyboard()
  });
}

function privateButtonToTopic(text) {
  const t = String(text || '').trim().toLowerCase();

  if (t.includes('общение')) return 'chat';
  if (t.includes('знакомства')) return 'social';
  if (t.includes('приветствие')) return 'welcome';
  if (t.includes('мем')) return 'meme';
  if (t.includes('игры')) return 'games';
  if (t.includes('вопрос')) return 'question';
  if (t.includes('помощь')) return 'help';
  if (t.includes('рандом')) return 'random';

  return null;
}

bot.onText(/^(\/start|\/help|начать|помощь)$/i, async (msg) => {
  try {
    if (msg.chat.type !== 'private') return;
    await sendPrivateMainMenu(msg.chat.id);
  } catch (error) {
    console.error('private start/help error:', error.message);
  }
});


// ======================================================
// RELATIONSHIP REQUEST FIX V2
// Отношения через reply / @username / TG ID
// ======================================================

function relFixMention(id, name) {
  return '<a href="tg://user?id=' + id + '">' + esc(name || ('ID ' + id)) + '</a>';
}

function relFixEnsureSocial(chat) {
  if (!chat.couples) chat.couples = {};
  if (!chat.pendingRelationshipRequests) chat.pendingRelationshipRequests = {};
  return chat;
}

async function relFixResolveTarget(msg, rawArg) {
  const chatId = msg.chat.id;

  // 1. Reply на сообщение
  if (msg.reply_to_message && msg.reply_to_message.from && !msg.reply_to_message.from.is_bot) {
    const u = msg.reply_to_message.from;

    return {
      id: Number(u.id),
      firstName: u.first_name || u.username || String(u.id),
      username: u.username || null
    };
  }

  const arg = String(rawArg || '').trim();

  if (!arg) return null;

  // 2. TG ID
  if (/^\d+$/.test(arg)) {
    const id = Number(arg);

    try {
      const member = await bot.getChatMember(chatId, id);

      if (member && member.user) {
        return {
          id: Number(member.user.id),
          firstName: member.user.first_name || member.user.username || String(id),
          username: member.user.username || null
        };
      }
    } catch (_) {}

    const chat = getChat(chatId);
    const stored = chat.users?.[String(id)];

    if (stored) {
      return {
        id: Number(stored.id || id),
        firstName: stored.firstName || stored.username || String(id),
        username: stored.username || null
      };
    }

    return {
      id,
      firstName: String(id),
      username: null
    };
  }

  // 3. @username
  const username = arg.replace(/^@/, '').toLowerCase();

  if (/^[a-zA-Z0-9_]{5,32}$/.test(username)) {
    const chat = getChat(chatId);

    const stored = Object.values(chat.users || {}).find((u) => {
      return String(u.username || '').toLowerCase() === username;
    });

    if (stored && stored.id) {
      return {
        id: Number(stored.id),
        firstName: stored.firstName || stored.username || String(stored.id),
        username: stored.username || username
      };
    }

    return {
      notFoundUsername: username
    };
  }

  return null;
}

async function relFixStartRequest(msg, rawArg) {
  try {
    if (!isGroup(msg)) return;

    const chatId = msg.chat.id;
    const chat = relFixEnsureSocial(getChat(chatId, msg.chat.title, msg.chat.type));

    const target = await relFixResolveTarget(msg, rawArg);

    if (target?.notFoundUsername) {
      await replyTo(
        msg,
        '❌ <b>Пользователь @' + esc(target.notFoundUsername) + ' не найден в базе этой беседы.</b>\n\n' +
        'Чтобы предложить отношения по username, человек должен хотя бы 1 раз написать сообщение в этот чат.\n\n' +
        'Лучший вариант: ответь на его сообщение и напиши <code>отношения</code>.'
      );
      return;
    }

    if (!target || !target.id) {
      await replyTo(
        msg,
        '❌ <b>Укажи человека</b>\n\n' +
        'Можно так:\n' +
        '• ответь на сообщение: <code>отношения</code>\n' +
        '• <code>отношения @username</code>\n' +
        '• <code>отношения TG_ID</code>'
      );
      return;
    }

    if (Number(target.id) === Number(msg.from.id)) {
      await replyTo(msg, '😅 С самим собой отношения создать нельзя.');
      return;
    }

    if (Number(target.id) === Number(_botId)) {
      await replyTo(msg, '🤖 Со мной нельзя, я пока просто бот.');
      return;
    }

    const fromUser = getUser(chatId, msg.from.id, msg.from.first_name, msg.from.username);
    const toUser = getUser(chatId, target.id, target.firstName, target.username);

    const fromId = String(fromUser.id);
    const toId = String(toUser.id);

    if (fromUser.couple || chat.couples[fromId]) {
      await replyTo(msg, '❌ У тебя уже есть пара. Сначала напиши: <code>расстаться</code>');
      return;
    }

    if (toUser.couple || chat.couples[toId]) {
      await replyTo(msg, '❌ У этого пользователя уже есть пара.');
      return;
    }

    const requestId = 'rel_' + Date.now().toString(36) + '_' + Math.floor(Math.random() * 99999).toString(36);

    chat.pendingRelationshipRequests[requestId] = {
      id: requestId,
      fromId: Number(fromUser.id),
      toId: Number(toUser.id),
      fromName: fromUser.firstName || fromUser.username || ('ID ' + fromUser.id),
      toName: toUser.firstName || toUser.username || ('ID ' + toUser.id),
      createdAt: Date.now()
    };

    saveDB();

    await replyTo(
      msg,
      '❤️ <b>Предложение отношений</b>\n\n' +
      '👤 ' + relFixMention(fromUser.id, fromUser.firstName || fromUser.username) + '\n' +
      '💌 предлагает ' + relFixMention(toUser.id, toUser.firstName || toUser.username) + '\n\n' +
      '✨ <b>' + esc(toUser.firstName || toUser.username || ('ID ' + toUser.id)) + '</b>, согласна/согласен стать парой?\n\n' +
      '💭 Решение только за тобой — можно принять или красиво отказаться.\n' +
      '⏳ Заявка активна 24 часа.\n' +
      '🔒 Нажать кнопки может только тот, кому отправили предложение.',
      {
        reply_markup: {
          inline_keyboard: [
            [{ text: '❤️ Принять отношения', callback_data: 'relfix:' + requestId + ':yes' }],
            [{ text: '💔 Отказаться', callback_data: 'relfix:' + requestId + ':no' }]
          ]
        }
      }
    );
  } catch (error) {
    console.error('relFixStartRequest error:', error.message);
    await replyTo(msg, '❌ Ошибка при создании заявки отношений.');
  }
}

// Ловим отношения отдельным обработчиком, чтобы не зависеть от старого parseCommand
bot.onText(/^\/?(?:отношения|отношение|любовь|love)(?:@[a-zA-Z0-9_]+)?(?:\s+(.+))?$/i, async (msg, match) => {
  if (!msg.from || msg.from.is_bot) return;
  if (!isGroup(msg)) return;

  const rawArg = match && match[1] ? match[1].trim() : '';

  await relFixStartRequest(msg, rawArg);
});



// ======================================================
// FINAL RELATIONSHIP SYSTEM
// ======================================================

function finalRelMention(id, name) {
  return '<a href="tg://user?id=' + id + '">' + esc(name || ('ID ' + id)) + '</a>';
}

function finalRelEnsure(chat) {
  if (!chat.couples) chat.couples = {};
  if (!chat.pendingRelationshipRequests) chat.pendingRelationshipRequests = {};
  return chat;
}

async function finalRelFindTarget(msg, argText = '') {
  const chatId = msg.chat.id;

  // reply
  if (msg.reply_to_message && msg.reply_to_message.from && !msg.reply_to_message.from.is_bot) {
    const u = msg.reply_to_message.from;
    return {
      id: Number(u.id),
      firstName: u.first_name || u.username || String(u.id),
      username: u.username || null
    };
  }

  const arg = String(argText || '').trim();

  if (!arg) return null;

  // TG ID
  if (/^\d+$/.test(arg)) {
    const id = Number(arg);

    try {
      const member = await bot.getChatMember(chatId, id);

      if (member && member.user) {
        return {
          id: Number(member.user.id),
          firstName: member.user.first_name || member.user.username || String(id),
          username: member.user.username || null
        };
      }
    } catch (_) {}

    const chat = getChat(chatId);
    const stored = chat.users?.[String(id)];

    if (stored) {
      return {
        id: Number(stored.id || id),
        firstName: stored.firstName || stored.username || String(id),
        username: stored.username || null
      };
    }

    return {
      id,
      firstName: String(id),
      username: null
    };
  }

  // @username
  const username = arg.replace(/^@/, '').toLowerCase();

  if (/^[a-zA-Z0-9_]{5,32}$/.test(username)) {
    const chat = getChat(chatId);

    const stored = Object.values(chat.users || {}).find((u) => {
      return String(u.username || '').toLowerCase() === username;
    });

    if (stored && stored.id) {
      return {
        id: Number(stored.id),
        firstName: stored.firstName || stored.username || String(stored.id),
        username: stored.username || username
      };
    }

    return {
      notFoundUsername: username
    };
  }

  return null;
}

async function finalRelationshipRequest(msg, argText = '') {
  try {
    if (!isGroup(msg)) return;

    const chatId = msg.chat.id;
    const chat = finalRelEnsure(getChat(chatId, msg.chat.title, msg.chat.type));

    const target = await finalRelFindTarget(msg, argText);

    if (target?.notFoundUsername) {
      await replyTo(
        msg,
        '❌ <b>Пользователь @' + esc(target.notFoundUsername) + ' не найден в базе этой беседы.</b>\n\n' +
        'Пусть человек напишет любое сообщение в чат, потом повтори.\n\n' +
        'Самый надёжный вариант: ответь на его сообщение и напиши <code>/отношения</code>.'
      );
      return true;
    }

    if (!target || !target.id) {
      await replyTo(
        msg,
        '❌ <b>Укажи человека</b>\n\n' +
        'Можно так:\n' +
        '• reply на сообщение → <code>/отношения</code>\n' +
        '• <code>/отношения @username</code>\n' +
        '• <code>/отношения TG_ID</code>'
      );
      return true;
    }

    if (Number(target.id) === Number(msg.from.id)) {
      await replyTo(msg, '😅 С самим собой отношения создать нельзя.');
      return true;
    }

    const fromUser = getUser(chatId, msg.from.id, msg.from.first_name, msg.from.username);
    const toUser = getUser(chatId, target.id, target.firstName, target.username);

    const fromId = String(fromUser.id);
    const toId = String(toUser.id);

    if (fromUser.couple || chat.couples[fromId]) {
      await replyTo(msg, '❌ У тебя уже есть пара. Сначала напиши: <code>/расстаться</code>');
      return true;
    }

    if (toUser.couple || chat.couples[toId]) {
      await replyTo(msg, '❌ У этого пользователя уже есть пара.');
      return true;
    }

    const requestId = 'finalrel_' + Date.now().toString(36) + '_' + Math.floor(Math.random() * 99999).toString(36);

    chat.pendingRelationshipRequests[requestId] = {
      id: requestId,
      fromId: Number(fromUser.id),
      toId: Number(toUser.id),
      fromName: fromUser.firstName || fromUser.username || ('ID ' + fromUser.id),
      toName: toUser.firstName || toUser.username || ('ID ' + toUser.id),
      createdAt: Date.now()
    };

    saveDB();

    await replyTo(
      msg,
      '❤️ <b>Предложение отношений</b>\n\n' +
      '👤 ' + finalRelMention(fromUser.id, fromUser.firstName || fromUser.username) + '\n' +
      '💌 предлагает ' + finalRelMention(toUser.id, toUser.firstName || toUser.username) + '\n\n' +
      '✨ <b>' + esc(toUser.firstName || toUser.username || ('ID ' + toUser.id)) + '</b>, согласна/согласен стать парой?\n\n' +
      '💭 Решение только за тобой — можно принять или красиво отказаться.\n' +
      '⏳ Заявка активна 24 часа.\n' +
      '🔒 Нажать кнопки может только тот, кому отправили предложение.',
      {
        reply_markup: {
          inline_keyboard: [
            [{ text: '❤️ Принять отношения', callback_data: 'finalrel:' + requestId + ':yes' }],
            [{ text: '💔 Отказаться', callback_data: 'finalrel:' + requestId + ':no' }]
          ]
        }
      }
    );

    return true;
  } catch (error) {
    console.error('finalRelationshipRequest error:', error);
    await replyTo(msg, '❌ Ошибка при создании заявки отношений.');
    return true;
  }
}


bot.on('message', async (msg) => {
  try {
    if (!msg.from || msg.from.is_bot) return;
    if (msg.chat.type !== 'private') return;
    if (!msg.text) return;

    const topic = privateButtonToTopic(msg.text);

    if (topic) {
      await sendPrivateTopic(msg.chat.id, topic);
    }
  } catch (error) {
    console.error('private topic message error:', error.message);
  }
});


bot.on('message', async (msg) => {
  try {
    if (!msg.from || msg.from.is_bot) return;
    if (!isGroup(msg)) return;
    // FINAL RELATIONSHIP DIRECT MESSAGE HOOK
    if (msg.text) {
      const relText = String(msg.text || '').trim();
      const relMatch = relText.match(/^\/?(?:отношения|отношение|любовь|love)(?:@[a-zA-Z0-9_]+)?(?:\s+(.+))?$/i);

      if (relMatch) {
        const argText = relMatch[1] ? relMatch[1].trim() : '';
        const handled = await finalRelationshipRequest(msg, argText);
        if (handled) return;
      }
    }



    const chatId = msg.chat.id;
    const userId = msg.from.id;

    // always register user
    const u = getUser(chatId, userId, msg.from.first_name, msg.from.username);
    getChat(chatId, msg.chat.title, msg.chat.type);

    // detect message type
    const msgType =
      msg.voice         ? 'voice'    :
      msg.video_note    ? 'circle'   :
      msg.photo         ? 'photo'    :
      msg.video         ? 'video'    :
      msg.sticker       ? 'sticker'  :
      msg.document      ? 'document' :
      msg.audio         ? 'audio'    :
      msg.animation     ? 'animation':
      msg.text          ? 'text'     : 'other';

    // parse command BEFORE counting (commands don't add stats)
    const parsed = parseCommand(msg.text || '');
    const isCmd  = !!parsed;

    if (!isCmd) {
      // activity
      u.messages = (u.messages || 0) + 1;
      u.xp       = (u.xp       || 0) + 1;
      if (!u.msgTypes) u.msgTypes = {};
      u.msgTypes[msgType] = (u.msgTypes[msgType] || 0) + 1;
      // period stats
      if (!u.stats) u.stats = { daily:{}, weekly:{}, monthly:{} };
      const dk = todayKey(), wk = weekKey(), mk = monthKey();
      u.stats.daily[dk]   = (u.stats.daily[dk]   || 0) + 1;
      u.stats.weekly[wk]  = (u.stats.weekly[wk]  || 0) + 1;
      u.stats.monthly[mk] = (u.stats.monthly[mk] || 0) + 1;
      // coins (anti-farm: 1 per second)
      const now = Date.now();
      if (!u._lc || now - u._lc > 1000) { u.balance = (u.balance || 0) + 1; u._lc = now; }
      saveDB();
      await checkAchievements(chatId, userId);
    }

    // automod
    if (msg.text || msg.sticker || msg.voice) await checkSpam(msg);
    if (msg.text || msg.caption)              await checkLinks(msg);
    if (msg.text || msg.caption)              await checkBadWords(msg);

    // passive detections (birthday, reminder)
    if (msg.text) {
      await checkBirthday(msg);
      await checkReminder(msg);
    }

    // video downloader from old bot: TikTok / YouTube / Instagram
    if (!isCmd && msg.text && isVideoLink(msg.text)) {
      await handleVideoDownload(msg);
      return;
    }

    // command routing
    if (isCmd) await handleCommand(parsed.command, msg, parsed.args, parsed.argText);
  } catch (e) { console.error('message handler:', e.message); }
});

// welcome / goodbye
bot.on('new_chat_members', async (msg) => {
  try {
    const chatId = msg.chat.id, chat = getChat(chatId);
    if (!chat.settings.welcome) return;
    for (const m of msg.new_chat_members) {
      if (m.is_bot) continue;
      getUser(chatId, m.id, m.first_name, m.username);
      const name = m.username ? `@${m.username}` : m.first_name;
      const txt  = chat.settings.welcomeText
        ? chat.settings.welcomeText.replace('{name}', name)
        : `👋 <b>Добро пожаловать, ${esc(name)}!</b>\n\nТы попал в «${esc(chat.title || 'наш чат')}».\nПеред общением прочитай /правила.\n\nПриятного общения ❤️`;
      await tgReply(chatId, txt);
      await sendLog(chatId, `➕ Вошёл: ${name} (${m.id})`);
    }
  } catch (e) { console.error('new_chat_members:', e.message); }
});

bot.on('left_chat_member', async (msg) => {
  try {
    const chatId = msg.chat.id, chat = getChat(chatId);
    const m = msg.left_chat_member;
    if (m.is_bot) return;
    // mark as left
    const u = getUser(chatId, m.id, m.first_name, m.username);
    u.leftChat = true; u.canCall = false; saveDB();
    if (!chat.settings.goodbye) return;
    const name = m.username ? `@${m.username}` : m.first_name;
    const txt  = chat.settings.goodbyeText
      ? chat.settings.goodbyeText.replace('{name}', name)
      : `👋 <b>${esc(name)}</b> покинул чат.`;
    await tgReply(chatId, txt);
    await sendLog(chatId, `➖ Вышел: ${name} (${m.id})`);
  } catch (e) { console.error('left_chat_member:', e.message); }
});

// ═══════════════════════════════════════════════════════════════
//  MAIN COMMAND HANDLER
// ═══════════════════════════════════════════════════════════════
async function handleCommand(cmd, msg, args, argText) {
  const chatId = msg.chat.id;
  try { switch (cmd) {

  // ── SETUP ──────────────────────────────────────────────────
  case 'setup': {
    if (!await guardGroup(msg)) return;
    const chat = getChat(chatId, msg.chat.title, msg.chat.type);
    chat.title = msg.chat.title; chat.type = msg.chat.type;
    // auto-assign owner
    try {
      const mem = await bot.getChatMember(chatId, msg.from.id);
      const u   = getUser(chatId, msg.from.id, msg.from.first_name, msg.from.username);
      if (mem.status === 'creator' || msg.from.id === OWNER_ID) {
        u.adminRank = 100;
      } else if (['administrator'].includes(mem.status) && u.adminRank < 60) {
        u.adminRank = 60;
      }
      saveDB();
    } catch (_) {}
    await replyTo(msg,
      `✅ <b>Бот настроен для этой беседы!</b>\n\n📛 Название: ${esc(chat.title)}\n🆔 ID чата: <code>${chatId}</code>\n\n📌 Команды работают со слешем и без:\n• профиль / /профиль\n• топ день / /топ день\n• мут 123 10 флуд / /мут 123 10 флуд\n\n🛡 Владелец назначен автоматически.\n📜 Правила: /правила\n⚙️ Настройки: /настройки`
    );
    break;
  }

  // ── HELP ───────────────────────────────────────────────────
  case 'help': {
    const kb = { inline_keyboard: [
      [{ text:'🛡 Модерация',   callback_data:'help:moder'   }, { text:'👑 Ранги',     callback_data:'help:ranks'   }],
      [{ text:'👤 Профиль',    callback_data:'help:profile'  }, { text:'📜 Правила',   callback_data:'help:rules'   }],
      [{ text:'⚙️ Настройки',  callback_data:'help:settings' }, { text:'🎁 Магазин',   callback_data:'help:shop'    }],
      [{ text:'📢 Созыв',      callback_data:'help:call'     }, { text:'❤️ Отношения', callback_data:'help:social'  }],
      [{ text:'🏆 Топы',       callback_data:'help:tops'     }, { text:'🎉 Пятница',   callback_data:'help:friday'  }],
      [{ text:'🌍 Глоб.ранги', callback_data:'help:global'   }, { text:'💰 Монеты',    callback_data:'help:coins'   }]
    ]};
    await replyTo(msg,
      `🤖 <b>FulTalchik_Botik — меню команд</b>

⚙️ Все команды работают со слешем и без!

Выбери раздел:`,
      { reply_markup: kb }
    );
    break;
  }

  // ── RULES ──────────────────────────────────────────────────
  case 'rules': {
    const chat = getChat(chatId);
    await replyTo(msg, `📜 <b>Правила чата</b>\n\n${esc(chat.settings.rules)}\n\n⚠️ <i>За нарушение: предупреждение, мут, кик или бан.</i>`);
    break;
  }
  case 'setrules': {
    if (!await guardGroup(msg) || !await guardRank(msg, 80)) return;
    if (!argText) { await replyTo(msg,'❌ Укажи текст правил.'); return; }
    getChat(chatId).settings.rules = argText; saveDB();
    await replyTo(msg,'✅ Правила обновлены.');
    await sendLog(chatId, `📜 Правила изменены: ${msg.from.first_name}`);
    break;
  }

  // ── MUTE ───────────────────────────────────────────────────
  case 'mute': {
    if (!await guardGroup(msg) || !await guardRank(msg, 30)) return;
    if (msg.reply_to_message && args.length === 0) {
      const tid = msg.reply_to_message.from.id;
      const k   = `mute:${chatId}:${msg.message_id}`;
      pending[k] = { actorId: msg.from.id, chatId, targetId: tid };
      const kb = { inline_keyboard: [
        [{ text:'5 мин.',  callback_data:`mt:${k}:5`  }, { text:'10 мин.', callback_data:`mt:${k}:10` }],
        [{ text:'30 мин.', callback_data:`mt:${k}:30` }, { text:'60 мин.', callback_data:`mt:${k}:60` }],
        [{ text:'❌ Отмена', callback_data:`mt:${k}:cancel` }]
      ]};
      await replyTo(msg, '🔇 <b>Выбери срок мута:</b>', { reply_markup: kb }); return;
    }
    const t = await guardTarget(msg, args, chatId); if (!t) return;
    if (!await guardCanPunish(msg, t.id)) return;
    const actorRank = await getEffectiveRank(chatId, msg.from.id);
    let minutes = 60;
    if (t.args[0] && /^\d+$/.test(t.args[0])) { minutes = parseInt(t.args[0],10); t.args.shift(); }
    const reason = t.args.join(' ') || 'Не указана';
    const limit  = getMuteLimit(actorRank);
    if (minutes > limit && limit !== Infinity) {
      await replyTo(msg, `❌ Превышен лимит мута\nТвой лимит: ${limit} мин.\nТы указал: ${minutes} мин.`); return;
    }
    try {
      const target = getUser(chatId, t.id, t.firstName, t.username);
      await doMute(chatId, t.id, minutes, reason, msg.from.first_name);
      await replyTo(msg, `🔇 <b>Мут выдан</b>\n\n👤 ${mention(target)}\n🆔 <code>${t.id}</code>\n⏱ ${fmtDur(minutes)}\n📌 ${esc(reason)}\n👮 ${esc(msg.from.first_name)}\n\n✅ Снимется автоматически.`);
    } catch (e) { await replyTo(msg, `❌ ${e.message}`); }
    break;
  }

  case 'unmute': {
    if (!await guardGroup(msg) || !await guardRank(msg, 30)) return;
    const t = await guardTarget(msg, args, chatId); if (!t) return;
    try {
      await doUnmute(chatId, t.id, msg.from.first_name);
      await replyTo(msg, `🔊 <b>Мут снят</b>\n👤 ${mention(getUser(chatId,t.id))}\n🆔 <code>${t.id}</code>\n👮 ${esc(msg.from.first_name)}\n\n✅ Пользователь снова может писать.`);
    } catch (e) { await replyTo(msg, `❌ ${e.message}`); }
    break;
  }

  case 'ban': {
    if (!await guardGroup(msg) || !await guardRank(msg, 70)) return;
    const t = await guardTarget(msg, args, chatId); if (!t) return;
    if (!await guardCanPunish(msg, t.id)) return;
    try {
      await doBan(chatId, t.id, t.args.join(' ') || 'Не указана', msg.from.first_name);
      await replyTo(msg, `🚫 <b>Забанен</b>\n👤 ${mention(getUser(chatId,t.id))}\n🆔 <code>${t.id}</code>\n📌 ${esc(t.args.join(' ') || 'Не указана')}\n👮 ${esc(msg.from.first_name)}`);
    } catch (e) { await replyTo(msg, `❌ ${e.message}`); }
    break;
  }

  case 'unban': {
    if (!await guardGroup(msg) || !await guardRank(msg, 70)) return;
    const uid = args[0]; if (!uid || !/^\d+$/.test(uid)) { await replyTo(msg,'❌ Укажи ID.'); return; }
    try {
      await doUnban(chatId, parseInt(uid,10), msg.from.first_name);
      await replyTo(msg, `✅ <b>Разбанен</b>\n🆔 <code>${uid}</code>\n👮 ${esc(msg.from.first_name)}`);
    } catch (e) { await replyTo(msg, `❌ ${e.message}`); }
    break;
  }

  case 'kick': {
    if (!await guardGroup(msg) || !await guardRank(msg, 60)) return;
    const t = await guardTarget(msg, args, chatId); if (!t) return;
    if (!await guardCanPunish(msg, t.id)) return;
    try {
      await doKick(chatId, t.id, t.args.join(' ') || 'Не указана', msg.from.first_name);
      await replyTo(msg, `👢 <b>Кикнут</b>\n👤 ${mention(getUser(chatId,t.id))}\n🆔 <code>${t.id}</code>\n📌 ${esc(t.args.join(' ') || 'Не указана')}\n👮 ${esc(msg.from.first_name)}`);
    } catch (e) { await replyTo(msg, `❌ ${e.message}`); }
    break;
  }

  case 'warn': {
    if (!await guardGroup(msg) || !await guardRank(msg, 30)) return;
    const t = await guardTarget(msg, args, chatId); if (!t) return;
    if (!await guardCanPunish(msg, t.id)) return;
    await doWarn(chatId, t.id, t.args.join(' ') || 'Не указана', msg.from.first_name, msg);
    break;
  }

  case 'unwarn': {
    if (!await guardGroup(msg) || !await guardRank(msg, 30)) return;
    const t = await guardTarget(msg, args, chatId); if (!t) return;
    const u = getUser(chatId, t.id);
    if (!u.warns?.length) { await replyTo(msg,'✅ Нет предупреждений.'); return; }
    u.warns.pop(); saveDB();
    addHistory(chatId, t.id, { type:'unwarn', by: msg.from.first_name });
    await replyTo(msg, `✅ <b>Пред снят</b>\n👤 ${mention(u)}\n📊 ${u.warns.length}/5\n👮 ${esc(msg.from.first_name)}`);
    break;
  }

  case 'warns': {
    if (!await guardGroup(msg) || !await guardRank(msg, 10)) return;
    const t  = await resolveTarget(msg, args, chatId);
    const u  = getUser(chatId, t ? t.id : msg.from.id);
    const ws = u.warns || [];
    if (!ws.length) { await replyTo(msg,`⚠️ У ${mention(u)} нет предупреждений.`); return; }
    const list = ws.map((w,i)=>`${i+1}. 📌 ${esc(w.reason)} — 👮 ${esc(w.by)} (${new Date(w.time).toLocaleDateString('ru')})`).join('\n');
    await replyTo(msg, `⚠️ <b>Предупреждения</b> ${mention(u)}\n\n${list}\n\n📊 Всего: ${ws.length}/5`);
    break;
  }

  case 'del': {
    if (!await guardGroup(msg) || !await guardRank(msg, 20)) return;
    if (!msg.reply_to_message) { await replyTo(msg,'❌ Ответь на сообщение.'); return; }
    try { await bot.deleteMessage(chatId, msg.reply_to_message.message_id); await bot.deleteMessage(chatId, msg.message_id); }
    catch (e) { await replyTo(msg, `❌ ${e.message}`); }
    break;
  }

  // ── RANK ASSIGN ────────────────────────────────────────────
  case 'setrank': {
    if (!await guardGroup(msg) || !await guardRank(msg, 20)) return;
    const t = await guardTarget(msg, args, chatId); if (!t) return;
    const nr = parseInt(t.args[0],10);
    if (isNaN(nr) || !RANKS[nr]) { await replyTo(msg,`❌ Неверный ранг. Допустимые: ${Object.keys(RANKS).join(', ')}`); return; }
    const ar = await getEffectiveRank(chatId, msg.from.id);
    if (nr >= ar) { await replyTo(msg,`❌ Нельзя выдать ранг ≥ своему (${ar}).`); return; }
    const u = getUser(chatId, t.id, t.firstName, t.username); u.adminRank = nr; saveDB();
    const ri = getRankInfo(nr);
    await replyTo(msg, `${ri.emoji} <b>Ранг выдан</b>\n👤 ${mention(u)}\n🆔 <code>${t.id}</code>\n🎚 ${ri.name} (${nr})\n👮 ${esc(msg.from.first_name)}`);
    await sendLog(chatId, `🎚 Ранг ${ri.name}(${nr}) → ${mention(u)} | ${msg.from.first_name}`);
    break;
  }
  case 'delrank': {
    if (!await guardGroup(msg)) return;
    const t  = await guardTarget(msg, args, chatId); if (!t) return;
    const ar = await getEffectiveRank(chatId, msg.from.id);
    const tr = await getEffectiveRank(chatId, t.id);
    if (tr >= ar) { await replyTo(msg,'❌ Нельзя снять ранг у равного или выше.'); return; }
    const u = getUser(chatId, t.id); u.adminRank = 0; saveDB();
    await replyTo(msg, `👤 <b>Ранг снят</b>\n👤 ${mention(u)}\n🆔 <code>${t.id}</code>\n👮 ${esc(msg.from.first_name)}`);
    break;
  }
  case 'owner':       await quickRank(msg, args, 100, chatId); break;
  case 'deputy':      await quickRank(msg, args,  95, chatId); break;
  case 'headadmin':   await quickRank(msg, args,  90, chatId); break;
  case 'curator':     await quickRank(msg, args,  80, chatId); break;
  case 'senioradmin': await quickRank(msg, args,  70, chatId); break;
  case 'admin':       await quickRank(msg, args,  60, chatId); break;
  case 'junioradmin': await quickRank(msg, args,  50, chatId); break;
  case 'seniormoder': await quickRank(msg, args,  40, chatId); break;
  case 'moder':       await quickRank(msg, args,  30, chatId); break;
  case 'helper':      await quickRank(msg, args,  20, chatId); break;
  case 'trainee':     await quickRank(msg, args,  10, chatId); break;
  case 'user':        await quickRank(msg, args,   0, chatId); break;
  case 'transferowner': {
    if (!await guardGroup(msg)) return;
    if (await getEffectiveRank(chatId, msg.from.id) < 100) { await replyTo(msg,'❌ Только владелец.'); return; }
    const t = await guardTarget(msg, args, chatId); if (!t) return;
    getChat(chatId).pendingOwnerTransfer = { from: msg.from.id, to: t.id }; saveDB();
    await replyTo(msg, `⚠️ Передача прав → <code>${t.id}</code>\n\nПодтверди: /confirmowner`);
    break;
  }
  case 'confirmowner': {
    if (!await guardGroup(msg)) return;
    const chat = getChat(chatId); const p = chat.pendingOwnerTransfer;
    if (!p || p.from !== msg.from.id) { await replyTo(msg,'❌ Нет ожидающей передачи.'); return; }
    getUser(chatId, p.from).adminRank = 0;
    getUser(chatId, p.to).adminRank   = 100;
    chat.pendingOwnerTransfer = null; saveDB();
    await replyTo(msg, `👑 Права владельца переданы <code>${p.to}</code>.`);
    break;
  }

  // ── GLOBAL RANKS ───────────────────────────────────────────
  case 'gsetrank': {
    if (!await guardRank(msg, 100)) return;
    const uid2 = args[0], rk2 = parseInt(args[1],10);
    if (!uid2 || isNaN(rk2)) { await replyTo(msg,'❌ gsetrank ID ранг'); return; }
    db.globalAdmins[uid2] = { id: parseInt(uid2,10), rank: rk2, assignedBy: msg.from.id, assignedAt: new Date().toISOString() };
    saveDB();
    const ri2 = getRankInfo(rk2);
    await replyTo(msg, `🌍 <b>Глоб. ранг выдан</b>\n🆔 <code>${uid2}</code>\n🎚 ${ri2.emoji} ${ri2.name} (${rk2})`);
    break;
  }
  case 'gdelrank': {
    if (!await guardRank(msg, 100)) return;
    const uid3 = args[0]; if (!uid3) { await replyTo(msg,'❌ gdelrank ID'); return; }
    delete db.globalAdmins[uid3]; saveDB();
    await replyTo(msg, `✅ Глобальный ранг снят: <code>${uid3}</code>.`);
    break;
  }
  case 'globaladmins': {
    const ga = Object.values(db.globalAdmins);
    if (!ga.length) { await replyTo(msg,'🌍 Нет глобальных администраторов.'); return; }
    const lines = ga.map(g => { const ri=getRankInfo(g.rank); return `${ri.emoji} ${ri.name} — <code>${g.id}</code>`; }).join('\n');
    await replyTo(msg, `🌍 <b>Глобальная администрация</b>\n\n${lines}`);
    break;
  }

  // ── RANK INFO ──────────────────────────────────────────────
  case 'rank': {
    const t     = await resolveTarget(msg, args, chatId);
    const uid   = t ? t.id : msg.from.id;
    const local  = getUser(chatId, uid).adminRank || 0;
    const glob   = db.globalAdmins[String(uid)]?.rank || 0;
    const eff    = await getEffectiveRank(chatId, uid);
    const riL = getRankInfo(local), riG = getRankInfo(glob), riE = getRankInfo(eff);
    const u4  = getUser(chatId, uid);
    await replyTo(msg, `${riE.emoji} <b>Ранг</b> ${mention(u4)}\n\n🏠 Локальный: ${riL.emoji} ${riL.name} (${local})\n🌍 Глобальный: ${riG.emoji} ${riG.name} (${glob})\n✅ Активный: ${riE.emoji} ${riE.name} (${eff})`);
    break;
  }
  case 'ranks': {
    let text = '👑 <b>Список рангов</b>\n\n';
    Object.entries(RANKS).sort((a,b)=>Number(b[0])-Number(a[0])).forEach(([lvl,r]) => {
      text += `${r.emoji} <b>${r.name}</b> — уровень ${lvl}\n   <i>${r.note}</i>\n`;
    });
    await replyTo(msg, text);
    break;
  }
  case 'admins': {
    if (!await guardGroup(msg)) return;
    const admins = Object.values(getChat(chatId).users).filter(u=>u.adminRank>0).sort((a,b)=>b.adminRank-a.adminRank);
    if (!admins.length) { await replyTo(msg,'👥 Нет назначенных администраторов.'); return; }
    let text = '👑 <b>Администрация</b>\n\n';
    admins.forEach(u => { const ri=getRankInfo(u.adminRank); text+=`${ri.emoji} <b>${ri.name}</b> — ${esc(u.firstName)}${u.username?` (@${u.username})`:''}\n`; });
    await replyTo(msg, text);
    break;
  }

  // ── DB INFO ────────────────────────────────────────────────
  case 'db': {
    if (!await guardGroup(msg)) return;
    const chat  = getChat(chatId);
    const users = Object.values(chat.users);
    const total  = users.filter(u => u.canCall !== false && !u.leftChat && u.username).length;
    const aCount = users.filter(u => u.adminRank >= 10).length;
    const oCount = users.filter(u => u.adminRank >= 95).length;
    await replyTo(msg, `📦 <b>База этой беседы</b>\n\n👥 Всего для созыва: ${total}\n🛡 Админов: ${aCount}\n👑 Владельцев: ${oCount}\n\n💡 Бот запоминает всех, кто написал хотя бы одно сообщение.`);
    break;
  }

  case 'remember': {
    if (!await guardGroup(msg) || !await guardRank(msg, 30)) return;
    // "запомнить 123456789 Имя" or reply
    if (msg.reply_to_message?.from) {
      const u2 = msg.reply_to_message.from;
      getUser(chatId, u2.id, u2.first_name, u2.username);
      saveDB();
      await replyTo(msg, `✅ Запомнил: ${esc(u2.first_name)} (<code>${u2.id}</code>)`);
    } else if (args[0] && /^\d+$/.test(args[0])) {
      const uid2 = parseInt(args[0],10);
      const name = args.slice(1).join(' ') || String(uid2);
      getUser(chatId, uid2, name, null);
      saveDB();
      await replyTo(msg, `✅ Запомнил: ${esc(name)} (<code>${uid2}</code>)`);
    } else {
      await replyTo(msg,'❌ Укажи ID или ответь на сообщение пользователя.');
    }
    break;
  }

  // ── CALL ───────────────────────────────────────────────────
  case 'call': {
    if (!await guardGroup(msg)) return;
    const rank = await getEffectiveRank(chatId, msg.from.id);
    if (rank < 30) { await replyTo(msg,'❌ Созыв доступен с ранга 🧹 Модератор.'); return; }
    const target = args[0]?.toLowerCase();
    if (!target) {
      const k = `call:${chatId}:${msg.message_id}`;
      pending[k] = { actorId: msg.from.id };
      const kb = { inline_keyboard: [
        [{ text:'👥 Все',       callback_data:`call:${k}:all`    }],
        [{ text:'🛡 Админы',   callback_data:`call:${k}:admins`  }],
        [{ text:'👑 Владельцы',callback_data:`call:${k}:owners`  }],
        [{ text:'❌ Отмена',   callback_data:`call:${k}:cancel`  }]
      ]};
      await replyTo(msg,'📢 <b>Созыв</b>\n\nКого созвать?', { reply_markup: kb });
    } else {
      await doCall(msg, target, chatId);
    }
    break;
  }

  // ── PROFILE ────────────────────────────────────────────────
  case 'profile': {
    const t  = await resolveTarget(msg, args, chatId);
    const uid = t ? t.id : msg.from.id;
    const u   = getUser(chatId, uid, msg.from.first_name, msg.from.username);
    const lvl = Math.floor(Math.sqrt((u.xp||0)/10))+1;
    const r   = await getEffectiveRank(chatId, uid);
    const ri  = getRankInfo(r);
    const dk  = todayKey(), wk = weekKey(), mk = monthKey();
    const mt  = u.msgTypes || {};
    const badges = [];
    if (u.inventory?.vip)           badges.push('⭐ VIP');
    if (u.inventory?.premium)       badges.push('💎 Premium');
    if (u.inventory?.coloredProfile) badges.push('🎨 Цвет');
    let coupleStr = '';
    if (u.couple) {
      const cp = Object.values(getChat(chatId).users).find(x => String(x.id) === String(u.couple));
      if (cp) coupleStr = `\n❤️ Пара: ${mention(cp)}`;
    }
    await replyTo(msg,
      `👤 <b>Профиль пользователя</b>\n\n` +
      `<b>Основное:</b>\n👤 ${esc(u.firstName)}\n🆔 <code>${uid}</code>\n${u.username?`🔗 @${u.username}\n`:''}\n` +
      `<b>Активность:</b>\n💬 Сообщений всего: ${u.messages||0}\n✍️ Текст: ${mt.text||0}\n🎙 Голосовые: ${mt.voice||0}\n⭕ Кружки: ${mt.circle||0}\n🖼 Фото: ${mt.photo||0}\n🎬 Видео: ${mt.video||0}\n😄 Стикеры: ${mt.sticker||0}\n` +
      `📅 Сегодня: ${u.stats?.daily?.[dk]||0}  📆 Неделя: ${u.stats?.weekly?.[wk]||0}  🗓 Месяц: ${u.stats?.monthly?.[mk]||0}\n\n` +
      `<b>Статистика:</b>\n⭐ Репутация: ${u.reputation||0}\n⚠️ Предупреждений: ${(u.warns||[]).length}/5\n🪙 Баланс: ${u.balance||0} монет\n🎚 Уровень: ${lvl}\n` +
      `${u.title?`🏷 Титул: ${esc(u.title)}\n`:''}` +
      `${r>0?`👑 Ранг: ${ri.emoji} ${ri.name}\n`:''}` +
      `${u.birthday?`🎂 День рождения: ${u.birthday.day}.${u.birthday.month}\n`:''}` +
      `${coupleStr}${badges.length?`\n${badges.join(' · ')}`:''}`
    );
    break;
  }

  case 'id': {
    if (msg.reply_to_message?.from) {
      const u=msg.reply_to_message.from;
      await replyTo(msg,`🆔 ID: <code>${u.id}</code>\n👤 ${esc(u.first_name)}`);
    } else {
      await replyTo(msg,`🆔 Твой ID: <code>${msg.from.id}</code>`);
    }
    break;
  }

  // ── TOP ────────────────────────────────────────────────────
  case 'top': {
    if (!await guardGroup(msg)) return;
    const period = args[0]?.toLowerCase();
    const users  = Object.values(getChat(chatId).users);
    const medals = ['🥇','🥈','🥉'];

    let key, label, statKey;
    if (period==='day'||period==='день')          { key=todayKey(); statKey='daily';   label='Топ дня 📅'; }
    else if (period==='week'||period==='неделя')  { key=weekKey();  statKey='weekly';  label='Топ недели 📆'; }
    else if (period==='month'||period==='месяц')  { key=monthKey(); statKey='monthly'; label='Топ месяца 🗓'; }
    else                                           { label='Топ за всё время 🏆'; }

    let sorted;
    if (key) {
      sorted = users.map(u=>({ u, cnt: u.stats?.[statKey]?.[key]||0 })).filter(x=>x.cnt>0).sort((a,b)=>b.cnt-a.cnt).slice(0,10);
    } else {
      sorted = users.filter(u=>u.messages>0).sort((a,b)=>b.messages-a.messages).slice(0,10).map(u=>({u,cnt:u.messages}));
    }
    if (!sorted.length) { await replyTo(msg,'📊 Статистика пуста.'); return; }
    let text = `🏆 <b>${label}</b>\n\n`;
    sorted.forEach(({u,cnt},i) => {
      const medal = medals[i]||`${i+1}.`;
      text += `${medal} ${mention(u)} — ${cnt}\n`;
    });
    await replyTo(msg, text);
    break;
  }

  case 'level': {
    const t = await resolveTarget(msg, args, chatId); const uid = t?t.id:msg.from.id;
    const u = getUser(chatId, uid);
    const lvl = Math.floor(Math.sqrt((u.xp||0)/10))+1;
    await replyTo(msg, `🎚 <b>Уровень</b>\n\n👤 ${mention(u)}\n🎚 ${lvl}\n⚡ XP: ${u.xp||0} / ${Math.pow(lvl,2)*10}`);
    break;
  }

  case 'history': {
    if (!await guardGroup(msg) || !await guardRank(msg, 50)) return;
    const t = await resolveTarget(msg, args, chatId); const uid = t?t.id:msg.from.id;
    const u = getUser(chatId, uid);
    const h = (u.history||[]).slice(-10).reverse();
    let text = `📂 <b>История</b> ${mention(u)}\n\n🆔 <code>${uid}</code>\n⚠️ Предов: ${(u.warns||[]).length}\n💬 Сообщений: ${u.messages||0}\n\n`;
    if (h.length) text += h.map(x=>`• <i>${new Date(x.time).toLocaleDateString('ru')}</i> — <b>${x.type}</b>${x.reason?` (${esc(x.reason)})`:''}`).join('\n');
    await replyTo(msg, text);
    break;
  }

  case 'actions': {
    if (!await guardGroup(msg) || !await guardRank(msg, 30)) return;
    if (!msg.reply_to_message) { await replyTo(msg,'❌ Ответь на сообщение.'); return; }
    const tid = msg.reply_to_message.from.id;
    const k   = `act:${chatId}:${msg.message_id}`;
    pending[k] = { actorId: msg.from.id, chatId, targetId: tid };
    const target = getUser(chatId, tid, msg.reply_to_message.from.first_name, msg.reply_to_message.from.username);
    const kb = { inline_keyboard: [
      [{ text:'🔇 Мут', callback_data:`act:${k}:mute` }, { text:'🚫 Бан',  callback_data:`act:${k}:ban`  }],
      [{ text:'👢 Кик', callback_data:`act:${k}:kick` }, { text:'⚠️ Пред', callback_data:`act:${k}:warn` }],
      [{ text:'📂 История', callback_data:`act:${k}:history` }, { text:'🗑 Удалить', callback_data:`act:${k}:del` }],
      [{ text:'❌ Отмена', callback_data:`act:${k}:cancel` }]
    ]};
    await replyTo(msg, `👤 <b>Действия с</b> ${mention(target)}`, { reply_markup: kb });
    break;
  }

  // ── REPUTATION ─────────────────────────────────────────────
  case 'rep': {
    const t = await resolveTarget(msg, args, chatId);
    if (!t) { await replyTo(msg,'❌ Укажи пользователя.'); return; }
    if (t.id === msg.from.id) { await replyTo(msg,'❌ Нельзя себе.'); return; }
    const giver = getUser(chatId, msg.from.id); const now = Date.now();
    if (!giver.cooldowns) giver.cooldowns = { daily:0, rep:{}, action:0 };
    if (!giver.cooldowns.rep) giver.cooldowns.rep = {};
    if (giver.cooldowns.rep[t.id] && now - giver.cooldowns.rep[t.id] < 12*3600000) {
      await replyTo(msg,`⏳ Подожди ещё ${Math.ceil((12*3600000-(now-giver.cooldowns.rep[t.id]))/3600000)} ч.`); return;
    }
    giver.cooldowns.rep[t.id] = now;
    const target = getUser(chatId, t.id, t.firstName, t.username);
    target.reputation = (target.reputation||0)+1; saveDB();
    await replyTo(msg, `⭐ <b>Репутация +1</b>\n👤 ${mention(target)}\n⭐ ${target.reputation}\n от ${esc(msg.from.first_name)}`);
    await checkAchievements(chatId, t.id);
    break;
  }
  case 'minusrep': {
    const t = await resolveTarget(msg, args, chatId);
    if (!t) { await replyTo(msg,'❌ Укажи пользователя.'); return; }
    if (t.id === msg.from.id) { await replyTo(msg,'❌ Нельзя себе.'); return; }
    const g = getUser(chatId, msg.from.id); const now = Date.now();
    if (!g.cooldowns) g.cooldowns = { daily:0, rep:{}, action:0 };
    if (!g.cooldowns.rep) g.cooldowns.rep = {};
    const rk = `m:${t.id}`;
    if (g.cooldowns.rep[rk] && now - g.cooldowns.rep[rk] < 12*3600000) { await replyTo(msg,'⏳ Слишком рано.'); return; }
    g.cooldowns.rep[rk] = now;
    const target = getUser(chatId, t.id, t.firstName, t.username);
    target.reputation = (target.reputation||0)-1; saveDB();
    await replyTo(msg, `👎 <b>Репутация -1</b>\n👤 ${mention(target)}\n⭐ ${target.reputation}`);
    break;
  }
  case 'myrep': {
    const u = getUser(chatId, msg.from.id);
    await replyTo(msg, `⭐ Твоя репутация: <b>${u.reputation||0}</b>`);
    break;
  }

  // ── BALANCE & ECONOMY ──────────────────────────────────────
  case 'balance': {
    // if args look like "ID amount" → coins command for owner
    if (args[0] && /^\d+$/.test(args[0]) && args[1] && msg.from.id === OWNER_ID) {
      await handleCommand('coins', msg, args, argText); return;
    }
    if (msg.reply_to_message && args[0] && /^-?\d+$/.test(args[0]) && msg.from.id === OWNER_ID) {
      await handleCommand('coins', msg, args, argText); return;
    }
    const u = getUser(chatId, msg.from.id);
    await replyTo(msg, `🪙 <b>Баланс</b>\n👤 ${esc(u.firstName)}\n🪙 ${u.balance||0} монет`);
    break;
  }

  case 'coins': {
    if (msg.from.id !== OWNER_ID) { await replyTo(msg,'❌ Только для разработчика.'); return; }
    let targetId, amount;
    if (msg.reply_to_message?.from) {
      targetId = msg.reply_to_message.from.id; amount = parseInt(args[0],10);
    } else {
      targetId = parseInt(args[0],10); amount = parseInt(args[1],10);
    }
    if (!targetId || isNaN(amount)) { await replyTo(msg,'❌ Укажи: coins ID сумма (или reply + сумма).'); return; }
    const u = getUser(chatId, targetId); u.balance = (u.balance||0) + amount; saveDB();
    await replyTo(msg,
      `🪙 <b>Монеты выданы</b>\n\n👤 ${mention(u)}\n🆔 <code>${targetId}</code>\n💰 Изменение: ${amount>0?'+':''}${amount}\n🏦 Новый баланс: ${u.balance}\n👨‍💻 Выдал разработчик`
    );
    break;
  }

  case 'daily': {
    const u = getUser(chatId, msg.from.id); const now = Date.now();
    if (!u.cooldowns) u.cooldowns = { daily:0, rep:{}, action:0 };
    if (u.cooldowns.daily && now - u.cooldowns.daily < 24*3600000) {
      await replyTo(msg,`⏳ Следующая награда через ${Math.ceil((24*3600000-(now-u.cooldowns.daily))/3600000)} ч.`); return;
    }
    u.cooldowns.daily = now; u.balance = (u.balance||0)+250; saveDB();
    await replyTo(msg, `🎁 <b>Ежедневная награда!</b>\n+250 монет\n🪙 Баланс: ${u.balance}`);
    break;
  }

  case 'give': {
    if (!await guardGroup(msg)) return;
    const t = await resolveTarget(msg, args, chatId); if (!t) return;
    const amount = parseInt(t.args[0],10);
    if (!amount || amount <= 0) { await replyTo(msg,'❌ Укажи сумму.'); return; }
    const sender = getUser(chatId, msg.from.id);
    if ((sender.balance||0) < amount) { await replyTo(msg,'❌ Недостаточно монет.'); return; }
    sender.balance -= amount;
    const target = getUser(chatId, t.id, t.firstName, t.username);
    target.balance = (target.balance||0)+amount; saveDB();
    await replyTo(msg, `💸 Передано <b>${amount}</b> монет → ${mention(target)}`);
    break;
  }

  case 'shop': {
    let text = '🛍 <b>Магазин</b>\n\n';
    for (const [id,item] of Object.entries(SHOP)) { text += `• <b>${item.name}</b> — ${item.price} монет\n  <i>${item.desc}</i>\n`; }
    text += '\n💬 Купить: <code>купить название</code>';
    await replyTo(msg, text);
    break;
  }

  case 'buy': {
    const k2 = args[0]?.toLowerCase().replace(/[^a-zа-яё]/gi,'');
    const MAP = { vip:'vip', premium:'premium', титул:'customtitle', customtitle:'customtitle',
                  защита:'warnshield', warnshield:'warnshield', цвет:'coloredprofile',
                  coloredprofile:'coloredprofile', реп:'reputationboost', reputationboost:'reputationboost' };
    const key3 = MAP[k2], item = key3 && SHOP[key3];
    if (!item) { await replyTo(msg,`❌ Товар не найден. Доступные: ${Object.keys(SHOP).join(', ')}`); return; }
    const u = getUser(chatId, msg.from.id);
    if ((u.balance||0) < item.price) { await replyTo(msg,`❌ Нужно: ${item.price} монет\n🪙 Есть: ${u.balance||0}`); return; }
    u.balance -= item.price;
    if (key3==='reputationboost')  u.reputation=(u.reputation||0)+5;
    else if (key3==='warnshield')  u.inventory.warnShield=(u.inventory.warnShield||0)+1;
    else if (key3==='customtitle') u.inventory.customTitle=true;
    else u.inventory[key3]=true;
    saveDB();
    await replyTo(msg, `✅ <b>Куплено!</b>\n${item.name} — ${item.price} монет\n🪙 Баланс: ${u.balance}`);
    break;
  }

  case 'title': {
    const u = getUser(chatId, msg.from.id);
    if (!u.inventory?.customTitle) { await replyTo(msg,'❌ Купи право на титул в магазине.'); return; }
    if (!argText) { await replyTo(msg,'❌ Укажи текст титула.'); return; }
    if (argText.length > 30) { await replyTo(msg,'❌ Максимум 30 символов.'); return; }
    u.title = argText; saveDB();
    await replyTo(msg, `✅ Титул: <b>${esc(argText)}</b>`);
    break;
  }
  case 'removetitle': {
    getUser(chatId, msg.from.id).title = null; saveDB();
    await replyTo(msg,'✅ Титул снят.');
    break;
  }

  // ── SETTINGS ───────────────────────────────────────────────
  case 'antispam': case 'antilinks': case 'antimat':
  case 'welcome':  case 'goodbye': {
    if (!await guardGroup(msg) || !await guardRank(msg, 80)) return;
    const chat2 = getChat(chatId); const val = args[0]?.toLowerCase();
    const settingMap = { antispam:'antispam', antilinks:'antilinks', antimat:'antimat', welcome:'welcome', goodbye:'goodbye' };
    const field = settingMap[cmd];
    if (val==='on'||val==='вкл') { chat2.settings[field]=true; saveDB(); await replyTo(msg,`✅ ${field} включён.`); }
    else if (val==='off'||val==='выкл') { chat2.settings[field]=false; saveDB(); await replyTo(msg,`✅ ${field} выключен.`); }
    else { await replyTo(msg,`${cmd}: ${chat2.settings[field]?'✅ ВКЛ':'❌ ВЫКЛ'}\n\nУправление: ${cmd} on | off`); }
    break;
  }

  case 'setwelcome': {
    if (!await guardGroup(msg)||!await guardRank(msg,80)) return;
    if (!argText) { await replyTo(msg,'❌ Укажи текст. {name} = имя.'); return; }
    getChat(chatId).settings.welcomeText=argText; saveDB(); await replyTo(msg,'✅ Приветствие обновлено.');
    break;
  }
  case 'setgoodbye': {
    if (!await guardGroup(msg)||!await guardRank(msg,80)) return;
    if (!argText) { await replyTo(msg,'❌ Укажи текст. {name} = имя.'); return; }
    getChat(chatId).settings.goodbyeText=argText; saveDB(); await replyTo(msg,'✅ Прощание обновлено.');
    break;
  }
  case 'settings': {
    if (!await guardGroup(msg)||!await guardRank(msg,80)) return;
    const s = getChat(chatId).settings;
    const kb = { inline_keyboard: [
      [{ text:`🛡 Антиспам: ${s.antispam?'✅':'❌'}`,  callback_data:`cfg:${chatId}:antispam`  }, { text:`🔗 Ссылки: ${s.antilinks?'✅':'❌'}`, callback_data:`cfg:${chatId}:antilinks` }],
      [{ text:`🤬 Антимат: ${s.antimat?'✅':'❌'}`,    callback_data:`cfg:${chatId}:antimat`   }, { text:`👋 Привет: ${s.welcome?'✅':'❌'}`,   callback_data:`cfg:${chatId}:welcome`   }],
      [{ text:`👋 Прощание: ${s.goodbye?'✅':'❌'}`,   callback_data:`cfg:${chatId}:goodbye`   }, { text:`🎉 Пятница: ${s.fridayPost?.enabled?'✅':'❌'}`, callback_data:`cfg:${chatId}:friday` }],
      [{ text:`☀️ Утро: ${s.morningEnabled?'✅':'❌'}`, callback_data:`cfg:${chatId}:morning`  }, { text:`🌙 Ночь: ${s.nightEnabled?'✅':'❌'}`,   callback_data:`cfg:${chatId}:night`   }],
      [{ text:`📊 Отчёт: ${s.weeklyReportEnabled?'✅':'❌'}`, callback_data:`cfg:${chatId}:weekly` }],
      [{ text:'📜 Правила', callback_data:`cfg:${chatId}:rules` }, { text:'📢 Лог-чат', callback_data:`cfg:${chatId}:setlog` }]
    ]};
    await replyTo(msg,'⚙️ <b>Настройки чата</b>\n\nНажми для переключения:', { reply_markup: kb });
    break;
  }
  case 'setlog': {
    if (!await guardGroup(msg)||!await guardRank(msg,90)) return;
    getChat(chatId).settings.logChatId=chatId; saveDB();
    await replyTo(msg,'✅ Этот чат назначен лог-чатом.');
    break;
  }
  case 'logs': {
    if (!await guardGroup(msg)||!await guardRank(msg,80)) return;
    const logs = (getChat(chatId).logs||[]).slice(-20).reverse();
    if (!logs.length) { await replyTo(msg,'📋 Логи пусты.'); return; }
    await replyTo(msg, `📋 <b>Последние логи</b>\n\n${logs.map(l=>`<i>${new Date(l.time).toLocaleString('ru')}</i>\n${esc(l.text)}`).join('\n\n').slice(0,3500)}`);
    break;
  }
  case 'badwords': {
    if (!await guardGroup(msg)||!await guardRank(msg,80)) return;
    const words = getChat(chatId).settings.badwords||[];
    await replyTo(msg,`🤬 <b>Стоп-слова</b>\n\n${words.length?words.map(w=>`• ${esc(w)}`).join('\n'):'Список пуст.'}`);
    break;
  }
  case 'addbadword': {
    if (!await guardGroup(msg)||!await guardRank(msg,80)) return;
    const w = args[0]?.toLowerCase(); if (!w) { await replyTo(msg,'❌ Укажи слово.'); return; }
    const chat2 = getChat(chatId); if (!chat2.settings.badwords) chat2.settings.badwords=[];
    if (!chat2.settings.badwords.includes(w)) { chat2.settings.badwords.push(w); saveDB(); }
    await replyTo(msg, `✅ <code>${esc(w)}</code> добавлено.`);
    break;
  }
  case 'delbadword': {
    if (!await guardGroup(msg)||!await guardRank(msg,80)) return;
    const w = args[0]?.toLowerCase(); if (!w) { await replyTo(msg,'❌ Укажи слово.'); return; }
    const chat2 = getChat(chatId); if (!chat2.settings.badwords) chat2.settings.badwords=[];
    chat2.settings.badwords = chat2.settings.badwords.filter(x=>x!==w); saveDB();
    await replyTo(msg, `✅ <code>${esc(w)}</code> удалено.`);
    break;
  }

  // ── FRIDAY ─────────────────────────────────────────────────
  case 'fridaypost': {
    if (!await guardGroup(msg)||!await guardRank(msg,80)) return;
    const chat2 = getChat(chatId); const val = args[0]?.toLowerCase();
    if (!chat2.settings.fridayPost) chat2.settings.fridayPost = mkDefaultChat().settings.fridayPost;
    if (val==='on'||val==='вкл') { chat2.settings.fridayPost.enabled=true; saveDB(); await replyTo(msg,'✅ Пятничный пост включён.'); }
    else if (val==='off'||val==='выкл') { chat2.settings.fridayPost.enabled=false; saveDB(); await replyTo(msg,'✅ Пятничный пост выключен.'); }
    else {
      const fp=chat2.settings.fridayPost;
      await replyTo(msg,`🎉 <b>Пятничный пост</b>\nСтатус: ${fp.enabled?'✅':'❌'}\nВремя: ${fp.time}\n\nпятница on/off\nсетпятница текст\nсетвремяпятницы HH:MM\nпятницасейчас`);
    }
    break;
  }
  case 'setfriday': {
    if (!await guardGroup(msg)||!await guardRank(msg,80)) return;
    if (!argText) { await replyTo(msg,'❌ Укажи текст.'); return; }
    const chat2=getChat(chatId); if (!chat2.settings.fridayPost) chat2.settings.fridayPost=mkDefaultChat().settings.fridayPost;
    chat2.settings.fridayPost.text=argText; saveDB();
    await replyTo(msg,'✅ Текст пятничного поста сохранён.');
    break;
  }
  case 'setfridaytime': {
    if (!await guardGroup(msg)||!await guardRank(msg,80)) return;
    const t2=args[0]; if (!t2||!/^\d{1,2}:\d{2}$/.test(t2)) { await replyTo(msg,'❌ Формат: HH:MM'); return; }
    const chat2=getChat(chatId); if (!chat2.settings.fridayPost) chat2.settings.fridayPost=mkDefaultChat().settings.fridayPost;
    chat2.settings.fridayPost.time=t2; saveDB();
    await replyTo(msg,`✅ Пятничный пост в ${t2}.`);
    break;
  }
  case 'fridaynow': {
    if (!await guardGroup(msg)||!await guardRank(msg,80)) return;
    const chat2=getChat(chatId); const fp=chat2.settings.fridayPost;
    const txt=fp?.text||FRIDAY_TEXTS[Math.floor(Math.random()*FRIDAY_TEXTS.length)];
    await tgReply(chatId, txt);
    if (fp) { fp.lastSentDate=todayKey(); saveDB(); }
    break;
  }

  // ── RELATIONS ──────────────────────────────────────────────
  case 'love': {
    if (!await guardGroup(msg)) return;
    if (!msg.reply_to_message?.from) { await replyTo(msg,'❌ Ответь на сообщение.'); return; }
    const p = msg.reply_to_message.from;
    if (p.is_bot||p.id===msg.from.id) { await replyTo(msg,'❌ Нельзя.'); return; }
    const u1=getUser(chatId,msg.from.id,msg.from.first_name,msg.from.username);
    const u2=getUser(chatId,p.id,p.first_name,p.username);
    u1.couple=p.id; u2.couple=msg.from.id; saveDB();
    await replyTo(msg,`❤️ <b>Пара создана!</b>\n\n${mention(u1)} и ${mention(u2)} теперь пара! 🥰`);
    break;
  }
  case 'couple': {
    const u=getUser(chatId,msg.from.id);
    if (!u.couple) { await replyTo(msg,'💔 Нет пары. Используй: любовь (reply)'); return; }
    const p=Object.values(getChat(chatId).users).find(x=>String(x.id)===String(u.couple));
    await replyTo(msg, p ? `❤️ Твоя пара: ${mention(p)}` : '💔 Пара не найдена в этом чате.');
    break;
  }
  case 'breakup': {
    const u=getUser(chatId,msg.from.id);
    if (!u.couple) { await replyTo(msg,'💔 Нет пары.'); return; }
    const p=Object.values(getChat(chatId).users).find(x=>String(x.id)===String(u.couple));
    if (p) p.couple=null;
    u.couple=null; saveDB();
    await replyTo(msg,`💔 <b>Расставание</b>\n\n${esc(msg.from.first_name)} и ${p?mention(p):'партнёр'} расстались.`);
    break;
  }
  case 'relationship': {
    await startSocialRequest(msg, args, 'relationship');
    break;
  }

  case 'friend': {
    await startSocialRequest(msg, args, 'friend');
    break;
  }

  case 'friends': {
    await showFriendsList(msg);
    break;
  }

  case 'unfriend': {
    await removeFriendCommand(msg, args);
    break;
  }

  case 'couple': {
    await showCoupleCommand(msg);
    break;
  }

  case 'breakup': {
    await breakupCommand(msg);
    break;
  }

  case 'hug': case 'kiss': case 'slap': case 'pat':
  case 'bite': case 'poke': case 'feed': case 'tea':
  case 'flower': case 'compliment':
    await handleSocial(cmd, msg);
    break;

  default: break;
  }} catch (e) { console.error(`handleCommand[${cmd}]:`, e.message); }
}

// ── CALL HELPER ────────────────────────────────────────────────────
async function doCall(msg, target, chatId) {
  const chat = getChat(chatId);
  const now  = Date.now();
  if (now - (chat.settings.callCooldown||0) < 10*60000) {
    const left = Math.ceil((10*60000 - (now - chat.settings.callCooldown)) / 60000);
    await replyTo(msg, `⏳ Созыв недавно уже был. Подожди ещё ${left} мин.`); return;
  }
  chat.settings.callCooldown = now; saveDB();

  const t = target.toLowerCase();
  const actorRank = await getEffectiveRank(chatId, msg.from.id);
  const allUsers  = Object.values(chat.users);
  let filtered, groupLabel;

  if (t === 'admins' || t === 'админы') {
    if (actorRank < 40) { await replyTo(msg,'❌ Созыв админов — ранг 40+.'); return; }
    filtered   = allUsers.filter(u => u.adminRank >= 10 && !u.leftChat);
    groupLabel = 'администрация';
  } else if (t === 'owners' || t === 'владельцы') {
    if (actorRank < 80) { await replyTo(msg,'❌ Созыв владельцев — ранг 80+.'); return; }
    filtered   = allUsers.filter(u => u.adminRank >= 95 && !u.leftChat);
    groupLabel = 'владельцы';
  } else {
    if (actorRank < 60) { await replyTo(msg,'❌ Созыв всех — ранг 60+.'); return; }
    filtered   = allUsers.filter(u => u.canCall !== false && !u.leftChat);
    groupLabel = 'все участники';
  }

  const mentions = filtered.filter(u => u.username && u.username !== BOT_USERNAME).map(u => `@${u.username}`);

  if (!mentions.length) {
    await replyTo(msg,
      `❌ Некого созывать.\nБот ещё не знает участников этой категории.\n\nЧтобы запомнить участника:\n• человек должен написать сообщение;\n• или ответь: <code>запомнить</code>;\n• или добавь: <code>запомнить 123456789 Имя</code>.`
    ); return;
  }

  const actorName = msg.from.username ? `@${msg.from.username}` : esc(msg.from.first_name);
  await tgReply(chatId, `📢 <b>Созыв участников</b>\n👮 Созвал: ${actorName}\n🎯 Группа: ${groupLabel}`);

  for (let i = 0; i < mentions.length; i += 25) {
    await tgReply(chatId, mentions.slice(i, i+25).join(' '));
  }
  await sendLog(chatId, `📢 Созыв (${groupLabel}) от ${actorName}`);
}

// ═══════════════════════════════════════════════════════════════
//  CALLBACK QUERY HANDLER
// ═══════════════════════════════════════════════════════════════
bot.on('callback_query', async (query) => {
    // ── PRIVATE TOPIC MENU BUTTONS ─────────────────────
    if (data.startsWith('topic:')) {
      const topic = data.split(':')[1];

      if (topic === 'back') {
        await bot.answerCallbackQuery(query.id).catch(() => {});
        await bot.editMessageText(botMainPrivateMenuText(), {
          chat_id: chatId,
          message_id: msg.message_id,
          parse_mode: 'HTML',
          reply_markup: botMainInlineKeyboard()
        }).catch(async () => {
          await bot.sendMessage(chatId, botMainPrivateMenuText(), {
            parse_mode: 'HTML',
            reply_markup: botMainInlineKeyboard()
          });
        });
        return;
      }

      const text = PRIVATE_TOPIC_TEXTS[topic];

      if (!text) {
        await bot.answerCallbackQuery(query.id, { text: '❌ Раздел не найден.' }).catch(() => {});
        return;
      }

      await bot.answerCallbackQuery(query.id).catch(() => {});

      await bot.editMessageText(text, {
        chat_id: chatId,
        message_id: msg.message_id,
        parse_mode: 'HTML',
        reply_markup: topicBackKeyboard()
      }).catch(async () => {
        await bot.sendMessage(chatId, text, {
          parse_mode: 'HTML',
          reply_markup: topicBackKeyboard()
        });
      });

      return;
    }


  try {
    // FINAL RELATIONSHIP CALLBACK HOOK
    if ((query.data || '').startsWith('finalrel:')) {
      const data = query.data || '';
      const msg = query.message;
      const chatId = msg.chat.id;
      const userId = query.from.id;

      const parts = data.split(':');
      const requestId = parts[1];
      const action = parts[2];

      const chat = finalRelEnsure(getChat(chatId));
      const request = chat.pendingRelationshipRequests?.[requestId];

      if (!request) {
        await bot.answerCallbackQuery(query.id, { text: '❌ Заявка устарела.' }).catch(() => {});
        return;
      }

      if (Number(request.toId) !== Number(userId)) {
        await bot.answerCallbackQuery(query.id, { text: '❌ Эта заявка не для тебя.' }).catch(() => {});
        return;
      }

      const fromUser = getUser(chatId, request.fromId);
      const toUser = getUser(chatId, request.toId);

      if (action === 'no') {
        delete chat.pendingRelationshipRequests[requestId];
        saveDB();

        await bot.answerCallbackQuery(query.id, { text: '💔 Отклонено.' }).catch(() => {});

        await bot.editMessageText(
          '💔 <b>Предложение отношений отклонено</b>\n\n' +
          finalRelMention(toUser.id, toUser.firstName || toUser.username) +
          ' отказался/отказалась от предложения.',
          {
            chat_id: chatId,
            message_id: msg.message_id,
            parse_mode: 'HTML'
          }
        ).catch(() => {});
        return;
      }

      if (fromUser.couple || toUser.couple || chat.couples[String(fromUser.id)] || chat.couples[String(toUser.id)]) {
        delete chat.pendingRelationshipRequests[requestId];
        saveDB();

        await bot.answerCallbackQuery(query.id, { text: '❌ У кого-то уже есть пара.' }).catch(() => {});
        await bot.editMessageText('❌ Заявка больше недоступна: у одного из пользователей уже есть пара.', {
          chat_id: chatId,
          message_id: msg.message_id,
          parse_mode: 'HTML'
        }).catch(() => {});
        return;
      }

      fromUser.couple = String(toUser.id);
      toUser.couple = String(fromUser.id);

      chat.couples[String(fromUser.id)] = String(toUser.id);
      chat.couples[String(toUser.id)] = String(fromUser.id);

      fromUser.balance = Number(fromUser.balance || 0) + 20;
      toUser.balance = Number(toUser.balance || 0) + 20;
      fromUser.coins = fromUser.balance;
      toUser.coins = toUser.balance;

      delete chat.pendingRelationshipRequests[requestId];
      saveDB();

      await bot.answerCallbackQuery(query.id, { text: '❤️ Теперь вы пара!' }).catch(() => {});

      await bot.editMessageText(
        '❤️ <b>Новая пара в беседе!</b>\n\n' +
        finalRelMention(fromUser.id, fromUser.firstName || fromUser.username) + ' и ' +
        finalRelMention(toUser.id, toUser.firstName || toUser.username) +
        ' теперь вместе!\n\n' +
        '💍 Пусть всё будет красиво, спокойно и по взаимности.\n' +
        '🎁 Бонус каждому: <b>+20 монет</b>',
        {
          chat_id: chatId,
          message_id: msg.message_id,
          parse_mode: 'HTML'
        }
      ).catch(() => {});

      return;
    }


    // ======================================================
    // RELATIONSHIP CALLBACK FIX V2
    // ======================================================
    if (data.startsWith('relfix:')) {
      const parts = data.split(':');
      const requestId = parts[1];
      const action = parts[2];

      const chat = relFixEnsureSocial(getChat(chatId));
      const request = chat.pendingRelationshipRequests?.[requestId];

      if (!request) {
        await bot.answerCallbackQuery(query.id, { text: '❌ Заявка устарела.' }).catch(() => {});
        return;
      }

      if (Number(request.toId) !== Number(userId)) {
        await bot.answerCallbackQuery(query.id, { text: '❌ Эта заявка не для тебя.' }).catch(() => {});
        return;
      }

      if (Date.now() - Number(request.createdAt || 0) > 24 * 60 * 60 * 1000) {
        delete chat.pendingRelationshipRequests[requestId];
        saveDB();

        await bot.answerCallbackQuery(query.id, { text: '⏳ Заявка истекла.' }).catch(() => {});
        await bot.editMessageText('⏳ Заявка на отношения устарела и больше недоступна.', {
          chat_id: chatId,
          message_id: msg.message_id,
          parse_mode: 'HTML'
        }).catch(() => {});
        return;
      }

      const fromUser = getUser(chatId, request.fromId);
      const toUser = getUser(chatId, request.toId);

      if (action === 'no') {
        delete chat.pendingRelationshipRequests[requestId];
        saveDB();

        await bot.answerCallbackQuery(query.id, { text: '💔 Отклонено.' }).catch(() => {});

        await bot.editMessageText(
          '💔 <b>Предложение отношений отклонено</b>\n\n' +
          relFixMention(toUser.id, toUser.firstName || toUser.username) +
          ' отказался/отказалась от предложения.',
          {
            chat_id: chatId,
            message_id: msg.message_id,
            parse_mode: 'HTML'
          }
        ).catch(() => {});
        return;
      }

      if (fromUser.couple || toUser.couple || chat.couples[String(fromUser.id)] || chat.couples[String(toUser.id)]) {
        delete chat.pendingRelationshipRequests[requestId];
        saveDB();

        await bot.answerCallbackQuery(query.id, { text: '❌ У кого-то уже есть пара.' }).catch(() => {});
        await bot.editMessageText('❌ Заявка больше недоступна: у одного из пользователей уже есть пара.', {
          chat_id: chatId,
          message_id: msg.message_id,
          parse_mode: 'HTML'
        }).catch(() => {});
        return;
      }

      fromUser.couple = String(toUser.id);
      toUser.couple = String(fromUser.id);
      chat.couples[String(fromUser.id)] = String(toUser.id);
      chat.couples[String(toUser.id)] = String(fromUser.id);

      fromUser.balance = Number(fromUser.balance || 0) + 20;
      toUser.balance = Number(toUser.balance || 0) + 20;

      fromUser.coins = fromUser.balance;
      toUser.coins = toUser.balance;

      delete chat.pendingRelationshipRequests[requestId];
      saveDB();

      await bot.answerCallbackQuery(query.id, { text: '❤️ Теперь вы пара!' }).catch(() => {});

      await bot.editMessageText(
        '❤️ <b>Новая пара в беседе!</b>\n\n' +
        relFixMention(fromUser.id, fromUser.firstName || fromUser.username) + ' и ' +
        relFixMention(toUser.id, toUser.firstName || toUser.username) +
        ' теперь вместе!\n\n' +
        '💍 Пусть всё будет красиво, спокойно и по взаимности.\n' +
        '🎁 Бонус каждому: <b>+20 монет</b>',
        {
          chat_id: chatId,
          message_id: msg.message_id,
          parse_mode: 'HTML'
        }
      ).catch(() => {});

      return;
    }


    const data   = query.data;
    const msg    = query.message;
    const chatId = msg.chat.id;
    const userId = query.from.id;

    // ── HELP SECTIONS ─────────────────────────────────────────
    if (data.startsWith('help:') && data !== 'help:back') {
      const sec = data.split(':')[1];
      const MAP = {
        moder:   `🛡 <b>Модерация</b>\n\nмут [ID/reply] [мин] [причина]\nунмут [ID/reply]\nбан [ID/reply] [причина]\nразбан ID\nкик [ID/reply] [причина]\nпред [ID/reply] [причина]\nунпред [ID/reply]\nпреды [ID/reply]\nудалить (reply)\nдействия (reply)`,
        ranks:   `👑 <b>Ранги</b>\n\nвладелец | зам | га | куратор | са | админ\nма | см | модер | помощник | стажер | юзер\n\nПо ID: <code>админ 123456789</code>\nПо reply: ответь на сообщение + команду\nвыдатьранг ID уровень\nснятьранг ID`,
        profile: `👤 <b>Профиль и статистика</b>\n\nпрофиль [ID/reply]\nид\nтоп [день/неделя/месяц/все]\nуровень\nреп [ID/reply]\nминусреп [ID/reply]\nмояреп\nбаланс\nежедневно`,
        rules:   `📜 <b>Правила</b>\n\nправила\nустановитьправила текст`,
        settings:`⚙️ <b>Настройки</b>\n\nнастройки\nантиспам on/off\nссылки on/off\nантимат on/off\nприветствие on/off\nпрощание on/off\nсетпривет текст\nсетпрощание текст\nматлист | добавитьмат | удалитьмат\nсетлог | логи`,
        shop:    `🎁 <b>Магазин</b>\n\nмагазин\nкупить vip | premium | customtitle | warnshield\nбаланс | ежедневно | передать ID сумма\nтитул текст | снятьтитул`,
        call:    `📢 <b>Созыв</b>\n\nкалл все — ранг 60+\nкалл админы — ранг 40+\nкалл владельцы — ранг 80+\nбаза — статистика БД\nзапомнить [ID/reply] — добавить в базу\n\nКулдаун: 10 минут`,
        social:  `❤️ <b>Отношения</b>\n\nлюбовь (reply) — создать пару\nпара | расстаться\n\nДействия по reply (или на пару):\nобнять | поцеловать | шлепнуть | погладить\nукусить | тыкнуть | покормить | чай | цветок | комплимент`,
        tops:    `🏆 <b>Топы</b>\n\nтоп | топ день | топ неделя | топ месяц\n\nУчитываются все типы сообщений.\nПрофиль показывает статистику по периодам.`,
        friday:  `🎉 <b>Пятничный пост</b>\n\nпятница on/off\nсетпятница текст\nсетвремяпятницы HH:MM\nпятницасейчас\n\nАвтоматически каждую пятницу.`,
        global:  `🌍 <b>Глобальные ранги</b>\n\ngsetrank ID ранг — выдать\ngdelrank ID — снять\nglobaladmins — список\n\nГлобальный ранг работает во всех беседах.\nДоступно только владельцу (OWNER_ID).`,
        coins:   `💰 <b>Монеты разработчика</b>\n\ncoin ID сумма\nмонеты ID сумма\nreply + монеты сумма\n\nМожно выдавать отрицательные суммы.\nДоступно только OWNER_ID.`
      };
      await bot.answerCallbackQuery(query.id);
      await bot.editMessageText(MAP[sec]||'❌ Раздел не найден.', {
        chat_id: chatId, message_id: msg.message_id, parse_mode:'HTML',
        reply_markup: { inline_keyboard:[[{ text:'🔙 Назад', callback_data:'help:back' }]] }
      });
      return;
    }

    if (data === 'help:back') {
      await bot.answerCallbackQuery(query.id);
      const kb = { inline_keyboard:[
        [{ text:'🛡 Модерация', callback_data:'help:moder' },   { text:'👑 Ранги',     callback_data:'help:ranks'   }],
        [{ text:'👤 Профиль',  callback_data:'help:profile' },  { text:'📜 Правила',   callback_data:'help:rules'   }],
        [{ text:'⚙️ Настройки',callback_data:'help:settings' }, { text:'🎁 Магазин',   callback_data:'help:shop'    }],
        [{ text:'📢 Созыв',    callback_data:'help:call' },      { text:'❤️ Отношения', callback_data:'help:social'  }],
        [{ text:'🏆 Топы',     callback_data:'help:tops' },      { text:'🎉 Пятница',   callback_data:'help:friday'  }],
        [{ text:'🌍 Глоб.ранги',callback_data:'help:global' },  { text:'💰 Монеты',    callback_data:'help:coins'   }]
      ]};
      await bot.editMessageText('🤖 <b>FulTalchik_Botik</b> — меню команд\n\n⚙️ Все команды работают со слешем и без!\n\nВыбери раздел:', {
        chat_id: chatId, message_id: msg.message_id, parse_mode:'HTML', reply_markup: kb
      });
      return;
    }

    // ── SOCIAL REQUEST BUTTONS ─────────────────────────
    if (data.startsWith('soc:')) {
      const parts = data.split(':');
      const requestId = parts[1];
      const action = parts[2];

      const chat = ensureSocialStorage(getChat(chatId));
      const request = chat.pendingSocialRequests?.[requestId];

      if (!request) {
        await bot.answerCallbackQuery(query.id, { text: '❌ Заявка устарела.' });
        return;
      }

      if (Number(request.toId) !== Number(userId)) {
        await bot.answerCallbackQuery(query.id, { text: '❌ Эта заявка не для тебя.' });
        return;
      }

      if (Date.now() - Number(request.createdAt || 0) > 24 * 60 * 60 * 1000) {
        delete chat.pendingSocialRequests[requestId];
        saveDB();
        await bot.answerCallbackQuery(query.id, { text: '⏳ Заявка истекла.' });
        await bot.editMessageText('⏳ Заявка устарела и больше недоступна.', {
          chat_id: chatId,
          message_id: msg.message_id,
          parse_mode: 'HTML'
        }).catch(() => {});
        return;
      }

      const fromUser = getUser(chatId, request.fromId);
      const toUser = getUser(chatId, request.toId);

      if (action === 'no') {
        delete chat.pendingSocialRequests[requestId];
        saveDB();

        await bot.answerCallbackQuery(query.id, { text: '❌ Отклонено.' });

        const declinedText = request.type === 'relationship'
          ? '💔 <b>Предложение отношений отклонено</b>'
          : '🤝 <b>Предложение дружбы отклонено</b>';

        await bot.editMessageText(
          declinedText + '\n\n' +
          mentionByIdSafe(toUser.id, toUser.firstName) + ' отказался/отказалась от предложения.',
          {
            chat_id: chatId,
            message_id: msg.message_id,
            parse_mode: 'HTML'
          }
        ).catch(() => {});
        return;
      }

      if (request.type === 'relationship') {
        if (fromUser.couple || toUser.couple) {
          delete chat.pendingSocialRequests[requestId];
          saveDB();

          await bot.answerCallbackQuery(query.id, { text: '❌ У кого-то уже есть пара.' });
          await bot.editMessageText('❌ Заявка больше недоступна: у одного из пользователей уже есть пара.', {
            chat_id: chatId,
            message_id: msg.message_id,
            parse_mode: 'HTML'
          }).catch(() => {});
          return;
        }

        fromUser.couple = toUser.id;
        toUser.couple = fromUser.id;

        fromUser.balance = Number(fromUser.balance || 0) + 20;
        toUser.balance = Number(toUser.balance || 0) + 20;

        delete chat.pendingSocialRequests[requestId];
        saveDB();

        await bot.answerCallbackQuery(query.id, { text: '❤️ Теперь вы пара!' });

        await bot.editMessageText(
          '❤️ <b>Новая пара в беседе!</b>\n\n' +
          mentionByIdSafe(fromUser.id, fromUser.firstName) + ' и ' +
          mentionByIdSafe(toUser.id, toUser.firstName) + ' теперь вместе!\n\n' +
          '💍 Пусть всё будет красиво, спокойно и по взаимности.\n' +
          '🎁 Бонус каждому: <b>+20 монет</b>',
          {
            chat_id: chatId,
            message_id: msg.message_id,
            parse_mode: 'HTML'
          }
        ).catch(() => {});
        return;
      }

      if (request.type === 'friend') {
        const key = makePairKey(fromUser.id, toUser.id);

        if (chat.friendships[key]) {
          delete chat.pendingSocialRequests[requestId];
          saveDB();

          await bot.answerCallbackQuery(query.id, { text: '🤝 Вы уже друзья.' });
          await bot.editMessageText('🤝 Вы уже друзья.', {
            chat_id: chatId,
            message_id: msg.message_id,
            parse_mode: 'HTML'
          }).catch(() => {});
          return;
        }

        chat.friendships[key] = {
          users: [String(fromUser.id), String(toUser.id)],
          createdAt: new Date().toISOString()
        };

        fromUser.balance = Number(fromUser.balance || 0) + 10;
        toUser.balance = Number(toUser.balance || 0) + 10;

        delete chat.pendingSocialRequests[requestId];
        saveDB();

        await bot.answerCallbackQuery(query.id, { text: '🤝 Дружба принята!' });

        await bot.editMessageText(
          '🤝 <b>Новая дружба в беседе!</b>\n\n' +
          mentionByIdSafe(fromUser.id, fromUser.firstName) + ' и ' +
          mentionByIdSafe(toUser.id, toUser.firstName) + ' теперь друзья!\n\n' +
          '✨ Дружба — это когда в чате есть свой человек.\n' +
          '🎁 Бонус каждому: <b>+10 монет</b>',
          {
            chat_id: chatId,
            message_id: msg.message_id,
            parse_mode: 'HTML'
          }
        ).catch(() => {});
        return;
      }
    }

    // ── BREAKUP / UNFRIEND BUTTONS ─────────────────────
    if (data.startsWith('break:')) {
      const parts = data.split(':');
      const actorId = Number(parts[1]);
      const partnerId = Number(parts[2]);
      const action = parts[3];

      if (Number(userId) !== actorId) {
        await bot.answerCallbackQuery(query.id, { text: '❌ Эта кнопка не для тебя.' });
        return;
      }

      const actor = getUser(chatId, actorId);
      const partner = getUser(chatId, partnerId);

      if (action === 'no') {
        await bot.answerCallbackQuery(query.id, { text: '❤️ Решение отменено.' });

        await bot.editMessageText(
          '❤️ <b>Расставание отменено</b>\n\n' +
          mentionByIdSafe(actor.id, actor.firstName) + ' решил(а) сохранить отношения с ' +
          mentionByIdSafe(partner.id, partner.firstName || ('ID ' + partner.id)) + '.\n\n' +
          '✨ Иногда один клик может сохранить красивую историю.',
          {
            chat_id: chatId,
            message_id: msg.message_id,
            parse_mode: 'HTML'
          }
        ).catch(() => {});
        return;
      }

      if (String(actor.couple) !== String(partnerId)) {
        await bot.answerCallbackQuery(query.id, { text: '❌ Вы уже не пара.' });

        await bot.editMessageText(
          '❌ Эти отношения уже не активны.',
          {
            chat_id: chatId,
            message_id: msg.message_id,
            parse_mode: 'HTML'
          }
        ).catch(() => {});
        return;
      }

      actor.couple = null;
      partner.couple = null;

      saveDB();

      await bot.answerCallbackQuery(query.id, { text: '💔 Отношения завершены.' });

      await bot.editMessageText(
        '💔 <b>Отношения завершены</b>\n\n' +
        mentionByIdSafe(actor.id, actor.firstName) + ' и ' +
        mentionByIdSafe(partner.id, partner.firstName || ('ID ' + partner.id)) +
        ' больше не пара.\n\n' +
        '━━━━━━━━━━━━━━\n' +
        'Спасибо за вашу историю. У каждого начинается новая глава.',
        {
          chat_id: chatId,
          message_id: msg.message_id,
          parse_mode: 'HTML'
        }
      ).catch(() => {});
      return;
    }

    if (data.startsWith('unfriend:')) {
      const parts = data.split(':');
      const actorId = Number(parts[1]);
      const friendId = Number(parts[2]);
      const action = parts[3];

      if (Number(userId) !== actorId) {
        await bot.answerCallbackQuery(query.id, { text: '❌ Эта кнопка не для тебя.' });
        return;
      }

      const chat = ensureSocialStorage(getChat(chatId));
      const key = makePairKey(actorId, friendId);

      const actor = getUser(chatId, actorId);
      const friend = getUser(chatId, friendId);

      if (action === 'no') {
        await bot.answerCallbackQuery(query.id, { text: '🤝 Отменено.' });

        await bot.editMessageText(
          '🤝 <b>Дружба сохранена</b>\n\n' +
          mentionByIdSafe(actor.id, actor.firstName) + ' и ' +
          mentionByIdSafe(friend.id, friend.firstName || ('ID ' + friend.id)) +
          ' остаются друзьями.\n\n' +
          '✨ Хорошие люди в чате на вес золота.',
          {
            chat_id: chatId,
            message_id: msg.message_id,
            parse_mode: 'HTML'
          }
        ).catch(() => {});
        return;
      }

      if (!chat.friendships[key]) {
        await bot.answerCallbackQuery(query.id, { text: '❌ Вы уже не друзья.' });

        await bot.editMessageText(
          '❌ Эта дружба уже не активна.',
          {
            chat_id: chatId,
            message_id: msg.message_id,
            parse_mode: 'HTML'
          }
        ).catch(() => {});
        return;
      }

      delete chat.friendships[key];
      saveDB();

      await bot.answerCallbackQuery(query.id, { text: '💔 Дружба завершена.' });

      await bot.editMessageText(
        '💔 <b>Дружба завершена</b>\n\n' +
        mentionByIdSafe(actor.id, actor.firstName) + ' и ' +
        mentionByIdSafe(friend.id, friend.firstName || ('ID ' + friend.id)) +
        ' больше не друзья.\n\n' +
        '━━━━━━━━━━━━━━\n' +
        'Без драмы — просто разные дороги.',
        {
          chat_id: chatId,
          message_id: msg.message_id,
          parse_mode: 'HTML'
        }
      ).catch(() => {});
      return;
    }

    // ── SOCIAL RELATIONSHIP FRIENDSHIP BUTTONS V2 ───────
    if (data.startsWith('soc:')) {
      const parts = data.split(':');
      const requestId = parts[1];
      const action = parts[2];

      const chat = ensureSocialStorage(getChat(chatId));
      const request = chat.pendingSocialRequests?.[requestId];

      if (!request) {
        await bot.answerCallbackQuery(query.id, { text: '❌ Заявка устарела.' });
        return;
      }

      if (Number(request.toId) !== Number(userId)) {
        await bot.answerCallbackQuery(query.id, { text: '❌ Эта заявка не для тебя.' });
        return;
      }

      if (Date.now() - Number(request.createdAt || 0) > 24 * 60 * 60 * 1000) {
        delete chat.pendingSocialRequests[requestId];
        saveDB();
        await bot.answerCallbackQuery(query.id, { text: '⏳ Заявка истекла.' });
        await bot.editMessageText('⏳ Заявка устарела и больше недоступна.', {
          chat_id: chatId,
          message_id: msg.message_id,
          parse_mode: 'HTML'
        }).catch(() => {});
        return;
      }

      const fromUser = getUser(chatId, request.fromId);
      const toUser = getUser(chatId, request.toId);

      if (action === 'no') {
        delete chat.pendingSocialRequests[requestId];
        saveDB();

        await bot.answerCallbackQuery(query.id, { text: '❌ Отклонено.' });

        await bot.editMessageText(
          (request.type === 'relationship'
            ? '💔 <b>Предложение отношений отклонено</b>'
            : '🤝 <b>Предложение дружбы отклонено</b>') +
          '\n\n' +
          mentionByIdPretty(toUser.id, toUser.firstName) + ' отказался/отказалась от предложения.',
          {
            chat_id: chatId,
            message_id: msg.message_id,
            parse_mode: 'HTML'
          }
        ).catch(() => {});
        return;
      }

      if (request.type === 'relationship') {
        if (getStoredCoupleId(chat, fromUser) || getStoredCoupleId(chat, toUser)) {
          delete chat.pendingSocialRequests[requestId];
          saveDB();

          await bot.answerCallbackQuery(query.id, { text: '❌ У кого-то уже есть пара.' });
          await bot.editMessageText('❌ Заявка больше недоступна: у одного из пользователей уже есть пара.', {
            chat_id: chatId,
            message_id: msg.message_id,
            parse_mode: 'HTML'
          }).catch(() => {});
          return;
        }

        setStoredCouple(chat, fromUser, toUser);

        delete chat.pendingSocialRequests[requestId];
        saveDB();

        await bot.answerCallbackQuery(query.id, { text: '❤️ Теперь вы пара!' });

        await bot.editMessageText(
          '❤️ <b>Новая пара в беседе!</b>\n\n' +
          mentionByIdPretty(fromUser.id, fromUser.firstName) + ' и ' +
          mentionByIdPretty(toUser.id, toUser.firstName) + ' теперь вместе!\n\n' +
          '💍 Пусть всё будет красиво, спокойно и по взаимности.\n' +
          '🎁 Бонус каждому: <b>+20 монет</b>',
          {
            chat_id: chatId,
            message_id: msg.message_id,
            parse_mode: 'HTML'
          }
        ).catch(() => {});
        return;
      }

      if (request.type === 'friend') {
        if (areFriends(chat, fromUser.id, toUser.id)) {
          delete chat.pendingSocialRequests[requestId];
          saveDB();

          await bot.answerCallbackQuery(query.id, { text: '🤝 Вы уже друзья.' });
          await bot.editMessageText('🤝 Вы уже друзья.', {
            chat_id: chatId,
            message_id: msg.message_id,
            parse_mode: 'HTML'
          }).catch(() => {});
          return;
        }

        setStoredFriendship(chat, fromUser, toUser);

        delete chat.pendingSocialRequests[requestId];
        saveDB();

        await bot.answerCallbackQuery(query.id, { text: '🤝 Дружба принята!' });

        await bot.editMessageText(
          '🤝 <b>Новая дружба в беседе!</b>\n\n' +
          mentionByIdPretty(fromUser.id, fromUser.firstName) + ' и ' +
          mentionByIdPretty(toUser.id, toUser.firstName) + ' теперь друзья!\n\n' +
          '✨ Дружба — это когда в чате есть свой человек.\n' +
          '🎁 Бонус каждому: <b>+10 монет</b>',
          {
            chat_id: chatId,
            message_id: msg.message_id,
            parse_mode: 'HTML'
          }
        ).catch(() => {});
        return;
      }
    }

    if (data.startsWith('break:')) {
      const parts = data.split(':');
      const actorId = Number(parts[1]);
      const partnerId = Number(parts[2]);
      const action = parts[3];

      if (Number(userId) !== actorId) {
        await bot.answerCallbackQuery(query.id, { text: '❌ Эта кнопка не для тебя.' });
        return;
      }

      const chat = ensureSocialStorage(getChat(chatId));
      const actor = getUser(chatId, actorId);
      const partner = getUser(chatId, partnerId);

      if (action === 'no') {
        await bot.answerCallbackQuery(query.id, { text: '❤️ Решение отменено.' });

        await bot.editMessageText(
          '❤️ <b>Расставание отменено</b>\n\n' +
          mentionByIdPretty(actor.id, actor.firstName) + ' решил(а) сохранить отношения с ' +
          mentionByIdPretty(partner.id, partner.firstName || ('ID ' + partner.id)) + '.\n\n' +
          '✨ Иногда один клик может сохранить красивую историю.',
          {
            chat_id: chatId,
            message_id: msg.message_id,
            parse_mode: 'HTML'
          }
        ).catch(() => {});
        return;
      }

      if (String(getStoredCoupleId(chat, actor)) !== String(partnerId)) {
        await bot.answerCallbackQuery(query.id, { text: '❌ Вы уже не пара.' });

        await bot.editMessageText('❌ Эти отношения уже не активны.', {
          chat_id: chatId,
          message_id: msg.message_id,
          parse_mode: 'HTML'
        }).catch(() => {});
        return;
      }

      clearStoredCouple(chat, actor, partner);
      saveDB();

      await bot.answerCallbackQuery(query.id, { text: '💔 Отношения завершены.' });

      await bot.editMessageText(
        '💔 <b>Отношения завершены</b>\n\n' +
        mentionByIdPretty(actor.id, actor.firstName) + ' и ' +
        mentionByIdPretty(partner.id, partner.firstName || ('ID ' + partner.id)) +
        ' больше не пара.\n\n' +
        '━━━━━━━━━━━━━━\n' +
        'Спасибо за вашу историю. У каждого начинается новая глава.',
        {
          chat_id: chatId,
          message_id: msg.message_id,
          parse_mode: 'HTML'
        }
      ).catch(() => {});
      return;
    }

    if (data.startsWith('unfriend:')) {
      const parts = data.split(':');
      const actorId = Number(parts[1]);
      const friendId = Number(parts[2]);
      const action = parts[3];

      if (Number(userId) !== actorId) {
        await bot.answerCallbackQuery(query.id, { text: '❌ Эта кнопка не для тебя.' });
        return;
      }

      const chat = ensureSocialStorage(getChat(chatId));
      const actor = getUser(chatId, actorId);
      const friend = getUser(chatId, friendId);

      if (action === 'no') {
        await bot.answerCallbackQuery(query.id, { text: '🤝 Отменено.' });

        await bot.editMessageText(
          '🤝 <b>Дружба сохранена</b>\n\n' +
          mentionByIdPretty(actor.id, actor.firstName) + ' и ' +
          mentionByIdPretty(friend.id, friend.firstName || ('ID ' + friend.id)) +
          ' остаются друзьями.\n\n' +
          '✨ Хорошие люди в чате на вес золота.',
          {
            chat_id: chatId,
            message_id: msg.message_id,
            parse_mode: 'HTML'
          }
        ).catch(() => {});
        return;
      }

      if (!areFriends(chat, actorId, friendId)) {
        await bot.answerCallbackQuery(query.id, { text: '❌ Вы уже не друзья.' });

        await bot.editMessageText('❌ Эта дружба уже не активна.', {
          chat_id: chatId,
          message_id: msg.message_id,
          parse_mode: 'HTML'
        }).catch(() => {});
        return;
      }

      clearStoredFriendship(chat, actorId, friendId);
      saveDB();

      await bot.answerCallbackQuery(query.id, { text: '💔 Дружба завершена.' });

      await bot.editMessageText(
        '💔 <b>Дружба завершена</b>\n\n' +
        mentionByIdPretty(actor.id, actor.firstName) + ' и ' +
        mentionByIdPretty(friend.id, friend.firstName || ('ID ' + friend.id)) +
        ' больше не друзья.\n\n' +
        '━━━━━━━━━━━━━━\n' +
        'Без драмы — просто разные дороги.',
        {
          chat_id: chatId,
          message_id: msg.message_id,
          parse_mode: 'HTML'
        }
      ).catch(() => {});
      return;
    }

    // ── SETTINGS TOGGLE ───────────────────────────────────────
    if (data.startsWith('cfg:')) {
      const parts = data.split(':'); const cfgChat = parts[1]; const key = parts[2];
      if (await getEffectiveRank(cfgChat, userId) < 80) { await bot.answerCallbackQuery(query.id,{text:'❌ Нет прав.'}); return; }
      const chat2 = getChat(cfgChat);
      if (['antispam','antilinks','antimat','welcome','goodbye'].includes(key)) {
        chat2.settings[key] = !chat2.settings[key]; saveDB();
      } else if (key==='friday')  { if (!chat2.settings.fridayPost) chat2.settings.fridayPost=mkDefaultChat().settings.fridayPost; chat2.settings.fridayPost.enabled = !chat2.settings.fridayPost.enabled; saveDB(); }
      else if (key==='morning')   { chat2.settings.morningEnabled  = !chat2.settings.morningEnabled;  saveDB(); }
      else if (key==='night')     { chat2.settings.nightEnabled    = !chat2.settings.nightEnabled;    saveDB(); }
      else if (key==='weekly')    { chat2.settings.weeklyReportEnabled = !chat2.settings.weeklyReportEnabled; saveDB(); }
      const s2 = chat2.settings;
      const kb = { inline_keyboard:[
        [{ text:`🛡 Антиспам: ${s2.antispam?'✅':'❌'}`, callback_data:`cfg:${cfgChat}:antispam` }, { text:`🔗 Ссылки: ${s2.antilinks?'✅':'❌'}`, callback_data:`cfg:${cfgChat}:antilinks` }],
        [{ text:`🤬 Антимат: ${s2.antimat?'✅':'❌'}`,   callback_data:`cfg:${cfgChat}:antimat`  }, { text:`👋 Привет: ${s2.welcome?'✅':'❌'}`,   callback_data:`cfg:${cfgChat}:welcome`   }],
        [{ text:`👋 Прощание: ${s2.goodbye?'✅':'❌'}`,  callback_data:`cfg:${cfgChat}:goodbye`  }, { text:`🎉 Пятница: ${s2.fridayPost?.enabled?'✅':'❌'}`, callback_data:`cfg:${cfgChat}:friday` }],
        [{ text:`☀️ Утро: ${s2.morningEnabled?'✅':'❌'}`, callback_data:`cfg:${cfgChat}:morning`}, { text:`🌙 Ночь: ${s2.nightEnabled?'✅':'❌'}`, callback_data:`cfg:${cfgChat}:night`    }],
        [{ text:`📊 Отчёт: ${s2.weeklyReportEnabled?'✅':'❌'}`, callback_data:`cfg:${cfgChat}:weekly` }],
        [{ text:'📜 Правила', callback_data:`cfg:${cfgChat}:rules` }, { text:'📢 Лог-чат', callback_data:`cfg:${cfgChat}:setlog` }]
      ]};
      await bot.answerCallbackQuery(query.id,{text:'✅ Обновлено'});
      try { await bot.editMessageReplyMarkup(kb,{chat_id:chatId,message_id:msg.message_id}); } catch (_) {}
      return;
    }

    // ── CALL BUTTONS ──────────────────────────────────────────
    if (data.startsWith('call:')) {
      const parts  = data.split(':');
      const choice = parts[parts.length-1];
      const k      = parts.slice(1,-1).join(':');
      const p2     = pending[k];
      if (!p2) { await bot.answerCallbackQuery(query.id,{text:'❌ Устарело.'}); return; }
      if (p2.actorId !== userId) { await bot.answerCallbackQuery(query.id,{text:'❌ Эта кнопка не для тебя.'}); return; }
      delete pending[k];
      await bot.answerCallbackQuery(query.id);
      if (choice==='cancel') { await bot.deleteMessage(chatId,msg.message_id); return; }
      const fakeMsg = { ...msg, from: query.from };
      await doCall(fakeMsg, choice, chatId);
      return;
    }

    // ── MUTE TIME ─────────────────────────────────────────────
    if (data.startsWith('mt:')) {
      const parts  = data.split(':');
      const choice = parts[parts.length-1];
      const k      = parts.slice(1,-1).join(':');
      const p2     = pending[k];
      if (!p2) { await bot.answerCallbackQuery(query.id,{text:'❌ Устарело.'}); return; }
      if (p2.actorId !== userId) { await bot.answerCallbackQuery(query.id,{text:'❌ Не для тебя.'}); return; }
      if (choice==='cancel') { delete pending[k]; await bot.answerCallbackQuery(query.id); await bot.deleteMessage(chatId,msg.message_id); return; }
      p2.minutes = parseInt(choice,10); await bot.answerCallbackQuery(query.id);
      const kb = { inline_keyboard:[
        [{ text:'Мат',         callback_data:`mr:${k}:мат`         }, { text:'Флуд',      callback_data:`mr:${k}:флуд`      }],
        [{ text:'Спам',        callback_data:`mr:${k}:спам`        }, { text:'Оскорбление',callback_data:`mr:${k}:оскорбление`}],
        [{ text:'Реклама',     callback_data:`mr:${k}:реклама`     }, { text:'Провокация', callback_data:`mr:${k}:провокация` }],
        [{ text:'Другое',      callback_data:`mr:${k}:другое`      }]
      ]};
      await bot.editMessageText(`🔇 Срок: <b>${p2.minutes} мин.</b>\n\nВыбери причину:`, {
        chat_id:chatId, message_id:msg.message_id, parse_mode:'HTML', reply_markup:kb
      });
      return;
    }

    // ── MUTE REASON ───────────────────────────────────────────
    if (data.startsWith('mr:')) {
      const parts  = data.split(':');
      const reason = parts[parts.length-1];
      const k      = parts.slice(1,-1).join(':');
      const p2     = pending[k];
      if (!p2) { await bot.answerCallbackQuery(query.id,{text:'❌ Устарело.'}); return; }
      if (p2.actorId !== userId) { await bot.answerCallbackQuery(query.id,{text:'❌ Не для тебя.'}); return; }
      await bot.answerCallbackQuery(query.id); delete pending[k];
      try {
        const ar = await getEffectiveRank(p2.chatId, userId);
        const lim = getMuteLimit(ar);
        if (p2.minutes > lim && lim !== Infinity) {
          await bot.editMessageText(`❌ Превышен лимит мута (${lim} мин.)`, {chat_id:chatId,message_id:msg.message_id}); return;
        }
        await doMute(p2.chatId, p2.targetId, p2.minutes, reason, query.from.first_name);
        const u2 = getUser(p2.chatId, p2.targetId);
        await bot.editMessageText(`🔇 <b>Мут выдан</b>\n👤 ${mention(u2)}\n⏱ ${p2.minutes} мин.\n📌 ${esc(reason)}\n👮 ${esc(query.from.first_name)}`, {
          chat_id:chatId, message_id:msg.message_id, parse_mode:'HTML'
        });
      } catch (e) { await bot.editMessageText(`❌ ${e.message}`, {chat_id:chatId,message_id:msg.message_id}); }
      return;
    }

    // ── ACTIONS MENU ──────────────────────────────────────────
    if (data.startsWith('act:')) {
      const parts  = data.split(':');
      const action = parts[parts.length-1];
      const k      = parts.slice(1,-1).join(':');
      const p2     = pending[k];
      if (!p2) { await bot.answerCallbackQuery(query.id,{text:'❌ Устарело.'}); return; }
      if (p2.actorId !== userId) { await bot.answerCallbackQuery(query.id,{text:'❌ Не для тебя.'}); return; }
      await bot.answerCallbackQuery(query.id); delete pending[k];
      const target = getUser(p2.chatId, p2.targetId);
      if (action==='cancel') { await bot.deleteMessage(chatId,msg.message_id); return; }
      if (action==='del')     { try { await bot.deleteMessage(chatId,msg.message_id); } catch (_) {} }
      else if (action==='history') {
        const h=(target.history||[]).slice(-5).reverse().map(x=>`• ${x.type}${x.reason?` (${x.reason})`:''}`).join('\n')||'Нет.';
        await bot.editMessageText(`📂 <b>История</b> ${mention(target)}\n\n${h}`, {chat_id:chatId,message_id:msg.message_id,parse_mode:'HTML'});
      } else if (action==='mute') {
        try { await doMute(p2.chatId,p2.targetId,60,'Через меню',query.from.first_name); await bot.editMessageText(`🔇 Мут 60 мин. → ${mention(target)}`, {chat_id:chatId,message_id:msg.message_id,parse_mode:'HTML'}); }
        catch (e) { await bot.editMessageText(`❌ ${e.message}`, {chat_id:chatId,message_id:msg.message_id}); }
      } else if (action==='ban') {
        try { await doBan(p2.chatId,p2.targetId,'Через меню',query.from.first_name); await bot.editMessageText(`🚫 ${mention(target)} забанен.`, {chat_id:chatId,message_id:msg.message_id,parse_mode:'HTML'}); }
        catch (e) { await bot.editMessageText(`❌ ${e.message}`, {chat_id:chatId,message_id:msg.message_id}); }
      } else if (action==='kick') {
        try { await doKick(p2.chatId,p2.targetId,'Через меню',query.from.first_name); await bot.editMessageText(`👢 ${mention(target)} кикнут.`, {chat_id:chatId,message_id:msg.message_id,parse_mode:'HTML'}); }
        catch (e) { await bot.editMessageText(`❌ ${e.message}`, {chat_id:chatId,message_id:msg.message_id}); }
      } else if (action==='warn') {
        await doWarn(p2.chatId,p2.targetId,'Через меню',query.from.first_name,null);
        await bot.editMessageText(`⚠️ Пред → ${mention(target)} (${(target.warns||[]).length}/5)`, {chat_id:chatId,message_id:msg.message_id,parse_mode:'HTML'});
      }
      return;
    }

    await bot.answerCallbackQuery(query.id);
  } catch (e) { console.error('callback_query:', e.message); try { await bot.answerCallbackQuery(query.id); } catch (_) {} }
});

console.log('🤖  FulTalchik_Botik v3.0 запущен!');