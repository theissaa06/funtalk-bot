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
// ============================================================

const fs   = require('fs');
const path = require('path');
require('dotenv').config();

// ── Путь к файлу базы ─────────────────────────────────────────
const dataDir = path.resolve('./data');
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
    // Добавляем недостающие таблицы
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

// ── Парсер SQL-запросов ───────────────────────────────────────
// Поддерживает только те запросы, которые реально используются в боте.

function parseSQL(sql) {
  const s = sql.trim();

  // CREATE TABLE — игнорируем
  if (/^CREATE\s+TABLE/i.test(s)) return { type: 'CREATE_TABLE' };

  // INSERT INTO table (...) VALUES (...)
  const insertMatch = s.match(/^INSERT\s+(?:OR\s+\w+\s+)?INTO\s+(\w+)\s*\(([^)]+)\)\s*VALUES\s*\(([^)]+)\)/i);
  if (insertMatch) {
    return {
      type: 'INSERT',
      table: insertMatch[1].toLowerCase(),
      columns: insertMatch[2].split(',').map(c => c.trim()),
    };
  }

  // INSERT OR IGNORE INTO table (col) VALUES (?)
  const insertIgnoreMatch = s.match(/^INSERT\s+OR\s+IGNORE\s+INTO\s+(\w+)\s*\(([^)]+)\)\s*VALUES\s*\(([^)]+)\)/i);
  if (insertIgnoreMatch) {
    return {
      type: 'INSERT_IGNORE',
      table: insertIgnoreMatch[1].toLowerCase(),
      columns: insertIgnoreMatch[2].split(',').map(c => c.trim()),
    };
  }

  // SELECT * FROM table WHERE ...
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

  // UPDATE table SET col = expr WHERE ...
  const updateMatch = s.match(/^UPDATE\s+(\w+)\s+SET\s+(.+?)\s+WHERE\s+(.+)$/i);
  if (updateMatch) {
    return {
      type: 'UPDATE',
      table: updateMatch[1].toLowerCase(),
      setClause: updateMatch[2],
      where: updateMatch[3],
    };
  }

  // DELETE FROM table WHERE ...
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

// ── Вычислить WHERE-условие ───────────────────────────────────
function matchWhere(row, whereClause, params) {
  if (!whereClause) return true;

  // Разбиваем по AND
  const conditions = whereClause.split(/\s+AND\s+/i);
  let paramIdx = 0;

  for (const cond of conditions) {
    // col = ?
    const eqMatch = cond.trim().match(/^(\w+)\s*=\s*\?$/i);
    if (eqMatch) {
      const col = eqMatch[1].toLowerCase();
      const val = params[paramIdx++];
      if (String(row[col]) !== String(val)) return false;
      continue;
    }

    // lower(col) = ?
    const lowerMatch = cond.trim().match(/^lower\((\w+)\)\s*=\s*\?$/i);
    if (lowerMatch) {
      const col = lowerMatch[1].toLowerCase();
      const val = params[paramIdx++];
      if (String(row[col] || '').toLowerCase() !== String(val).toLowerCase()) return false;
      continue;
    }

    // col IS NULL / col IS NOT NULL — пропускаем (не используется)
  }

  return true;
}

// ── Применить SET-выражение ───────────────────────────────────
function applySet(row, setClause, params) {
  const assignments = setClause.split(',');
  let paramIdx = 0;

  for (const assign of assignments) {
    const trimmed = assign.trim();

    // col = ?
    const simpleMatch = trimmed.match(/^(\w+)\s*=\s*\?$/i);
    if (simpleMatch) {
      row[simpleMatch[1].toLowerCase()] = params[paramIdx++];
      continue;
    }

    // col = col + ?
    const addMatch = trimmed.match(/^(\w+)\s*=\s*(\w+)\s*\+\s*\?$/i);
    if (addMatch) {
      const col = addMatch[1].toLowerCase();
      row[col] = (Number(row[col]) || 0) + Number(params[paramIdx++]);
      continue;
    }

    // col = MAX(0, col - ?)
    const maxSubMatch = trimmed.match(/^(\w+)\s*=\s*MAX\s*\(\s*0\s*,\s*\w+\s*-\s*\?\s*\)$/i);
    if (maxSubMatch) {
      const col = maxSubMatch[1].toLowerCase();
      row[col] = Math.max(0, (Number(row[col]) || 0) - Number(params[paramIdx++]));
      continue;
    }

    // col = col - ?
    const subMatch = trimmed.match(/^(\w+)\s*=\s*(\w+)\s*-\s*\?$/i);
    if (subMatch) {
      const col = subMatch[1].toLowerCase();
      row[col] = (Number(row[col]) || 0) - Number(params[paramIdx++]);
      continue;
    }

    // col = CURRENT_TIMESTAMP
    if (/^(\w+)\s*=\s*CURRENT_TIMESTAMP$/i.test(trimmed)) {
      const col = trimmed.split('=')[0].trim().toLowerCase();
      row[col] = new Date().toISOString().slice(0, 19).replace('T', ' ');
      continue;
    }

    // col = col (no-op, e.g. username = excluded.username — ON CONFLICT)
    // Пропускаем
  }
}

// ── Сортировка ────────────────────────────────────────────────
function applyOrderBy(rows, orderBy) {
  if (!orderBy) return rows;
  const parts = orderBy.trim().split(/\s+/);
  const col   = parts[0].toLowerCase();
  const dir   = (parts[1] || 'ASC').toUpperCase();

  return [...rows].sort((a, b) => {
    const av = a[col];
    const bv = b[col];
    if (av == null && bv == null) return 0;
    if (av == null) return 1;
    if (bv == null) return -1;
    if (typeof av === 'number' && typeof bv === 'number') {
      return dir === 'DESC' ? bv - av : av - bv;
    }
    return dir === 'DESC'
      ? String(bv).localeCompare(String(av))
      : String(av).localeCompare(String(bv));
  });
}

// ── Дефолтные значения для новых строк ───────────────────────
const TABLE_DEFAULTS = {
  users: {
    xp: 0, level: 1, coins: 0, warnings: 0, muted_until: 0,
    joined_at: () => new Date().toISOString().slice(0, 19).replace('T', ' '),
    last_active: () => new Date().toISOString().slice(0, 19).replace('T', ' '),
  },
  warnings: {
    created_at: () => new Date().toISOString().slice(0, 19).replace('T', ' '),
  },
  mod_log: {
    created_at: () => new Date().toISOString().slice(0, 19).replace('T', ' '),
  },
  security_settings: {
    antilink_enabled: 1, antiflood_enabled: 1, badwords_enabled: 1,
    delete_violations: 1, automute_enabled: 1,
    flood_limit: 5, flood_seconds: 8, mute_minutes: 10,
  },
  security_logs: {
    created_at: () => Date.now(),
  },
  advanced_security_settings: {
    captcha_enabled: 1, antibot_enabled: 1, smart_links_enabled: 1,
    captcha_minutes: 3, captcha_attempts: 3,
    updated_at: () => Date.now(),
  },
  captcha_logs: {
    created_at: () => Date.now(),
  },
};

function applyDefaults(table, row) {
  const defs = TABLE_DEFAULTS[table] || {};
  for (const [key, val] of Object.entries(defs)) {
    if (!(key in row)) {
      row[key] = typeof val === 'function' ? val() : val;
    }
  }
  return row;
}

// ── Основной класс Statement ──────────────────────────────────
class Statement {
  constructor(sql) {
    this._parsed = parseSQL(sql);
    this._sql    = sql;
  }

  // Выполнить SELECT → вернуть первую строку или undefined
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

  // Выполнить SELECT → вернуть все строки
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

  // Выполнить INSERT / UPDATE / DELETE → вернуть { changes, lastInsertRowid }
  run(...params) {
    const data = load();
    const p    = this._parsed;
    let changes = 0;
    let lastInsertRowid = null;

    if (p.type === 'CREATE_TABLE') {
      // Ничего не делаем
      return { changes: 0, lastInsertRowid: null };
    }

    if (p.type === 'INSERT' || p.type === 'INSERT_IGNORE') {
      if (!data[p.table]) data[p.table] = [];

      // Строим объект из колонок и параметров
      const row = {};
      p.columns.forEach((col, i) => {
        row[col.toLowerCase()] = params[i] !== undefined ? params[i] : null;
      });

      // ON CONFLICT(id) DO UPDATE — обновляем если id совпадает
      const isUpsert = /ON\s+CONFLICT/i.test(this._sql);
      if (isUpsert) {
        const idCol = p.columns[0].toLowerCase();
        const existing = data[p.table].find(r => String(r[idCol]) === String(row[idCol]));
        if (existing) {
          // Применяем SET из ON CONFLICT ... DO UPDATE SET
          const conflictMatch = this._sql.match(/DO\s+UPDATE\s+SET\s+(.+)$/is);
          if (conflictMatch) {
            const setClauses = conflictMatch[1].split(',');
            for (const clause of setClauses) {
              const m = clause.trim().match(/^(\w+)\s*=\s*excluded\.(\w+)$/i);
              if (m) {
                existing[m[1].toLowerCase()] = row[m[2].toLowerCase()];
              } else {
                // last_active = CURRENT_TIMESTAMP
                const tsMatch = clause.trim().match(/^(\w+)\s*=\s*CURRENT_TIMESTAMP$/i);
                if (tsMatch) {
                  existing[tsMatch[1].toLowerCase()] = new Date().toISOString().slice(0, 19).replace('T', ' ');
                }
              }
            }
          }
          save(data);
          return { changes: 1, lastInsertRowid: existing.id || null };
        }
      }

      // INSERT OR IGNORE — пропускаем если уже есть
      if (p.type === 'INSERT_IGNORE') {
        const idCol = p.columns[0].toLowerCase();
        const exists = data[p.table].some(r => String(r[idCol]) === String(row[idCol]));
        if (exists) {
          return { changes: 0, lastInsertRowid: null };
        }
      }

      // Новая строка
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

      // Разбиваем WHERE на части для подсчёта параметров SET
      const setParams  = [];
      const whereParams = [];

      // Считаем кол-во ? в SET
      const setClause = p.setClause;
      const setCount  = (setClause.match(/\?/g) || []).length;

      for (let i = 0; i < setCount; i++)   setParams.push(params[i]);
      for (let i = setCount; i < params.length; i++) whereParams.push(params[i]);

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
  prepare(sql) {
    return new Statement(sql);
  },

  exec(sql) {
    // CREATE TABLE — игнорируем (таблицы создаются автоматически)
    return this;
  },

  pragma(str) {
    // Игнорируем (WAL, foreign_keys и т.д.)
    return this;
  },
};

console.log(`✅ JSON-база подключена: ${dbPath}`);

module.exports = db;
