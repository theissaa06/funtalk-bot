const { Telegraf } = require('telegraf');
const path = require('path');
const http = require('http');
const { readConfig } = require('./config');
const { createLogger } = require('./logger');
const { JsonFileStore } = require('./storage/jsonFileStore');
const { createAppData, createEconomyData, createModerationData } = require('./storage/defaultData');
const { createRepositories } = require('./repositories');
const { EventBus } = require('./eventBus');
const { CallbackRouter } = require('./callbackRouter');
const { createContextMiddleware } = require('./context');
const { ShopBridge } = require('./services/shopBridge');
const { createSupportInboxBot, registerSupportInboxProfile } = require('./supportInboxBot');

const { registerActivity } = require('./modules/activity');
const { registerAchievements } = require('./modules/achievements');
const { registerAi } = require('./modules/ai');
const { registerChatTools } = require('./modules/chatTools');
const { registerDownloader } = require('./modules/downloader');
const { registerEconomy } = require('./modules/economy');
const { registerGames } = require('./modules/games');
const { registerLeaderboard } = require('./modules/leaderboard');
const { registerMenu } = require('./modules/menu');
const { registerModeration } = require('./modules/moderation');
const { registerProfile } = require('./modules/profile');
const { registerSettings } = require('./modules/settings');
const { registerShop } = require('./modules/shop');
const { registerSupport } = require('./modules/support');
const { registerUiCleanup } = require('./modules/uiCleanup');
const { registerWelcome } = require('./modules/welcome');

function createStores(config, logger) {
  return {
    app: new JsonFileStore(config.stores.app, createAppData, logger.child('store:app')),
    economy: new JsonFileStore(config.stores.economy, createEconomyData, logger.child('store:economy')),
    moderation: new JsonFileStore(config.stores.moderation, createModerationData, logger.child('store:moderation')),
  };
}

function validateRuntimeConfig(config) {
  const warnings = [];
  const errors = [];
  const defaultDataDir = path.resolve(__dirname, '../../data');

  if (config.railwayService && path.resolve(config.dataDir) === defaultDataDir && !config.allowEphemeralData) {
    errors.push(
      'Railway persistent storage is not configured: set DATA_DIR to the mounted Volume path, or set FUNTALK_ALLOW_EPHEMERAL_DATA=1 only for disposable test deploys.'
    );
  }

  return { warnings, errors };
}

function startHealthServer(config, logger, webhookHandler = null) {
  const port = Number(config.healthPort);
  if (!Number.isInteger(port) || port <= 0) return null;

  const server = http.createServer((req, res) => {
    const pathname = new URL(req.url || '/', 'http://localhost').pathname;
    if (webhookHandler && pathname === config.webhookPath) {
      webhookHandler(req, res);
      return;
    }
    if (pathname === '/health' || pathname === '/') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ ok: true, service: 'funtalk-bot' }));
      return;
    }
    res.writeHead(404, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: false, error: 'not_found' }));
  });

  server.on('error', error => {
    logger.warn('health server failed:', error.message);
  });

  server.listen(port, () => {
    logger.info(`health server listening on port ${port}`);
  });

  return server;
}

function registerCommands(bot) {
  return bot.telegram.setMyCommands([
    { command: 'start', description: 'Главное меню' },
    { command: 'menu', description: 'Открыть меню' },
    { command: 'buttons', description: 'Показать кнопки меню' },
    { command: 'hidebuttons', description: 'Скрыть кнопки меню' },
    { command: 'profile', description: 'Мой профиль' },
    { command: 'coins', description: 'Баланс FunMoney' },
    { command: 'daily', description: 'Ежедневный бонус' },
    { command: 'shop', description: 'Магазин' },
    { command: 'inventory', description: 'Инвентарь' },
    { command: 'achievements', description: 'Ачивки и награды' },
    { command: 'top', description: 'Топ активности' },
    { command: 'topmoney', description: 'Топ по FunMoney' },
    { command: 'games', description: 'Мини-игры' },
    { command: 'support', description: 'Обращения' },
    { command: 'mysupport', description: 'Мои обращения' },
    { command: 'ai', description: 'ИИ-помощник' },
    { command: 'dl', description: 'Скачать TikTok/YouTube' },
    { command: 'settings', description: 'Настройки чата' },
    { command: 'warn', description: 'Выдать варн' },
    { command: 'warnings', description: 'Показать варны' },
    { command: 'mute', description: 'Замутить участника' },
    { command: 'ban', description: 'Забанить участника' },
    { command: 'ping', description: 'Проверить бота' },
    { command: 'id', description: 'Показать ID' },
    { command: 'info', description: 'Информация о чате' },
    { command: 'meme', description: 'Мемная фраза' },
    { command: 'topic', description: 'Тема для разговора' },
    { command: 'dice', description: 'Кубик' },
  ]);
}

async function registerBotProfile(bot) {
  await Promise.all([
    bot.telegram.setMyDescription('FunTalk — бот для чата, обращений и быстрых инструментов.'),
    bot.telegram.setMyShortDescription('FunTalk: чат, обращения и инструменты.'),
  ]);
}

function createApp(options = {}) {
  const config = options.config || readConfig(options.env || process.env);
  const logger = options.logger || createLogger('funtalk');
  if (!config.botToken && !config.isTest) {
    throw new Error('BOT_TOKEN is required');
  }
  const runtimeCheck = validateRuntimeConfig(config);
  for (const warning of runtimeCheck.warnings) logger.warn(warning);
  if (runtimeCheck.errors.length && !config.isTest) {
    throw new Error(runtimeCheck.errors.join(' '));
  }

  const bot = options.bot || new Telegraf(config.botToken || 'TEST_TOKEN');
  const stores = createStores(config, logger);
  const repos = createRepositories(stores, config);
  const eventBus = new EventBus(logger.child('events'));
  const callbackRouter = new CallbackRouter(logger.child('callbacks'));
  const app = {
    bot,
    config,
    logger,
    stores,
    repos,
    eventBus,
    callbackRouter,
    renderers: {},
    healthServer: null,
  };
  app.shopBridge = new ShopBridge(repos, eventBus);
  app.supportInboxBot = createSupportInboxBot(app);

  bot.use(createContextMiddleware(app));
  bot.use(callbackRouter.middleware());
  registerUiCleanup(app);

  registerActivity(app);
  registerAchievements(app);
  registerModeration(app);
  registerProfile(app);
  registerShop(app);
  registerEconomy(app);
  registerLeaderboard(app);
  registerGames(app);
  registerChatTools(app);
  registerDownloader(app);
  registerSupport(app);
  registerAi(app);
  registerSettings(app);
  registerWelcome(app);
  registerMenu(app);

  bot.catch((error, ctx) => {
    logger.error(`update ${ctx.update?.update_id || 'unknown'} failed:`, error.message);
  });

  app.launch = async function launch() {
    if (config.webhookUrl) {
      if (!app.healthServer) app.healthServer = startHealthServer(config, logger, bot.webhookCallback(config.webhookPath));
      const webhookEndpoint = `${config.webhookUrl}${config.webhookPath}`;
      await bot.telegram.setWebhook(webhookEndpoint, { drop_pending_updates: true });
      logger.info(`FunTalk bot launched in webhook mode at ${config.webhookPath}`);
    } else {
      if (!app.healthServer) app.healthServer = startHealthServer(config, logger);
      await bot.telegram.deleteWebhook({ drop_pending_updates: true });
      await bot.launch({ dropPendingUpdates: true });
      logger.info('FunTalk bot launched in polling mode');
    }
    if (app.supportInboxBot) {
      await app.supportInboxBot.launch({ dropPendingUpdates: true });
      try {
        await registerSupportInboxProfile(app.supportInboxBot);
      } catch (error) {
        logger.warn('failed to register support inbox profile:', error.message);
      }
      logger.info('Support inbox bot launched');
    }
    try {
      await registerCommands(bot);
      await registerBotProfile(bot);
      logger.info('Telegram commands registered');
    } catch (error) {
      logger.warn('failed to register commands:', error.message);
    }
  };

  app.stop = function stop(reason = 'SIGTERM') {
    bot.stop(reason);
    if (app.supportInboxBot) app.supportInboxBot.stop(reason);
    if (app.healthServer) app.healthServer.close();
  };

  return app;
}

module.exports = {
  createApp,
  createStores,
  validateRuntimeConfig,
  startHealthServer,
  registerCommands,
  registerBotProfile,
};
