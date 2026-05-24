const fs = require("fs");

const path = "index.js";
let code = fs.readFileSync(path, "utf8");

// ======================================================
// 1. Добавляем красивое ЛС-меню как у Iris
// ======================================================

const insertBefore = "// ═══════════════════════════════════════════════════════════════\n//  SCHEDULERS";

if (!code.includes("function botMainPrivateMenuText()")) {
  const menuBlock = `
function getBotPublicUsername() {
  return String((_botUser && _botUser.username) || BOT_USERNAME || 'FunTalchik_Botik')
    .replace(/^@/, '')
    .trim();
}

function botInviteUrl() {
  return 'https://t.me/' + getBotPublicUsername() + '?startgroup=true';
}

function botMainPrivateMenuText() {
  return \`🤖 <b>FulTalchik_Botik приветствует Вас!</b>

Я могу предложить следующие темы:

1️⃣ <b>общение</b> — профиль, топы, активность, монеты;
2️⃣ <b>знакомства</b> — дружба, отношения, пары и действия;
3️⃣ <b>приветствие</b> — встреча новых участников и правила;
4️⃣ <b>мем</b> — пятничные посты, комплименты и весёлые действия;
5️⃣ <b>игры</b> — простые развлечения для активности;
6️⃣ <b>вопрос</b> — как пользоваться ботом и что делать;
7️⃣ <b>помощь</b> — список основных команд;
8️⃣ <b>рандом</b> — случайные мини-функции.

━━━━━━━━━━━━━━
👥 <b>Бот работает в группах</b>
Добавьте меня в беседу и напишите там: <code>настроить</code>

📌 Для вызова меню напишите: <b>начать</b> или <b>помощь</b>.\`;
}

function botMainInlineKeyboard() {
  return {
    inline_keyboard: [
      [
        { text: '💬 Общение', callback_data: 'topic:chat' },
        { text: '❤️ Знакомства', callback_data: 'topic:social' }
      ],
      [
        { text: '👋 Приветствие', callback_data: 'topic:welcome' },
        { text: '😂 Мем', callback_data: 'topic:meme' }
      ],
      [
        { text: '🎮 Игры', callback_data: 'topic:games' },
        { text: '❓ Вопрос', callback_data: 'topic:question' }
      ],
      [
        { text: '📋 Помощь', callback_data: 'topic:help' },
        { text: '🎲 Рандом', callback_data: 'topic:random' }
      ],
      [
        { text: '➕ Добавить в свой чат', url: botInviteUrl() }
      ]
    ]
  };
}

function botReplyKeyboard() {
  return {
    keyboard: [
      [{ text: '💬 Общение' }, { text: '❤️ Знакомства' }],
      [{ text: '👋 Приветствие' }, { text: '😂 Мем' }],
      [{ text: '🎮 Игры' }, { text: '❓ Вопрос' }],
      [{ text: '📋 Помощь' }, { text: '🎲 Рандом' }]
    ],
    resize_keyboard: true
  };
}

const PRIVATE_TOPIC_TEXTS = {
  chat: \`💬 <b>Общение</b>

Здесь всё для активности беседы:

👤 <code>профиль</code> — профиль участника
🏆 <code>топ день</code> — топ активности за день
📊 <code>топ неделя</code> — топ за неделю
🪙 <code>монеты</code> — баланс
🎁 <code>магазин</code> — магазин ролей и бонусов

Бот считает текст, голосовые, фото, видео, стикеры и другую активность.\`,

  social: \`❤️ <b>Знакомства</b>

Раздел для дружбы, пар и общения:

🤝 <code>дружба @username</code> — предложить дружбу
❤️ <code>отношения @username</code> — предложить отношения
💔 <code>расстаться</code> — расстаться через кнопку
🤝 <code>раздружиться @username</code> — завершить дружбу

Также работает через reply на сообщение пользователя.\`,

  welcome: \`👋 <b>Приветствие</b>

Бот может встречать новых участников, показывать правила и помогать с порядком.

📜 <code>правила</code> — показать правила
⚙️ <code>настроить</code> — настроить бота в беседе
🛡 <code>настройки</code> — настройки группы

У каждой беседы свои правила, ранги, база и настройки.\`,

  meme: \`😂 <b>Мем и настроение</b>

Функции для лампового общения:

🌸 <code>комплимент</code>
🤗 <code>обнять</code>
😘 <code>поцеловать</code>
🍵 <code>чай</code>
🎉 <code>пятница</code>

Команды можно писать со слешем и без слеша.\`,

  games: \`🎮 <b>Игры</b>

Сейчас доступны простые активности через действия и рандомные функции.

Можно добавить дальше:
🎲 кубик
🪙 монетка
🎯 дуэль
✊ камень-ножницы-бумага
🎁 розыгрыши

Если хочешь — следующим этапом добавим полноценные мини-игры.\`,

  question: \`❓ <b>Вопросы</b>

Коротко:

1. Добавь бота в чат.
2. Дай права администратора.
3. Напиши в беседе: <code>настроить</code>
4. Отключи Privacy Mode у BotFather, чтобы бот видел обычные сообщения.
5. Используй <code>помощь</code> для списка команд.

Если бот не считает людей в БД — чаще всего включён Privacy Mode.\`,

  help: \`📋 <b>Помощь</b>

Основные команды:

<code>профиль</code>
<code>топ день</code>
<code>монеты</code>
<code>калл</code>
<code>база</code>
<code>правила</code>
<code>ранги</code>
<code>магазин</code>
<code>отношения</code>
<code>дружба</code>

Все команды работают со слешем и без слеша.\`,

  random: \`🎲 <b>Рандом</b>

Можно добавить в этот раздел:

🎲 случайное число
🪙 монетка
💬 случайная фраза
🎁 случайный бонус
😂 случайный комплимент

Сейчас этот раздел подготовлен как меню для будущих функций.\`
};

function topicBackKeyboard() {
  return {
    inline_keyboard: [
      [{ text: '🔙 Назад', callback_data: 'topic:back' }],
      [{ text: '➕ Добавить в свой чат', url: botInviteUrl() }]
    ]
  };
}

async function sendPrivateMainMenu(chatId) {
  await bot.sendMessage(chatId, botMainPrivateMenuText(), {
    parse_mode: 'HTML',
    reply_markup: botMainInlineKeyboard()
  });

  await bot.sendMessage(chatId, 'Выберите тему на клавиатуре ниже 👇', {
    reply_markup: botReplyKeyboard()
  });
}

async function sendPrivateTopic(chatId, topic) {
  const text = PRIVATE_TOPIC_TEXTS[topic];

  if (!text) {
    await bot.sendMessage(chatId, '❌ Раздел не найден.', {
      reply_markup: topicBackKeyboard()
    });
    return;
  }

  await bot.sendMessage(chatId, text, {
    parse_mode: 'HTML',
    reply_markup: topicBackKeyboard()
  });
}

function privateButtonToTopic(text) {
  const t = String(text || '').trim().toLowerCase();

  if (t.includes('общение')) return 'chat';
  if (t.includes('знакомства')) return 'social';
  if (t.includes('приветствие')) return 'welcome';
  if (t.includes('мем')) return 'meme';
  if (t.includes('игры')) return 'games';
  if (t.includes('вопрос')) return 'question';
  if (t.includes('помощь')) return 'help';
  if (t.includes('рандом')) return 'random';

  return null;
}

// ЛС-команды /start, начать, помощь
bot.onText(/^(\\/start|\\/help|начать|помощь)$/i, async (msg) => {
  try {
    if (msg.chat.type !== 'private') return;
    await sendPrivateMainMenu(msg.chat.id);
  } catch (error) {
    console.error('private start/help error:', error.message);
  }
});

// ЛС-кнопки обычной клавиатуры
bot.on('message', async (msg) => {
  try {
    if (!msg.from || msg.from.is_bot) return;
    if (msg.chat.type !== 'private') return;
    if (!msg.text) return;

    const topic = privateButtonToTopic(msg.text);

    if (topic) {
      await sendPrivateTopic(msg.chat.id, topic);
    }
  } catch (error) {
    console.error('private topic message error:', error.message);
  }
});

`;

  if (!code.includes(insertBefore)) {
    console.error("❌ Не нашёл место перед SCHEDULERS");
    process.exit(1);
  }

  code = code.replace(insertBefore, menuBlock + insertBefore);
}

// ======================================================
// 2. Добавляем обработку inline-кнопок topic:*
// ======================================================

const callbackMarker = "    // ── SETTINGS TOGGLE";

if (!code.includes("PRIVATE TOPIC MENU BUTTONS")) {
  const callbackBlock = `    // ── PRIVATE TOPIC MENU BUTTONS ─────────────────────
    if (data.startsWith('topic:')) {
      const topic = data.split(':')[1];

      if (topic === 'back') {
        await bot.answerCallbackQuery(query.id).catch(() => {});
        await bot.editMessageText(botMainPrivateMenuText(), {
          chat_id: chatId,
          message_id: msg.message_id,
          parse_mode: 'HTML',
          reply_markup: botMainInlineKeyboard()
        }).catch(async () => {
          await bot.sendMessage(chatId, botMainPrivateMenuText(), {
            parse_mode: 'HTML',
            reply_markup: botMainInlineKeyboard()
          });
        });
        return;
      }

      const text = PRIVATE_TOPIC_TEXTS[topic];

      if (!text) {
        await bot.answerCallbackQuery(query.id, { text: '❌ Раздел не найден.' }).catch(() => {});
        return;
      }

      await bot.answerCallbackQuery(query.id).catch(() => {});

      await bot.editMessageText(text, {
        chat_id: chatId,
        message_id: msg.message_id,
        parse_mode: 'HTML',
        reply_markup: topicBackKeyboard()
      }).catch(async () => {
        await bot.sendMessage(chatId, text, {
          parse_mode: 'HTML',
          reply_markup: topicBackKeyboard()
        });
      });

      return;
    }

`;

  if (!code.includes(callbackMarker)) {
    console.error("❌ Не нашёл место в callback_query перед SETTINGS TOGGLE");
    process.exit(1);
  }

  code = code.replace(callbackMarker, callbackBlock + callbackMarker);
}

fs.writeFileSync(path, code, "utf8");

console.log("✅ Добавлено ЛС-меню как у Iris");
console.log("✅ Добавлены темы: Общение, Знакомства, Приветствие, Мем, Игры, Вопрос, Помощь, Рандом");
console.log("✅ Добавлена кнопка: ➕ Добавить в свой чат");
console.log("✅ Добавлена reply-клавиатура в личке");
