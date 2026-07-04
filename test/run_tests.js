process.env.BOT_TOKEN = process.env.BOT_TOKEN || 'TEST_TOKEN';
process.env.NODE_ENV = 'test';
process.env.JSON_DB_PATH = process.env.JSON_DB_PATH || 'data/test-database.json';
process.env.DB_PATH = process.env.DB_PATH || 'data/test-bot_data.json';
process.env.AI_PROVIDER = 'gemini';
process.env.GEMINI_API_KEY = '';
process.env.OPENAI_API_KEY = '';
process.env.CLAUDE_API_KEY = '';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { Telegram } = require('telegraf');

const rootDir = path.resolve(__dirname, '..');
const tempFiles = [
  process.env.JSON_DB_PATH,
  process.env.DB_PATH,
  'data/tg-users.json',
];
const preExistingFiles = new Set(tempFiles.filter((file) => fs.existsSync(path.resolve(rootDir, file))));

function cleanup() {
  for (const file of tempFiles) {
    if (preExistingFiles.has(file)) continue;
    const fullPath = path.resolve(rootDir, file);
    if (fs.existsSync(fullPath)) fs.rmSync(fullPath);
  }
}

for (const file of [process.env.JSON_DB_PATH, process.env.DB_PATH]) {
  const fullPath = path.resolve(rootDir, file);
  if (fs.existsSync(fullPath)) fs.rmSync(fullPath);
}

const testDatabasePath = path.resolve(rootDir, process.env.JSON_DB_PATH);
fs.mkdirSync(path.dirname(testDatabasePath), { recursive: true });
fs.writeFileSync(testDatabasePath, JSON.stringify({
  counters: {},
  chats: {
    '-1001': {
      users: {
        '42': {
          id: 42,
          username: 'tester',
          firstName: 'Tester',
          messages: 3,
          balance: 5,
          xp: 7,
          msgTypes: { sticker: 0 },
          firstSeenAt: Date.now() - 86400000,
          lastSeenAt: Date.now() - 3600000,
          achievements: {},
        },
      },
    },
  },
}, null, 2), 'utf8');

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
  if (method === 'getMe') {
    return { id: 12345, is_bot: true, username: 'FunTalchikTestBot', first_name: 'FunTalk Test' };
  }
  if (method === 'getChatMember') {
    return { status: 'administrator', user: { id: payload.user_id || 42, is_bot: false } };
  }
  return true;
};

const { bot } = require('../src/index.js');
let updateCounter = 0;

function user(overrides = {}) {
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

async function sendCommand(command) {
  await bot.handleUpdate({
    update_id: ++updateCounter,
    message: {
      message_id: updateCounter,
      date: Math.floor(Date.now() / 1000),
      chat: chat(),
      from: user(),
      text: command,
      entities: [{ offset: 0, length: command.split(/\s+/)[0].length, type: 'bot_command' }],
    },
  });
}

async function sendText(text) {
  await bot.handleUpdate({
    update_id: ++updateCounter,
    message: {
      message_id: updateCounter,
      date: Math.floor(Date.now() / 1000),
      chat: chat(),
      from: user(),
      text,
    },
  });
}

(async () => {
  const beforeLegacyMessageCalls = calls.length;
  await sendText('ordinary old user message');
  const legacyMessageTexts = calls
    .slice(beforeLegacyMessageCalls)
    .filter((call) => call.method === 'sendMessage')
    .map((call) => String(call.payload.text || ''));

  assert(
    !legacyMessageTexts.some((text) => text.includes('Новое достижение') || text.includes('Первый шаг')),
    'Existing chat members should not get a public first-message achievement notification'
  );

  const storedData = JSON.parse(fs.readFileSync(testDatabasePath, 'utf8'));
  const storedMember = storedData.members.find((member) =>
    String(member.user_id) === '42' && String(member.chat_id) === '-1001'
  );
  assert(storedMember, 'Legacy chat user should be migrated into members');
  assert.strictEqual(storedMember.message_count, 4, 'Legacy message count should be preserved before incrementing');
  assert(
    storedData.user_achievements.some((item) =>
      String(item.user_id) === '42' &&
      String(item.chat_id) === '-1001' &&
      item.achievement_id === 'first_msg'
    ),
    'Already-earned first message achievement should be recorded silently'
  );

  const beforeAiCalls = calls.length;
  await sendCommand('/ai');
  await sendText('Привет, помоги придумать текст');
  const aiTexts = calls
    .slice(beforeAiCalls)
    .filter((call) => call.method === 'sendMessage')
    .map((call) => String(call.payload.text || ''));

  assert(aiTexts.some((text) => text.includes('ИИ-помощник включён')), 'AI assistant should open without crashing');
  assert(aiTexts.some((text) => text.includes('GEMINI_API_KEY')), 'AI assistant should explain missing Gemini key');

  const { getAiProviderConfig } = require('../src/services/ai');
  process.env.GEMINI_API_KEY = 'test-gemini-key';
  const geminiConfig = getAiProviderConfig();
  assert.strictEqual(geminiConfig.provider, 'gemini', 'Gemini provider should be selectable');
  assert.strictEqual(geminiConfig.model, 'gemini-2.5-flash', 'Gemini should use the stable default model');
  assert.strictEqual(geminiConfig.configured, true, 'Gemini should be configured when GEMINI_API_KEY is present');
  process.env.GEMINI_API_KEY = '';

  await sendCommand('/start');
  await sendCommand('/shop');

  const sentTexts = calls
    .filter((call) => call.method === 'sendMessage')
    .map((call) => String(call.payload.text || ''));

  assert(sentTexts.length >= 2, 'Bot should send responses for /start and /shop');
  assert(sentTexts.some((text) => text.includes('Магазин') || text.includes('РњР°РіР°Р·РёРЅ')), 'Shop command should render shop text');

  console.log(`OK: ${calls.length} mocked Telegram API calls`);
  cleanup();
})().catch((error) => {
  cleanup();
  console.error(error);
  process.exit(1);
});
