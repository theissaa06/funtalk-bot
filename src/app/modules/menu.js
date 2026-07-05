const { Markup } = require('telegraf');
const { safeEditOrReply, safeReply } = require('../safeTelegram');
const { escapeHtml } = require('../format');
const { botInviteUrl } = require('../botLinks');

const CATEGORIES = {
  moderation: {
    title: 'Модерация',
    lines: [
      '/warn — выдать предупреждение',
      '/warnings — посмотреть варны',
      '/clearwarns — сбросить варны',
      '/mute, /unmute — муты',
      '/ban, /unban, /kick — жёсткие действия',
      '/modlog — последние действия',
    ],
  },
  economy: {
    title: 'Экономика',
    lines: [
      '/coins — баланс',
      '/daily — ежедневный бонус',
      '/give — перевести FunMoney',
      '/topmoney — топ по монетам',
      '/achievements — ачивки и награды',
    ],
  },
  shop: {
    title: 'Магазин',
    lines: [
      '/shop — товары и daily deal',
      '/inventory — инвентарь',
      '/use <item_id> — использовать предмет',
      '/gift <item_id> — подарить предмет по reply',
      '/sell <item_id> — продать косметику обратно',
    ],
  },
  games: {
    title: 'Игры',
    lines: [
      '/games — игровая панель',
      '/rps 50 — камень, ножницы, бумага кнопками',
      '/casino 50 — слоты',
      '/roulette 50 red — рулетка',
      '/dice — кубик',
    ],
  },
  settings: {
    title: 'Настройки чата',
    lines: [
      '/settings — toggles для админов',
      'Приветствия, лёгкая капча, мемы по пятницам и монеты за активность переключаются кнопками.',
    ],
  },
  support: {
    title: 'Поддержка',
    lines: ['Выбери действие:'],
  },
  ai: {
    title: 'ИИ-помощник',
    lines: [
      '/ai — открыть AI-панель',
      'Режимы: обычный, текст, мемы, объяснить.',
      'Провайдер выбирается через AI_PROVIDER в .env.',
    ],
  },
  downloader: {
    title: 'Скачивание медиа',
    lines: [
      '/dl <url> — скачать TikTok или YouTube через yt-dlp',
      'В группах автообработка ссылок включается админом через /settings.',
      'Для работы на сервере нужен yt-dlp или переменная YTDLP_PATH.',
    ],
  },
};

function mainKeyboard(app) {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback('Профиль', 'menu:profile'),
      Markup.button.callback('Магазин', 'menu:shop'),
    ],
    [
      Markup.button.callback('Игры', 'menu:games'),
      Markup.button.callback('ИИ', 'menu:ai'),
    ],
    [
      Markup.button.callback('Топы', 'menu:leaderboard'),
      Markup.button.callback('Ачивки', 'menu:achievements'),
    ],
    [
      Markup.button.callback('Админ', 'menu:category:settings'),
      Markup.button.callback('Скачать', 'downloader:main'),
    ],
    [
      Markup.button.callback('Все разделы', 'menu:commands'),
      Markup.button.callback('Поддержка', 'menu:support'),
    ],
    [
      Markup.button.url('Добавить в свой чат', botInviteUrl(app)),
    ],
  ]);
}

const REPLY_MENU = {
  profile: 'Профиль',
  shop: 'Магазин',
  inventory: 'Инвентарь',
  achievements: 'Ачивки',
  leaderboard: 'Топ',
  games: 'Игры',
  downloader: 'Скачать',
  ai: 'ИИ',
  settings: 'Настройки',
  support: 'Поддержка',
  commands: 'Команды',
  addToChat: 'Добавить в чат',
  hide: 'Скрыть кнопки',
};

function replyMenuKeyboard() {
  return Markup.keyboard([
    [REPLY_MENU.profile, REPLY_MENU.shop, REPLY_MENU.inventory],
    [REPLY_MENU.achievements, REPLY_MENU.leaderboard, REPLY_MENU.games],
    [REPLY_MENU.downloader, REPLY_MENU.ai, REPLY_MENU.support],
    [REPLY_MENU.settings, REPLY_MENU.commands],
    [REPLY_MENU.addToChat, REPLY_MENU.hide],
  ]).resize();
}

function menuText() {
  return [
    '<b>FunTalk</b>',
    '',
    'Меню обновлено: основные разделы доступны кнопками возле поля ввода.',
    '',
    'Inline-кнопки под сообщениями тоже остаются: они нужны для магазина, игр, настроек и быстрых действий.',
  ].join('\n');
}

function categoryText(key) {
  const category = CATEGORIES[key];
  if (!category) return menuText();
  return [
    `<b>${escapeHtml(category.title)}</b>`,
    '',
    ...category.lines.map(line => escapeHtml(line)),
  ].join('\n');
}

function categoryKeyboard(key, app) {
  const supportInboxUsername = String(app?.config?.supportInboxBotUsername || '').replace(/^@/, '');
  const supportDirect = [
    supportInboxUsername
      ? Markup.button.url('Обращения', `https://t.me/${supportInboxUsername}`)
      : Markup.button.callback('Обращения', 'menu:support'),
    Markup.button.callback('Мои обращения', 'support:mine'),
  ];
  const direct = {
    shop: [Markup.button.callback('Открыть магазин', 'shop:page:0')],
    games: [Markup.button.callback('Открыть игры', 'games:main')],
    settings: [Markup.button.callback('Открыть настройки', 'settings:panel')],
    support: supportDirect,
    ai: [Markup.button.callback('Открыть ИИ', 'ai:main')],
    downloader: [Markup.button.callback('Жду ссылку', 'downloader:wait')],
    economy: [Markup.button.callback('Профиль', 'profile:main'), Markup.button.callback('Ачивки', 'achievements:main')],
  }[key];

  const rows = [];
  if (direct) rows.push(direct);
  if (key === 'settings') rows.push([Markup.button.url('Добавить в свой чат', botInviteUrl(app))]);
  rows.push([Markup.button.callback('Назад', 'menu:commands'), Markup.button.callback('Главная', 'menu:home')]);
  return Markup.inlineKeyboard(rows);
}

function supportCategoryText() {
  return '<b>Поддержка</b>\n\nВыбери действие:';
}

function commandsKeyboard() {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback('Модерация', 'menu:category:moderation'),
      Markup.button.callback('Экономика', 'menu:category:economy'),
    ],
    [
      Markup.button.callback('Магазин', 'menu:category:shop'),
      Markup.button.callback('Игры', 'menu:category:games'),
    ],
    [
      Markup.button.callback('Настройки', 'menu:category:settings'),
      Markup.button.callback('Поддержка', 'menu:category:support'),
    ],
    [
      Markup.button.callback('ИИ', 'menu:category:ai'),
      Markup.button.callback('Скачать', 'menu:category:downloader'),
    ],
    [
      Markup.button.callback('Главная', 'menu:home'),
    ],
  ]);
}

function commandsText() {
  return '<b>Команды FunTalk</b>\n\nВыбери категорию. Owner-команды выдачи монет не показываются в общем меню.';
}

function registerMenu(app) {
  const { bot, callbackRouter } = app;

  bot.start(async ctx => {
    await safeReply(ctx, menuText(), { parse_mode: 'HTML', ...replyMenuKeyboard() });
    await safeReply(ctx, 'Быстрое inline-меню:', { parse_mode: 'HTML', ...mainKeyboard(app) });
  });

  bot.command(['menu', 'help'], async ctx => {
    await safeReply(ctx, menuText(), { parse_mode: 'HTML', ...replyMenuKeyboard() });
    await safeReply(ctx, 'Быстрое inline-меню:', { parse_mode: 'HTML', ...mainKeyboard(app) });
  });

  bot.command(['buttons', 'newmenu', 'keyboard'], async ctx => {
    await safeReply(ctx, 'Кнопки включены. Они будут открываться возле поля ввода.', replyMenuKeyboard());
  });

  bot.command(['hidebuttons', 'oldbuttons'], async ctx => {
    await safeReply(ctx, 'Кнопки скрыты. Вернуть их можно командой /buttons.', {
      reply_markup: { remove_keyboard: true },
    });
  });

  bot.hears(REPLY_MENU.profile, async ctx => app.renderers.profile(ctx));
  bot.hears(REPLY_MENU.shop, async ctx => app.renderers.shop(ctx, 0));
  bot.hears(REPLY_MENU.inventory, async ctx => {
    if (app.renderers.inventory) return app.renderers.inventory(ctx);
    return safeReply(ctx, 'Инвентарь открывается командой /inventory.');
  });
  bot.hears(REPLY_MENU.achievements, async ctx => app.renderers.achievements(ctx));
  bot.hears(REPLY_MENU.leaderboard, async ctx => app.renderers.leaderboard(ctx));
  bot.hears(REPLY_MENU.games, async ctx => app.renderers.games(ctx));
  bot.hears(REPLY_MENU.downloader, async ctx => app.renderers.downloader(ctx));
  bot.hears(REPLY_MENU.ai, async ctx => app.renderers.ai(ctx));
  bot.hears(REPLY_MENU.settings, async ctx => app.renderers.settings(ctx));
  bot.hears(REPLY_MENU.support, async ctx => app.renderers.support(ctx));
  bot.hears(REPLY_MENU.commands, async ctx => {
    await safeReply(ctx, commandsText(), { parse_mode: 'HTML', ...commandsKeyboard() });
  });
  bot.hears(REPLY_MENU.addToChat, async ctx => {
    await safeReply(ctx, 'Добавить бота в чат можно по кнопке ниже.', Markup.inlineKeyboard([
      [Markup.button.url('Добавить в свой чат', botInviteUrl(app))],
    ]));
  });
  bot.hears(REPLY_MENU.hide, async ctx => {
    await safeReply(ctx, 'Кнопки скрыты. Вернуть их можно командой /buttons.', {
      reply_markup: { remove_keyboard: true },
    });
  });

  callbackRouter.on('menu', async (ctx, route) => {
    if (route.action === 'home') {
      return safeEditOrReply(ctx, menuText(), { parse_mode: 'HTML', ...mainKeyboard(app) });
    }
    if (route.action === 'commands') {
      return safeEditOrReply(ctx, commandsText(), { parse_mode: 'HTML', ...commandsKeyboard() });
    }
    if (route.action === 'category') {
      const key = route.args[0];
      const text = key === 'support' ? supportCategoryText() : categoryText(key);
      return safeEditOrReply(ctx, text, { parse_mode: 'HTML', ...categoryKeyboard(key, app) });
    }
    if (route.action === 'profile') return app.renderers.profile(ctx);
    if (route.action === 'shop') return app.renderers.shop(ctx, 0);
    if (route.action === 'leaderboard') return app.renderers.leaderboard(ctx);
    if (route.action === 'games') return app.renderers.games(ctx);
    if (route.action === 'achievements') return app.renderers.achievements(ctx);
    if (route.action === 'settings') return app.renderers.settings(ctx);
    if (route.action === 'support') return app.renderers.support(ctx);
    if (route.action === 'ai') return app.renderers.ai(ctx);
    return safeEditOrReply(ctx, menuText(), { parse_mode: 'HTML', ...mainKeyboard(app) });
  });
}

module.exports = {
  registerMenu,
  mainKeyboard,
  replyMenuKeyboard,
  REPLY_MENU,
};
