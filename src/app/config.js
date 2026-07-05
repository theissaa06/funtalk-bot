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
  const railwayVolumePath = env.RAILWAY_VOLUME_MOUNT_PATH || env.RAILWAY_VOLUME_PATH;
  const dataDir = path.resolve(env.DATA_DIR || railwayVolumePath || path.join(__dirname, '../../data'));

  return {
    env: env.NODE_ENV || 'development',
    isTest: env.NODE_ENV === 'test' || env.FUNTALK_TEST === '1',
    botToken: env.BOT_TOKEN || '',
    brandName: env.BOT_DISPLAY_NAME || env.BRAND_NAME || 'Somnia',
    botUsername: env.BOT_USERNAME || 'FunTalchik_Botik',
    ownerIds: parseIdList(env.OWNER_IDS || env.OWNER_ID),
    supportChatId: env.SUPPORT_CHAT_ID ? Number(env.SUPPORT_CHAT_ID) : null,
    supportInboxBotToken: env.SUPPORT_INBOX_BOT_TOKEN || env.SUPPORT_TOKEN || env.SUPPORT_BOT_TOKEN || '',
    supportInboxBotUsername: String(env.SUPPORT_INBOX_BOT_USERNAME || '').replace(/^@/, ''),
    dataDir,
    railwayService: Boolean(env.RAILWAY_ENVIRONMENT || env.RAILWAY_PROJECT_ID || env.RAILWAY_SERVICE_ID),
    allowEphemeralData: env.FUNTALK_ALLOW_EPHEMERAL_DATA === '1',
    healthPort: env.HEALTH_PORT || env.PORT || '',
    webhookUrl: String(env.WEBHOOK_URL || '').replace(/\/+$/, ''),
    webhookPath: env.WEBHOOK_PATH || '/telegram-webhook',
    skipTelegramProfileSync: env.SKIP_TELEGRAM_PROFILE_SYNC === '1',
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
