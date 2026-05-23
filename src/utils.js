// ============================================================
// src/utils.js
// Общие утилиты, используемые во всех модулях.
// Импортируй нужные функции: const { isUserAdmin } = require('./utils');
// ============================================================

/**
 * Проверить, является ли пользователь администратором или владельцем чата.
 * НИКОГДА не падает — при ошибке возвращает false.
 *
 * @param {object} ctx    — контекст Telegraf
 * @param {number} userId — Telegram ID пользователя
 * @param {number} [chatId] — ID чата (по умолчанию ctx.chat.id)
 * @returns {Promise<boolean>}
 */
async function isUserAdmin(ctx, userId, chatId) {
  try {
    const cid = chatId || ctx.chat?.id;
    if (!cid || !userId) return false;
    const member = await ctx.telegram.getChatMember(cid, userId);
    return member.status === 'creator' || member.status === 'administrator';
  } catch (error) {
    console.error(`[isUserAdmin] Ошибка проверки прав userId=${userId}:`, error.message);
    return false; // безопасный fallback — не применяем наказание
  }
}

/**
 * Проверить, является ли бот администратором чата.
 * @param {object} ctx
 * @returns {Promise<boolean>}
 */
async function isBotAdmin(ctx) {
  try {
    const botInfo = await ctx.telegram.getMe();
    const member = await ctx.telegram.getChatMember(ctx.chat.id, botInfo.id);
    return member.status === 'administrator';
  } catch {
    return false;
  }
}

/**
 * Форматировать имя пользователя из объекта from.
 * Приоритет: @username → first_name + last_name → first_name → "Участник"
 *
 * @param {object} user — объект ctx.message.from
 * @returns {string}
 */
function formatName(user) {
  if (!user) return 'Участник';
  if (user.username) return `@${user.username}`;
  const parts = [user.first_name, user.last_name].filter(Boolean);
  return parts.join(' ') || 'Участник';
}

/**
 * Форматировать имя с HTML-ссылкой на профиль.
 * @param {object} user
 * @returns {string}
 */
function formatNameLink(user) {
  if (!user) return 'Участник';
  const name = [user.first_name, user.last_name].filter(Boolean).join(' ') || 'Участник';
  return `<a href="tg://user?id=${user.id}">${escapeHtml(name)}</a>`;
}

/**
 * Экранировать HTML-спецсимволы.
 * @param {string} str
 * @returns {string}
 */
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * Пауза на N миллисекунд.
 * @param {number} ms
 * @returns {Promise<void>}
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Выбрать случайный элемент из массива.
 * @param {Array} arr
 * @returns {*}
 */
function getRandom(arr) {
  if (!arr || arr.length === 0) return null;
  return arr[Math.floor(Math.random() * arr.length)];
}

/**
 * Безопасно удалить сообщение через N секунд.
 * @param {object} ctx
 * @param {number} messageId
 * @param {number} delayMs
 */
async function deleteAfter(ctx, messageId, delayMs = 5000) {
  await sleep(delayMs);
  try {
    await ctx.telegram.deleteMessage(ctx.chat.id, messageId);
  } catch {
    // Игнорируем — сообщение уже удалено или нет прав
  }
}

/**
 * Форматировать длительность в читаемый вид.
 * @param {number} seconds
 * @returns {string}
 */
function formatDuration(seconds) {
  if (seconds < 60) return `${seconds} сек.`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)} мин.`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} ч.`;
  return `${Math.floor(seconds / 86400)} дн.`;
}

module.exports = {
  isUserAdmin,
  isBotAdmin,
  formatName,
  formatNameLink,
  escapeHtml,
  sleep,
  getRandom,
  deleteAfter,
  formatDuration,
};
