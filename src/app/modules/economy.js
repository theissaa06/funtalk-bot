const { safeReply } = require('../safeTelegram');
const { displayName, formatMoney, parseArgs, randomInt, toPositiveInt } = require('../format');
const { resolveTarget } = require('../target');
const { requireOwner } = require('../access');

const DAILY_MS = 24 * 60 * 60 * 1000;

function dailyAvailable(user) {
  if (!user.daily?.lastClaimAt) return { ok: true, leftMs: 0 };
  const elapsed = Date.now() - new Date(user.daily.lastClaimAt).getTime();
  return { ok: elapsed >= DAILY_MS, leftMs: Math.max(0, DAILY_MS - elapsed) };
}

function formatLeft(ms) {
  const hours = Math.floor(ms / 3600000);
  const minutes = Math.ceil((ms % 3600000) / 60000);
  return `${hours} ч. ${minutes} мин.`;
}

function registerEconomy(app) {
  const { bot, repos } = app;

  bot.command(['coins', 'balance'], async ctx => {
    const user = repos.economy.getUser(ctx.from.id);
    await safeReply(ctx, `Баланс ${displayName(ctx.from)}: <b>${formatMoney(user.coins)}</b>`, { parse_mode: 'HTML' });
  });

  bot.command('daily', async ctx => {
    const user = repos.economy.getUser(ctx.from.id);
    const available = dailyAvailable(user);
    if (!available.ok) {
      return safeReply(ctx, `Daily уже получен. Возвращайся через <b>${formatLeft(available.leftMs)}</b>.`, { parse_mode: 'HTML' });
    }

    const streak = user.daily?.streak || 0;
    const bonus = randomInt(50, 150) + Math.min(100, streak * 10);
    const updated = repos.economy.setDailyClaim(ctx.from.id, bonus);
    await app.eventBus.emit('economy.daily', { telegramId: ctx.from.id, bonus, streak: updated.daily.streak });
    return safeReply(
      ctx,
      `Ежедневный бонус: <b>+${formatMoney(bonus)}</b>\nСтрик: <b>${updated.daily.streak}</b>\nБаланс: <b>${formatMoney(updated.coins)}</b>`,
      { parse_mode: 'HTML' }
    );
  });

  bot.command(['give', 'pay'], async ctx => {
    const target = await resolveTarget(ctx);
    const amount = toPositiveInt(parseArgs(ctx).find(arg => /^\d+$/.test(arg)));
    if (!target || !amount) {
      return safeReply(ctx, 'Использование: ответь на сообщение и напиши /give 100');
    }
    const result = repos.economy.transferCoins(ctx.from.id, target.id, amount, {
      chatId: ctx.chat?.id,
      reason: 'user transfer',
    });
    if (!result.ok) return safeReply(ctx, result.error);
    return safeReply(
      ctx,
      `${displayName(ctx.from)} перевёл <b>${formatMoney(amount)}</b> пользователю ${displayName(target)}.`,
      { parse_mode: 'HTML' }
    );
  });

  bot.command(['givecoins', 'grant'], async ctx => {
    if (!(await requireOwner(ctx))) return;
    const target = await resolveTarget(ctx);
    const amount = toPositiveInt(parseArgs(ctx).find(arg => /^\d+$/.test(arg)));
    if (!target || !amount) return safeReply(ctx, 'Использование: ответь на пользователя и напиши /givecoins 1000');
    const updated = repos.economy.addCoins(target.id, amount, {
      type: 'owner_grant',
      byTelegramId: ctx.from.id,
      chatId: ctx.chat?.id,
      reason: 'owner command',
    });
    return safeReply(ctx, `Выдано <b>${formatMoney(amount)}</b> для ${displayName(target)}.\nБаланс: <b>${formatMoney(updated.coins)}</b>`, { parse_mode: 'HTML' });
  });

  bot.command('takecoins', async ctx => {
    if (!(await requireOwner(ctx))) return;
    const target = await resolveTarget(ctx);
    const amount = toPositiveInt(parseArgs(ctx).find(arg => /^\d+$/.test(arg)));
    if (!target || !amount) return safeReply(ctx, 'Использование: ответь на пользователя и напиши /takecoins 1000');
    const updated = repos.economy.addCoins(target.id, -amount, {
      type: 'owner_take',
      byTelegramId: ctx.from.id,
      chatId: ctx.chat?.id,
      reason: 'owner command',
    });
    return safeReply(ctx, `Списано <b>${formatMoney(amount)}</b> у ${displayName(target)}.\nБаланс: <b>${formatMoney(updated.coins)}</b>`, { parse_mode: 'HTML' });
  });

  bot.command(['richest', 'topcoins'], async ctx => {
    const top = repos.economy.topByCoins(10);
    if (!top.length) return safeReply(ctx, 'Пока нет данных по монетам.');
    const lines = top.map((user, index) => `${index + 1}. ${user.username ? `@${user.username}` : `ID ${user.telegramId}`} — ${formatMoney(user.coins)}`);
    return safeReply(ctx, `<b>Топ по FunMoney</b>\n\n${lines.join('\n')}`, { parse_mode: 'HTML' });
  });
}

module.exports = {
  registerEconomy,
  dailyAvailable,
};
