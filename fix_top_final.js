const fs = require("fs");

const path = "index.js";
let code = fs.readFileSync(path, "utf8");

const start = code.indexOf("  if (command === 'top') {");
const end = code.indexOf("  if (command === 'level')", start);

if (start === -1 || end === -1) {
  console.error("❌ Не нашёл блок top или level в index.js");
  process.exit(1);
}

const newTopBlock = `  if (command === 'top') {
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
      return ctx.reply(titles[mode] + '\\n\\nПока нет статистики для этого периода.');
    }

    const lines = users.map((user, index) => {
      return medal(index) + ' ' + (index + 1) + '. ' + getTopName(user) + ' — <b>' + user.score + '</b>';
    });

    const text = titles[mode] + '\\n\\n' + lines.join('\\n');

    return ctx.reply(text, {
      parse_mode: 'HTML'
    });
  }

`;

code = code.slice(0, start) + newTopBlock + code.slice(end);

fs.writeFileSync(path, code, "utf8");

console.log("✅ Топ исправлен: теперь без \\n в сообщении и с красивым оформлением");
