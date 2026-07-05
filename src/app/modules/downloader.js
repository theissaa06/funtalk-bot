const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { Markup } = require('telegraf');
const { safeEditOrReply, safeReply } = require('../safeTelegram');
const { parseArgs } = require('../format');

const URL_RE = /(https?:\/\/(?:[^\s/]+\.)?(?:tiktok\.com|youtube\.com|youtu\.be)[^\s]*)/i;
const cooldown = new Map();
const waitingForLink = new Set();
const COOLDOWN_MS = 2 * 60 * 1000;
const MAX_BYTES = 48 * 1024 * 1024;

function extractMediaUrl(text) {
  const match = String(text || '').match(URL_RE);
  return match?.[1]?.replace(/[),.]+$/, '') || null;
}

function safeName(value) {
  return String(value).replace(/[^a-z0-9_-]/gi, '_').slice(0, 80);
}

function sessionKey(ctx) {
  return `${ctx.chat?.id || 'private'}:${ctx.from?.id}`;
}

function downloaderKeyboard() {
  return Markup.inlineKeyboard([
    [Markup.button.callback('Жду ссылку', 'downloader:wait')],
    [
      Markup.button.callback('Настройки', 'settings:panel'),
      Markup.button.callback('Меню', 'menu:home'),
    ],
  ]);
}

function downloaderText(ctx) {
  const autoText = ctx.chat?.type === 'private'
    ? 'В личке можно просто отправить ссылку.'
    : 'В группе можно нажать "Жду ссылку" или включить автоскачивание в настройках.';
  return [
    '<b>Скачать TikTok / YouTube</b>',
    '',
    'Отправь ссылку на TikTok, YouTube или youtu.be.',
    'Также работает команда: <code>/dl ссылка</code>.',
    '',
    autoText,
  ].join('\n');
}

function runYtDlp(app, url, outputDir) {
  const binary = process.env.YTDLP_PATH || 'yt-dlp';
  const outputTemplate = path.join(outputDir, '%(title).80s-%(id)s.%(ext)s');
  const args = [
    '--no-playlist',
    '--max-filesize', '48M',
    '--format', 'bv*+ba/b[filesize<48M]/best[filesize<48M]/best',
    '--output', outputTemplate,
    url,
  ];

  return new Promise((resolve, reject) => {
    const child = spawn(binary, args, { windowsHide: true });
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error('download timeout'));
    }, 120000);

    child.stderr.on('data', chunk => {
      stderr += chunk.toString();
    });

    child.on('error', error => {
      clearTimeout(timer);
      reject(error);
    });

    child.on('close', code => {
      clearTimeout(timer);
      if (code !== 0) {
        reject(new Error(stderr || `yt-dlp exited with code ${code}`));
        return;
      }
      const files = fs.readdirSync(outputDir)
        .map(file => path.join(outputDir, file))
        .filter(file => fs.statSync(file).isFile())
        .sort((left, right) => fs.statSync(right).mtimeMs - fs.statSync(left).mtimeMs);
      const file = files[0];
      if (!file) reject(new Error('downloaded file not found'));
      else resolve(file);
    });
  });
}

async function downloadAndSend(ctx, app, url) {
  const key = sessionKey(ctx);
  const leftMs = COOLDOWN_MS - (Date.now() - (cooldown.get(key) || 0));
  if (leftMs > 0) {
    return safeReply(ctx, `Скачивание доступно через ${Math.ceil(leftMs / 1000)} сек.`);
  }
  cooldown.set(key, Date.now());

  const outputDir = path.join(app.config.dataDir, '..', 'downloads', `${Date.now()}_${safeName(ctx.from.id)}`);
  fs.mkdirSync(outputDir, { recursive: true });

  try {
    await safeReply(ctx, 'Скачиваю медиа. Если ссылка приватная или слишком большая, скажу об этом.');
    const file = await runYtDlp(app, url, outputDir);
    const stat = fs.statSync(file);
    if (stat.size > MAX_BYTES) {
      return safeReply(ctx, 'Файл получился больше лимита Telegram для быстрой отправки. Попробуй короткое видео.');
    }
    await ctx.replyWithDocument({ source: file }, { caption: 'Готово.' });
  } catch (error) {
    app.logger.warn('download failed:', error.message);
    const installHint = /ENOENT/i.test(error.message)
      ? '\n\nНа сервере не найден yt-dlp. Установи его или укажи путь в YTDLP_PATH.'
      : '';
    await safeReply(ctx, `Не удалось скачать медиа. Проверь ссылку или попробуй позже.${installHint}`);
  } finally {
    try {
      fs.rmSync(outputDir, { recursive: true, force: true });
    } catch {}
  }
}

function registerDownloader(app) {
  app.renderers.downloader = async ctx => {
    await safeEditOrReply(ctx, downloaderText(ctx), { parse_mode: 'HTML', ...downloaderKeyboard() });
  };

  app.bot.command('dl', async ctx => {
    const url = extractMediaUrl(parseArgs(ctx).join(' '));
    if (!url) return safeReply(ctx, 'Использование: /dl <ссылка TikTok или YouTube>');
    return downloadAndSend(ctx, app, url);
  });

  app.callbackRouter.on('downloader', async (ctx, route) => {
    if (route.action === 'wait') {
      waitingForLink.add(sessionKey(ctx));
      return safeEditOrReply(ctx, [
        '<b>Жду ссылку</b>',
        '',
        'Отправь следующим сообщением ссылку на TikTok или YouTube.',
        'Я скачаю медиа и пришлю файл сюда.',
      ].join('\n'), { parse_mode: 'HTML', ...downloaderKeyboard() });
    }
    return app.renderers.downloader(ctx);
  });

  app.bot.on('text', async (ctx, next) => {
    const url = extractMediaUrl(ctx.message?.text);
    const key = sessionKey(ctx);
    const isWaiting = waitingForLink.has(key);

    if (!url) {
      if (isWaiting && !String(ctx.message?.text || '').startsWith('/')) {
        return safeReply(ctx, 'Это не похоже на TikTok/YouTube-ссылку. Пришли ссылку или открой /menu.');
      }
      return next();
    }

    if (isWaiting) {
      waitingForLink.delete(key);
      return downloadAndSend(ctx, app, url);
    }

    if (ctx.chat?.type !== 'private') {
      const settings = app.repos.chats.getSettings(ctx.chat.id);
      if (!settings.autoDownloaderEnabled) return next();
    }
    return downloadAndSend(ctx, app, url);
  });
}

module.exports = {
  registerDownloader,
  extractMediaUrl,
  downloaderText,
};
