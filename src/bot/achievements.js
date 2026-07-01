// ============================================================
// src/bot/achievements.js
// Система достижений — автоматические ачивки
// ============================================================

const { Markup } = require('telegraf');
const db = require('../database/db');
const { formatName } = require('../utils');

// ── Список достижений ─────────────────────────────────────────
const ACHIEVEMENTS = [
  // Активность
  { id: 'first_msg',    name: '👋 Первый шаг',      desc: 'Написал первое сообщение',         reward: 20,   check: (u) => (u.messages_count || 0) >= 1 },
  { id: 'msg_10',       name: '💬 Болтун',           desc: '10 сообщений в чате',              reward: 30,   check: (u) => (u.messages_count || 0) >= 10 },
  { id: 'msg_100',      name: '🗣 Активист',         desc: '100 сообщений в чате',             reward: 100,  check: (u) => (u.messages_count || 0) >= 100 },
  { id: 'msg_500',      name: '📢 Голос чата',       desc: '500 сообщений в чате',             reward: 300,  check: (u) => (u.messages_count || 0) >= 500 },
  { id: 'msg_1000',     name: '🏆 Легенда чата',     desc: '1000 сообщений в чате',            reward: 1000, check: (u) => (u.messages_count || 0) >= 1000 },

  // Уровни
  { id: 'level_5',      name: '🥉 Участник',         desc: 'Достиг 5 уровня',                  reward: 50,   check: (u) => (u.level || 1) >= 5 },
  { id: 'level_10',     name: '🥈 Опытный',          desc: 'Достиг 10 уровня',                 reward: 150,  check: (u) => (u.level || 1) >= 10 },
  { id: 'level_20',     name: '🥇 Про',              desc: 'Достиг 20 уровня',                 reward: 400,  check: (u) => (u.level || 1) >= 20 },
  { id: 'level_30',     name: '💎 Эксперт',          desc: 'Достиг 30 уровня',                 reward: 800,  check: (u) => (u.level || 1) >= 30 },
  { id: 'level_50',     name: '👑 Легенда',          desc: 'Достиг 50 уровня',                 reward: 2000, check: (u) => (u.level || 1) >= 50 },

  // Монеты
  { id: 'coins_100',    name: '💰 Копилка',          desc: 'Накопил 100 монет',                reward: 0,    check: (u) => (u.coins || 0) >= 100 },
  { id: 'coins_1000',   name: '💎 Богач',            desc: 'Накопил 1000 монет',               reward: 50,   check: (u) => (u.coins || 0) >= 1000 },
  { id: 'coins_5000',   name: '🤑 Миллионер',        desc: 'Накопил 5000 монет',               reward: 200,  check: (u) => (u.coins || 0) >= 5000 },

  // Социальное
  { id: 'first_friend', name: '🤝 Первый друг',      desc: 'Завёл первого друга',              reward: 30,   check: (u) => (u.friends_count || 0) >= 1 },
  { id: 'friends_5',    name: '👥 Компания',         desc: '5 друзей в чате',                  reward: 100,  check: (u) => (u.friends_count || 0) >= 5 },
  { id: 'in_love',      name: '❤️ Влюблённый',       desc: 'Нашёл пару',                       reward: 50,   check: (u) => u.in_couple === true },
  { id: 'rep_10',       name: '⭐ Уважаемый',        desc: 'Получил 10 репутации',             reward: 100,  check: (u) => (u.reputation || 0) >= 10 },
  { id: 'rep_50',       name: '🌟 Авторитет',        desc: 'Получил 50 репутации',             reward: 500,  check: (u) => (u.reputation || 0) >= 50 },

  // Игры
  { id: 'first_casino', name: '🎰 Игрок',            desc: 'Сыграл в казино первый раз',       reward: 20,   check: (u) => (u.casino_games || 0) >= 1 },
  { id: 'casino_win',   name: '🤑 Везунчик',         desc: 'Выиграл в казино',                 reward: 50,   check: (u) => (u.casino_wins || 0) >= 1 },
  { id: 'duel_win',     name: '⚔️ Дуэлянт',          desc: 'Победил в дуэли',                  reward: 75,   check: (u) => (u.duel_wins || 0) >= 1 },
  { id: 'duel_5',       name: '🗡 Непобедимый',      desc: 'Победил в 5 дуэлях',               reward: 200,  check: (u) => (u.duel_wins || 0) >= 5 },

  // Особые
  { id: 'daily_7',      name: '📅 Постоянный',       desc: '7 дней подряд получал бонус',      reward: 200,  check: (u) => (u.daily_streak || 0) >= 7 },
  { id: 'daily_30',     name: '🗓 Преданный',        desc: '30 дней подряд получал бонус',     reward: 1000, check: (u) => (u.daily_streak || 0) >= 30 },
  { id: 'shop_buyer',   name: '🛍 Покупатель',       desc: 'Купил что-то в магазине',          reward: 30,   check: (u) => (u.inventory || []).length >= 1 },
];

// ── Вспомогательные ──────────────────────────────────────────
function getDbUser(userId, chatId) {
  const data = db.loadDb();
  return data.users.find(u => String(u.telegram_id) === String(userId));
}

function getUserAchievements(userId, chatId) {
  const u = getDbUser(userId, chatId);
  return u?.achievements || [];
}

function grantAchievement(userId, chatId, achievementId) {
  const data = db.loadDb();
  const user = data.users.find(u => String(u.telegram_id) === String(userId));
  if (!user) return false;
  if (!user.achievements) user.achievements = [];
  if (user.achievements.includes(achievementId)) return false;
  
  user.achievements.push(achievementId);
  user.updated_at = db.now();
  
  db.saveDb(data);
  console.log(`[Achievements] Выдано достижение ${achievementId} пользователю ${userId}`);
  return true;
}

// ── Увеличить счётчик сообщений ───────────────────────────────
function incrementMessageCount(userId, chatId) {
  const data = db.loadDb();
  const user = data.users.find(u => String(u.telegram_id) === String(userId));
  if (!user) return;
  
  user.messages_count = (user.messages_count || 0) + 1;
  user.updated_at = db.now();
  
  db.saveDb(data);
  console.log(`[Achievements] messages_count пользователя ${userId}: ${user.messages_count}`);
}

// ── Проверить и выдать новые достижения ───────────────────────
async function checkAchievements(ctx, userId, chatId) {
  const user = getDbUser(userId, chatId);
  if (!user) return;

  console.log(`[Achievements] Проверка достижений для пользователя ${userId}, messages_count: ${user.messages_count || 0}, achievements: ${user.achievements?.length || 0}`);

  for (const ach of ACHIEVEMENTS) {
    try {
      if (!ach.check(user)) continue;
      const granted = grantAchievement(userId, chatId, ach.id);
      if (!granted) continue;

      // Выдаём награду
      if (ach.reward > 0) {
        db.addCoins(userId, ach.reward);
      }

      // Уведомляем в чат
      await ctx.reply(
        `🏆 <b>Новое достижение!</b>\n\n` +
        `${ach.name}\n` +
        `📝 ${ach.desc}\n` +
        (ach.reward > 0 ? `💰 Награда: <b>+${ach.reward} монет</b>` : ''),
        { parse_mode: 'HTML' }
      );
    } catch {}
  }
}

// ── Регистрация ───────────────────────────────────────────────
function registerAchievements(bot) {

  // /achievements — список достижений
  bot.command(['achievements', 'ачивки', 'достижения'], async (ctx) => {
    const chatId = ctx.chat.type === 'private' ? ctx.from.id : ctx.chat.id;
    const earned = getUserAchievements(ctx.from.id, chatId);

    const lines = ACHIEVEMENTS.map(ach => {
      const done = earned.includes(ach.id);
      return `${done ? '✅' : '⬜'} ${ach.name} — ${ach.desc}${ach.reward > 0 ? ` (+${ach.reward}💰)` : ''}`;
    });

    const total = ACHIEVEMENTS.length;
    const done  = earned.length;

    // Разбиваем на страницы по 10
    const page1 = lines.slice(0, 12).join('\n');

    await ctx.reply(
      `🏆 <b>Достижения ${formatName(ctx.from)}</b>\n` +
      `Получено: <b>${done}/${total}</b>\n\n` +
      page1,
      {
        parse_mode: 'HTML',
        ...Markup.inlineKeyboard([
          [Markup.button.callback('➡️ Ещё достижения', 'ach_page_1')],
        ]),
      }
    );
  });

  bot.action(/^ach_page_(\d+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    const page   = parseInt(ctx.match[1]);
    const chatId = ctx.chat.type === 'private' ? ctx.from.id : ctx.chat.id;
    const earned = getUserAchievements(ctx.from.id, chatId);

    const lines = ACHIEVEMENTS.map(ach => {
      const done = earned.includes(ach.id);
      return `${done ? '✅' : '⬜'} ${ach.name} — ${ach.desc}${ach.reward > 0 ? ` (+${ach.reward}💰)` : ''}`;
    });

    const perPage = 12;
    const start   = page * perPage;
    const slice   = lines.slice(start, start + perPage);
    const total   = Math.ceil(lines.length / perPage);

    const nav = [];
    if (page > 0)          nav.push(Markup.button.callback('⬅️', `ach_page_${page - 1}`));
    if (page < total - 1)  nav.push(Markup.button.callback('➡️', `ach_page_${page + 1}`));

    await ctx.editMessageText(
      `🏆 <b>Достижения</b> (стр. ${page + 1}/${total})\n\n${slice.join('\n')}`,
      {
        parse_mode: 'HTML',
        ...Markup.inlineKeyboard(nav.length ? [nav] : []),
      }
    );
  });

  // Проверяем достижения при каждом сообщении
  bot.on('message', async (ctx, next) => {
    try {
      if (ctx.from && !ctx.from.is_bot && ctx.chat?.type !== 'private') {
        // Сначала увеличиваем счётчик сообщений
        incrementMessageCount(ctx.from.id, ctx.chat.id);
        // Затем проверяем достижения
        await checkAchievements(ctx, ctx.from.id, ctx.chat.id);
      }
    } catch {}
    return next();
  });

  console.log('✅ Модуль achievements подключён');
}

module.exports = { registerAchievements, checkAchievements, ACHIEVEMENTS, incrementMessageCount };
