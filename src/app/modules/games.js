const { Markup } = require('telegraf');
const { safeEditOrReply, safeReply } = require('../safeTelegram');
const { formatMoney, parseArgs, randomInt, toPositiveInt, displayName } = require('../format');

const casinoCooldown = new Map();
const rouletteCooldown = new Map();

function cooldownLeft(map, key, ms) {
  const left = ms - (Date.now() - (map.get(key) || 0));
  return left > 0 ? Math.ceil(left / 1000) : 0;
}

function gamesText() {
  return [
    '<b>Мини-игры</b>',
    '',
    '/casino 50 — слоты',
    '/roulette 50 red — рулетка',
    '/rps 50 — камень, ножницы, бумага',
    '',
    'Игры используют FunMoney и пишут операции в лог экономики.',
  ].join('\n');
}

function gamesKeyboard(bet = 50) {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback('Камень', `games:rps:rock:${bet}`),
      Markup.button.callback('Ножницы', `games:rps:scissors:${bet}`),
      Markup.button.callback('Бумага', `games:rps:paper:${bet}`),
    ],
    [Markup.button.callback('Меню', 'menu:home')],
  ]);
}

function registerGames(app) {
  const { bot, repos, callbackRouter } = app;
  app.renderers.games = async ctx => safeEditOrReply(ctx, gamesText(), { parse_mode: 'HTML', ...gamesKeyboard(50) });

  bot.command('games', async ctx => safeReply(ctx, gamesText(), { parse_mode: 'HTML', ...gamesKeyboard(50) }));

  bot.command('casino', async ctx => {
    const bet = toPositiveInt(parseArgs(ctx)[0]);
    if (!bet || bet < 10) return safeReply(ctx, 'Использование: /casino 50. Минимальная ставка: 10.');
    const key = `${ctx.chat?.id || ctx.from.id}:${ctx.from.id}`;
    const cd = cooldownLeft(casinoCooldown, key, 30000);
    if (cd) return safeReply(ctx, `Подожди ${cd} сек. перед следующей игрой.`);
    const user = repos.economy.getUser(ctx.from.id);
    if (user.coins < bet) return safeReply(ctx, `Недостаточно FunMoney. Баланс: ${formatMoney(user.coins)}.`);

    casinoCooldown.set(key, Date.now());
    repos.economy.addCoins(ctx.from.id, -bet, { type: 'game_bet', chatId: ctx.chat?.id, reason: 'casino' });
    const symbols = ['7', '★', '◆', '●', '■'];
    const roll = [0, 1, 2].map(() => symbols[randomInt(0, symbols.length - 1)]);
    const multiplier = roll[0] === roll[1] && roll[1] === roll[2] ? 5 : roll[0] === roll[1] || roll[1] === roll[2] || roll[0] === roll[2] ? 2 : 0;
    const win = bet * multiplier;
    if (win) repos.economy.addCoins(ctx.from.id, win, { type: 'game_win', chatId: ctx.chat?.id, reason: 'casino' });
    await app.eventBus.emit('game.finished', { game: 'casino', telegramId: ctx.from.id, bet, win });
    return safeReply(ctx, `<b>Слоты</b>\n\n[ ${roll.join(' | ')} ]\n\nСтавка: ${formatMoney(bet)}\nВыигрыш: <b>${formatMoney(win)}</b>`, { parse_mode: 'HTML' });
  });

  bot.command('roulette', async ctx => {
    const args = parseArgs(ctx);
    const bet = toPositiveInt(args[0]);
    const pick = String(args[1] || '').toLowerCase();
    const valid = ['red', 'black', 'green', 'even', 'odd'];
    const numberPick = /^\d+$/.test(pick) && Number(pick) >= 0 && Number(pick) <= 36;
    if (!bet || bet < 10 || (!valid.includes(pick) && !numberPick)) {
      return safeReply(ctx, 'Использование: /roulette 50 red. Варианты: red, black, green, even, odd, 0-36.');
    }
    const key = `${ctx.chat?.id || ctx.from.id}:${ctx.from.id}`;
    const cd = cooldownLeft(rouletteCooldown, key, 30000);
    if (cd) return safeReply(ctx, `Подожди ${cd} сек. перед следующей рулеткой.`);
    const user = repos.economy.getUser(ctx.from.id);
    if (user.coins < bet) return safeReply(ctx, `Недостаточно FunMoney. Баланс: ${formatMoney(user.coins)}.`);

    rouletteCooldown.set(key, Date.now());
    repos.economy.addCoins(ctx.from.id, -bet, { type: 'game_bet', chatId: ctx.chat?.id, reason: 'roulette' });
    const number = randomInt(0, 36);
    const color = number === 0 ? 'green' : number % 2 ? 'red' : 'black';
    const winMultiplier =
      pick === color ? (color === 'green' ? 14 : 2) :
      pick === 'even' && number > 0 && number % 2 === 0 ? 2 :
      pick === 'odd' && number % 2 === 1 ? 2 :
      Number(pick) === number ? 35 : 0;
    const win = bet * winMultiplier;
    if (win) repos.economy.addCoins(ctx.from.id, win, { type: 'game_win', chatId: ctx.chat?.id, reason: 'roulette' });
    await app.eventBus.emit('game.finished', { game: 'roulette', telegramId: ctx.from.id, bet, win });
    return safeReply(ctx, `<b>Рулетка</b>\n\nВыпало: <b>${number}</b> (${color})\nСтавка: ${pick}\nВыигрыш: <b>${formatMoney(win)}</b>`, { parse_mode: 'HTML' });
  });

  bot.command('rps', async ctx => {
    const bet = toPositiveInt(parseArgs(ctx)[0], 50);
    if (bet < 10) return safeReply(ctx, 'Минимальная ставка: 10.');
    return safeReply(ctx, `<b>${displayName(ctx.from)}</b>, выбери ход. Ставка: <b>${formatMoney(bet)}</b>`, { parse_mode: 'HTML', ...gamesKeyboard(bet) });
  });

  callbackRouter.on('games', async (ctx, route) => {
    if (route.action !== 'rps') return app.renderers.games(ctx);
    const [pick, betRaw] = route.args;
    const bet = toPositiveInt(betRaw, 50);
    const user = repos.economy.getUser(ctx.from.id);
    if (user.coins < bet) return safeEditOrReply(ctx, `Недостаточно FunMoney. Баланс: ${formatMoney(user.coins)}.`, { ...gamesKeyboard(bet) });

    const choices = ['rock', 'scissors', 'paper'];
    const botPick = choices[randomInt(0, choices.length - 1)];
    const wins = (pick === 'rock' && botPick === 'scissors') || (pick === 'scissors' && botPick === 'paper') || (pick === 'paper' && botPick === 'rock');
    const draw = pick === botPick;
    repos.economy.addCoins(ctx.from.id, -bet, { type: 'game_bet', chatId: ctx.chat?.id, reason: 'rps' });
    const win = draw ? bet : wins ? bet * 2 : 0;
    if (win) repos.economy.addCoins(ctx.from.id, win, { type: 'game_win', chatId: ctx.chat?.id, reason: 'rps' });
    await app.eventBus.emit('game.finished', { game: 'rps', telegramId: ctx.from.id, bet, win });
    const labels = { rock: 'камень', scissors: 'ножницы', paper: 'бумага' };
    return safeEditOrReply(ctx, `<b>КНБ</b>\n\nТы: ${labels[pick]}\nБот: ${labels[botPick]}\n\n${draw ? 'Ничья.' : wins ? 'Победа!' : 'Поражение.'}\nВыигрыш: <b>${formatMoney(win)}</b>`, { parse_mode: 'HTML', ...gamesKeyboard(bet) });
  });
}

module.exports = {
  registerGames,
};
