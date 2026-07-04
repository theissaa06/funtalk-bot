const { safeAnswerCb } = require('./safeTelegram');

class CallbackRouter {
  constructor(logger) {
    this.logger = logger;
    this.routes = new Map();
  }

  on(namespace, handler) {
    if (!namespace || namespace.includes(':')) {
      throw new Error(`Invalid callback namespace: ${namespace}`);
    }
    this.routes.set(namespace, handler);
  }

  middleware() {
    return async (ctx, next) => {
      const data = ctx.callbackQuery?.data;
      if (!data) return next();

      const [namespace, action = '', ...args] = data.split(':');
      const handler = this.routes.get(namespace);
      if (!handler) return next();

      try {
        await safeAnswerCb(ctx);
        return await handler(ctx, { namespace, action, args, raw: data });
      } catch (error) {
        this.logger?.error(`callback ${data} failed:`, error.message);
        await safeAnswerCb(ctx, 'Ошибка обработки кнопки', { show_alert: true });
        return undefined;
      }
    };
  }
}

module.exports = {
  CallbackRouter,
};
