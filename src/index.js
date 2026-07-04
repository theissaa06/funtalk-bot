require('dotenv').config();

const { createApp } = require('./app/createApp');
const { safeReply } = require('./app/safeTelegram');

const app = createApp();
const { bot } = app;

async function launchBotWithRetry(retries = 0) {
  try {
    await app.launch();
  } catch (error) {
    console.error('Ошибка запуска бота:', error.message);
    if (String(error.message).includes('409') && retries < 10) {
      const delaySeconds = 5 + retries * 2;
      console.log(`Конфликт Telegram getUpdates. Повтор ${retries + 1}/10 через ${delaySeconds} сек.`);
      setTimeout(() => launchBotWithRetry(retries + 1), delaySeconds * 1000);
      return;
    }
    if (retries >= 10 || !String(error.message).includes('409')) {
      process.exit(1);
    }
  }
}

process.once('SIGINT', () => app.stop('SIGINT'));
process.once('SIGTERM', () => app.stop('SIGTERM'));

if (require.main === module && !app.config.isTest) {
  launchBotWithRetry();
}

module.exports = {
  app,
  bot,
  launchBotWithRetry,
  safeReply,
};
