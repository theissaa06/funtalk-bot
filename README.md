# FulTalchik_botik v4.0

Telegram-бот для группы «Клуб случайных людей»: модерация, русские/английские команды, ранги администрации, кнопки, правила, профиль, топ, экономика, магазин, антиспам, антиссылки, антимат, приветствие/прощание и деплой на Railway.

## Стек

- Node.js 18+
- Telegraf 4.x
- dotenv
- JSON база: `data/database.json`
- Railway/GitHub ready

## Быстрый запуск локально

```bash
npm install
cp .env.example .env
npm start
```

В Windows можно просто создать `.env` вручную и вставить:

```env
BOT_TOKEN=твой_новый_токен_от_BotFather
BOT_USERNAME=FunTalchik_Botik
OWNER_ID=7887217301
NODE_ENV=development
```

## Важно про токен

Не загружай `.env` в GitHub. Он уже добавлен в `.gitignore`.
Если токен был показан кому-то или загружен в чат, перевыпусти его через BotFather:
`/mybots` → выбрать бота → `API Token` → `Revoke current token`.

## Основные команды

### Помощь

- `/help`, `/помощь`, `/commands`, `/команды`

### Модерация

- `/mute`, `/мут`
- `/unmute`, `/унмут`
- `/ban`, `/бан`
- `/unban`, `/разбан`
- `/kick`, `/кик`
- `/warn`, `/пред`
- `/unwarn`, `/унпред`
- `/warns`, `/преды`
- `/actions`, `/действия`
- `/history`, `/история`
- `/del`, `/удалить`

Примеры:

```text
/мут 123456789 60 флуд
Ответ на сообщение → /мут 30 мат
/бан 123456789 реклама
Ответ на сообщение → /кик нарушение
```

### Ранги администрации

- `/rank`, `/ранг`
- `/ranks`, `/ранги`
- `/admins`, `/админы`
- `/setrank`, `/выдатьранг`
- `/delrank`, `/снятьранг`

Команды для конкретных рангов:

- `/owner`, `/владелец` — 100
- `/deputy`, `/зам`, `/заместитель` — 95
- `/headadmin`, `/главныйадмин`, `/главадмин` — 90
- `/curator`, `/куратор` — 80
- `/senioradmin`, `/старшийадмин`, `/стадмин` — 70
- `/admin`, `/админ` — 60
- `/junioradmin`, `/младшийадмин`, `/младший` — 50
- `/seniormoder`, `/старшиймодер`, `/стмодер` — 40
- `/moder`, `/модер`, `/модератор` — 30
- `/helper`, `/хелпер`, `/помощник` — 20
- `/trainee`, `/стажер`, `/стажёр` — 10
- `/user`, `/пользователь` — снять ранг

Примеры:

```text
/admin 123456789
Ответ на сообщение → /модер
/setrank 123456789 50
/delrank 123456789
```

Главный администратор 90 может назначать максимум куратора 80 и ниже. Он не может выдать 90/95/100 и не может снять равного или старшего.

### Правила

- `/rules`, `/правила`
- `/setrules`, `/установитьправила`

### Настройки

- `/settings`, `/настройки`
- `/antispam`, `/антиспам` `on/off`
- `/antilinks`, `/ссылки` `on/off`
- `/antimat`, `/антимат` `on/off`
- `/welcome`, `/приветствие` `on/off`
- `/goodbye`, `/прощание` `on/off`
- `/setlog`, `/сетлог`
- `/logs`, `/логи`

### Профиль и активность

- `/profile`, `/профиль`
- `/top`, `/топ`
- `/level`, `/уровень`
- `/balance`, `/баланс`
- `/daily`, `/ежедневно`
- `/rep`, `/реп`
- `/minusrep`, `/минусреп`
- `/myrep`, `/мояреп`

### Магазин

- `/shop`, `/магазин`
- `/buy`, `/купить`
- `/title`, `/титул`
- `/removetitle`, `/снятьтитул`

Товары:

- `vip` — 5000 монет
- `premium` — 10000 монет
- `title` — 7000 монет
- `shield` — 12000 монет
- `color` — 3000 монет
- `repboost` — 4000 монет

## Деплой на GitHub

```bash
git init
git add .
git commit -m "Initial FulTalchik bot"
git branch -M main
git remote add origin https://github.com/USERNAME/REPOSITORY.git
git push -u origin main
```

## Деплой на Railway

1. Railway → New Project.
2. Deploy from GitHub repo.
3. Выбрать репозиторий.
4. Variables добавить:

```env
BOT_TOKEN=твой_новый_токен_от_BotFather
BOT_USERNAME=FunTalchik_Botik
OWNER_ID=7887217301
NODE_ENV=production
```

5. Railway сам запустит `npm start`.
6. В Logs должно быть:

```text
✅ FulTalchik_botik запущен!
🚀 GitHub/Railway ready
```

## Частые ошибки

### BOT_TOKEN не найден

Добавь BOT_TOKEN в `.env` локально или в Railway Variables.

### 409 Conflict

Бот запущен в двух местах. Останови локальный `npm start`, если бот уже работает на Railway.

### not enough rights

Дай боту права администратора в группе: удаление сообщений, бан/ограничение пользователей.

### Скачивание видео не работает на Railway

Функция скачивания требует `yt-dlp`/Python. На Railway это может не работать без дополнительной настройки. Остальной функционал бота работает без этого.
