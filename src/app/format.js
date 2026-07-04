function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function displayName(user) {
  if (!user) return 'Участник';
  if (user.username) return `@${user.username}`;
  const parts = [user.first_name || user.firstName, user.last_name || user.lastName].filter(Boolean);
  return parts.join(' ') || `ID ${user.id || user.telegramId || 'unknown'}`;
}

function mention(user) {
  if (!user) return 'Участник';
  const id = user.id || user.telegramId;
  const name = escapeHtml(displayName({ ...user, username: null }));
  return id ? `<a href="tg://user?id=${id}">${name}</a>` : name;
}

function parseArgs(ctx) {
  const text = ctx.message?.text || '';
  return text.trim().split(/\s+/).slice(1).filter(Boolean);
}

function toPositiveInt(value, fallback = null) {
  const number = Number.parseInt(value, 10);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function formatMoney(amount) {
  return `${Number(amount) || 0} FunMoney`;
}

function formatDuration(seconds) {
  const value = Math.max(0, Number(seconds) || 0);
  if (value < 60) return `${value} сек.`;
  if (value < 3600) return `${Math.ceil(value / 60)} мин.`;
  if (value < 86400) return `${Math.ceil(value / 3600)} ч.`;
  return `${Math.ceil(value / 86400)} дн.`;
}

function nowIso() {
  return new Date().toISOString();
}

module.exports = {
  escapeHtml,
  displayName,
  mention,
  parseArgs,
  toPositiveInt,
  randomInt,
  formatMoney,
  formatDuration,
  nowIso,
};
