// ============================================================
// src/bot/downloader.js
// Скачивание видео и фото с TikTok, YouTube, Instagram, VK
//
// Работает через yt-dlp (установлен в nixpacks.toml).
// Поддерживает:
//   - TikTok (видео без водяного знака, фото-коллажи)
//   - YouTube (видео до 50 МБ)
//   - Instagram (reels, посты с фото)
//   - VK (видео)
//   - Любые другие ссылки, которые поддерживает yt-dlp
// ============================================================

const { execFile } = require('child_process');
const { promisify } = require('util');
const fs   = require('fs');
const path = require('path');

const execFileAsync = promisify(execFile);

const DOWNLOAD_DIR = path.join(process.cwd(), 'downloads');
if (!fs.existsSync(DOWNLOAD_DIR)) fs.mkdirSync(DOWNLOAD_DIR, { recursive: true });

// Максимальный размер файла для отправки в Telegram (50 МБ)
const MAX_FILE_SIZE = 50 * 1024 * 1024;

// Кулдаун: один пользователь не чаще раза в 30 сек
const downloadCooldown = new Map();
const DOWNLOAD_CD_MS   = 30 * 1000;

// ── Определить тип ссылки ─────────────────────────────────────
function detectPlatform(url) {
  if (/tiktok\.com|vm\.tiktok\.com|vt\.tiktok\.com/i.test(url)) return 'tiktok';
  if (/youtube\.com|youtu\.be/i.test(url))                        return 'youtube';
  if (/instagram\.com/i.test(url))                                return 'instagram';
  if (/vk\.com|vkvideo\.ru/i.test(url))                           return 'vk';
  return 'other';
}

function isMediaUrl(text) {
  return /https?:\/\/(www\.)?(tiktok\.com|vm\.tiktok\.com|vt\.tiktok\.com|youtube\.com|youtu\.be|instagram\.com|vk\.com|vkvideo\.ru)/i.test(text || '');
}

// ── Получить метаданные через yt-dlp ─────────────────────────
async function getMediaInfo(url) {
  try {
    const { stdout } = await execFileAsync('yt-dlp', [
      '--dump-json',
      '--no-playlist',
      '--flat-playlist',
      url,
    ], { timeout: 15000 });
    return JSON.parse(stdout.trim().split('\n')[0]);
  } catch {
    return null;
  }
}

// ── Скачать видео ─────────────────────────────────────────────
async function downloadVideo(url, platform) {
  const fileName   = `video_${Date.now()}_${Math.random().toString(36).slice(2)}.mp4`;
  const outputPath = path.join(DOWNLOAD_DIR, fileName);

  const args = [
    '--no-playlist',
    '--merge-output-format', 'mp4',
    '-o', outputPath,
  ];

  // TikTok — без водяного знака
  if (platform === 'tiktok') {
    args.push('--extractor-args', 'tiktok:api_hostname=api22-normal-c-useast2a.tiktokv.com');
  }

  // YouTube — ограничиваем качество чтобы не превысить 50 МБ
  if (platform === 'youtube') {
    args.push('-f', 'bestvideo[height<=720][ext=mp4]+bestaudio[ext=m4a]/best[height<=720][ext=mp4]/best[ext=mp4]/best');
  } else {
    args.push('-f', 'mp4/best[ext=mp4]/best');
  }

  args.push(url);

  await execFileAsync('yt-dlp', args, { timeout: 60000 });
  return outputPath;
}

// ── Скачать фото-коллаж (TikTok slideshow) ───────────────────
async function downloadPhotos(url) {
  const pattern    = path.join(DOWNLOAD_DIR, `photo_${Date.now()}_%(autonumber)s.%(ext)s`);
  const outputGlob = path.join(DOWNLOAD_DIR, `photo_${Date.now()}_*`);

  await execFileAsync('yt-dlp', [
    '--no-playlist',
    '--write-thumbnail',
    '--skip-download',
    '-o', pattern,
    url,
  ], { timeout: 30000 });

  // Ищем скачанные файлы
  const files = fs.readdirSync(DOWNLOAD_DIR)
    .filter(f => f.startsWith(`photo_${Date.now().toString().slice(0, 8)}`))
    .map(f => path.join(DOWNLOAD_DIR, f));

  return files;
}

// ── Очистить временные файлы ──────────────────────────────────
function cleanup(...files) {
  for (const f of files) {
    try {
      if (f && fs.existsSync(f)) fs.unlinkSync(f);
    } catch {}
  }
}

// ── Платформа → эмодзи ───────────────────────────────────────
const PLATFORM_EMOJI = {
  tiktok:    '🎵',
  youtube:   '▶️',
  instagram: '📸',
  vk:        '🔵',
  other:     '🎬',
};

// ── Регистрация ───────────────────────────────────────────────
function registerDownloader(bot) {

  // Команда /download [url] или /dl [url]
  bot.command(['download', 'dl', 'скачать', 'save'], async (ctx) => {
    const args = ctx.message.text.split(' ').slice(1);
    const url  = args[0] || ctx.message.reply_to_message?.text;

    if (!url || !isMediaUrl(url)) {
      return ctx.reply(
        `🎬 <b>Скачать медиа</b>\n\n` +
        `Отправь ссылку на видео или фото:\n` +
        `/download [ссылка]\n\n` +
        `<b>Поддерживаемые платформы:</b>\n` +
        `🎵 TikTok (видео без водяного знака, фото-коллажи)\n` +
        `▶️ YouTube (до 720p)\n` +
        `📸 Instagram (reels, посты)\n` +
        `🔵 VK Видео\n\n` +
        `Или просто отправь ссылку в чат — бот скачает автоматически!`,
        { parse_mode: 'HTML' }
      );
    }

    await handleDownload(ctx, url);
  });

  // Автоматическое скачивание при отправке ссылки в чат
  bot.on('text', async (ctx, next) => {
    const text = ctx.message?.text || '';
    if (!isMediaUrl(text)) return next();

    // Не реагируем на команды
    if (text.startsWith('/')) return next();

    await handleDownload(ctx, text.trim());
    return next();
  });

  console.log('✅ Модуль downloader подключён');
}

// ── Основная логика скачивания ────────────────────────────────
async function handleDownload(ctx, url) {
  const userId = ctx.from.id;
  const now    = Date.now();
  const last   = downloadCooldown.get(userId) || 0;

  if (now - last < DOWNLOAD_CD_MS) {
    const left = Math.ceil((DOWNLOAD_CD_MS - (now - last)) / 1000);
    return ctx.reply(`⏳ Подожди ещё <b>${left} сек.</b> перед следующей загрузкой.`, { parse_mode: 'HTML' });
  }

  const platform = detectPlatform(url);
  const emoji    = PLATFORM_EMOJI[platform];

  const loadingMsg = await ctx.reply(`${emoji} Скачиваю... Подожди немного ⏳`);

  downloadCooldown.set(userId, now);

  let videoPath = null;

  try {
    // Пробуем скачать видео
    videoPath = await downloadVideo(url, platform);

    // Проверяем размер
    if (!fs.existsSync(videoPath)) {
      throw new Error('Файл не создан');
    }

    const size = fs.statSync(videoPath).size;
    if (size > MAX_FILE_SIZE) {
      cleanup(videoPath);
      await ctx.telegram.deleteMessage(ctx.chat.id, loadingMsg.message_id).catch(() => {});
      return ctx.reply(
        `❌ Видео слишком большое (${Math.round(size / 1024 / 1024)} МБ).\n` +
        `Telegram принимает файлы до 50 МБ.\n\n` +
        `Попробуй ссылку на более короткое видео.`
      );
    }

    // Удаляем сообщение "Скачиваю..."
    await ctx.telegram.deleteMessage(ctx.chat.id, loadingMsg.message_id).catch(() => {});

    // Отправляем видео
    await ctx.replyWithVideo(
      { source: videoPath },
      {
        caption: `${emoji} Скачано через FunTalk Bot`,
        supports_streaming: true,
      }
    );

    cleanup(videoPath);

  } catch (err) {
    cleanup(videoPath);
    console.error('[downloader]', err.message);

    await ctx.telegram.deleteMessage(ctx.chat.id, loadingMsg.message_id).catch(() => {});

    // Если видео не скачалось — пробуем как фото (TikTok slideshow)
    if (platform === 'tiktok') {
      await tryDownloadPhotos(ctx, url, emoji);
    } else {
      await ctx.reply(
        `❌ Не удалось скачать.\n\n` +
        `Возможные причины:\n` +
        `• Видео приватное или удалено\n` +
        `• Ссылка устарела\n` +
        `• Платформа временно недоступна\n\n` +
        `Попробуй ещё раз или другую ссылку.`
      );
    }
  }
}

// ── Попытка скачать как фото (TikTok slideshow) ───────────────
async function tryDownloadPhotos(ctx, url, emoji) {
  const loadingMsg = await ctx.reply(`📸 Пробую скачать как фото-коллаж...`);
  const photos     = [];

  try {
    // Скачиваем через yt-dlp с флагом для фото
    const pattern = path.join(DOWNLOAD_DIR, `tk_${Date.now()}_%(autonumber)03d.%(ext)s`);
    const prefix  = `tk_${Date.now()}`;

    await execFileAsync('yt-dlp', [
      '--no-playlist',
      '-o', pattern,
      url,
    ], { timeout: 45000 });

    // Собираем скачанные файлы
    const allFiles = fs.readdirSync(DOWNLOAD_DIR);
    const myFiles  = allFiles
      .filter(f => f.startsWith(prefix))
      .map(f => path.join(DOWNLOAD_DIR, f))
      .filter(f => fs.existsSync(f));

    if (!myFiles.length) throw new Error('Файлы не найдены');

    await ctx.telegram.deleteMessage(ctx.chat.id, loadingMsg.message_id).catch(() => {});

    // Если один файл — отправляем как видео или фото
    if (myFiles.length === 1) {
      const file = myFiles[0];
      const ext  = path.extname(file).toLowerCase();

      if (['.mp4', '.mov', '.avi', '.webm'].includes(ext)) {
        await ctx.replyWithVideo({ source: file }, { caption: `${emoji} Скачано через FunTalk Bot`, supports_streaming: true });
      } else {
        await ctx.replyWithPhoto({ source: file }, { caption: `${emoji} Скачано через FunTalk Bot` });
      }
      cleanup(file);
      return;
    }

    // Несколько файлов — отправляем как медиагруппу (альбом)
    const mediaGroup = [];
    for (const file of myFiles.slice(0, 10)) { // Telegram лимит — 10 в альбоме
      const ext = path.extname(file).toLowerCase();
      if (['.jpg', '.jpeg', '.png', '.webp'].includes(ext)) {
        mediaGroup.push({ type: 'photo', media: { source: file } });
      } else if (['.mp4', '.mov'].includes(ext)) {
        mediaGroup.push({ type: 'video', media: { source: file }, supports_streaming: true });
      }
      photos.push(file);
    }

    if (mediaGroup.length > 0) {
      // Добавляем подпись к первому элементу
      mediaGroup[0].caption = `${emoji} Скачано через FunTalk Bot (${mediaGroup.length} фото)`;
      await ctx.replyWithMediaGroup(mediaGroup);
    }

    cleanup(...photos);

  } catch (err) {
    console.error('[downloader:photos]', err.message);
    cleanup(...photos);
    await ctx.telegram.deleteMessage(ctx.chat.id, loadingMsg.message_id).catch(() => {});
    await ctx.reply(
      `❌ Не удалось скачать.\n\n` +
      `Возможные причины:\n` +
      `• Видео/фото приватное\n` +
      `• Ссылка устарела\n` +
      `• yt-dlp не установлен на сервере\n\n` +
      `Попробуй другую ссылку.`
    );
  }
}

module.exports = { registerDownloader, isMediaUrl };
