class EventBus {
  constructor(logger) {
    this.logger = logger;
    this.handlers = new Map();
  }

  on(eventName, handler) {
    const handlers = this.handlers.get(eventName) || [];
    handlers.push(handler);
    this.handlers.set(eventName, handlers);
  }

  async emit(eventName, payload = {}) {
    const handlers = this.handlers.get(eventName) || [];
    for (const handler of handlers) {
      try {
        await handler(payload);
      } catch (error) {
        this.logger?.error(`event ${eventName} failed:`, error.message);
      }
    }
  }
}

module.exports = {
  EventBus,
};
