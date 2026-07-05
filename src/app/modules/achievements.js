const { Markup } = require('telegraf');
const { safeEditOrReply, safeReply } = require('../safeTelegram');
const { formatMoney } = require('../format');

const RARITY = {
  common: { label: 'обычная', reward: 25 },
  uncommon: { label: 'необычная', reward: 50 },
  rare: { label: 'редкая', reward: 100 },
  epic: { label: 'эпическая', reward: 200 },
  legendary: { label: 'легендарная', reward: 500 },
};

const ACHIEVEMENTS = [
  {
    id: 'first_message',
    title: 'Первый голос',
    rarity: 'common',
    description: 'Написать первое сообщение в группе.',
    event: 'chat.message',
    statKey: 'messages_total',
    isMet: ({ stats }) => stats.messages_total >= 1,
  },
  {
    id: 'chat_regular',
    title: 'Свой человек',
    rarity: 'uncommon',
    description: 'Написать 50 сообщений.',
    event: 'chat.message',
    statKey: 'messages_total',
    isMet: ({ stats }) => stats.messages_total >= 50,
  },
  {
    id: 'chat_engine',
    title: 'Двигатель чата',
    rarity: 'rare',
    description: 'Написать 250 сообщений.',
    event: 'chat.message',
    statKey: 'messages_total',
    isMet: ({ stats }) => stats.messages_total >= 250,
  },
  {
    id: 'daily_first',
    title: 'Первый daily',
    rarity: 'common',
    description: 'Забрать ежедневный бонус.',
    event: 'economy.daily',
    isMet: ({ payload }) => Number(payload.streak || 0) >= 1,
  },
  {
    id: 'daily_week',
    title: 'Неделя дисциплины',
    rarity: 'rare',
    description: 'Собрать daily-стрик 7 дней.',
    event: 'economy.daily',
    isMet: ({ payload }) => Number(payload.streak || 0) >= 7,
  },
  {
    id: 'first_purchase',
    title: 'Покупатель',
    rarity: 'common',
    description: 'Купить первый предмет в магазине.',
    event: 'shop.item_bought',
    statKey: 'shop_purchases',
    isMet: ({ stats }) => stats.shop_purchases >= 1,
  },
  {
    id: 'loot_luck',
    title: 'Охотник за лутом',
    rarity: 'uncommon',
    description: 'Открыть первый лутбокс.',
    event: 'shop.lootbox_opened',
    statKey: 'lootboxes_opened',
    isMet: ({ stats }) => stats.lootboxes_opened >= 1,
  },
  {
    id: 'item_tactician',
    title: 'Тактик',
    rarity: 'uncommon',
    description: 'Использовать предмет из инвентаря.',
    event: 'shop.item_used',
    statKey: 'items_used',
    isMet: ({ stats }) => stats.items_used >= 1,
  },
  {
    id: 'first_game_win',
    title: 'Первая победа',
    rarity: 'common',
    description: 'Выиграть мини-игру.',
    event: 'game.finished',
    statKey: 'game_wins',
    isMet: ({ payload, stats }) => Number(payload.win || 0) > 0 && stats.game_wins >= 1,
  },
  {
    id: 'game_streak',
    title: 'Игровой разгон',
    rarity: 'epic',
    description: 'Выиграть 10 мини-игр.',
    event: 'game.finished',
    statKey: 'game_wins',
    isMet: ({ stats }) => stats.game_wins >= 10,
  },
];

const byId = new Map(ACHIEVEMENTS.map(item => [item.id, item]));

function achievementKeyboard() {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback('Профиль', 'profile:main'),
      Markup.button.callback('Магазин', 'shop:page:0'),
    ],
    [Markup.button.callback('Меню', 'menu:home')],
  ]);
}

function achievementLines(app, telegramId) {
  const granted = new Map(app.repos.economy.listAchievements(telegramId).map(item => [item.id, item]));
  return ACHIEVEMENTS.map(item => {
    const info = RARITY[item.rarity] || RARITY.common;
    const grant = granted.get(item.id);
    const marker = grant ? 'получено' : 'закрыто';
    return `<b>${item.title}</b> · ${info.label} · ${marker}\n${item.description}${grant ? `\nПолучено: ${grant.grantedAt.slice(0, 10)}` : ''}`;
  });
}

function achievementsText(app, telegramId) {
  const earned = app.repos.economy.listAchievements(telegramId).length;
  return [
    '<b>Ачивки FunTalk</b>',
    `Получено: <b>${earned}/${ACHIEVEMENTS.length}</b>`,
    '',
    ...achievementLines(app, telegramId),
  ].join('\n\n');
}

function getStats(app, telegramId) {
  return app.repos.economy.getUser(telegramId)?.achievementStats || {};
}

async function grantAndToast(app, telegramId, achievement, payload = {}) {
  const rarity = RARITY[achievement.rarity] || RARITY.common;
  const result = app.repos.economy.grantAchievementWithReward(telegramId, achievement.id, rarity.reward, {
    byTelegramId: null,
    chatId: payload.chatId || payload.meta?.chatId || null,
    reason: achievement.id,
  });
  if (!result.ok || !result.granted) return;

  const chatId = payload.chatId || payload.meta?.chatId || null;
  if (!chatId) return;

  try {
    await app.bot.telegram.sendMessage(
      chatId,
      [
        '<b>Новая ачивка!</b>',
        `<b>${achievement.title}</b> · ${rarity.label}`,
        achievement.description,
        `Награда: <b>+${formatMoney(rarity.reward)}</b>`,
      ].join('\n'),
      { parse_mode: 'HTML' }
    );
  } catch (error) {
    app.logger.warn('achievement toast failed:', error.message);
  }
}

async function handleAchievementEvent(app, eventName, payload = {}) {
  const telegramId = payload.telegramId || payload.fromTelegramId || payload.toTelegramId;
  if (!telegramId) return;

  // При первом событии chat.message проверяем: если у пользователя в moderation store
  // уже есть messageCount > 0, но achievementStats.messages_total = 0 — значит это
  // старый пользователь после деплоя Railway (economy_store.json был сброшен).
  // Тихо восстанавливаем stats и закрываем все уже достигнутые ачивки без уведомления.
  if (eventName === 'chat.message') {
    const chatId = payload.chatId;
    const member = chatId ? app.repos.moderation.getMember(chatId, telegramId) : null;
    const existingMsgCount = Number(member?.messageCount || 0);
    const currentStatCount = app.repos.economy.getAchievementStat(telegramId, 'messages_total');

    if (existingMsgCount > 1 && currentStatCount <= 1) {
      // Пользователь старый — восстанавливаем счётчик
      const gap = existingMsgCount - currentStatCount;
      if (gap > 0) {
        app.repos.economy.incrementAchievementStat(telegramId, 'messages_total', gap);
      }
      // Тихо закрываем все уже достигнутые ачивки
      const restoredStats = app.repos.economy.getUser(telegramId)?.achievementStats || {};
      for (const ach of ACHIEVEMENTS) {
        if (app.repos.economy.hasAchievement(telegramId, ach.id)) continue;
        if (ach.isMet({ payload, stats: restoredStats, app })) {
          app.repos.economy.grantAchievement(telegramId, ach.id);
          // Без уведомления и без монет
        }
      }
      return; // не выдаём уведомлений в этом вызове
    }
  }

  const candidates = ACHIEVEMENTS.filter(item => item.event === eventName);
  const statKeys = [...new Set(candidates.map(item => item.statKey).filter(Boolean))];
  for (const statKey of statKeys) {
    if (statKey === 'game_wins' && Number(payload.win || 0) <= 0) continue;
    app.repos.economy.incrementAchievementStat(telegramId, statKey, 1);
  }

  for (const achievement of candidates) {
    if (app.repos.economy.hasAchievement(telegramId, achievement.id)) continue;

    const stats = getStats(app, telegramId);
    if (achievement.isMet({ payload, stats, app })) {
      await grantAndToast(app, telegramId, achievement, payload);
    }
  }
}

function registerAchievements(app) {
  app.renderers.achievements = async ctx => {
    await safeEditOrReply(ctx, achievementsText(app, ctx.from.id), { parse_mode: 'HTML', ...achievementKeyboard() });
  };

  app.bot.command(['achievements', 'ach', 'ачивки', 'достижения'], async ctx => {
    await safeReply(ctx, achievementsText(app, ctx.from.id), { parse_mode: 'HTML', ...achievementKeyboard() });
  });

  app.callbackRouter.on('achievements', async ctx => {
    await app.renderers.achievements(ctx);
  });

  for (const eventName of [...new Set(ACHIEVEMENTS.map(item => item.event))]) {
    app.eventBus.on(eventName, payload => handleAchievementEvent(app, eventName, payload));
  }
}

module.exports = {
  registerAchievements,
  ACHIEVEMENTS,
  achievementsText,
};
