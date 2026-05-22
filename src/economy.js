const fs = require("fs");
const path = require("path");
const Database = require("better-sqlite3");

const dbPath = process.env.DATABASE_PATH || "./data/bot.sqlite";
const dbDir = path.dirname(dbPath);

if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const db = new Database(dbPath);

db.exec(`
CREATE TABLE IF NOT EXISTS user_levels (
  chat_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  username TEXT,
  first_name TEXT,
  last_name TEXT,
  xp INTEGER DEFAULT 0,
  level INTEGER DEFAULT 1,
  reputation INTEGER DEFAULT 0,
  coins INTEGER DEFAULT 0,
  messages INTEGER DEFAULT 0,
  last_xp_at INTEGER DEFAULT 0,
  updated_at INTEGER,
  PRIMARY KEY (chat_id, user_id)
);

CREATE TABLE IF NOT EXISTS user_items (
  chat_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  item_id TEXT NOT NULL,
  amount INTEGER DEFAULT 1,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (chat_id, user_id, item_id)
);

CREATE TABLE IF NOT EXISTS user_titles (
  chat_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  active_title TEXT,
  updated_at INTEGER,
  PRIMARY KEY (chat_id, user_id)
);

CREATE TABLE IF NOT EXISTS achievements (
  chat_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  achievement_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (chat_id, user_id, achievement_id)
);

CREATE TABLE IF NOT EXISTS economy_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  chat_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  action TEXT NOT NULL,
  amount INTEGER DEFAULT 0,
  details TEXT,
  created_at INTEGER NOT NULL
);
`);

const pendingDuels = new Map();

const shopItems = [
  {
    id: "title_legend",
    name: "👑 Титул «Легенда»",
    price: 500,
    type: "title",
    value: "👑 Легенда",
    description: "Красивый титул для профиля.",
  },
  {
    id: "title_active",
    name: "⚡ Титул «Активист»",
    price: 300,
    type: "title",
    value: "⚡ Активист",
    description: "Для тех, кто часто пишет в чат.",
  },
  {
    id: "title_meme",
    name: "😂 Титул «Мемный»",
    price: 250,
    type: "title",
    value: "😂 Мемный",
    description: "Для любителей мемов.",
  },
  {
    id: "title_kind",
    name: "💛 Титул «Добряк»",
    price: 220,
    type: "title",
    value: "💛 Добряк",
    description: "Для самого доброго участника.",
  },
  {
    id: "lucky_box",
    name: "🎁 Лаки-бокс",
    price: 150,
    type: "box",
    value: "lucky_box",
    description: "Случайный бонус: монеты, XP или достижение.",
  },
  {
    id: "duel_ticket",
    name: "⚔️ Билет дуэлянта",
    price: 120,
    type: "item",
    value: "duel_ticket",
    description: "Просто красивый предмет в инвентаре.",
  },
];

const achievementList = [
  {
    id: "first_purchase",
    name: "🛒 Первая покупка",
    description: "Купить первый предмет в магазине.",
  },
  {
    id: "first_gift",
    name: "🎁 Первый подарок",
    description: "Подарить монеты другому пользователю.",
  },
  {
    id: "first_duel",
    name: "⚔️ Первая дуэль",
    description: "Принять участие в дуэли.",
  },
  {
    id: "duel_winner",
    name: "🏆 Победитель дуэли",
    description: "Победить в дуэли.",
  },
  {
    id: "rich_1000",
    name: "💰 Богач",
    description: "Накопить 1000 монет.",
  },
  {
    id: "collector",
    name: "🎒 Коллекционер",
    description: "Иметь 3 разных предмета в инвентаре.",
  },
];

function now() {
  return Date.now();
}

function isGroup(ctx) {
  const type = ctx.chat?.type;
  return type === "group" || type === "supergroup";
}

function normalizeUsername(username) {
  return String(username || "").replace("@", "").toLowerCase();
}

function getDisplayName(user) {
  if (!user) return "Неизвестно";
  if (user.username) return `@${String(user.username).replace("@", "")}`;

  return (
    [user.first_name, user.last_name].filter(Boolean).join(" ") ||
    `ID ${user.user_id || user.id}`
  );
}

function getShopItem(itemId) {
  return shopItems.find((item) => item.id === itemId);
}

function parseArgs(ctx) {
  const text = ctx.message?.text || "";
  return text.split(/\s+/).slice(1);
}

function getUser(chatId, userId) {
  return db.prepare(`
    SELECT * FROM user_levels
    WHERE chat_id = ? AND user_id = ?
  `).get(String(chatId), String(userId));
}

function upsertUser(chatId, user) {
  if (!chatId || !user || user.is_bot) return null;

  const chat = String(chatId);
  const id = String(user.id);

  const current = getUser(chat, id);

  if (!current) {
    db.prepare(`
      INSERT INTO user_levels (
        chat_id,
        user_id,
        username,
        first_name,
        last_name,
        xp,
        level,
        reputation,
        coins,
        messages,
        last_xp_at,
        updated_at
      )
      VALUES (?, ?, ?, ?, ?, 0, 1, 0, 0, 0, 0, ?)
    `).run(
      chat,
      id,
      normalizeUsername(user.username),
      user.first_name || "",
      user.last_name || "",
      now()
    );

    return getUser(chat, id);
  }

  db.prepare(`
    UPDATE user_levels
    SET username = ?,
        first_name = ?,
        last_name = ?,
        updated_at = ?
    WHERE chat_id = ? AND user_id = ?
  `).run(
    normalizeUsername(user.username),
    user.first_name || "",
    user.last_name || "",
    now(),
    chat,
    id
  );

  return getUser(chat, id);
}

function findUserByUsername(chatId, username) {
  return db.prepare(`
    SELECT * FROM user_levels
    WHERE chat_id = ? AND lower(username) = ?
  `).get(String(chatId), normalizeUsername(username));
}

async function requireGroup(ctx, safeReply) {
  if (!isGroup(ctx)) {
    await safeReply(ctx, "Эта команда работает только в группе.");
    return false;
  }

  return true;
}

async function resolveTarget(ctx, args, safeReply) {
  const replyUser = ctx.message?.reply_to_message?.from;

  if (replyUser && !replyUser.is_bot) {
    upsertUser(ctx.chat.id, replyUser);

    return {
      id: replyUser.id,
      username: replyUser.username || "",
      first_name: replyUser.first_name || "",
      last_name: replyUser.last_name || "",
    };
  }

  const raw = args[0];

  if (!raw) {
    await safeReply(ctx, "Укажи пользователя: ответом на сообщение, @username или ID.");
    return null;
  }

  if (raw.startsWith("@")) {
    const found = findUserByUsername(ctx.chat.id, raw);

    if (!found) {
      await safeReply(
        ctx,
        "Я пока не знаю этого пользователя. Пусть он напишет сообщение в группе, либо используй команду ответом на его сообщение."
      );
      return null;
    }

    return {
      id: Number(found.user_id),
      username: found.username,
      first_name: found.first_name,
      last_name: found.last_name,
    };
  }

  if (/^\d+$/.test(raw)) {
    const found = getUser(ctx.chat.id, raw);

    return {
      id: Number(raw),
      username: found?.username || "",
      first_name: found?.first_name || "",
      last_name: found?.last_name || "",
    };
  }

  await safeReply(ctx, "Не понял пользователя. Используй ответ на сообщение, @username или ID.");
  return null;
}

function addCoins(chatId, userId, amount, details = "") {
  db.prepare(`
    UPDATE user_levels
    SET coins = coins + ?,
        updated_at = ?
    WHERE chat_id = ? AND user_id = ?
  `).run(Number(amount), now(), String(chatId), String(userId));

  saveEconomyLog(chatId, userId, "COINS_ADD", amount, details);
}

function removeCoins(chatId, userId, amount, details = "") {
  db.prepare(`
    UPDATE user_levels
    SET coins = coins - ?,
        updated_at = ?
    WHERE chat_id = ? AND user_id = ?
  `).run(Number(amount), now(), String(chatId), String(userId));

  saveEconomyLog(chatId, userId, "COINS_REMOVE", amount, details);
}

function addXp(chatId, userId, amount, details = "") {
  db.prepare(`
    UPDATE user_levels
    SET xp = xp + ?,
        updated_at = ?
    WHERE chat_id = ? AND user_id = ?
  `).run(Number(amount), now(), String(chatId), String(userId));

  saveEconomyLog(chatId, userId, "XP_ADD", amount, details);
}

function addItem(chatId, userId, itemId, amount = 1) {
  db.prepare(`
    INSERT INTO user_items (chat_id, user_id, item_id, amount, created_at)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(chat_id, user_id, item_id)
    DO UPDATE SET amount = amount + excluded.amount
  `).run(String(chatId), String(userId), itemId, amount, now());
}

function getUserItems(chatId, userId) {
  return db.prepare(`
    SELECT * FROM user_items
    WHERE chat_id = ? AND user_id = ?
    ORDER BY created_at DESC
  `).all(String(chatId), String(userId));
}

function hasItem(chatId, userId, itemId) {
  const row = db.prepare(`
    SELECT * FROM user_items
    WHERE chat_id = ? AND user_id = ? AND item_id = ?
  `).get(String(chatId), String(userId), itemId);

  return row && row.amount > 0;
}

function saveEconomyLog(chatId, userId, action, amount = 0, details = "") {
  db.prepare(`
    INSERT INTO economy_logs (chat_id, user_id, action, amount, details, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    String(chatId),
    String(userId),
    action,
    Number(amount || 0),
    details,
    now()
  );
}

function unlockAchievement(chatId, userId, achievementId) {
  const achievement = achievementList.find((item) => item.id === achievementId);

  if (!achievement) return null;

  const existing = db.prepare(`
    SELECT * FROM achievements
    WHERE chat_id = ? AND user_id = ? AND achievement_id = ?
  `).get(String(chatId), String(userId), achievementId);

  if (existing) return null;

  db.prepare(`
    INSERT INTO achievements (chat_id, user_id, achievement_id, created_at)
    VALUES (?, ?, ?, ?)
  `).run(String(chatId), String(userId), achievementId, now());

  saveEconomyLog(chatId, userId, "ACHIEVEMENT", 0, achievementId);

  return achievement;
}

function getAchievements(chatId, userId) {
  return db.prepare(`
    SELECT * FROM achievements
    WHERE chat_id = ? AND user_id = ?
    ORDER BY created_at DESC
  `).all(String(chatId), String(userId));
}

function checkPassiveAchievements(chatId, userId) {
  const user = getUser(chatId, userId);
  if (!user) return [];

  const unlocked = [];

  if ((user.coins || 0) >= 1000) {
    const achievement = unlockAchievement(chatId, userId, "rich_1000");
    if (achievement) unlocked.push(achievement);
  }

  const itemCount = db.prepare(`
    SELECT COUNT(*) as count
    FROM user_items
    WHERE chat_id = ? AND user_id = ?
  `).get(String(chatId), String(userId));

  if ((itemCount?.count || 0) >= 3) {
    const achievement = unlockAchievement(chatId, userId, "collector");
    if (achievement) unlocked.push(achievement);
  }

  return unlocked;
}

function setActiveTitle(chatId, userId, title) {
  db.prepare(`
    INSERT INTO user_titles (chat_id, user_id, active_title, updated_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(chat_id, user_id)
    DO UPDATE SET active_title = excluded.active_title,
                  updated_at = excluded.updated_at
  `).run(String(chatId), String(userId), title, now());
}

function getActiveTitle(chatId, userId) {
  const row = db.prepare(`
    SELECT * FROM user_titles
    WHERE chat_id = ? AND user_id = ?
  `).get(String(chatId), String(userId));

  return row?.active_title || "";
}

function shopText() {
  const items = shopItems
    .map((item) => {
      return (
        `${item.name}\n` +
        `ID: ${item.id}\n` +
        `Цена: ${item.price} монет\n` +
        `${item.description}`
      );
    })
    .join("\n\n");

  return (
    "🛒 Магазин FunTalk\n\n" +
    items +
    "\n\nКак купить:\n" +
    "/buy item_id\n\n" +
    "Пример:\n" +
    "/buy title_legend"
  );
}

function inventoryText(ctx, userId) {
  const items = getUserItems(ctx.chat.id, userId);
  const user = getUser(ctx.chat.id, userId);
  const activeTitle = getActiveTitle(ctx.chat.id, userId);

  if (!items.length) {
    return (
      "🎒 Инвентарь пуст.\n\n" +
      `Баланс: ${user?.coins || 0} монет\n` +
      "Зайди в /shop и купи первый предмет."
    );
  }

  const list = items
    .map((item, index) => {
      const shopItem = getShopItem(item.item_id);

      return `${index + 1}. ${shopItem?.name || item.item_id} ×${item.amount}`;
    })
    .join("\n");

  return (
    "🎒 Инвентарь\n\n" +
    `Активный титул: ${activeTitle || "не установлен"}\n` +
    `Баланс: ${user?.coins || 0} монет\n\n` +
    list +
    "\n\nПоставить титул:\n/use_title item_id"
  );
}

function achievementsText(ctx, userId) {
  const rows = getAchievements(ctx.chat.id, userId);

  if (!rows.length) {
    return (
      "🏆 Достижения пока пустые.\n\n" +
      "Получай достижения за покупки, подарки, дуэли и активность."
    );
  }

  const text = rows
    .map((row, index) => {
      const achievement = achievementList.find((item) => item.id === row.achievement_id);

      return `${index + 1}. ${achievement?.name || row.achievement_id}`;
    })
    .join("\n");

  return "🏆 Достижения пользователя:\n\n" + text;
}

function duelKey(chatId, targetId) {
  return `${chatId}:${targetId}`;
}

function registerEconomy(bot, helpers) {
  const { safeReply } = helpers;

  bot.command("shop", async (ctx) => {
    if (!(await requireGroup(ctx, safeReply))) return;

    upsertUser(ctx.chat.id, ctx.from);

    return safeReply(ctx, shopText());
  });

  bot.command("buy", async (ctx) => {
    if (!(await requireGroup(ctx, safeReply))) return;

    upsertUser(ctx.chat.id, ctx.from);

    const itemId = parseArgs(ctx)[0];

    if (!itemId) {
      return safeReply(ctx, "Укажи ID товара. Пример: /buy title_legend");
    }

    const item = getShopItem(itemId);

    if (!item) {
      return safeReply(ctx, "Такого товара нет. Открой /shop.");
    }

    const user = getUser(ctx.chat.id, ctx.from.id);

    if ((user.coins || 0) < item.price) {
      return safeReply(
        ctx,
        `Недостаточно монет.\n\nЦена: ${item.price}\nТвой баланс: ${user.coins || 0}`
      );
    }

    removeCoins(ctx.chat.id, ctx.from.id, item.price, `buy ${item.id}`);
    addItem(ctx.chat.id, ctx.from.id, item.id, 1);

    const unlocked = [];

    const firstPurchase = unlockAchievement(ctx.chat.id, ctx.from.id, "first_purchase");
    if (firstPurchase) unlocked.push(firstPurchase);

    const passive = checkPassiveAchievements(ctx.chat.id, ctx.from.id);
    unlocked.push(...passive);

    if (item.type === "box") {
      const rewardType = Math.random();

      if (rewardType < 0.4) {
        const coins = Math.floor(Math.random() * 151) + 50;
        addCoins(ctx.chat.id, ctx.from.id, coins, "lucky box");
        return safeReply(
          ctx,
          `🎁 Лаки-бокс открыт!\n\nТы получил +${coins} монет.`
        );
      }

      if (rewardType < 0.8) {
        const xp = Math.floor(Math.random() * 101) + 50;
        addXp(ctx.chat.id, ctx.from.id, xp, "lucky box");
        return safeReply(
          ctx,
          `🎁 Лаки-бокс открыт!\n\nТы получил +${xp} XP.`
        );
      }

      const achievement = unlockAchievement(ctx.chat.id, ctx.from.id, "collector");

      return safeReply(
        ctx,
        `🎁 Лаки-бокс открыт!\n\nТы получил редкий бонус: ${achievement?.name || "приятный сюрприз"}`
      );
    }

    let text =
      `✅ Покупка успешна!\n\n` +
      `Товар: ${item.name}\n` +
      `Списано: ${item.price} монет`;

    if (unlocked.length) {
      text += "\n\n🏆 Новые достижения:\n" + unlocked.map((a) => a.name).join("\n");
    }

    return safeReply(ctx, text);
  });

  bot.command("inventory", async (ctx) => {
    if (!(await requireGroup(ctx, safeReply))) return;

    upsertUser(ctx.chat.id, ctx.from);

    return safeReply(ctx, inventoryText(ctx, ctx.from.id));
  });

  bot.command("inv", async (ctx) => {
    if (!(await requireGroup(ctx, safeReply))) return;

    upsertUser(ctx.chat.id, ctx.from);

    return safeReply(ctx, inventoryText(ctx, ctx.from.id));
  });

  bot.command("use_title", async (ctx) => {
    if (!(await requireGroup(ctx, safeReply))) return;

    upsertUser(ctx.chat.id, ctx.from);

    const itemId = parseArgs(ctx)[0];

    if (!itemId) {
      return safeReply(ctx, "Укажи ID титула. Пример: /use_title title_legend");
    }

    const item = getShopItem(itemId);

    if (!item || item.type !== "title") {
      return safeReply(ctx, "Это не титул. Открой /shop.");
    }

    if (!hasItem(ctx.chat.id, ctx.from.id, itemId)) {
      return safeReply(ctx, "У тебя нет этого титула. Купи его в /shop.");
    }

    setActiveTitle(ctx.chat.id, ctx.from.id, item.value);

    return safeReply(ctx, `✅ Активный титул установлен: ${item.value}`);
  });

  bot.command("gift", async (ctx) => {
    if (!(await requireGroup(ctx, safeReply))) return;

    upsertUser(ctx.chat.id, ctx.from);

    const args = parseArgs(ctx);
    const target = await resolveTarget(ctx, args, safeReply);
    if (!target) return;

    if (target.id === ctx.from.id) {
      return safeReply(ctx, "Самому себе дарить монеты нельзя 😅");
    }

    const amountRaw = ctx.message?.reply_to_message ? args[0] : args[1];
    const amount = Number(amountRaw);

    if (!Number.isInteger(amount) || amount <= 0 || amount > 100000) {
      return safeReply(
        ctx,
        "Укажи сумму. Пример: /gift @user 100 или ответом на сообщение: /gift 100"
      );
    }

    upsertUser(ctx.chat.id, target);

    const fromUser = getUser(ctx.chat.id, ctx.from.id);

    if ((fromUser.coins || 0) < amount) {
      return safeReply(ctx, `Недостаточно монет. Баланс: ${fromUser.coins || 0}`);
    }

    removeCoins(ctx.chat.id, ctx.from.id, amount, `gift to ${target.id}`);
    addCoins(ctx.chat.id, target.id, amount, `gift from ${ctx.from.id}`);

    const achievement = unlockAchievement(ctx.chat.id, ctx.from.id, "first_gift");

    let text =
      `🎁 ${getDisplayName(ctx.from)} подарил ${amount} монет пользователю ${getDisplayName(target)}.`;

    if (achievement) {
      text += `\n\n🏆 Достижение получено: ${achievement.name}`;
    }

    return safeReply(ctx, text);
  });

  bot.command("achievements", async (ctx) => {
    if (!(await requireGroup(ctx, safeReply))) return;

    upsertUser(ctx.chat.id, ctx.from);
    checkPassiveAchievements(ctx.chat.id, ctx.from.id);

    return safeReply(ctx, achievementsText(ctx, ctx.from.id));
  });

  bot.command("duel", async (ctx) => {
    if (!(await requireGroup(ctx, safeReply))) return;

    upsertUser(ctx.chat.id, ctx.from);

    const args = parseArgs(ctx);
    const target = await resolveTarget(ctx, args, safeReply);
    if (!target) return;

    if (target.id === ctx.from.id) {
      return safeReply(ctx, "Нельзя вызвать на дуэль самого себя 😅");
    }

    upsertUser(ctx.chat.id, target);

    const amountRaw = ctx.message?.reply_to_message ? args[0] : args[1];
    const amount = Number(amountRaw || 50);

    if (!Number.isInteger(amount) || amount < 10 || amount > 10000) {
      return safeReply(ctx, "Ставка должна быть от 10 до 10000 монет.");
    }

    const fromUser = getUser(ctx.chat.id, ctx.from.id);
    const toUser = getUser(ctx.chat.id, target.id);

    if ((fromUser.coins || 0) < amount) {
      return safeReply(ctx, `У тебя недостаточно монет. Баланс: ${fromUser.coins || 0}`);
    }

    if ((toUser.coins || 0) < amount) {
      return safeReply(ctx, `У соперника недостаточно монет. Баланс: ${toUser.coins || 0}`);
    }

    const key = duelKey(ctx.chat.id, target.id);

    pendingDuels.set(key, {
      chatId: ctx.chat.id,
      fromId: ctx.from.id,
      fromName: getDisplayName(ctx.from),
      targetId: target.id,
      targetName: getDisplayName(target),
      amount,
      createdAt: now(),
    });

    setTimeout(() => {
      const duel = pendingDuels.get(key);

      if (duel && now() - duel.createdAt >= 2 * 60 * 1000) {
        pendingDuels.delete(key);
      }
    }, 2 * 60 * 1000);

    return safeReply(
      ctx,
      `⚔️ ${getDisplayName(ctx.from)} вызвал ${getDisplayName(target)} на дуэль!\n\n` +
        `Ставка: ${amount} монет\n\n` +
        `${getDisplayName(target)}, напиши /acceptduel чтобы принять или /declineduel чтобы отказаться.\n` +
        `Время на ответ: 2 минуты.`
    );
  });

  bot.command("acceptduel", async (ctx) => {
    if (!(await requireGroup(ctx, safeReply))) return;

    upsertUser(ctx.chat.id, ctx.from);

    const key = duelKey(ctx.chat.id, ctx.from.id);
    const duel = pendingDuels.get(key);

    if (!duel) {
      return safeReply(ctx, "У тебя нет активного вызова на дуэль.");
    }

    pendingDuels.delete(key);

    const fromUser = getUser(ctx.chat.id, duel.fromId);
    const targetUser = getUser(ctx.chat.id, duel.targetId);

    if ((fromUser?.coins || 0) < duel.amount || (targetUser?.coins || 0) < duel.amount) {
      return safeReply(ctx, "Дуэль отменена: у одного из участников уже не хватает монет.");
    }

    const winnerId = Math.random() > 0.5 ? duel.fromId : duel.targetId;
    const loserId = winnerId === duel.fromId ? duel.targetId : duel.fromId;

    removeCoins(ctx.chat.id, loserId, duel.amount, "duel lose");
    addCoins(ctx.chat.id, winnerId, duel.amount, "duel win");

    unlockAchievement(ctx.chat.id, duel.fromId, "first_duel");
    unlockAchievement(ctx.chat.id, duel.targetId, "first_duel");
    const winnerAchievement = unlockAchievement(ctx.chat.id, winnerId, "duel_winner");

    saveEconomyLog(ctx.chat.id, winnerId, "DUEL_WIN", duel.amount, `vs ${loserId}`);
    saveEconomyLog(ctx.chat.id, loserId, "DUEL_LOSE", duel.amount, `vs ${winnerId}`);

    const winnerName = winnerId === duel.fromId ? duel.fromName : duel.targetName;
    const loserName = winnerId === duel.fromId ? duel.targetName : duel.fromName;

    let text =
      `⚔️ Дуэль состоялась!\n\n` +
      `Победитель: ${winnerName}\n` +
      `Проигравший: ${loserName}\n` +
      `Ставка: ${duel.amount} монет\n\n` +
      `🏆 ${winnerName} получает ${duel.amount} монет.`;

    if (winnerAchievement) {
      text += `\n\n🏆 Новое достижение: ${winnerAchievement.name}`;
    }

    return safeReply(ctx, text);
  });

  bot.command("declineduel", async (ctx) => {
    if (!(await requireGroup(ctx, safeReply))) return;

    const key = duelKey(ctx.chat.id, ctx.from.id);
    const duel = pendingDuels.get(key);

    if (!duel) {
      return safeReply(ctx, "У тебя нет активного вызова на дуэль.");
    }

    pendingDuels.delete(key);

    return safeReply(ctx, "❌ Дуэль отменена.");
  });

  bot.command("economylog", async (ctx) => {
    if (!(await requireGroup(ctx, safeReply))) return;

    const rows = db.prepare(`
      SELECT * FROM economy_logs
      WHERE chat_id = ?
      ORDER BY id DESC
      LIMIT 10
    `).all(String(ctx.chat.id));

    if (!rows.length) {
      return safeReply(ctx, "Лог экономики пока пуст.");
    }

    const text = rows
      .map((log) => {
        const date = new Date(Number(log.created_at)).toLocaleString("ru-RU");

        return (
          `#${log.id} ${log.action}\n` +
          `User ID: ${log.user_id}\n` +
          `Сумма: ${log.amount}\n` +
          `Детали: ${log.details || "нет"}\n` +
          `${date}`
        );
      })
      .join("\n\n");

    return safeReply(ctx, "💰 Последние действия экономики:\n\n" + text);
  });
}

module.exports = {
  registerEconomy,
};