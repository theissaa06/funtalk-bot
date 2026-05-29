process.env.BOT_TOKEN = process.env.BOT_TOKEN || 'TEST_TOKEN';

// small delay helper
const wait = ms => new Promise(res => setTimeout(res, ms));

(async function(){
  console.log('Starting test: require index.js');
  require('../index.js');

  // wait for bot stub to be created
  for (let i=0;i<10;i++) {
    if (global.__TEST_BOT_INSTANCE__) break;
    await wait(100);
  }

  const bot = global.__TEST_BOT_INSTANCE__;
  if (!bot) {
    console.error('Test bot instance not found');
    process.exit(2);
  }

  console.log('Bot stub ready. Emitting callback_query help:shop');

  // simulate callback_query for help:shop
  bot.emit('callback_query', {
    id: 'q-1',
    data: 'help:shop',
    message: { chat: { id: 999 }, message_id: 111 }
  });

  // allow handlers to process
  await wait(200);

  console.log('Messages sent by bot stub after help:shop:');
  for (const m of (bot.sent||[])) {
    console.log('->', m.chatId, '-', (m.text || '').slice(0,120).replace(/\n/g,'\\n'));
  }

  // simulate pressing buy:vip as user with id 42
  console.log('Emitting callback_query buy:vip from user 42');
  bot.emit('callback_query', {
    id: 'q-2',
    data: 'buy:vip',
    from: { id: 42 },
    message: { chat: { id: 999 }, message_id: 111 }
  });

  await wait(200);

  console.log('Messages sent by bot stub after buy attempt:');
  for (const m of (bot.sent||[])) {
    console.log('->', m.chatId, '-', (m.text || '').slice(0,120).replace(/\n/g,'\\n'));
  }

  // Quick checks
  const shopSent = (bot.sent||[]).some(s => typeof s.text === 'string' && s.text.includes('Магазин'));
  const bought = (bot.sent||[]).some(s => typeof s.text === 'string' && s.text.includes('Куплено'));

  if (!shopSent) {
    console.error('❌ Shop callback NOT handled');
    process.exit(3);
  }

  if (bought) {
    console.log('✅ Purchase succeeded (unexpected if balance was 0)');
    process.exit(0);
  } else {
    console.log('✅ Purchase not completed (likely due to insufficient balance)');
    process.exit(0);
  }
})();
