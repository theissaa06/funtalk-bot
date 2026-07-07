require('dotenv').config();

const fs = require('fs');
const path = require('path');
const { createApp } = require('./app/createApp');
const { safeReply } = require('./app/safeTelegram');

const app = createApp();
const { bot } = app;
const lockFilePath = path.resolve(process.cwd(), '.bot.lock');
let botLockState = null;

function tryAcquireBotLock() {
  if (botLockState?.pid === String(process.pid)) {
    return false;
  }

  try {
    const fd = fs.openSync(lockFilePath, 'wx');
    fs.writeFileSync(fd, String(process.pid), 'utf8');
    fs.closeSync(fd);
    botLockState = { pid: String(process.pid), acquiredAt: Date.now() };
    return true;
  } catch (error) {
    if (fs.existsSync(lockFilePath)) {
      try {
        const existing = fs.readFileSync(lockFilePath, 'utf8').trim();
        if (existing && existing !== String(process.pid)) {
          try {
            process.kill(Number(existing), 0);
            botLockState = { pid: existing, acquiredAt: Date.now() };
            return false;
          } catch {
            fs.rmSync(lockFilePath, { force: true });
            return tryAcquireBotLock();
          }
        }
      } catch {
        fs.rmSync(lockFilePath, { force: true });
        return tryAcquireBotLock();
      }
    }

    botLockState = { pid: String(process.pid), acquiredAt: Date.now() };
    return false;
  }
}

function releaseBotLock() {
  if (botLockState?.pid === String(process.pid) || !botLockState) {
    fs.rmSync(lockFilePath, { force: true });
    botLockState = null;
  }
}

function getBotLockState() {
  return botLockState;
}

if (!global.__funtalkProcessErrorHandlersRegistered) {
  global.__funtalkProcessErrorHandlersRegistered = true;
  process.on('uncaughtException', error => {
    app.logger?.error?.('uncaughtException:', error?.stack || error?.message || error);
  });
  process.on('unhandledRejection', reason => {
    app.logger?.error?.('unhandledRejection:', reason?.stack || reason?.message || reason);
  });
}

async function launchBotWithRetry(retries = 0) {
  if (!tryAcquireBotLock()) {
    console.error('Бот уже запущен в другой копии процесса. Остановка новой попытки запуска.');
    return;
  }

  try {
    await app.launch();
  } catch (error) {
    releaseBotLock();
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

process.once('SIGINT', () => {
  releaseBotLock();
  app.stop('SIGINT');
});
process.once('SIGTERM', () => {
  releaseBotLock();
  app.stop('SIGTERM');
});
process.once('exit', () => releaseBotLock());

if (require.main === module && !app.config.isTest) {
  launchBotWithRetry();
}

module.exports = {
  app,
  bot,
  launchBotWithRetry,
  safeReply,
  tryAcquireBotLock,
  releaseBotLock,
  getBotLockState,
};
