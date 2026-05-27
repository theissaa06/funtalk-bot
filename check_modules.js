const modules = ['moderation', 'removeUser', 'pin', 'levels', 'economy', 'call', 'chatTools', 'adminRanks', 'security', 'advancedSecurity', 'commandDocs', 'systemTools', 'autoResponder'];

const botModules = ['menu', 'welcome', 'communication', 'dating', 'memes', 'greetings', 'randomPhrase', 'aiAssistant', 'settings', 'shipping', 'games', 'shop', 'achievements', 'reputation', 'chatstats', 'downloader', 'safety'];

console.log('=== Проверка модулей src/ ===');
modules.forEach(m => {
  try {
    require(`./src/${m}.js`);
    console.log(`✅ ${m}`);
  } catch(e) {
    console.log(`❌ ${m}: ${e.message.split('\n')[0]}`);
  }
});

console.log('\n=== Проверка модулей src/bot/ ===');
botModules.forEach(m => {
  try {
    require(`./src/bot/${m}.js`);
    console.log(`✅ ${m}`);
  } catch(e) {
    console.log(`❌ ${m}: ${e.message.split('\n')[0]}`);
  }
});
