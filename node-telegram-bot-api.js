const EventEmitter = require('events');

class FakeBot extends EventEmitter {
  constructor(token, opts) {
    super();
    this.token = token;
    this.opts = opts;
    this.sent = [];
    // expose for tests
    global.__TEST_BOT_INSTANCE__ = this;
  }

  on(event, cb) { return super.on(event, cb); }

  sendMessage(chatId, text, extra) {
    this.sent.push({ chatId, text, extra });
    return Promise.resolve({ message_id: Date.now() % 10000 });
  }

  answerCallbackQuery(id, opts) { return Promise.resolve(); }
  getMe() { return Promise.resolve({ id: 12345, username: 'fakebot' }); }
  restrictChatMember() { return Promise.resolve(); }
  banChatMember() { return Promise.resolve(); }
  unbanChatMember() { return Promise.resolve(); }
  getChatMember() { return Promise.resolve({ status: 'member', user: { id: 1 } }); }
  sendVideo() { return Promise.resolve(); }
  deleteMessage() { return Promise.resolve(); }
}

module.exports = FakeBot;
