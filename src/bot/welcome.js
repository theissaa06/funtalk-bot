// ============================================================
// src/bot/welcome.js
// Уникальное приветствие каждого нового участника
// ============================================================

const { Markup } = require('telegraf');

// ── Шаблоны приветствий — подставляем имя ────────────────────
const WELCOME_TEMPLATES = [
  (name) =>
    `🎉 О, новый человек!\n\n` +
    `*${name}*, добро пожаловать в чат! 👋\n\n` +
    `Здесь общаются, шутят и просто кайфуют.\n` +
    `Не стесняйся — залетай в разговор 😄`,

  (name) =>
    `✨ Чат пополнился!\n\n` +
    `Привет, *${name}*! Рады видеть тебя здесь 🔥\n\n` +
    `Пиши, общайся, не молчи — у нас не кусаются 😎`,

  (name) =>
    `👀 *${name}* только что вошёл в чат.\n\n` +
    `Добро пожаловать! 🎊\n` +
    `Здесь собрались люди, которым не скучно.\n` +
    `Присоединяйся к разговору 💬`,

  (name) =>
    `🚀 Новый участник!\n\n` +
    `*${name}*, ты попал в правильное место 😄\n\n` +
    `Общайся, шути, знакомься.\n` +
    `Главное — без токсичности, всё остальное можно 🙌`,

  (name) =>
    `💫 Хей, *${name}*!\n\n` +
    `Добро пожаловать в наш чат 👋\n\n` +
    `Тут всегда есть с кем поговорить.\n` +
    `Не молчи — напиши что-нибудь! 😊`,

  (name) =>
    `🌟 *${name}* зашёл в чат!\n\n` +
    `Добро пожаловать 🎉\n\n` +
    `Мы рады всем, кто умеет нормально общаться.\n` +
    `Напиши /help — узнай что умеет бот 🤖`,

  (name) =>
    `🎭 Внимание! В чат зашёл *${name}*!\n\n` +
    `Добро пожаловать 😄\n\n` +
    `Здесь можно болтать, шутить и просто быть собой.\n` +
    `Не стесняйся — мы не кусаемся 🐾`,

  (name) =>
    `🔥 *${name}*, ты здесь!\n\n` +
    `Добро пожаловать в чат 👋\n\n` +
    `Общайся, задавай вопросы, участвуй в разговорах.\n` +
    `Рады тебя видеть! ✨`,

  (name) =>
    `😄 Привет, *${name}*!\n\n` +
    `Ты попал в хорошее место 🌟\n\n` +
    `Здесь всегда есть движ и интересные люди.\n` +
    `Залетай в разговор — не пожалеешь 💬`,

  (name) =>
    `🎊 Чат встречает *${name}*!\n\n` +
    `Добро пожаловать 🙌\n\n` +
    `Пиши, общайся, знакомься.\n` +
    `Мы рады каждому новому человеку! 💫`,
];

// ── Уникальные факты/вопросы для первого сообщения ───────────
const FIRST_QUESTIONS = [
  '❓ Кстати, расскажи о себе — откуда ты?',
  '❓ Как тебя занесло в этот чат?',
  '❓ Что сейчас слушаешь? 🎵',
  '❓ Чем занимаешься в свободное время?',
  '❓ Какой последний фильм смотрел?',
  '❓ Есть любимая игра или сериал?',
  '❓ Что тебя сегодня порадовало?',
  '❓ Как настроение? 😊',
];

function getRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function registerWelcome(bot) {
  bot.on('new_chat_members', async (ctx) => {
    try {
      const chatType = ctx.chat?.type;
      if (chatType !== 'group' && chatType !== 'supergroup') return;

      const newMembers = ctx.message?.new_chat_members || [];
      const botInfo = await ctx.telegram.getMe();

      for (const member of newMembers) {
        // Бот сам зашёл в чат
        if (member.id === botInfo.id) {
          await ctx.reply(
            `👋 *Всем привет! Я FunTalk Bot.*\n\n` +
            `Помогу с общением, модерацией и развлечениями.\n\n` +
            `📖 /help — все команды\n` +
            `⚙️ /settings — настройки\n` +
            `🛡 /systemcheck — проверка прав`,
            {
              parse_mode: 'Markdown',
              ...Markup.inlineKeyboard([
                [Markup.button.callback('📖 Что я умею?', 'help_all')],
              ]),
            }
          );
          continue;
        }

        if (member.is_bot) continue;

        // Формируем имя
        const name = member.first_name
          ? member.first_name
          : (member.username ? `@${member.username}` : 'новый участник');

        // Выбираем уникальный шаблон на основе ID пользователя
        // (один и тот же человек всегда получит одно и то же приветствие)
        const templateIdx = member.id % WELCOME_TEMPLATES.length;
        const template = WELCOME_TEMPLATES[templateIdx];
        const question = getRandom(FIRST_QUESTIONS);

        await ctx.reply(
          template(name) + `\n\n${question}`,
          {
            parse_mode: 'Markdown',
            ...Markup.inlineKeyboard([
              [
                Markup.button.callback('📖 Команды', 'help_back'),
                Markup.button.callback('🎁 Бонусы', 'help_economy'),
              ],
              [
                Markup.button.callback('😂 Мемы', 'help_fun'),
                Markup.button.callback('🤝 Социальное', 'help_social'),
              ],
            ]),
          }
        );
      }
    } catch (error) {
      console.error('[Welcome Error]', error.message);
    }
  });
}

module.exports = { registerWelcome };
