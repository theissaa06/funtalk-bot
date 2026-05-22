function registerWelcome(bot) {
  bot.on("new_chat_members", async (ctx) => {
    try {
      const chatType = ctx.chat?.type;

      if (chatType !== "group" && chatType !== "supergroup") {
        return;
      }

      const newMembers = ctx.message?.new_chat_members || [];
      const botInfo = await ctx.telegram.getMe();

      for (const member of newMembers) {
        if (member.id === botInfo.id) {
          await ctx.reply(
            "👋 Всем привет! Я FunTalk Bot.\n\n" +
              "Я помогу с общением, знакомствами, мемами и прикольными фразами.\n\n" +
              "Команды:\n" +
              "/talk — тема для общения\n" +
              "/meme — мемный вопрос\n" +
              "/dating — фраза для знакомства\n" +
              "/question — вопрос для диалога\n" +
              "/help — все команды"
          );
          continue;
        }

        if (member.is_bot) continue;

        const name = member.first_name || member.username || "новый участник";

        await ctx.reply(
          `👋 Добро пожаловать, ${name}!\n\n` +
            "Залетай в общение 😄\n" +
            "Я могу помочь с темами для разговора, мемами и знакомствами.\n\n" +
            "Команды:\n" +
            "/talk — тема для общения\n" +
            "/meme — мемный вопрос\n" +
            "/dating — фраза для знакомства\n" +
            "/help — все команды"
        );
      }
    } catch (error) {
      console.error("[Welcome Error]", error.message);
    }
  });
}

module.exports = {
  registerWelcome,
};
