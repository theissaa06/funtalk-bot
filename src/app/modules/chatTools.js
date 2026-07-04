const { safeReply } = require('../safeTelegram');
const { randomInt, displayName } = require('../format');

const TOPICS = [
  'Какой момент за неделю был самым смешным?',
  'Какой фильм или сериал стоит посмотреть всем?',
  'Какая привычка реально улучшила день?',
  'Что бы ты добавил в этот чат, чтобы стало веселее?',
  'Какой трек сейчас чаще всего на повторе?',
];

const MEMES = [
  'Когда хотел лечь пораньше, но чат снова ожил.',
  'Админ сказал "последнее предупреждение" и включил режим босса.',
  'Баланс FunMoney маленький, зато амбиции легендарные.',
  'Я не флужу, я тестирую антифлуд.',
  'Пятница ещё не пришла, но настроение уже обновилось.',
];

function registerChatTools(app) {
  const { bot } = app;

  bot.command('ping', async ctx => {
    await safeReply(ctx, 'Pong. Бот на связи.');
  });

  bot.command('id', async ctx => {
    const reply = ctx.message?.reply_to_message?.from;
    const target = reply || ctx.from;
    await safeReply(ctx, `${displayName(target)}\nID: <code>${target.id}</code>\nЧат: <code>${ctx.chat?.id || '-'}</code>`, { parse_mode: 'HTML' });
  });

  bot.command('info', async ctx => {
    if (!ctx.chat) return;
    await safeReply(
      ctx,
      `<b>Информация</b>\nЧат: ${ctx.chat.title || ctx.chat.username || ctx.chat.type}\nID: <code>${ctx.chat.id}</code>\nТип: ${ctx.chat.type}`,
      { parse_mode: 'HTML' }
    );
  });

  bot.command('flip', async ctx => {
    await safeReply(ctx, Math.random() < 0.5 ? 'Орёл.' : 'Решка.');
  });

  bot.command('dice', async ctx => {
    await safeReply(ctx, `Выпало: ${randomInt(1, 6)}.`);
  });

  bot.command('topic', async ctx => {
    await safeReply(ctx, TOPICS[randomInt(0, TOPICS.length - 1)]);
  });

  bot.command('meme', async ctx => {
    await safeReply(ctx, MEMES[randomInt(0, MEMES.length - 1)]);
  });
}

module.exports = {
  registerChatTools,
};
