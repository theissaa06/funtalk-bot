// ============================================================
// src/db.js
// JSON-база данных с API, совместимым с better-sqlite3.
// Используется модулями: moderation, economy, levels, call,
// removeUser, adminRanks, advancedSecurity, security.
//
// Поддерживаемые методы:
//   db.prepare(sql).get(...params)
//   db.prepare(sql).all(...params)
//   db.prepare(sql).run(...params)
//   db.exec(sql)          — только CREATE TABLE (игнорируется)
//   db.pragma(...)        — игнорируется
//
// Прямые функции (без SQL):
//   db.rememberUser(user, chatId)        — запомнить участника
//   db.findUser(chatId, query)           — найти по id/username
//   db.setUserStatus(userId, chatId, s)  — active/banned/muted
//   db.getChatMembers(chatId)            — все участники чата
// ============================================================

const fs   = require('fs');
const path = require('path');
require('dotenv').config();

// ── Путь к файлу базы ─────────────────────────────────────────
const dataDir = path.resolve(path.join(__dirname, '../data'));
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const dbPath = process.env.DB_PATH
  ? path.resolve(process.env.DB_PATH)
  : path.join(dataDir, 'bot_data.json');

// ── Структура базы ────────────────────────────────────────────
const DEFAULT_DB = {
  users:                      [],
  chats:                      [],
  warnings:                   [],
  mod_log:                    [],
  security_settings:          [],
  bad_words:                  [],
  security_logs:              [],
  advanced_security_settings: [],
  link_whitelist:             [],
  captcha_logs:               [],
  _counters: {},
};

// ── Чтение / запись ───────────────────────────────────────────
function load() {
  try {
    if (!fs.existsSync(dbPath)) {
      fs.writeFileSync(dbPath, JSON.stringify(DEFAULT_DB, null, 2), 'utf8');
      return JSON.parse(JSON.stringify(DEFAULT_DB));
    }
    const raw = fs.readFileSync(dbPath, 'utf8');
    const data = JSON.parse(raw);
    for (const key of Object.keys(DEFAULT_DB)) {
      if (!(key in data)) data[key] = Array.isArray(DEFAULT_DB[key]) ? [] : {};
    }
    return data;
  } catch (err) {
    console.error('[db.js] Ошибка чтения базы, создаю новую:', err.message);
    const fresh = JSON.parse(JSON.stringify(DEFAULT_DB));
    fs.writeFileSync(dbPath, JSON.stringify(fresh, null, 2), 'utf8');
    return fresh;
  }
}

function save(data) {
  try {
    fs.writeFileSync(dbPath, JSON.stringify(data, null, 2), 'utf8');
  } catch (err) {
    console.error('[db.js] Ошибка записи базы:', err.message);
  }
}

// ── Автоинкремент ─────────────────────────────────────────────
function nextId(data, table) {
  if (!data._counters) data._counters = {};
  data._counters[table] = (data._counters[table] || 0) + 1;
  return data._counters[table];
}

// ══════════════════════════════════════════════════════════════
// ПРЯМЫЕ ФУНКЦИИ ДЛЯ РАБОТЫ С УЧАСТНИКАМИ
// ══════════════════════════════════════════════════════════════

/**
 * Запомнить/обновить участника чата.
 * НИКОГДА не удаляет запись — только обновляет поля.
 */
function rememberUser(user, chatId) {
  if (!user || !user.id || !chatId) return null;
  const data = load();
  if (!data.users) data.users = [];

  let row = data.users.find(
    u => u.id === user.id && String(u.chat_id) === String(chatId)
  );

  const now = new Date().toISOString().slice(0, 19).replace('T', ' ');

  if (row) {
    if (user.username  !== undefined) row.username   = user.username   || null;
    if (user.first_name !== undefined) row.first_name = user.first_name || null;
    if (user.last_name  !== undefined) row.last_name  = user.last_name  || null;
    row.last_active = now;
  } else {
    row = {
      id:          user.id,
      chat_id:     chatId,
      username:    user.username   || null,
      first_name:  user.first_name || null,
      last_name:   user.last_name  || null,
      xp:          0,
      level:       1,
      coins:       0,
      warnings:    0,
      muted_until: 0,
      status:      'active',
      joined_at:   now,
      last_active: now,
      messages_count: 0,
      achievements: [],
    };
    data.users.push(row);
  }

  save(data);
  return row;
}

/**
 * Найти участника чата по ID или @username.
 * Работает даже если пользователь уже покинул/забанен.
 */
function findUser(chatId, query) {
  if (!query || !chatId) return null;
  const data = load();
  const users = (data.users || []).filter(
    u => String(u.chat_id) === String(chatId)
  );

  const q = String(query).replace(/^@/, '').toLowerCase().trim();

  // По числовому ID
  if (/^\d+$/.test(q)) {
    const byId = users.find(u => String(u.id) === q);
    if (byId) return byId;
  }

  // По username
  return users.find(u => u.username && u.username.toLowerCase() === q) || null;
}

/**
 * Установить статус участника: 'active' | 'banned' | 'muted'
 */
function setUserStatus(userId, chatId, status) {
  const data = load();
  const row = (data.users || []).find(
    u => u.id === userId && String(u.chat_id) === String(chatId)
  );
  if (row) {
    row.status = status;
    save(data);
  }
}

/**
 * Получить всех участников чата (включая забаненных).
 */
function getChatMembers(chatId) {
  const data = load();
  return (data.users || []).filter(u => String(u.chat_id) === String(chatId));
}

// ── Парсер SQL-запросов ───────────────────────────────────────
function parseSQL(sql) {
  const s = sql.trim();

  if (/^CREATE\s+TABLE/i.test(s)) return { type: 'CREATE_TABLE' };

  const insertMatch = s.match(/^INSERT\s+(?:OR\s+\w+\s+)?INTO\s+(\w+)\s*\(([^)]+)\)\s*VALUES\s*\(([^)]+)\)/i);
  if (insertMatch) {
    return {
      type: 'INSERT',
      table: insertMatch[1].toLowerCase(),
      columns: insertMatch[2].split(',').map(c => c.trim()),
    };
  }

  const insertIgnoreMatch = s.match(/^INSERT\s+OR\s+IGNORE\s+INTO\s+(\w+)\s*\(([^)]+)\)\s*VALUES\s*\(([^)]+)\)/i);
  if (insertIgnoreMatch) {
    return {
      type: 'INSERT_IGNORE',
      table: insertIgnoreMatch[1].toLowerCase(),
      columns: insertIgnoreMatch[2].split(',').map(c => c.trim()),
    };
  }

  const selectMatch = s.match(/^SELECT\s+(.*?)\s+FROM\s+(\w+)(?:\s+WHERE\s+(.+?))?(?:\s+ORDER\s+BY\s+(.+?))?(?:\s+LIMIT\s+(\d+))?$/i);
  if (selectMatch) {
    return {
      type: 'SELECT',
      columns: selectMatch[1],
      table: selectMatch[2].toLowerCase(),
      where: selectMatch[3] || null,
      orderBy: selectMatch[4] || null,
      limit: selectMatch[5] ? parseInt(selectMatch[5]) : null,
    };
  }

  const updateMatch = s.match(/^UPDATE\s+(\w+)\s+SET\s+(.+?)\s+WHERE\s+(.+)$/i);
  if (updateMatch) {
    return {
      type: 'UPDATE',
      table: updateMatch[1].toLowerCase(),
      setClause: updateMatch[2],
      where: updateMatch[3],
    };
  }

  const deleteMatch = s.match(/^DELETE\s+FROM\s+(\w+)(?:\s+WHERE\s+(.+))?$/i);
  if (deleteMatch) {
    return {
      type: 'DELETE',
      table: deleteMatch[1].toLowerCase(),
      where: deleteMatch[2] || null,
    };
  }

  return { type: 'UNKNOWN', sql: s };
}

function matchWhere(row, whereClause, params) {
  if (!whereClause) return true;
  const conditions = whereClause.split(/\s+AND\s+/i);
  let paramIdx = 0;

  for (const cond of conditions) {
    const eqMatch = cond.trim().match(/^(\w+)\s*=\s*\?$/i);
    if (eqMatch) {
      const col = eqMatch[1].toLowerCase();
      const val = params[paramIdx++];
      if (String(row[col]) !== String(val)) return false;
      continue;
    }
    const lowerMatch = cond.trim().match(/^lower\((\w+)\)\s*=\s*\?$/i);
    if (lowerMatch) {
      const col = lowerMatch[1].toLowerCase();
      const val = params[paramIdx++];
      if (String(row[col] || '').toLowerCase() !== String(val).toLowerCase()) return false;
      continue;
    }
  }
  return true;
}

function applySet(row, setClause, params) {
  const assignments = setClause.split(',');
  let paramIdx = 0;

  for (const assign of assignments) {
    const trimmed = assign.trim();

    const simpleMatch = trimmed.match(/^(\w+)\s*=\s*\?$/i);
    if (simpleMatch) { row[simpleMatch[1].toLowerCase()] = params[paramIdx++]; continue; }

    const addMatch = trimmed.match(/^(\w+)\s*=\s*(\w+)\s*\+\s*\?$/i);
    if (addMatch) {
      const col = addMatch[1].toLowerCase();
      row[col] = (Number(row[col]) || 0) + Number(params[paramIdx++]);
      continue;
    }

    const maxSubMatch = trimmed.match(/^(\w+)\s*=\s*MAX\s*\(\s*0\s*,\s*\w+\s*-\s*\?\s*\)$/i);
    if (maxSubMatch) {
      const col = maxSubMatch[1].toLowerCase();
      row[col] = Math.max(0, (Number(row[col]) || 0) - Number(params[paramIdx++]));
      continue;
    }

    const subMatch = trimmed.match(/^(\w+)\s*=\s*(\w+)\s*-\s*\?$/i);
    if (subMatch) {
      const col = subMatch[1].toLowerCase();
      row[col] = (Number(row[col]) || 0) - Number(params[paramIdx++]);
      continue;
    }

    if (/^(\w+)\s*=\s*CURRENT_TIMESTAMP$/i.test(trimmed)) {
      const col = trimmed.split('=')[0].trim().toLowerCase();
      row[col] = new Date().toISOString().slice(0, 19).replace('T', ' ');
      continue;
    }
  }
}

function applyOrderBy(rows, orderBy) {
  if (!orderBy) return rows;
  const parts = orderBy.trim().split(/\s+/);
  const col   = parts[0].toLowerCase();
  const dir   = (parts[1] || 'ASC').toUpperCase();

  return [...rows].sort((a, b) => {
    const av = a[col], bv = b[col];
    if (av == null && bv == null) return 0;
    if (av == null) return 1;
    if (bv == null) return -1;
    if (typeof av === 'number' && typeof bv === 'number') return dir === 'DESC' ? bv - av : av - bv;
    return dir === 'DESC'
      ? String(bv).localeCompare(String(av))
      : String(av).localeCompare(String(bv));
  });
}

const TABLE_DEFAULTS = {
  users: {
    xp: 0, level: 1, coins: 0, warnings: 0, muted_until: 0, status: 'active',
    joined_at:   () => new Date().toISOString().slice(0, 19).replace('T', ' '),
    last_active: () => new Date().toISOString().slice(0, 19).replace('T', ' '),
  },
  warnings:    { created_at: () => new Date().toISOString().slice(0, 19).replace('T', ' ') },
  mod_log:     { created_at: () => new Date().toISOString().slice(0, 19).replace('T', ' ') },
  security_settings: {
    antilink_enabled: 1, antiflood_enabled: 1, badwords_enabled: 1,
    delete_violations: 1, automute_enabled: 1,
    flood_limit: 5, flood_seconds: 8, mute_minutes: 10,
  },
  security_logs:              { created_at: () => Date.now() },
  advanced_security_settings: {
    captcha_enabled: 1, antibot_enabled: 1, smart_links_enabled: 1,
    captcha_minutes: 3, captcha_attempts: 3, updated_at: () => Date.now(),
  },
  captcha_logs: { created_at: () => Date.now() },
};

function applyDefaults(table, row) {
  const defs = TABLE_DEFAULTS[table] || {};
  for (const [key, val] of Object.entries(defs)) {
    if (!(key in row)) row[key] = typeof val === 'function' ? val() : val;
  }
  return row;
}

// ── Основной класс Statement ──────────────────────────────────
class Statement {
  constructor(sql) {
    this._parsed = parseSQL(sql);
    this._sql    = sql;
  }

  get(...params) {
    const data = load();
    const p    = this._parsed;
    if (p.type === 'SELECT') {
      const table = data[p.table] || [];
      let rows = table.filter(row => matchWhere(row, p.where, params));
      rows = applyOrderBy(rows, p.orderBy);
      if (p.limit) rows = rows.slice(0, p.limit);
      return rows[0] || undefined;
    }
    console.warn('[db.js] get() вызван для не-SELECT запроса:', this._sql);
    return undefined;
  }

  all(...params) {
    const data = load();
    const p    = this._parsed;
    if (p.type === 'SELECT') {
      const table = data[p.table] || [];
      let rows = table.filter(row => matchWhere(row, p.where, params));
      rows = applyOrderBy(rows, p.orderBy);
      if (p.limit) rows = rows.slice(0, p.limit);
      return rows;
    }
    console.warn('[db.js] all() вызван для не-SELECT запроса:', this._sql);
    return [];
  }

  run(...params) {
    const data = load();
    const p    = this._parsed;
    let changes = 0;
    let lastInsertRowid = null;

    if (p.type === 'CREATE_TABLE') return { changes: 0, lastInsertRowid: null };

    if (p.type === 'INSERT' || p.type === 'INSERT_IGNORE') {
      if (!data[p.table]) data[p.table] = [];

      const row = {};
      p.columns.forEach((col, i) => {
        row[col.toLowerCase()] = params[i] !== undefined ? params[i] : null;
      });

      const isUpsert = /ON\s+CONFLICT/i.test(this._sql);
      if (isUpsert) {
        const idCol = p.columns[0].toLowerCase();
        const existing = data[p.table].find(r => String(r[idCol]) === String(row[idCol]));
        if (existing) {
          const conflictMatch = this._sql.match(/DO\s+UPDATE\s+SET\s+(.+)$/is);
          if (conflictMatch) {
            const setClauses = conflictMatch[1].split(',');
            for (const clause of setClauses) {
              const m = clause.trim().match(/^(\w+)\s*=\s*excluded\.(\w+)$/i);
              if (m) {
                existing[m[1].toLowerCase()] = row[m[2].toLowerCase()];
              } else {
                const tsMatch = clause.trim().match(/^(\w+)\s*=\s*CURRENT_TIMESTAMP$/i);
                if (tsMatch) existing[tsMatch[1].toLowerCase()] = new Date().toISOString().slice(0, 19).replace('T', ' ');
              }
            }
          }
          save(data);
          return { changes: 1, lastInsertRowid: existing.id || null };
        }
      }

      if (p.type === 'INSERT_IGNORE') {
        const idCol = p.columns[0].toLowerCase();
        const exists = data[p.table].some(r => String(r[idCol]) === String(row[idCol]));
        if (exists) return { changes: 0, lastInsertRowid: null };
      }

      applyDefaults(p.table, row);
      if (!row.id) row.id = nextId(data, p.table);
      data[p.table].push(row);
      lastInsertRowid = row.id;
      changes = 1;
      save(data);
      return { changes, lastInsertRowid };
    }

    if (p.type === 'UPDATE') {
      if (!data[p.table]) data[p.table] = [];
      const setClause   = p.setClause;
      const setCount    = (setClause.match(/\?/g) || []).length;
      const setParams   = params.slice(0, setCount);
      const whereParams = params.slice(setCount);

      for (const row of data[p.table]) {
        if (matchWhere(row, p.where, whereParams)) {
          applySet(row, setClause, setParams);
          changes++;
        }
      }
      save(data);
      return { changes, lastInsertRowid: null };
    }

    if (p.type === 'DELETE') {
      if (!data[p.table]) data[p.table] = [];
      const before = data[p.table].length;
      data[p.table] = data[p.table].filter(row => !matchWhere(row, p.where, params));
      changes = before - data[p.table].length;
      save(data);
      return { changes, lastInsertRowid: null };
    }

    console.warn('[db.js] run() — неизвестный тип запроса:', this._sql);
    return { changes: 0, lastInsertRowid: null };
  }
}

// ── Публичный API ─────────────────────────────────────────────
const db = {
  prepare(sql)  { return new Statement(sql); },
  exec(sql)     { return this; },
  pragma(str)   { return this; },

  // Прямые функции для работы с участниками
  rememberUser,
  findUser,
  setUserStatus,
  getChatMembers,
};

console.log(`✅ JSON-база подключена: ${dbPath}`);

module.exports = db;
