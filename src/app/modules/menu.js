const { Markup } = require('telegraf');
const { safeEditOrReply, safeReply } = require('../safeTelegram');
const { escapeHtml } = require('../format');
const { removeReplyKeyboard } = require('./uiCleanup');

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
    lines: [
      '/support — отправить обращение разработчику',
      'Разработчик отвечает реплаем в support-чате, бот доставляет ответ пользователю.',
    ],
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

function mainKeyboard() {
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
  ]);
}

function menuText() {
  return [
    '<b>FunTalk</b>',
    '',
    'Новое меню: быстрые действия сверху, остальные функции внутри разделов.',
    '',
    'Старые нижние Telegram-кнопки автоматически убираются. Пользуйся кнопками под этим сообщением.',
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

function categoryKeyboard(key) {
  const direct = {
    shop: [Markup.button.callback('Открыть магазин', 'shop:page:0')],
    games: [Markup.button.callback('Открыть игры', 'games:main')],
    settings: [Markup.button.callback('Открыть настройки', 'settings:panel')],
    support: [Markup.button.callback('Написать в поддержку', 'support:start')],
    ai: [Markup.button.callback('Открыть ИИ', 'ai:main')],
    downloader: [Markup.button.callback('Жду ссылку', 'downloader:wait')],
    economy: [Markup.button.callback('Профиль', 'profile:main'), Markup.button.callback('Ачивки', 'achievements:main')],
  }[key];

  const rows = [];
  if (direct) rows.push(direct);
  rows.push([Markup.button.callback('Назад', 'menu:commands'), Markup.button.callback('Главная', 'menu:home')]);
  return Markup.inlineKeyboard(rows);
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
    await safeReply(ctx, menuText(), { parse_mode: 'HTML', ...mainKeyboard() });
  });

  bot.command(['menu', 'help'], async ctx => {
    await safeReply(ctx, menuText(), { parse_mode: 'HTML', ...mainKeyboard() });
  });

  bot.command(['buttons', 'newmenu'], async ctx => {
    await removeReplyKeyboard(ctx, { force: true });
    await safeReply(ctx, menuText(), { parse_mode: 'HTML', ...mainKeyboard() });
  });

  callbackRouter.on('menu', async (ctx, route) => {
    if (route.action === 'home') {
      return safeEditOrReply(ctx, menuText(), { parse_mode: 'HTML', ...mainKeyboard() });
    }
    if (route.action === 'commands') {
      return safeEditOrReply(ctx, commandsText(), { parse_mode: 'HTML', ...commandsKeyboard() });
    }
    if (route.action === 'category') {
      const key = route.args[0];
      return safeEditOrReply(ctx, categoryText(key), { parse_mode: 'HTML', ...categoryKeyboard(key) });
    }
    if (route.action === 'profile') return app.renderers.profile(ctx);
    if (route.action === 'shop') return app.renderers.shop(ctx, 0);
    if (route.action === 'leaderboard') return app.renderers.leaderboard(ctx);
    if (route.action === 'games') return app.renderers.games(ctx);
    if (route.action === 'achievements') return app.renderers.achievements(ctx);
    if (route.action === 'settings') return app.renderers.settings(ctx);
    if (route.action === 'support') return app.renderers.support(ctx);
    if (route.action === 'ai') return app.renderers.ai(ctx);
    return safeEditOrReply(ctx, menuText(), { parse_mode: 'HTML', ...mainKeyboard() });
  });
}

module.exports = {
  registerMenu,
  mainKeyboard,
};
