# FunTalk Bot v3.0

Групповой Telegram-бот с модерацией, уровнями, экономикой и развлечениями.

## Стек
- Node.js 18+
- Telegraf 4.x
- better-sqlite3
- dotenv
- Render hosting

---

## Структура проекта

```
src/
├── index.js          # Точка входа — короткая, только подключение модулей
├── db.js             # Подключение к SQLite (единая точка)
├── utils.js          # Общие утилиты: isUserAdmin, formatName, getRandom и др.
├── moderation.js     # Мут, бан, кик, предупреждения, антифлуд
├── levels.js         # Система уровней и XP
├── economy.js        # Монеты, ежедневный бонус, переводы
├── chatTools.js      # /commands, /id, /info, /ping, /meme и др.
├── adminRanks.js     # Ранги администраторов
├── autoResponder.js  # Авто-ответы на ключевые слова
├── stability.js      # Keep-alive HTTP, graceful shutdown
└── data/
    ├── greetings.js  # Приветствия новых участников
    ├── phrases.js    # Фразы: мемы, темы, рандом
    └── memes.js      # Банк мемов
data/
└── bot.sqlite        # База данных (создаётся автоматически)
```

---

## Локальный запуск

```bash
# 1. Установить зависимости
npm install

# 2. Создать .env
cp .env.example .env
# Заполни BOT_TOKEN

# 3. Запустить
npm start          # продакшн
npm run dev        # разработка (nodemon)
```

---

## Деплой на Render

1. Залей проект в GitHub
2. Создай новый Web Service на render.com
3. Build Command: `npm install`
4. Start Command: `npm start`
5. В Environment Variables добавь:
   - `BOT_TOKEN` = токен от @BotFather
   - `DATABASE_URL` = `./data/bot.sqlite`

---

## Переменные окружения

| Переменная     | Описание                          | Пример          |
|----------------|-----------------------------------|-----------------|
| `BOT_TOKEN`    | Токен Telegram-бота               | `1234:ABC...`   |
| `BOT_ADMIN_IDS`| ID администраторов бота           | `123456789`     |
| `DATABASE_URL` | Путь к SQLite-файлу               | `./data/bot.sqlite` |
| `PORT`         | Порт keep-alive сервера (Render)  | `3000`          |

---

## Ключевые команды

| Команда       | Описание                          |
|---------------|-----------------------------------|
| `/commands`   | Список всех команд                |
| `/rank`       | Твой уровень и XP                 |
| `/top`        | Топ чата                          |
| `/daily`      | Ежедневный бонус монет            |
| `/coins`      | Баланс монет                      |
| `/meme`       | Случайный мем                     |
| `/mute`       | Замутить (для администраторов)    |
| `/ban`        | Забанить (для администраторов)    |
| `/warn`       | Предупреждение                    |
| `/admins`     | Список администраторов чата       |

---

## Защита администраторов

Бот **никогда** не применяет мут, бан, кик или предупреждения к:
- владельцу чата (`creator`)
- администраторам чата (`administrator`)

При попытке — бот отвечает: `🛡 Нельзя применить действие к администратору`.
