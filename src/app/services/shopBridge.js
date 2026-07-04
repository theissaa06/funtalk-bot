const { getShopItem, pickLootboxReward } = require('../catalog');

class ShopBridge {
  constructor(repos, eventBus) {
    this.repos = repos;
    this.eventBus = eventBus;
  }

  buyItem(telegramId, itemId, price, meta = {}) {
    const item = getShopItem(itemId);
    if (!item) return { ok: false, error: 'Товар не найден.' };

    const user = this.repos.economy.getUser(telegramId);
    if ((user?.coins || 0) < price) return { ok: false, error: 'Недостаточно FunMoney.' };
    if ((item.type === 'badge' || item.type === 'title') && this.repos.economy.hasInventoryItem(telegramId, itemId)) {
      return { ok: false, error: 'Этот предмет уже есть в инвентаре.' };
    }

    this.repos.economy.addCoins(telegramId, -price, {
      ...meta,
      type: 'shop_purchase',
      reason: itemId,
    });

    if (item.type === 'lootbox') {
      const reward = pickLootboxReward();
      this.repos.economy.addInventoryItem(telegramId, reward.id);
      this.eventBus.emit('shop.lootbox_opened', { telegramId, itemId, rewardId: reward.id, meta });
      return { ok: true, item, reward };
    }

    this.repos.economy.addInventoryItem(telegramId, itemId);
    this.eventBus.emit('shop.item_bought', { telegramId, itemId, meta });
    return { ok: true, item };
  }

  sellItem(telegramId, itemId, meta = {}) {
    const item = getShopItem(itemId);
    if (!item) return { ok: false, error: 'Товар не найден.' };
    if (!this.repos.economy.hasInventoryItem(telegramId, itemId)) {
      return { ok: false, error: 'Этого предмета нет в инвентаре.' };
    }
    if (item.type === 'consumable' || item.type === 'lootbox') {
      return { ok: false, error: 'Этот тип предмета нельзя продать обратно.' };
    }

    const removed = this.repos.economy.removeInventoryItem(telegramId, itemId);
    if (!removed) return { ok: false, error: 'Не удалось списать предмет.' };
    const refund = item.sellPrice || Math.floor(item.price * 0.4);
    this.repos.economy.addCoins(telegramId, refund, {
      ...meta,
      type: 'shop_sellback',
      reason: itemId,
    });
    this.eventBus.emit('shop.item_sold', { telegramId, itemId, refund, meta });
    return { ok: true, item, refund };
  }

  giftItem(fromTelegramId, toTelegramId, itemId, meta = {}) {
    const item = getShopItem(itemId);
    if (!item) return { ok: false, error: 'Товар не найден.' };
    if (!this.repos.economy.hasInventoryItem(fromTelegramId, itemId)) {
      return { ok: false, error: 'Этого предмета нет в инвентаре.' };
    }
    if ((item.type === 'badge' || item.type === 'title') && this.repos.economy.hasInventoryItem(toTelegramId, itemId)) {
      return { ok: false, error: 'У получателя уже есть этот предмет.' };
    }

    const removed = this.repos.economy.removeInventoryItem(fromTelegramId, itemId);
    if (!removed) return { ok: false, error: 'Не удалось списать предмет.' };
    this.repos.economy.addInventoryItem(toTelegramId, itemId);
    this.eventBus.emit('shop.item_gifted', { fromTelegramId, toTelegramId, itemId, meta });
    return { ok: true, item };
  }

  useItem(telegramId, itemId, ctx) {
    const item = getShopItem(itemId);
    if (!item) return { ok: false, error: 'Товар не найден.' };
    if (item.type !== 'consumable' && item.type !== 'lootbox') {
      return { ok: false, error: 'Этот предмет нельзя использовать.' };
    }
    if (!this.repos.economy.hasInventoryItem(telegramId, itemId)) {
      return { ok: false, error: 'Этого предмета нет в инвентаре.' };
    }

    let effectText = '';
    if (item.type === 'lootbox') {
      const reward = pickLootboxReward();
      this.repos.economy.removeInventoryItem(telegramId, itemId);
      this.repos.economy.addInventoryItem(telegramId, reward.id);
      effectText = `Внутри оказался предмет: ${reward.name}.`;
      this.eventBus.emit('shop.lootbox_opened', { telegramId, itemId, rewardId: reward.id });
      return { ok: true, item, effectText };
    }

    const chatId = ctx.chat?.type === 'private' ? null : ctx.chat?.id;
    if (item.effect === 'warn_remove') {
      if (!chatId) return { ok: false, error: 'Этот предмет работает только в группе.' };
      const result = this.repos.moderation.removeWarning(chatId, telegramId, 1, telegramId);
      if (!result.removed) return { ok: false, error: 'У тебя нет активных варнов в этом чате.' };
      effectText = `Снят 1 варн. Осталось: ${result.warnings}.`;
    } else if (item.effect === 'warn_shield') {
      if (!chatId) return { ok: false, error: 'Этот предмет работает только в группе.' };
      this.repos.moderation.setShield(chatId, telegramId, 'warn', true);
      effectText = 'Щит от следующего варна активирован.';
    } else if (item.effect === 'mute_shield') {
      if (!chatId) return { ok: false, error: 'Этот предмет работает только в группе.' };
      this.repos.moderation.setShield(chatId, telegramId, 'mute', true);
      effectText = 'Защита от следующего мута активирована.';
    } else if (item.effect === 'daily_reroll') {
      this.repos.economy.resetDailyCooldown(telegramId);
      effectText = 'Кулдаун daily сброшен.';
    } else if (item.effect === 'xp_boost') {
      const until = Date.now() + 60 * 60 * 1000;
      const user = this.repos.economy.getUser(telegramId);
      user.effects = user.effects || {};
      user.effects.xpBoostUntil = until;
      this.repos.economy.store.mutate(data => {
        const row = data.users.find(entry => String(entry.telegramId) === String(telegramId));
        if (row) row.effects = { ...(row.effects || {}), xpBoostUntil: until };
        return row;
      });
      effectText = 'XP x2 активирован на 1 час.';
    } else {
      return { ok: false, error: 'Эффект предмета ещё не подключён.' };
    }

    const removed = this.repos.economy.removeInventoryItem(telegramId, itemId);
    if (!removed) return { ok: false, error: 'Не удалось списать предмет.' };
    this.eventBus.emit('shop.item_used', { telegramId, itemId, chatId });
    return { ok: true, item, effectText };
  }
}

module.exports = {
  ShopBridge,
};
