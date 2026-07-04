const { Telegraf } = require('telegraf');
const { readConfig } = require('./config');
const { createLogger } = require('./logger');
const { JsonFileStore } = require('./storage/jsonFileStore');
const { createAppData, createEconomyData, createModerationData } = require('./storage/defaultData');
const { createRepositories } = require('./repositories');
const { EventBus } = require('./eventBus');
const { CallbackRouter } = require('./callbackRouter');
const { createContextMiddleware } = require('./context');
const { ShopBridge } = require('./services/shopBridge');

const { registerActivity } = require('./modules/activity');
const { registerAi } = require('./modules/ai');
const { registerChatTools } = require('./modules/chatTools');
const { registerEconomy } = require('./modules/economy');
const { registerGames } = require('./modules/games');
const { registerLeaderboard } = require('./modules/leaderboard');
const { registerMenu } = require('./modules/menu');
const { registerModeration } = require('./modules/moderation');
const { registerProfile } = require('./modules/profile');
const { registerSettings } = require('./modules/settings');
const { registerShop } = require('./modules/shop');
const { registerSupport } = require('./modules/support');
const { registerWelcome } = require('./modules/welcome');

function createStores(config, logger) {
  return {
    app: new JsonFileStore(config.stores.app, createAppData, logger.child('store:app')),
    economy: new JsonFileStore(config.stores.economy, createEconomyData, logger.child('store:economy')),
    moderation: new JsonFileStore(config.stores.moderation, createModerationData, logger.child('store:moderation')),
  };
}

function registerCommands(bot) {
  return bot.telegram.setMyCommands([
    { command: 'start', description: 'Главное меню' },
    { command: 'menu', description: 'Открыть меню' },
    { command: 'profile', description: 'Мой профиль' },
    { command: 'coins', description: 'Баланс FunMoney' },
    { command: 'daily', description: 'Ежедневный бонус' },
    { command: 'shop', description: 'Магазин' },
    { command: 'inventory', description: 'Инвентарь' },
    { command: 'top', description: 'Топ активности' },
    { command: 'games', description: 'Мини-игры' },
    { command: 'support', description: 'Связь с поддержкой' },
    { command: 'ai', description: 'ИИ-помощник' },
    { command: 'settings', description: 'Настройки чата' },
    { command: 'ping', description: 'Проверить бота' },
    { command: 'id', description: 'Показать ID' },
    { command: 'info', description: 'Информация о чате' },
    { command: 'meme', description: 'Мемная фраза' },
    { command: 'topic', description: 'Тема для разговора' },
    { command: 'dice', description: 'Кубик' },
  ]);
}

function createApp(options = {}) {
  const config = options.config || readConfig(options.env || process.env);
  const logger = options.logger || createLogger('funtalk');
  if (!config.botToken && !config.isTest) {
    throw new Error('BOT_TOKEN is required');
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
  };
  app.shopBridge = new ShopBridge(repos, eventBus);

  bot.use(createContextMiddleware(app));
  bot.use(callbackRouter.middleware());

  registerActivity(app);
  registerModeration(app);
  registerProfile(app);
  registerShop(app);
  registerEconomy(app);
  registerLeaderboard(app);
  registerGames(app);
  registerChatTools(app);
  registerSupport(app);
  registerAi(app);
  registerSettings(app);
  registerWelcome(app);
  registerMenu(app);

  bot.catch((error, ctx) => {
    logger.error(`update ${ctx.update?.update_id || 'unknown'} failed:`, error.message);
  });

  app.launch = async function launch() {
    await bot.launch({ dropPendingUpdates: true });
    logger.info('FunTalk bot launched');
    try {
      await registerCommands(bot);
      logger.info('Telegram commands registered');
    } catch (error) {
      logger.warn('failed to register commands:', error.message);
    }
  };

  app.stop = function stop(reason = 'SIGTERM') {
    bot.stop(reason);
  };

  return app;
}

module.exports = {
  createApp,
  createStores,
  registerCommands,
};
