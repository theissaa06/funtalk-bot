const { Markup } = require('telegraf');
const { SHOP_ITEMS, RARITY_LABELS, getDailyDeal, getShopItem, priceFor } = require('../catalog');
const { safeEditOrReply, safeReply } = require('../safeTelegram');
const { escapeHtml, formatMoney, parseArgs } = require('../format');
const { resolveTarget } = require('../target');

const PER_PAGE = 5;

function shopText(app, ctx, page = 0) {
  const user = app.repos.economy.getUser(ctx.from.id);
  const deal = getDailyDeal();
  const total = Math.ceil(SHOP_ITEMS.length / PER_PAGE);
  const items = SHOP_ITEMS.slice(page * PER_PAGE, page * PER_PAGE + PER_PAGE);
  const lines = items.map(item => {
    const price = priceFor(item, deal);
    const sale = deal.itemId === item.id ? ` вместо ${item.price}` : '';
    return `<b>${item.name}</b> · ${RARITY_LABELS[item.rarity] || item.rarity}\n${item.description}\nЦена: <b>${formatMoney(price)}</b>${sale}`;
  });

  return [
    `<b>Магазин ${escapeHtml(app.config.brandName || 'Somnia')}</b> · стр. ${page + 1}/${total}`,
    `Баланс: <b>${formatMoney(user.coins)}</b>`,
    '',
    ...lines,
  ].join('\n\n');
}

function shopKeyboard(page = 0) {
  const total = Math.ceil(SHOP_ITEMS.length / PER_PAGE);
  const items = SHOP_ITEMS.slice(page * PER_PAGE, page * PER_PAGE + PER_PAGE);
  const rows = items.map(item => [Markup.button.callback(`Купить: ${item.name}`, `shop:buy:${item.id}:${page}`)]);
  const nav = [];
  if (page > 0) nav.push(Markup.button.callback('Назад', `shop:page:${page - 1}`));
  if (page + 1 < total) nav.push(Markup.button.callback('Дальше', `shop:page:${page + 1}`));
  if (nav.length) rows.push(nav);
  rows.push([
    Markup.button.callback('Инвентарь', 'shop:inventory'),
    Markup.button.callback('Меню', 'menu:home'),
  ]);
  return Markup.inlineKeyboard(rows);
}

function inventoryText(app, telegramId) {
  const user = app.repos.economy.getUser(telegramId);
  const inventory = user.inventory || [];
  if (!inventory.length) return '<b>Инвентарь пуст</b>\n\nЗагляни в магазин: /shop';

  const lines = inventory.map(entry => {
    const item = getShopItem(entry.id);
    if (!item) return `Неизвестный предмет: ${entry.id} x${entry.qty}`;
    const active = user.activeBadge === item.id || user.activeTitle === item.id ? ' · активен' : '';
    return `<b>${item.name}</b> x${entry.qty}${active}\n${item.description}`;
  });

  return `<b>Инвентарь</b>\n\n${lines.join('\n\n')}`;
}

function inventoryKeyboard(app, telegramId) {
  const user = app.repos.economy.getUser(telegramId);
  const rows = [];
  for (const entry of user.inventory || []) {
    const item = getShopItem(entry.id);
    if (!item) continue;
    if (item.type === 'consumable' || item.type === 'lootbox') {
      rows.push([Markup.button.callback(`Использовать: ${item.name}`, `shop:use:${item.id}`)]);
    }
    if (item.type === 'badge' || item.type === 'title') {
      rows.push([
        Markup.button.callback(`Надеть: ${item.name}`, `shop:equip:${item.id}`),
        Markup.button.callback('Продать', `shop:sell:${item.id}`),
      ]);
    }
  }
  rows.push([Markup.button.callback('Магазин', 'shop:page:0'), Markup.button.callback('Меню', 'menu:home')]);
  return Markup.inlineKeyboard(rows);
}

function registerShop(app) {
  const { bot, callbackRouter, repos, shopBridge } = app;

  app.renderers.shop = async (ctx, page = 0) => {
    await safeEditOrReply(ctx, shopText(app, ctx, page), { parse_mode: 'HTML', ...shopKeyboard(page) });
  };

  app.renderers.inventory = async ctx => {
    await safeEditOrReply(ctx, inventoryText(app, ctx.from.id), { parse_mode: 'HTML', ...inventoryKeyboard(app, ctx.from.id) });
  };

  bot.command('shop', async ctx => {
    await safeReply(ctx, shopText(app, ctx, 0), { parse_mode: 'HTML', ...shopKeyboard(0) });
  });

  bot.command(['inventory', 'inv'], async ctx => {
    await safeReply(ctx, inventoryText(app, ctx.from.id), { parse_mode: 'HTML', ...inventoryKeyboard(app, ctx.from.id) });
  });

  bot.command('use', async ctx => {
    const itemId = parseArgs(ctx)[0];
    if (!itemId) return safeReply(ctx, 'Использование: /use warn_shield');
    const result = shopBridge.useItem(ctx.from.id, itemId, ctx);
    if (!result.ok) return safeReply(ctx, result.error);
    return safeReply(ctx, `Предмет использован: <b>${result.item.name}</b>\n${result.effectText}`, { parse_mode: 'HTML' });
  });

  bot.command('sell', async ctx => {
    const itemId = parseArgs(ctx)[0];
    if (!itemId) return safeReply(ctx, 'Использование: /sell vip_badge');
    const result = shopBridge.sellItem(ctx.from.id, itemId, { chatId: ctx.chat?.id });
    if (!result.ok) return safeReply(ctx, result.error);
    return safeReply(ctx, `Предмет продан: <b>${result.item.name}</b>\nВозврат: <b>${formatMoney(result.refund)}</b>`, { parse_mode: 'HTML' });
  });

  bot.command('gift', async ctx => {
    const target = await resolveTarget(ctx);
    const itemId = parseArgs(ctx).find(arg => getShopItem(arg));
    if (!target || !itemId) return safeReply(ctx, 'Использование: ответь на пользователя и напиши /gift vip_badge');
    const result = shopBridge.giftItem(ctx.from.id, target.id, itemId, { chatId: ctx.chat?.id });
    if (!result.ok) return safeReply(ctx, result.error);
    return safeReply(ctx, `Подарок отправлен: <b>${result.item.name}</b> для ${target.username ? `@${target.username}` : target.first_name}.`, { parse_mode: 'HTML' });
  });

  callbackRouter.on('shop', async (ctx, route) => {
    if (route.action === 'page') {
      const page = Number(route.args[0]) || 0;
      return app.renderers.shop(ctx, page);
    }

    if (route.action === 'inventory') {
      return safeEditOrReply(ctx, inventoryText(app, ctx.from.id), { parse_mode: 'HTML', ...inventoryKeyboard(app, ctx.from.id) });
    }

    if (route.action === 'buy') {
      const [itemId, pageRaw] = route.args;
      const item = getShopItem(itemId);
      if (!item) return safeEditOrReply(ctx, 'Товар не найден.', { ...shopKeyboard(Number(pageRaw) || 0) });
      const deal = getDailyDeal();
      const price = priceFor(item, deal);
      const result = shopBridge.buyItem(ctx.from.id, itemId, price, { chatId: ctx.chat?.id });
      if (!result.ok) return safeEditOrReply(ctx, result.error, { ...shopKeyboard(Number(pageRaw) || 0) });
      if (result.reward) {
        return safeEditOrReply(ctx, `Лутбокс открыт.\nВыпал предмет: <b>${result.reward.name}</b>.`, { parse_mode: 'HTML', ...inventoryKeyboard(app, ctx.from.id) });
      }
      return safeEditOrReply(ctx, `Куплено: <b>${item.name}</b>\nОстаток: <b>${formatMoney(repos.economy.getCoins(ctx.from.id))}</b>`, { parse_mode: 'HTML', ...inventoryKeyboard(app, ctx.from.id) });
    }

    if (route.action === 'use') {
      const result = shopBridge.useItem(ctx.from.id, route.args[0], ctx);
      if (!result.ok) return safeEditOrReply(ctx, result.error, { ...inventoryKeyboard(app, ctx.from.id) });
      return safeEditOrReply(ctx, `Предмет использован: <b>${result.item.name}</b>\n${result.effectText}`, { parse_mode: 'HTML', ...inventoryKeyboard(app, ctx.from.id) });
    }

    if (route.action === 'sell') {
      const result = shopBridge.sellItem(ctx.from.id, route.args[0], { chatId: ctx.chat?.id });
      if (!result.ok) return safeEditOrReply(ctx, result.error, { ...inventoryKeyboard(app, ctx.from.id) });
      return safeEditOrReply(ctx, `Предмет продан: <b>${result.item.name}</b>\nВозврат: <b>${formatMoney(result.refund)}</b>`, { parse_mode: 'HTML', ...inventoryKeyboard(app, ctx.from.id) });
    }

    if (route.action === 'equip') {
      const item = getShopItem(route.args[0]);
      if (!item) return safeEditOrReply(ctx, 'Предмет не найден.', { ...inventoryKeyboard(app, ctx.from.id) });
      if (!repos.economy.hasInventoryItem(ctx.from.id, item.id)) {
        return safeEditOrReply(ctx, 'Этого предмета нет в инвентаре.', { ...inventoryKeyboard(app, ctx.from.id) });
      }
      repos.economy.setActiveCosmetic(ctx.from.id, item.type, item.id);
      return safeEditOrReply(ctx, `Активировано: <b>${item.name}</b>.`, { parse_mode: 'HTML', ...inventoryKeyboard(app, ctx.from.id) });
    }

    return app.renderers.shop(ctx, 0);
  });
}

module.exports = {
  registerShop,
  shopText,
  inventoryText,
};
