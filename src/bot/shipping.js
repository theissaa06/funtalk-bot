// ============================================================
// src/bot/shipping.js
// Шиппинг: случайные пары и шип друзей
//
// Команды:
//   /шипперим — зашипить случайную пару из чата
//   /шипдрузей — зашипить двух случайных друзей
//
// Кнопки:
//   💞 Зашипить пару   — в главном меню
//   👫 Шип друзей      — в главном меню
// ============================================================

const { Markup } = require('telegraf');
const db = require('../db');

// ── Фразы для шиппинга пар ────────────────────────────────────
const SHIP_PHRASES = [
  '💞 Алгоритм не врёт — эти двое созданы друг для друга!',
  '🔥 Искра между ними такая, что даже бот почувствовал!',
  '💘 Вселенная давно намекала, а теперь официально!',
  '✨ Идеальное совпадение по всем параметрам!',
  '🌹 Романтика неизбежна — сопротивляться бесполезно!',
  '💫 Звёзды сошлись именно для этой пары!',
  '🎯 Стрела Купидона попала точно в цель!',
  '🌈 Эти двое — как два пазла, которые идеально подходят!',
  '💝 Бот официально объявляет их парой чата!',
  '🦋 Что-то в воздухе витает... и это любовь!',
  '🎪 Дамы и господа, встречайте новую пару чата!',
  '🌸 Нежность и тепло — именно это их объединяет!',
];

// ── Фразы для шиппинга друзей ─────────────────────────────────
const FRIEND_SHIP_PHRASES = [
  '🤝 Эти двое — лучшие друзья, которые ещё не знают об этом!',
  '👊 Дружба на века — бот гарантирует!',
  '🎮 Идеальные напарники для любых приключений!',
  '🍕 Эти двое точно делили бы последний кусок пиццы!',
  '🎯 Лучший дуэт чата по версии FunTalk Bot!',
  '🌟 Вместе они непобедимы — это факт!',
  '🎭 Комедийный дуэт, который чат заслуживает!',
  '🔥 Эти двое зажгут любую вечеринку!',
  '💪 Команда мечты — официально!',
  '🎵 Они на одной волне, даже если не знают об этом!',
  '🏆 Золотой дуэт чата — по мнению алгоритма!',
  '🌈 Дружба этих двоих — легенда, которую ещё предстоит написать!',
];

// ── Эмодзи совместимости ──────────────────────────────────────
const COMPAT_EMOJIS = ['💔', '❤️‍🔥', '💛', '💚', '💙', '💜', '🖤', '🤍', '💗', '💖', '💝', '❤️'];

function getRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

// ── Получить имя пользователя для отображения ─────────────────
function displayName(user) {
  if (!user) return 'Участник';
  if (user.username) return `@${user.username}`;
  return user.first_name || `Участник`;
}

// ── HTML-ссылка на пользователя ───────────────────────────────
function mentionHtml(user) {
  if (!user) return 'Участник';
  const name = user.first_name || user.username || 'Участник';
  const escaped = name.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return `<a href="tg://user?id=${user.id}">${escaped}</a>`;
}

// ── Прогресс-бар совместимости ────────────────────────────────
function compatBar(percent) {
  const filled = Math.round(percent / 10);
  const empty  = 10 - filled;
  return '❤️'.repeat(filled) + '🖤'.repeat(empty);
}

// ── Получить участников чата из базы ─────────────────────────
function getChatUsers(chatId) {
  try {
    return db.prepare(
      `SELECT id, username, first_name FROM users WHERE chat_id = ? ORDER BY last_active DESC LIMIT 200`
    ).all(chatId);
  } catch {
    return [];
  }
}

// ── Получить друзей пользователя из базы ─────────────────────
// Дружба хранится в database.json (src/database/db.js) через index.js
// Но у нас нет прямого доступа к friendships оттуда.
// Поэтому шип друзей берёт двух случайных активных участников чата
// и называет их "лучшими друзьями" — это весёлый формат.
function getTwoRandom(users, excludeId) {
  const pool = users.filter(u => u.id !== excludeId);
  if (pool.length < 2) return null;

  // Перемешиваем
  const shuffled = [...pool].sort(() => Math.random() - 0.5);
  return [shuffled[0], shuffled[1]];
}

// ── Сформировать сообщение шиппинга пары ─────────────────────
function buildShipMessage(userA, userB, isCouple = true) {
  const compat = Math.floor(Math.random() * 41) + 60; // 60–100%
  const emoji  = COMPAT_EMOJIS[Math.floor(compat / 10) - 1] || '❤️';
  const phrase = isCouple ? getRandom(SHIP_PHRASES) : getRandom(FRIEND_SHIP_PHRASES);
  const bar    = compatBar(compat);
  const title  = isCouple ? '💞 Шиппинг пары' : '👫 Шип друзей';
  const label  = isCouple ? 'Совместимость' : 'Дружба';

  return (
    `${title}\n\n` +
    `${mentionHtml(userA)} ${emoji} ${mentionHtml(userB)}\n\n` +
    `${bar}\n` +
    `${label}: <b>${compat}%</b>\n\n` +
    `${phrase}`
  );
}

// ── Inline-кнопки для шиппинга ────────────────────────────────
function shipButtons(type) {
  return Markup.inlineKeyboard([
    [Markup.button.callback('🔄 Зашипить ещё раз', `ship_again_${type}`)],
  ]);
}

// ── Публичные функции для вызова из menu.js ──────────────────
async function shipCouple(ctx) {
  const users = getChatUsers(ctx.chat.id);
  const pair  = getTwoRandom(users, null);
  if (!pair) {
    return ctx.reply('😅 Маловато участников для шиппинга. Нужно хотя бы 2 человека в базе!');
  }
  await ctx.reply(
    buildShipMessage(pair[0], pair[1], true),
    { parse_mode: 'HTML', ...shipButtons('couple') }
  );
}

async function shipFriends(ctx) {
  const users = getChatUsers(ctx.chat.id);
  const pair  = getTwoRandom(users, null);
  if (!pair) {
    return ctx.reply('😅 Маловато участников. Нужно хотя бы 2 человека в базе!');
  }
  await ctx.reply(
    buildShipMessage(pair[0], pair[1], false),
    { parse_mode: 'HTML', ...shipButtons('friends') }
  );
}

// ── Регистрация команд и кнопок ───────────────────────────────
function registerShipping(bot) {

  // ── /шипперим — шип случайной пары ───────────────────────────
  bot.command(['шипперим', 'ship', 'шип', 'шиппинг'], async (ctx) => {
    if (ctx.chat.type === 'private') {
      return ctx.reply('💞 Шиппинг работает только в группах — там есть кого шипперить!');
    }

    const users = getChatUsers(ctx.chat.id);
    const pair  = getTwoRandom(users, null);

    if (!pair) {
      return ctx.reply('😅 Маловато участников для шиппинга. Нужно хотя бы 2 человека в базе!');
    }

    await ctx.reply(
      buildShipMessage(pair[0], pair[1], true),
      { parse_mode: 'HTML', ...shipButtons('couple') }
    );
  });

  // ── /шипдрузей — шип двух "лучших друзей" ────────────────────
  bot.command(['шипдрузей', 'shipfriends', 'шипфренды', 'друзья'], async (ctx) => {
    if (ctx.chat.type === 'private') {
      return ctx.reply('👫 Шип друзей работает только в группах!');
    }

    const users = getChatUsers(ctx.chat.id);
    const pair  = getTwoRandom(users, null);

    if (!pair) {
      return ctx.reply('😅 Маловато участников. Нужно хотя бы 2 человека в базе!');
    }

    await ctx.reply(
      buildShipMessage(pair[0], pair[1], false),
      { parse_mode: 'HTML', ...shipButtons('friends') }
    );
  });

  // ── Кнопка "Зашипить ещё раз" — пара ─────────────────────────
  bot.action('ship_again_couple', async (ctx) => {
    await ctx.answerCbQuery('🔄 Шиппим...');

    if (ctx.chat.type === 'private') return;

    const users = getChatUsers(ctx.chat.id);
    const pair  = getTwoRandom(users, null);

    if (!pair) {
      return ctx.answerCbQuery('😅 Маловато участников!', { show_alert: true });
    }

    await ctx.editMessageText(
      buildShipMessage(pair[0], pair[1], true),
      { parse_mode: 'HTML', ...shipButtons('couple') }
    );
  });

  // ── Кнопка "Зашипить ещё раз" — друзья ───────────────────────
  bot.action('ship_again_friends', async (ctx) => {
    await ctx.answerCbQuery('🔄 Шиппим...');

    if (ctx.chat.type === 'private') return;

    const users = getChatUsers(ctx.chat.id);
    const pair  = getTwoRandom(users, null);

    if (!pair) {
      return ctx.answerCbQuery('😅 Маловато участников!', { show_alert: true });
    }

    await ctx.editMessageText(
      buildShipMessage(pair[0], pair[1], false),
      { parse_mode: 'HTML', ...shipButtons('friends') }
    );
  });

  console.log('✅ Модуль shipping подключён');
}

module.exports = { registerShipping, shipCouple, shipFriends };
