const { Markup } = require('telegraf');
const { memePhrases, memeReactions, memeReplies } = require('../../data/memes');
const { safeEditOrReply, safeReply } = require('../safeTelegram');
const { escapeHtml } = require('../format');

const recentByUser = new Map();
const RECENT_LIMIT = 5;

function memePool() {
  return [
    ...memePhrases.map(text => ({ type: 'Фраза', text })),
    ...memeReactions.map(text => ({ type: 'Реакция', text })),
    ...memeReplies.map(text => ({ type: 'Ответ', text })),
  ];
}

function pickMeme(telegramId) {
  const pool = memePool();
  const recent = recentByUser.get(telegramId) || [];
  const available = pool
    .map((item, index) => ({ ...item, index }))
    .filter(item => !recent.includes(item.index));
  const choices = available.length ? available : pool.map((item, index) => ({ ...item, index }));
  const picked = choices[Math.floor(Math.random() * choices.length)];
  const nextRecent = [picked.index, ...recent.filter(index => index !== picked.index)].slice(0, RECENT_LIMIT);
  recentByUser.set(telegramId, nextRecent);
  return picked;
}

function memeKeyboard() {
  return Markup.inlineKeyboard([
    [Markup.button.callback('Ещё мем', 'meme:next')],
    [Markup.button.callback('Меню', 'menu:home')],
  ]);
}

function memeText(meme) {
  return `<b>Мем: ${escapeHtml(meme.type)}</b>\n\n${escapeHtml(meme.text)}`;
}

async function renderMeme(ctx) {
  const meme = pickMeme(ctx.from.id);
  return safeEditOrReply(ctx, memeText(meme), { parse_mode: 'HTML', ...memeKeyboard() });
}

function registerMemes(app) {
  const { bot, callbackRouter } = app;

  app.renderers.memes = renderMeme;

  bot.command(['meme', 'memes'], async ctx => {
    const meme = pickMeme(ctx.from.id);
    await safeReply(ctx, memeText(meme), { parse_mode: 'HTML', ...memeKeyboard() });
  });

  callbackRouter.on('meme', async (ctx, route) => {
    if (route.action === 'next') return renderMeme(ctx);
    return renderMeme(ctx);
  });
}

module.exports = {
  registerMemes,
  pickMeme,
};
