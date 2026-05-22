require('dotenv').config();
const https = require('https');
const token = process.env.BOT_TOKEN;
const url = `https://api.telegram.org/bot${token}/getUpdates?timeout=1`;
console.log('REQUEST', url.replace(token, token.slice(0,10)+'...'));
https.get(url, (res) => {
  let body = '';
  res.on('data', (d) => { body += d; });
  res.on('end', () => {
    console.log('STATUS', res.statusCode);
    console.log('BODY', body);
    process.exit(0);
  });
}).on('error', (e) => {
  console.error('ERR', e.message);
  process.exit(1);
});
