require('dotenv').config();
const path = require('path');

function parseIdList(value) {
  return String(value || '')
    .split(',')
    .map(item => item.trim())
    .filter(Boolean)
    .map(item => Number(item))
    .filter(Number.isFinite);
}

function readConfig(env = process.env) {
  const dataDir = path.resolve(env.DATA_DIR || path.join(__dirname, '../../data'));

  return {
    env: env.NODE_ENV || 'development',
    isTest: env.NODE_ENV === 'test' || env.FUNTALK_TEST === '1',
    botToken: env.BOT_TOKEN || '',
    botUsername: env.BOT_USERNAME || 'FunTalchik_Botik',
    ownerIds: parseIdList(env.OWNER_IDS || env.OWNER_ID),
    supportChatId: env.SUPPORT_CHAT_ID ? Number(env.SUPPORT_CHAT_ID) : null,
    supportInboxBotToken: env.SUPPORT_INBOX_BOT_TOKEN || '',
    dataDir,
    stores: {
      app: path.resolve(env.APP_STORE_PATH || path.join(dataDir, 'app_store.json')),
      economy: path.resolve(env.ECONOMY_STORE_PATH || path.join(dataDir, 'economy_store.json')),
      moderation: path.resolve(env.MODERATION_STORE_PATH || path.join(dataDir, 'moderation_store.json')),
    },
    ai: {
      provider: (env.AI_PROVIDER || 'gemini').toLowerCase(),
      geminiModel: env.GEMINI_MODEL || 'gemini-2.5-flash',
    },
  };
}

module.exports = {
  readConfig,
  parseIdList,
};
