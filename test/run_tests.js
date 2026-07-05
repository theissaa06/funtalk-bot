process.env.BOT_TOKEN = process.env.BOT_TOKEN || 'TEST_TOKEN';
process.env.NODE_ENV = 'test';
process.env.FUNTALK_TEST = '1';
process.env.AI_PROVIDER = 'gemini';
process.env.GEMINI_API_KEY = '';
process.env.OPENAI_API_KEY = '';
process.env.CLAUDE_API_KEY = '';
process.env.OWNER_ID = '42';
process.env.APP_STORE_PATH = 'data/test-app_store.json';
process.env.ECONOMY_STORE_PATH = 'data/test-economy_store.json';
process.env.MODERATION_STORE_PATH = 'data/test-moderation_store.json';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { Telegram } = require('telegraf');

const rootDir = path.resolve(__dirname, '..');
const tempFiles = [
  process.env.APP_STORE_PATH,
  process.env.ECONOMY_STORE_PATH,
  process.env.MODERATION_STORE_PATH,
].map(file => path.resolve(rootDir, file));

function cleanup() {
  for (const file of tempFiles) {
    if (fs.existsSync(file)) fs.rmSync(file);
  }
}

cleanup();

const calls = [];
Telegram.prototype.callApi = async (method, payload) => {
  calls.push({ method, payload });
  if (method === 'sendMessage') {
    return {
      message_id: calls.length,
      date: Math.floor(Date.now() / 1000),
      chat: { id: payload.chat_id, type: 'group', title: 'Test chat' },
      text: payload.text,
    };
  }
  if (method === 'editMessageText') return true;
  if (method === 'answerCallbackQuery') return true;
  if (method === 'getMe') return { id: 12345, is_bot: true, username: 'FunTalkTestBot', first_name: 'FunTalk Test' };
  if (method === 'getChatMember') {
    const userId = Number(payload.user_id);
    return {
      status: userId === 42 || userId === 12345 ? 'administrator' : 'member',
      user: { id: userId, is_bot: false, first_name: `User${userId}` },
    };
  }
  if (method === 'setMyCommands') return true;
  return true;
};

const { bot, app } = require('../src/index');
const { createApp } = require('../src/app/createApp');
let updateId = 0;

function from(overrides = {}) {
  return {
    id: 42,
    is_bot: false,
    first_name: 'Tester',
    username: 'tester',
    ...overrides,
  };
}

function chat(overrides = {}) {
  return {
    id: -1001,
    type: 'group',
    title: 'Test chat',
    ...overrides,
  };
}

async function sendTextWith(targetBot, text, options = {}) {
  await targetBot.handleUpdate({
    update_id: ++updateId,
    message: {
      message_id: updateId,
      date: Math.floor(Date.now() / 1000),
      chat: options.chat || chat(),
      from: options.from || from(),
      text,
      entities: text.startsWith('/') ? [{ offset: 0, length: text.split(/\s+/)[0].length, type: 'bot_command' }] : undefined,
      reply_to_message: options.replyTo ? {
        message_id: updateId - 1,
        date: Math.floor(Date.now() / 1000),
        chat: options.chat || chat(),
        from: options.replyTo,
        text: 'target',
      } : undefined,
    },
  });
}

async function sendText(text, options = {}) {
  return sendTextWith(bot, text, options);
}

async function press(data, options = {}) {
  await bot.handleUpdate({
    update_id: ++updateId,
    callback_query: {
      id: String(updateId),
      from: options.from || from(),
      message: {
        message_id: 100,
        date: Math.floor(Date.now() / 1000),
        chat: options.chat || chat(),
        text: 'callback source',
      },
      chat_instance: 'test',
      data,
    },
  });
}

(async () => {
  await sendText('/start');
  await sendText('Профиль');
  await sendText('/daily');
  await sendText('/coins');
  await sendText('/shop');
  await press('shop:buy:daily_reroll:0');
  await sendText('/inventory');

  const target = from({ id: 77, first_name: 'Target', username: 'target' });
  await sendText('/warn spam', { replyTo: target });
  await sendText('/warnings', { replyTo: target });

  await sendText('/ai');
  await sendText('Привет, помоги придумать текст');

  const sentTexts = calls
    .filter(call => call.method === 'sendMessage')
    .map(call => String(call.payload.text || ''));
  const hasReplyKeyboard = calls.some(call =>
    call.method === 'sendMessage' &&
    Array.isArray(call.payload.reply_markup?.keyboard) &&
    call.payload.reply_markup.keyboard.flat().includes('Профиль')
  );

  assert(sentTexts.some(text => text.includes('FunTalk')), 'start/menu should render');
  assert(hasReplyKeyboard, 'start/menu should show Telegram reply keyboard buttons');
  assert(sentTexts.some(text => text.includes('Профиль')), 'reply keyboard profile button should work');
  assert(sentTexts.some(text => text.includes('Ежедневный бонус')), 'daily should work');
  assert(sentTexts.some(text => text.includes('Баланс')), 'coins/profile economy should work');
  assert(sentTexts.some(text => text.includes('Магазин')), 'shop should render');
  assert(sentTexts.some(text => text.includes('Инвентарь')), 'inventory should render');
  assert(sentTexts.some(text => text.includes('предупреждение') || text.includes('варнов')), 'moderation warning should work');
  assert(sentTexts.some(text => text.includes('GEMINI_API_KEY')), 'AI should explain missing Gemini key without crashing');

  app.repos.economy.addCoins(9001, 500, { type: 'test_seed' });
  const transferResult = app.repos.economy.transferCoins(9001, 9002, 125, { reason: 'test transfer' });
  assert.strictEqual(transferResult.ok, true, 'transfer should be atomic and successful');
  const gameResult = app.repos.economy.settleGame(9001, 100, 250, { reason: 'test game' });
  assert.strictEqual(gameResult.ok, true, 'game settlement should be atomic and successful');
  const purchaseResult = app.repos.economy.purchaseInventoryItem(9001, 'test_item', 50, { reason: 'test purchase' });
  assert.strictEqual(purchaseResult.ok, true, 'shop purchase should be atomic and successful');
  const giftResult = app.repos.economy.giftInventoryItem(9001, 9002, 'test_item');
  assert.strictEqual(giftResult.ok, true, 'gift should move inventory atomically');

  const beforeRestartData = JSON.parse(fs.readFileSync(path.resolve(rootDir, process.env.ECONOMY_STORE_PATH), 'utf8'));
  const firstMessageRewardsBefore = beforeRestartData.transactions.filter(transaction =>
    String(transaction.telegramId) === '42' &&
    transaction.type === 'achievement_reward' &&
    transaction.reason === 'first_message'
  ).length;
  assert.strictEqual(firstMessageRewardsBefore, 1, 'first_message reward should be granted once before restart');

  const restartedApp = createApp();
  await sendTextWith(restartedApp.bot, 'message after local restart');

  const economyData = JSON.parse(fs.readFileSync(path.resolve(rootDir, process.env.ECONOMY_STORE_PATH), 'utf8'));
  const moderationData = JSON.parse(fs.readFileSync(path.resolve(rootDir, process.env.MODERATION_STORE_PATH), 'utf8'));
  assert(economyData.users.some(user => String(user.telegramId) === '42'), 'economy user should be stored');
  assert(economyData.transactions.length >= 2, 'economy transactions should be logged');
  const firstMessageRewardsAfter = economyData.transactions.filter(transaction =>
    String(transaction.telegramId) === '42' &&
    transaction.type === 'achievement_reward' &&
    transaction.reason === 'first_message'
  ).length;
  assert.strictEqual(firstMessageRewardsAfter, 1, 'first_message reward should not be duplicated after restart');
  assert.strictEqual(economyData.users.find(user => String(user.telegramId) === '9001').coins, 475, 'atomic economy operations should keep the expected balance');
  assert(economyData.users.find(user => String(user.telegramId) === '9002').inventory.some(item => item.id === 'test_item' && item.qty === 1), 'gifted inventory item should be stored on recipient');
  assert(moderationData.warnings.some(warn => String(warn.telegramId) === '77'), 'warning should be stored per chat');

  console.log(`OK: ${calls.length} mocked Telegram API calls, ${economyData.transactions.length} economy transactions`);
  cleanup();
})().catch(error => {
  cleanup();
  console.error(error);
  process.exit(1);
});
