// ============================================================
// src/bot/achievements.js
// Система достижений — автоматические ачивки
// ============================================================

const { Markup } = require('telegraf');
const db = require('../database/db');
const { formatName } = require('../utils');

// ── Список достижений ─────────────────────────────────────────
const ACHIEVEMENTS = [
  // Активность (per-чат)
  { id: 'first_msg',    name: '👋 Первый шаг',      desc: 'Написал первое сообщение в чате',   reward: 20,   check: (u) => (u.message_count || 0) >= 1 },
  { id: 'msg_10',       name: '💬 Болтун',           desc: '10 сообщений в чате',              reward: 30,   check: (u) => (u.message_count || 0) >= 10 },
  { id: 'msg_100',      name: '🗣 Активист',         desc: '100 сообщений в чате',             reward: 100,  check: (u) => (u.message_count || 0) >= 100 },
  { id: 'msg_500',      name: '📢 Голос чата',       desc: '500 сообщений в чате',             reward: 300,  check: (u) => (u.message_count || 0) >= 500 },
  { id: 'msg_1000',     name: '🏆 Легенда чата',     desc: '1000 сообщений в чате',            reward: 1000, check: (u) => (u.message_count || 0) >= 1000 },

  // Стикеры (per-чат)
  { id: 'sticker_10',   name: '😎 Стикероман',       desc: 'Отправил 10 стикеров',             reward: 30,   check: (u) => (u.sticker_count || 0) >= 10 },
  { id: 'sticker_100',  name: '🎨 Художник',         desc: 'Отправил 100 стикеров',            reward: 200,  check: (u) => (u.sticker_count || 0) >= 100 },

  // Ответы (per-чат)
  { id: 'reply_10',     name: '💬 Отвечающий',       desc: 'Ответил 10 раз',                   reward: 30,   check: (u) => (u.reply_count || 0) >= 10 },
  { id: 'reply_100',    name: '🗣 Диалогист',        desc: 'Ответил 100 раз',                  reward: 200,  check: (u) => (u.reply_count || 0) >= 100 },

  // Уровни (per-чат)
  { id: 'level_5',      name: '🥉 Участник',         desc: 'Достиг 5 уровня',                  reward: 50,   check: (u) => (u.level || 1) >= 5 },
  { id: 'level_10',     name: '🥈 Опытный',          desc: 'Достиг 10 уровня',                 reward: 150,  check: (u) => (u.level || 1) >= 10 },
  { id: 'level_20',     name: '🥇 Про',              desc: 'Достиг 20 уровня',                 reward: 400,  check: (u) => (u.level || 1) >= 20 },
  { id: 'level_30',     name: '💎 Эксперт',          desc: 'Достиг 30 уровня',                 reward: 800,  check: (u) => (u.level || 1) >= 30 },
  { id: 'level_50',     name: '👑 Легенда',          desc: 'Достиг 50 уровня',                 reward: 2000, check: (u) => (u.level || 1) >= 50 },

  // Монеты (per-чат)
  { id: 'coins_100',    name: '💰 Копилка',          desc: 'Накопил 100 монет в чате',         reward: 0,    check: (u) => (u.coins || 0) >= 100 },
  { id: 'coins_1000',   name: '💎 Богач',            desc: 'Накопил 1000 монет в чате',        reward: 50,   check: (u) => (u.coins || 0) >= 1000 },
  { id: 'coins_5000',   name: '🤑 Миллионер',        desc: 'Накопил 5000 монет в чате',        reward: 200,  check: (u) => (u.coins || 0) >= 5000 },

  // Социальное (глобальные поля из users)
  { id: 'first_friend', name: '🤝 Первый друг',      desc: 'Завёл первого друга',              reward: 30,   check: (u) => (u.friends_count || 0) >= 1 },
  { id: 'friends_5',    name: '👥 Компания',         desc: '5 друзей в чате',                  reward: 100,  check: (u) => (u.friends_count || 0) >= 5 },
  { id: 'in_love',      name: '❤️ Влюблённый',       desc: 'Нашёл пару',                       reward: 50,   check: (u) => u.in_couple === true },
  { id: 'rep_10',       name: '⭐ Уважаемый',        desc: 'Получил 10 репутации',             reward: 100,  check: (u) => (u.reputation || 0) >= 10 },
  { id: 'rep_50',       name: '🌟 Авторитет',        desc: 'Получил 50 репутации',             reward: 500,  check: (u) => (u.reputation || 0) >= 50 },

  // Игры (глобальные поля из users)
  { id: 'first_casino', name: '🎰 Игрок',            desc: 'Сыграл в казино первый раз',       reward: 20,   check: (u) => (u.casino_games || 0) >= 1 },
  { id: 'casino_win',   name: '🤑 Везунчик',         desc: 'Выиграл в казино',                 reward: 50,   check: (u) => (u.casino_wins || 0) >= 1 },
  { id: 'duel_win',     name: '⚔️ Дуэлянт',          desc: 'Победил в дуэли',                  reward: 75,   check: (u) => (u.duel_wins || 0) >= 1 },
  { id: 'duel_5',       name: '🗡 Непобедимый',      desc: 'Победил в 5 дуэлях',               reward: 200,  check: (u) => (u.duel_wins || 0) >= 5 },

  // Особые (глобальные поля из users)
  { id: 'daily_7',      name: '📅 Постоянный',       desc: '7 дней подряд получал бонус',      reward: 200,  check: (u) => (u.daily_streak || 0) >= 7 },
  { id: 'daily_30',     name: '🗓 Преданный',        desc: '30 дней подряд получал бонус',     reward: 1000, check: (u) => (u.daily_streak || 0) >= 30 },
  { id: 'shop_buyer',   name: '🛍 Покупатель',       desc: 'Купил что-то в магазине',          reward: 30,   check: (u) => (u.inventory || []).length >= 1 },
];

const PROGRESS_ACHIEVEMENTS = {
  first_msg:   { field: 'message_count', threshold: 1 },
  msg_10:      { field: 'message_count', threshold: 10 },
  msg_100:     { field: 'message_count', threshold: 100 },
  msg_500:     { field: 'message_count', threshold: 500 },
  msg_1000:    { field: 'message_count', threshold: 1000 },
  sticker_10:  { field: 'sticker_count', threshold: 10 },
  sticker_100: { field: 'sticker_count', threshold: 100 },
  reply_10:    { field: 'reply_count', threshold: 10 },
  reply_100:   { field: 'reply_count', threshold: 100 },
};

// ── Вспомогательные ──────────────────────────────────────────
function getMember(userId, chatId) {
  return db.getMember(userId, chatId);
}

function getUserAchievements(userId, chatId) {
  return db.getUserAchievements(userId, chatId);
}

// ── Синхронизация участников при запуске ───────────────────────
function syncMembers() {
  const data = db.loadDb();
  let synced = 0;
  
  for (const member of data.members) {
    let changed = false;
    
    // Добавляем message_count если отсутствует
    if (member.message_count === undefined) {
      member.message_count = 0;
      changed = true;
    }
    
    // Добавляем coins если отсутствует
    if (member.coins === undefined) {
      member.coins = 0;
      changed = true;
    }
    
    // Добавляем level если отсутствует
    if (member.level === undefined) {
      member.level = 1;
      changed = true;
    }
    
    // Добавляем xp если отсутствует
    if (member.xp === undefined) {
      member.xp = 0;
      changed = true;
    }
    
    // Добавляем sticker_count если отсутствует
    if (member.sticker_count === undefined) {
      member.sticker_count = 0;
      changed = true;
    }
    
    // Добавляем reply_count если отсутствует
    if (member.reply_count === undefined) {
      member.reply_count = 0;
      changed = true;
    }
    
    if (changed) {
      synced++;
    }
  }
  
  if (synced > 0) {
    db.saveDb(data);
    console.log(`[Achievements] Синхронизировано ${synced} участников`);
  }
  
  return synced;
}

// ── Создание профиля участника для чата ───────────────────────
function ensureMemberProfile(userId, chatId) {
  const member = db.upsertMember(userId, chatId);
  if (member) {
    console.log(`[Achievements] Профиль участника создан/обновлён для пользователя ${userId} в чате ${chatId}`);
  }
  return member;
}

function grantAchievement(userId, chatId, achievementId) {
  console.log(`[Achievements] Проверка достижения ${achievementId} для пользователя ${userId} в чате ${chatId}`);
  
  // Проверяем, не выдано ли уже
  if (db.hasUserAchievement(userId, chatId, achievementId)) {
    console.log(`[Achievements] ⚠️ Достижение ${achievementId} уже выдано, пропускаем`);
    return false;
  }
  
  const granted = db.grantUserAchievement(userId, chatId, achievementId);
  if (granted) {
    console.log(`[Achievements] ✅ Выдано достижение ${achievementId} пользователю ${userId} в чате ${chatId}`);
  }
  
  return granted;
}

// ── Увеличить счётчик сообщений ───────────────────────────────
function incrementMessageCount(userId, chatId) {
  const member = db.incrementMemberField(userId, chatId, 'message_count', 1);
  if (member) {
    console.log(`[Achievements] message_count пользователя ${userId} в чате ${chatId}: ${member.message_count}`);
  }
  return member;
}

// ── Проверить и выдать новые достижения ───────────────────────
async function checkAchievements(ctx, userId, chatId, previousStats = {}) {
  const member = getMember(userId, chatId);
  if (!member) return;

  const earned = getUserAchievements(userId, chatId);
  console.log(`[Achievements] Проверка достижений для пользователя ${userId} в чате ${chatId}, message_count: ${member.message_count || 0}, achievements: ${earned.length}`);

  for (const ach of ACHIEVEMENTS) {
    try {
      // Сначала проверяем условия достижения
      if (!ach.check(member)) continue;
      
      // Затем проверяем, не выдано ли уже это достижение
      if (earned.includes(ach.id)) {
        console.log(`[Achievements] ⚠️ Достижение ${ach.id} уже выдано, пропускаем`);
        continue;
      }
      
      const progress = PROGRESS_ACHIEVEMENTS[ach.id];
      const wasAlreadyReached = progress &&
        Number(previousStats[progress.field] || 0) >= progress.threshold;

      const granted = grantAchievement(userId, chatId, ach.id);
      if (!granted) continue;

      // Выдаём награду (coins в member таблице)
      if (ach.reward > 0) {
        db.incrementMemberField(userId, chatId, 'coins', ach.reward);
      }

      if (wasAlreadyReached) {
        console.log(`[Achievements] ${ach.id} добавлено без уведомления: порог был пройден раньше`);
        continue;
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
  // Синхронизируем участников при запуске
  syncMembers();

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
        // Убеждаемся что профиль участника существует для этого чата
        const before = ensureMemberProfile(ctx.from.id, ctx.chat.id) || {};
        const previousStats = {
          message_count: Number(before.message_count || 0),
          sticker_count: Number(before.sticker_count || 0),
          reply_count: Number(before.reply_count || 0),
        };

        // Если у пользователя уже есть сообщения, но достижение first_msg ещё не выдано —
        // значит это старый пользователь (данные были до введения системы достижений).
        // Тихо закрываем все уже достигнутые достижения без уведомления,
        // чтобы они не спамили при следующем сообщении.
        if (previousStats.message_count > 0 && !db.hasUserAchievement(ctx.from.id, ctx.chat.id, 'first_msg')) {
          for (const ach of ACHIEVEMENTS) {
            if (!ach.check(before)) continue;
            if (db.hasUserAchievement(ctx.from.id, ctx.chat.id, ach.id)) continue;
            const silentGranted = db.grantUserAchievement(ctx.from.id, ctx.chat.id, ach.id);
            if (silentGranted) {
              console.log(`[Achievements] Тихая выдача ${ach.id} старому пользователю ${ctx.from.id}`);
            }
          }
        }

        // Сначала увеличиваем счётчик сообщений
        incrementMessageCount(ctx.from.id, ctx.chat.id);
        
        // Триггер: стикер
        if (ctx.message.sticker) {
          db.incrementMemberField(ctx.from.id, ctx.chat.id, 'sticker_count', 1);
          console.log(`[Achievements] sticker_count пользователя ${ctx.from.id} в чате ${ctx.chat.id} увеличен`);
        }
        
        // Триггер: ответ
        if (ctx.message.reply_to_message) {
          db.incrementMemberField(ctx.from.id, ctx.chat.id, 'reply_count', 1);
          console.log(`[Achievements] reply_count пользователя ${ctx.from.id} в чате ${ctx.chat.id} увеличен`);
        }
        
        // Триггер: пересылка
        if (ctx.message.forward_from || ctx.message.forward_from_chat) {
          // Можно добавить достижение для пересылок в будущем
          console.log(`[Achievements] Пользователь ${ctx.from.id} переслал сообщение в чате ${ctx.chat.id}`);
        }
        
        // Затем проверяем достижения
        await checkAchievements(ctx, ctx.from.id, ctx.chat.id, previousStats);
      }
    } catch {}
    return next();
  });

  console.log('✅ Модуль achievements подключён');
}

module.exports = { registerAchievements, checkAchievements, ACHIEVEMENTS, incrementMessageCount };
