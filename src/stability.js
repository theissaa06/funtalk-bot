// ============================================================
// src/stability.js
// Стабильность: глобальный обработчик ошибок, keep-alive,
// graceful shutdown для Render.
// ============================================================

/**
 * Зарегистрировать глобальные обработчики ошибок.
 * Вызвать ОДИН РАЗ в index.js до bot.launch().
 * @param {object} bot — экземпляр Telegraf
 */
function setupStability(bot) {

  // ── Ошибки Telegraf ───────────────────────────────────────────
  bot.catch((err, ctx) => {
    const type = ctx?.updateType || 'unknown';
    console.error(`[bot.catch] Ошибка в обработчике (${type}):`, err.message);

    // Не отвечаем пользователю — это может вызвать цикл ошибок
    // Просто логируем и продолжаем
  });

  // ── Необработанные исключения Node.js ────────────────────────
  process.on('uncaughtException', (err) => {
    console.error('[uncaughtException]', err.message);
    // НЕ завершаем процесс — Render перезапустит при реальном падении
  });

  process.on('unhandledRejection', (reason) => {
    console.error('[unhandledRejection]', reason instanceof Error ? reason.message : reason);
  });

  // ── Graceful shutdown ─────────────────────────────────────────
  const stop = (signal) => {
    console.log(`\n[stability] Получен сигнал ${signal}. Останавливаем бота...`);
    bot.stop(signal);
    process.exit(0);
  };

  process.once('SIGINT',  () => stop('SIGINT'));
  process.once('SIGTERM', () => stop('SIGTERM'));

  // ── Keep-alive HTTP-сервер для Render ────────────────────────
  // Render завершает сервис, если нет входящих HTTP-запросов.
  // Этот минимальный сервер предотвращает засыпание.
  const http = require('http');
  const PORT = process.env.PORT || 3000;

  http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('FunTalk Bot is running ✅');
  }).listen(PORT, () => {
    console.log(`🌐 Keep-alive сервер слушает порт ${PORT}`);
  });

  console.log('✅ Модуль stability подключён');
}

module.exports = { setupStability };
