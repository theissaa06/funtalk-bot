# FulTalchik_Botik v3.0.1

Обновлённый модульный бот для Telegram-бесед на Node.js + Telegraf.

## Что внутри

- модульный слой `src/app/*` с единым callback-router;
- inline-меню без старых Telegram reply-кнопок;
- модерация: варны, муты, баны, кик, антифлуд, лог действий;
- экономика: FunMoney, daily, переводы, owner-выдача/списание с логами;
- магазин: покупки, daily deal, лутбоксы, консумаблы, sell-back, gifting;
- ачивки: event-hook, rarity, награды и toast-уведомления;
- топы активности и монет, закрепляемый leaderboard с автообновлением;
- мини-игры: КНБ кнопками, слоты, рулетка;
- поддержка через бота с reply-ответами разработчика;
- ИИ-помощник через Gemini/OpenAI/Claude;
- `/dl` для TikTok/YouTube через `yt-dlp`.

## Railway Variables

```env
BOT_TOKEN=...
BOT_USERNAME=FunTalchik_Botik
OWNER_ID=7887217301
NODE_ENV=production
AI_PROVIDER=gemini
GEMINI_API_KEY=...
GEMINI_MODEL=gemini-2.5-flash
OPENAI_API_KEY=...
AI_MODEL=gpt-4o-mini
CLAUDE_API_KEY=...
CLAUDE_MODEL=claude-3-5-sonnet-20241022
SUPPORT_CHAT_ID=...
YTDLP_PATH=yt-dlp
```

Для Gemini достаточно заполнить `GEMINI_API_KEY`. Для скачивания TikTok/YouTube на сервере должен быть доступен `yt-dlp` или путь к нему в `YTDLP_PATH`.

## Запуск

```bash
npm install
npm start
```

Не запускай локально и на Railway одновременно, иначе Telegram может дать 409 Conflict.
