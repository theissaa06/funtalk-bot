// ============================================================
// src/call.js
// Модуль созыва участников для группы "Клуб случайных людей"
//
// Бот не может принудительно включить push-уведомления,
// если пользователь отключил уведомления или замутил чат.
// Созыв работает через упоминания — Telegram отправляет
// уведомление только если пользователь не замутил чат.
// ============================================================

const db      = require('./db');
const { getRandom } = require('./utils');

// ── Cooldown: один чат не чаще 1 раза в 5 минут ──────────────
const callCooldowns = new Map();
const COOLDOWN_MS   = 5 * 60 * 1000; // 5 минут

// ── Размер чанка упоминаний ───────────────────────────────────
const CHUNK_SIZE  = 20;
const CHUNK_DELAY = 800; // мс между чанками

// ── Варианты вступительного текста ───────────────────────────
const introTexts = [
  '🔥 Клуб случайных людей, общий сбор!\nКто онлайн — залетайте в чат 😄',
  '📢 Народ, залетаем в чат! Все сюда 👇',
  '⚡ Срочный созыв участников!\nОткликнитесь, кто в сети 👀',
  '🎉 Все сюда — начинается движ!\nЖдём всех в чате 🚀',
  '🗣 Клуб, ауу! Время пообщаться 😎\nКто здесь — отзовись!',
  '💥 Общий сбор!\nВылезаем из режима тишины 👋',
];

// ── Пауза ─────────────────────────────────────────────────────
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ── Проверка: является ли пользователь админом чата ──────────
async function isChatAdmin(ctx, userId) {
  try {
    const member = await ctx.telegram.getChatMember(ctx.chat.id, userId);
    return member.status === 'creator' || member.status === 'administrator';
  } catch (err) {
    console.error('[call:isChatAdmin]', err.message);
    return false;
  }
}

// ── Форматировать имя администратора ─────────────────────────
function formatAdminName(user) {
  if (!user) return 'Администратор';
  if (user.username) return `@${user.username}`;
  return [user.first_name, user.last_name].filter(Boolean).join(' ') || 'Администратор';
}

// ── Форматировать упоминание участника ───────────────────────
// @username если есть, иначе HTML-ссылка на профиль
function formatMention(user) {
  if (user.username) {
    return `@${user.username}`;
  }
  const name = user.first_name || `Участник`;
  return `<a href="tg://user?id=${user.id}">${name}</a>`;
}

// ── Разбить массив на чанки ───────────────────────────────────
function chunkArray(arr, size) {
  const chunks = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

// ─────────────────────────────────────────────────────────────
// Регистрация команд
// ─────────────────────────────────────────────────────────────
function register(bot) {

  // Обрабатываем все варианты команды
  bot.command(['call', 'калл', 'созыв', 'online', 'все'], async (ctx) => {

    // 1. Только группы
    if (ctx.chat.type === 'private') {
      return ctx.reply('📢 Созыв работает только в группах.');
    }

    // 2. Только администраторы
    const adminOk = await isChatAdmin(ctx, ctx.from.id);
    if (!adminOk) {
      return ctx.reply('⛔ Созыв могут делать только администраторы чата.');
    }

    // 3. Cooldown — не чаще раза в 5 минут
    const chatId  = ctx.chat.id;
    const now     = Date.now();
    const lastCall = callCooldowns.get(chatId) || 0;
    const elapsed  = now - lastCall;

    if (elapsed < COOLDOWN_MS) {
      const remainSec = Math.ceil((COOLDOWN_MS - elapsed) / 1000);
      return ctx.reply(`⏳ Созыв уже был недавно. Подожди ещё <b>${remainSec} сек.</b>`, {
        parse_mode: 'HTML',
      });
    }

    // 4. Парсим причину (всё после команды)
    const rawText = ctx.message.text || '';
    // Убираем команду + имя бота (если /call@botname)
    const reason = rawText.replace(/^\/\S+\s*/, '').trim();

    // 5. Берём участников из базы
    let users = [];
    try {
      users = db.prepare(
        `SELECT id, username, first_name
         FROM users
         WHERE chat_id = ?
         ORDER BY last_active DESC
         LIMIT 100`
      ).all(chatId);
    } catch (err) {
      console.error('[call] Ошибка чтения базы:', err.message);
      return ctx.reply('❌ Не удалось загрузить список участников.');
    }

    // 6. Фильтрация: не звать самого администратора и ботов
    const callerId = ctx.from.id;
    const filtered = users.filter(u => {
      if (!u.id)           return false; // нет id
      if (u.id === callerId) return false; // сам администратор
      return true;
    });

    if (filtered.length === 0) {
      return ctx.reply(
        '📭 Пока некого звать.\n\n' +
        'Участники появятся в списке после того, как напишут хотя бы одно сообщение в чат.'
      );
    }

    // 7. Ставим cooldown
    callCooldowns.set(chatId, now);

    // 8. Отправляем вступительное сообщение
    const adminName = formatAdminName(ctx.from);
    const intro     = getRandom(introTexts);

    let headerText =
      `📢 <b>Созыв от администратора ${adminName}</b>\n\n`;

    if (reason) {
      headerText += `📝 <b>Причина:</b> ${reason}\n\n`;
    }

    headerText += intro;

    await ctx.reply(headerText, { parse_mode: 'HTML' });

    // 9. Отправляем упоминания чанками
    const chunks = chunkArray(filtered, CHUNK_SIZE);

    for (let i = 0; i < chunks.length; i++) {
      const chunk     = chunks[i];
      const mentions  = chunk.map(formatMention).join(' ');

      // Небольшой заголовок у первого чанка
      const prefix = chunks.length > 1
        ? `<b>Часть ${i + 1}/${chunks.length}:</b>\n`
        : '';

      await ctx.reply(prefix + mentions, {
        parse_mode: 'HTML',
        disable_notification: false, // важно: уведомления включены
      });

      // Пауза между чанками чтобы не словить rate limit
      if (i < chunks.length - 1) {
        await sleep(CHUNK_DELAY);
      }
    }

    // 10. Итоговое сообщение
    await ctx.reply(
      `✅ Созыв отправлен — упомянуто <b>${filtered.length}</b> участников.`,
      { parse_mode: 'HTML' }
    );

    console.log(
      `[call] Созыв в чате ${chatId} от ${callerId}: ${filtered.length} участников`
    );
  });

  console.log('✅ Модуль call подключён');
}

module.exports = { register };
