// ============================================================
// src/bot/welcome.js
// Приветствие новых участников в группе
// ============================================================

const { Markup } = require('telegraf');

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
            `📖 Нажми /help чтобы увидеть все команды\n` +
            `⚙️ Нажми /settings для настройки\n` +
            `🛡 Нажми /systemcheck для проверки прав`,
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

        const name = member.first_name || member.username || 'новый участник';

        await ctx.reply(
          `👋 *${name}* только что вошёл в чат!\n\n` +
          `Добро пожаловать 🎉\n\n` +
          `Я *FunTalk Bot* — помогу с общением и развлечениями.\n` +
          `Напиши /help чтобы узнать что я умею 👇`,
          {
            parse_mode: 'Markdown',
            ...Markup.inlineKeyboard([
              [
                Markup.button.callback('📖 Команды', 'help_back'),
                Markup.button.callback('😂 Мемы', 'help_fun'),
              ],
              [
                Markup.button.callback('🤝 Социальное', 'help_social'),
                Markup.button.callback('🎁 Бонусы', 'help_economy'),
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
