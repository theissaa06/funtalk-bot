// ============================================================
// src/bot/achievements.js
// Система достижений
//
// ХРАНИЛИЩЕ: data.chats[chatId].users[userId].granted_achievements[]
// Это поле сохраняется между деплоями Railway (секция chats не сбрасывается).
//
// ЗАЩИТА ОТ ПОВТОРНОЙ ВЫДАЧИ:
//   1. In-memory Set initializedUsers — мгновенная проверка без чтения файла
//   2. Метка '_ach_init' в granted_achievements — сохраняется между перезапусками
//   3. statsBeforeIncrement — для прогрессивных ачивок проверяем что порог
//      пройден ИМЕННО этим сообщением, а не раньше
// ============================================================

const { Markup } = require('telegraf');
const db = require('../database/db');
const { formatName } = require('../utils');

// In-memory: ключ = `${userId}:${chatId}`, значение = true
// Защищает от race condition когда два сообщения приходят одновременно
const initializedUsers = new Set();

// ── Список достижений ─────────────────────────────────────────
const ACHIEVEMENTS = [
  { id: 'first_msg',    name: '👋 Первый шаг',    desc: 'Написал первое сообщение в чате',  reward: 20,   check: (u) => (u.message_count || 0) >= 1 },
  { id: 'msg_10',       name: '💬 Болтун',         desc: '10 сообщений в чате',             reward: 30,   check: (u) => (u.message_count || 0) >= 10 },
  { id: 'msg_100',      name: '🗣 Активист',       desc: '100 сообщений в чате',            reward: 100,  check: (u) => (u.message_count || 0) >= 100 },
  { id: 'msg_500',      name: '📢 Голос чата',     desc: '500 сообщений в чате',            reward: 300,  check: (u) => (u.message_count || 0) >= 500 },
  { id: 'msg_1000',     name: '🏆 Легенда чата',   desc: '1000 сообщений в чате',           reward: 1000, check: (u) => (u.message_count || 0) >= 1000 },
  { id: 'sticker_10',   name: '😎 Стикероман',     desc: 'Отправил 10 стикеров',            reward: 30,   check: (u) => (u.sticker_count || 0) >= 10 },
  { id: 'sticker_100',  name: '🎨 Художник',       desc: 'Отправил 100 стикеров',           reward: 200,  check: (u) => (u.sticker_count || 0) >= 100 },
  { id: 'reply_10',     name: '💬 Отвечающий',     desc: 'Ответил 10 раз',                  reward: 30,   check: (u) => (u.reply_count || 0) >= 10 },
  { id: 'reply_100',    name: '🗣 Диалогист',      desc: 'Ответил 100 раз',                 reward: 200,  check: (u) => (u.reply_count || 0) >= 100 },
  { id: 'level_5',      name: '🥉 Участник',       desc: 'Достиг 5 уровня',                 reward: 50,   check: (u) => (u.level || 1) >= 5 },
  { id: 'level_10',     name: '🥈 Опытный',        desc: 'Достиг 10 уровня',                reward: 150,  check: (u) => (u.level || 1) >= 10 },
  { id: 'level_20',     name: '🥇 Про',            desc: 'Достиг 20 уровня',                reward: 400,  check: (u) => (u.level || 1) >= 20 },
  { id: 'level_30',     name: '💎 Эксперт',        desc: 'Достиг 30 уровня',                reward: 800,  check: (u) => (u.level || 1) >= 30 },
  { id: 'level_50',     name: '👑 Легенда',        desc: 'Достиг 50 уровня',                reward: 2000, check: (u) => (u.level || 1) >= 50 },
  { id: 'coins_100',    name: '💰 Копилка',        desc: 'Накопил 100 монет',               reward: 0,    check: (u) => (u.coins || 0) >= 100 },
  { id: 'coins_1000',   name: '💎 Богач',          desc: 'Накопил 1000 монет',              reward: 50,   check: (u) => (u.coins || 0) >= 1000 },
  { id: 'coins_5000',   name: '🤑 Миллионер',      desc: 'Накопил 5000 монет',              reward: 200,  check: (u) => (u.coins || 0) >= 5000 },
  { id: 'first_friend', name: '🤝 Первый друг',    desc: 'Завёл первого друга',             reward: 30,   check: (u) => (u.friends_count || 0) >= 1 },
  { id: 'friends_5',    name: '👥 Компания',       desc: '5 друзей в чате',                 reward: 100,  check: (u) => (u.friends_count || 0) >= 5 },
  { id: 'in_love',      name: '❤️ Влюблённый',     desc: 'Нашёл пару',                      reward: 50,   check: (u) => u.in_couple === true },
  { id: 'rep_10',       name: '⭐ Уважаемый',      desc: 'Получил 10 репутации',            reward: 100,  check: (u) => (u.reputation || 0) >= 10 },
  { id: 'rep_50',       name: '🌟 Авторитет',      desc: 'Получил 50 репутации',            reward: 500,  check: (u) => (u.reputation || 0) >= 50 },
  { id: 'first_casino', name: '🎰 Игрок',          desc: 'Сыграл в казино первый раз',      reward: 20,   check: (u) => (u.casino_games || 0) >= 1 },
  { id: 'casino_win',   name: '🤑 Везунчик',       desc: 'Выиграл в казино',                reward: 50,   check: (u) => (u.casino_wins || 0) >= 1 },
  { id: 'duel_win',     name: '⚔️ Дуэлянт',        desc: 'Победил в дуэли',                 reward: 75,   check: (u) => (u.duel_wins || 0) >= 1 },
  { id: 'duel_5',       name: '🗡 Непобедимый',    desc: 'Победил в 5 дуэлях',              reward: 200,  check: (u) => (u.duel_wins || 0) >= 5 },
  { id: 'daily_7',      name: '📅 Постоянный',     desc: '7 дней подряд получал бонус',     reward: 200,  check: (u) => (u.daily_streak || 0) >= 7 },
  { id: 'daily_30',     name: '🗓 Преданный',      desc: '30 дней подряд получал бонус',    reward: 1000, check: (u) => (u.daily_streak || 0) >= 30 },
  { id: 'shop_buyer',   name: '🛍 Покупатель',     desc: 'Купил что-то в магазине',         reward: 30,   check: (u) => (u.inventory || []).length >= 1 },
];

// Прогрессивные ачивки: выдаются только если порог пройден ИМЕННО этим действием
const PROGRESS_THRESHOLDS = {
  first_msg:   { field: 'message_count', threshold: 1 },
  msg_10:      { field: 'message_count', threshold: 10 },
  msg_100:     { field: 'message_count', threshold: 100 },
  msg_500:     { field: 'message_count', threshold: 500 },
  msg_1000:    { field: 'message_count', threshold: 1000 },
  sticker_10:  { field: 'sticker_count', threshold: 10 },
  sticker_100: { field: 'sticker_count', threshold: 100 },
  reply_10:    { field: 'reply_count',   threshold: 10 },
  reply_100:   { field: 'reply_count',   threshold: 100 },
};

// ── Хранилище: data.chats[chatId].users[userId].granted_achievements ──
function isGranted(userId, chatId, achievementId) {
  return db.hasChatUserAchievement(userId, chatId, achievementId);
}

function doGrant(userId, chatId, achievementId) {
  return db.grantChatUserAchievement(userId, chatId, achievementId);
}

function getEarned(userId, chatId) {
  return db.getChatUserAchievements(userId, chatId)
    .filter(id => id !== '_ach_init');
}

// ── Тихая инициализация старых пользователей ─────────────────
// Вызывается один раз на пользователя в чате.
// Если у него уже есть история — тихо закрываем все достигнутые ачивки.
function silentInitIfNeeded(userId, chatId, memberSnapshot) {
  const key = `${userId}:${chatId}`;

  // Быстрая in-memory проверка (защита от race condition)
  if (initializedUsers.has(key)) return;

  // Проверяем в файле (сохраняется между перезапусками)
  if (isGranted(userId, chatId, '_ach_init')) {
    initializedUsers.add(key); // кешируем
    return;
  }

  // Помечаем сразу в памяти — блокируем повторный вход
  initializedUsers.add(key);

  // Записываем метку в файл
  doGrant(userId, chatId, '_ach_init');

  const msgCount = Number(memberSnapshot.message_count || 0);
  if (msgCount === 0) {
    console.log(`[Achievements] Новый пользователь ${userId} в чате ${chatId}`);
    return;
  }

  // Старый пользователь — тихо закрываем всё уже достигнутое
  console.log(`[Achievements] Старый пользователь ${userId} (${msgCount} сообщений) — тихая инициализация`);
  const globalCoins = db.getCoins(userId);
  const checkData = { ...memberSnapshot, coins: globalCoins };
  let count = 0;
  for (const ach of ACHIEVEMENTS) {
    if (!ach.check(checkData)) continue;
    if (isGranted(userId, chatId, ach.id)) continue;
    doGrant(userId, chatId, ach.id);
    count++;
  }
  console.log(`[Achievements] Тихо закрыто ${count} достижений для ${userId}`);
}

// ── Проверить и выдать новые достижения ───────────────────────
// statsBeforeIncrement — счётчики ДО текущего сообщения
async function checkAchievements(ctx, userId, chatId, statsBeforeIncrement) {
  try {
    const member = db.getMember(userId, chatId);
    if (!member) return;

    const globalCoins = db.getCoins(userId);
    const checkData = { ...member, coins: globalCoins };

    for (const ach of ACHIEVEMENTS) {
      try {
        if (!ach.check(checkData)) continue;
        if (isGranted(userId, chatId, ach.id)) continue;

        // Прогрессивная проверка: порог должен быть пройден СЕЙЧАС
        const prog = PROGRESS_THRESHOLDS[ach.id];
        if (prog) {
          const before = Number(statsBeforeIncrement[prog.field] || 0);
          const after = Number(checkData[prog.field] || 0);
          
          // Если порог был пройден ДО этого сообщения — пропускаем (уже было)
          if (before >= prog.threshold) {
            continue;
          }
          
          // Если порог не пройден даже ПОСЛЕ этого сообщения — пропускаем
          if (after < prog.threshold) {
            continue;
          }
          
          // Иначе: порог пройден ИМЕННО этим сообщением — выдаём
        }

        const granted = doGrant(userId, chatId, ach.id);
        if (!granted) continue;

        // Награда — в глобальный баланс (тот же что магазин и /coins)
        if (ach.reward > 0) {
          db.addCoins(userId, ach.reward);
        }

        await ctx.reply(
          `🏆 <b>Новое достижение!</b>\n\n` +
          `${ach.name}\n` +
          `📝 ${ach.desc}\n` +
          (ach.reward > 0 ? `💰 Награда: <b>+${ach.reward} монет</b>` : ''),
          { parse_mode: 'HTML' }
        );
      } catch (e) {
        console.error(`[Achievements] ошибка при ${ach.id}:`, e.message);
      }
    }
  } catch (e) {
    console.error('[Achievements] checkAchievements:', e.message);
  }
}

// ── Регистрация ───────────────────────────────────────────────
function registerAchievements(bot) {

  // /achievements — список достижений
  bot.command(['achievements', 'ачивки', 'достижения'], async (ctx) => {
    const chatId = ctx.chat.type === 'private' ? ctx.from.id : ctx.chat.id;
    const earned = getEarned(ctx.from.id, chatId);

    const lines = ACHIEVEMENTS.map(ach => {
      const done = earned.includes(ach.id);
      return `${done ? '✅' : '⬜'} ${ach.name} — ${ach.desc}${ach.reward > 0 ? ` (+${ach.reward}💰)` : ''}`;
    });

    const total = ACHIEVEMENTS.length;
    const done  = earned.length;
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
    const earned = getEarned(ctx.from.id, chatId);

    const lines = ACHIEVEMENTS.map(ach => {
      const done = earned.includes(ach.id);
      return `${done ? '✅' : '⬜'} ${ach.name} — ${ach.desc}${ach.reward > 0 ? ` (+${ach.reward}💰)` : ''}`;
    });

    const perPage = 12;
    const start   = page * perPage;
    const slice   = lines.slice(start, start + perPage);
    const total   = Math.ceil(lines.length / perPage);

    const nav = [];
    if (page > 0)         nav.push(Markup.button.callback('⬅️', `ach_page_${page - 1}`));
    if (page < total - 1) nav.push(Markup.button.callback('➡️', `ach_page_${page + 1}`));

    await ctx.editMessageText(
      `🏆 <b>Достижения</b> (стр. ${page + 1}/${total})\n\n${slice.join('\n')}`,
      {
        parse_mode: 'HTML',
        ...Markup.inlineKeyboard(nav.length ? [nav] : []),
      }
    );
  });

  // Обработчик каждого сообщения
  bot.on('message', async (ctx, next) => {
    try {
      if (ctx.from && !ctx.from.is_bot && ctx.chat?.type !== 'private') {
        const userId = ctx.from.id;
        const chatId = ctx.chat.id;

        // Получаем снимок ДО любых изменений
        // Используем getMember чтобы не перезаписывать данные через upsertMember на каждом сообщении
        let memberBefore = db.getMember(userId, chatId);
        if (!memberBefore) {
          // Первый раз — создаём через upsertMember (включает миграцию legacy данных)
          memberBefore = db.upsertMember(userId, chatId) || {};
        }

        const statsBeforeIncrement = {
          message_count: Number(memberBefore.message_count || 0),
          sticker_count: Number(memberBefore.sticker_count || 0),
          reply_count:   Number(memberBefore.reply_count   || 0),
        };

        // Тихая инициализация (один раз на пользователя)
        silentInitIfNeeded(userId, chatId, memberBefore);

        // Увеличиваем счётчики
        db.incrementMemberField(userId, chatId, 'message_count', 1);

        if (ctx.message.sticker) {
          db.incrementMemberField(userId, chatId, 'sticker_count', 1);
        }
        if (ctx.message.reply_to_message) {
          db.incrementMemberField(userId, chatId, 'reply_count', 1);
        }

        // Проверяем новые достижения
        await checkAchievements(ctx, userId, chatId, statsBeforeIncrement);
      }
    } catch (e) {
      console.error('[Achievements] message handler:', e.message);
    }
    return next();
  });

  console.log('✅ Модуль achievements подключён');
}

module.exports = { registerAchievements, checkAchievements, ACHIEVEMENTS };
