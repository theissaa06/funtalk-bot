// ============================================================
// src/db.js
// Единое подключение к SQLite через better-sqlite3.
// Импортируй этот модуль везде, где нужна база данных.
// ============================================================

const Database = require("better-sqlite3");
const path = require("path");
const fs = require("fs");
require("dotenv").config();

// Папка для базы данных
const dataDir = path.resolve("./data");

// Если папки data нет — создаём
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

// Путь к базе:
// 1) если в .env есть DB_PATH — используем его
// 2) если нет — используем ./data/bot.sqlite
const dbPath = process.env.DB_PATH
  ? path.resolve(process.env.DB_PATH)
  : path.join(dataDir, "bot.sqlite");

// Подключение к SQLite
const db = new Database(dbPath);

// Настройки SQLite
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

// Инициализация таблиц
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id          INTEGER PRIMARY KEY,
    username    TEXT,
    first_name  TEXT,
    chat_id     INTEGER,
    xp          INTEGER DEFAULT 0,
    level       INTEGER DEFAULT 1,
    coins       INTEGER DEFAULT 0,
    warnings    INTEGER DEFAULT 0,
    muted_until INTEGER DEFAULT 0,
    joined_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_active DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS chats (
    id              INTEGER PRIMARY KEY,
    title           TEXT,
    welcome_enabled INTEGER DEFAULT 1,
    moderation      INTEGER DEFAULT 1,
    antiflood       INTEGER DEFAULT 1,
    created_at      DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS warnings (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id    INTEGER,
    chat_id    INTEGER,
    reason     TEXT,
    issued_by  INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS mod_log (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    chat_id    INTEGER,
    user_id    INTEGER,
    action     TEXT,
    reason     TEXT,
    by_user_id INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

console.log(`✅ SQLite база подключена: ${dbPath}`);

module.exports = db;